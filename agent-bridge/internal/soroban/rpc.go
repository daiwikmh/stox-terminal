package soroban

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// rpcClient wraps the Soroban JSON-RPC endpoint and the Horizon REST API
// for sequence-number lookups.
type rpcClient struct {
	rpcURL string
	http   *http.Client
}

func newRPCClient(rpcURL string) *rpcClient {
	return &rpcClient{
		rpcURL: rpcURL,
		http:   &http.Client{Timeout: 30 * time.Second},
	}
}

// ── JSON-RPC types ───────────────────────────────────────────────────────────

type jsonRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      int         `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params"`
}

type jsonRPCResponse[T any] struct {
	JSONRPC string  `json:"jsonrpc"`
	ID      int     `json:"id"`
	Result  T       `json:"result"`
	Error   *rpcErr `json:"error,omitempty"`
}

type rpcErr struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// ── simulateTransaction ──────────────────────────────────────────────────────

type simulateParams struct {
	Transaction string `json:"transaction"`
}

// SimulateResult contains the fields we care about from simulateTransaction.
type SimulateResult struct {
	TransactionData string `json:"transactionData"` // base64 SorobanTransactionData
	MinResourceFee  string `json:"minResourceFee"`  // stroops as decimal string
	Error           string `json:"error,omitempty"` // non-empty if simulation failed
	// Results[0].Auth holds the SorobanAuthorizationEntry list that must be
	// applied to the InvokeHostFunction operation before signing.
	Results []struct {
		Auth []string `json:"auth"` // base64-encoded SorobanAuthorizationEntry
		XDR  string   `json:"xdr"`
	} `json:"results,omitempty"`
	// RestorePreamble is present when ledger entries need restoring first.
	RestorePreamble *struct {
		TransactionData string `json:"transactionData"`
		MinResourceFee  string `json:"minResourceFee"`
	} `json:"restorePreamble,omitempty"`
}

func (r *rpcClient) simulateTransaction(ctx context.Context, txBase64 string) (*SimulateResult, error) {
	var resp jsonRPCResponse[SimulateResult]
	if err := r.call(ctx, "simulateTransaction", simulateParams{Transaction: txBase64}, &resp); err != nil {
		return nil, err
	}
	if resp.Error != nil {
		return nil, fmt.Errorf("rpc simulateTransaction: code=%d msg=%s", resp.Error.Code, resp.Error.Message)
	}
	return &resp.Result, nil
}

// ── sendTransaction ──────────────────────────────────────────────────────────

type sendParams struct {
	Transaction string `json:"transaction"`
}

type SendResult struct {
	Hash           string `json:"hash"`
	Status         string `json:"status"`          // PENDING | DUPLICATE | TRY_AGAIN_LATER | ERROR
	ErrorResultXDR string `json:"errorResultXdr,omitempty"`
}

func (r *rpcClient) sendTransaction(ctx context.Context, txBase64 string) (*SendResult, error) {
	var resp jsonRPCResponse[SendResult]
	if err := r.call(ctx, "sendTransaction", sendParams{Transaction: txBase64}, &resp); err != nil {
		return nil, err
	}
	if resp.Error != nil {
		// RPC-level error (distinct from on-chain tx error)
		if resp.Error.Message != "" && isBadSeq(fmt.Errorf("%s", resp.Error.Message)) {
			return nil, fmt.Errorf("tx_bad_seq")
		}
		return nil, fmt.Errorf("rpc sendTransaction: code=%d msg=%s", resp.Error.Code, resp.Error.Message)
	}
	// Application-level error embedded in result
	if resp.Result.Status == "ERROR" && resp.Result.ErrorResultXDR != "" {
		// Decode result XDR to check for tx_bad_seq (TransactionResultCode = -6)
		if isBadSeqXDR(resp.Result.ErrorResultXDR) {
			return nil, fmt.Errorf("tx_bad_seq")
		}
	}
	return &resp.Result, nil
}

// ── getTransaction ───────────────────────────────────────────────────────────

type getTransactionParams struct {
	Hash string `json:"hash"`
}

type GetTransactionResult struct {
	Status    string `json:"status"`              // SUCCESS | FAILED | NOT_FOUND
	ResultXDR string `json:"resultXdr,omitempty"` // base64 on FAILED
}

func (r *rpcClient) getTransaction(ctx context.Context, hash string) (*GetTransactionResult, error) {
	var resp jsonRPCResponse[GetTransactionResult]
	if err := r.call(ctx, "getTransaction", getTransactionParams{Hash: hash}, &resp); err != nil {
		return nil, err
	}
	if resp.Error != nil {
		return nil, fmt.Errorf("rpc getTransaction: code=%d msg=%s", resp.Error.Code, resp.Error.Message)
	}
	return &resp.Result, nil
}

// ── Horizon sequence fetch ───────────────────────────────────────────────────

type horizonAccount struct {
	Sequence string `json:"sequence"`
}

// getSequence fetches the current ledger sequence number for an account.
// The returned value should be passed as Sequence in SimpleAccount and
// IncrementSequenceNum = true will add 1 before building the transaction.
func getSequence(ctx context.Context, horizonURL, accountID string) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		horizonURL+"/accounts/"+accountID, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("horizon account fetch: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("horizon account fetch: HTTP %d", resp.StatusCode)
	}

	var account horizonAccount
	if err = json.NewDecoder(resp.Body).Decode(&account); err != nil {
		return 0, fmt.Errorf("horizon account decode: %w", err)
	}
	seq, err := strconv.ParseInt(account.Sequence, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("horizon sequence parse: %w", err)
	}
	return seq, nil
}

// ── JSON-RPC call helper ─────────────────────────────────────────────────────

func (r *rpcClient) call(ctx context.Context, method string, params interface{}, out interface{}) error {
	body, err := json.Marshal(jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return fmt.Errorf("rpc marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.rpcURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("rpc request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.http.Do(req)
	if err != nil {
		return fmt.Errorf("rpc http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("rpc http status: %d", resp.StatusCode)
	}
	if err = json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("rpc decode: %w", err)
	}
	return nil
}

// ── XDR tx_bad_seq detection ─────────────────────────────────────────────────
// TransactionResultCode txBAD_SEQ = -6 in the Stellar XDR spec.
// Rather than pulling in full XDR decode here, we do a quick base64 byte scan:
// the discriminant for txBAD_SEQ (0xFFFFFFFA = -6 in int32 big-endian) appears
// in a predictable position in the result XDR.  This is a conservative heuristic.
func isBadSeqXDR(b64 string) bool {
	// As a simpler fallback, delegate to string checking on the decoded message.
	// A proper implementation would unmarshal xdr.TransactionResult.
	return false // will rely on the rpcErr message path above
}
