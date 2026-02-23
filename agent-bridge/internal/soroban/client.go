// Package soroban is the "Contract Controller" — the single Go component that
// holds ADMIN_SECRET and is the only entity authorised to call settle_pnl on
// AgentVault and open_synthetic_position on LeveragePool.
//
// Key design points:
//   - All monetary int64 values are 7-decimal-scaled (1 USDC == 10_000_000).
//     Callers must multiply before passing in; use ScaleFactor as the constant.
//   - Every invocation runs simulateTransaction first to obtain the ledger
//     footprint + resource fee, then submits with those attached.
//   - tx_bad_seq triggers a fresh sequence-number fetch and retries up to 3×.
//   - Soroban simulation errors are logged verbatim before returning.
package soroban

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/strkey"
	"github.com/stellar/go-stellar-sdk/txnbuild"
	"github.com/stellar/go-stellar-sdk/xdr"
)

// ScaleFactor is 10^7. All Go monetary values must be multiplied by this
// before being passed to contract functions as i128 arguments.
const ScaleFactor int64 = 10_000_000

// Client holds connection config and the admin signing keypair.
//
// mu serialises all contract invocations so that concurrent HTTP handlers
// never race on the admin account's sequence number.  Without the lock two
// simultaneous calls (e.g. stale-position probe + open) both call
// getSequence(), get the same value S, build txs with S+1, and the second
// submission is rejected with txBAD_AUTH.
type Client struct {
	RPCURL            string // e.g. "https://soroban-testnet.stellar.org"
	HorizonURL        string // e.g. "https://horizon-testnet.stellar.org"
	NetworkPassphrase string
	AdminSecret       string // Stellar secret key (S...)
	VaultContractID   string // AgentVault contract (C...)
	PoolContractID    string // LeveragePool contract (C...)

	rpc *rpcClient
	mu  sync.Mutex // serialises admin-account invocations
}

// New creates a ready-to-use Client.
func New(rpcURL, horizonURL, networkPassphrase, adminSecret, vaultID, poolID string) *Client {
	return &Client{
		RPCURL:            rpcURL,
		HorizonURL:        horizonURL,
		NetworkPassphrase: networkPassphrase,
		AdminSecret:       adminSecret,
		VaultContractID:   vaultID,
		PoolContractID:    poolID,
		rpc:               newRPCClient(rpcURL),
	}
}

// ── Public API ───────────────────────────────────────────────────────────────

// SettleTrade calls AgentVault.settle_pnl(user, token, pnl).
//
//   - userAddr  – G... Stellar account address of the trader
//   - pnlScaled – PnL already in 7-decimal units (multiply by ScaleFactor first)
//     positive = profit credited to user; negative = loss seized from user
//   - tokenAddr – C... contract address of the settlement token (e.g. USDC)
func (c *Client) SettleTrade(ctx context.Context, userAddr string, pnlScaled int64, tokenAddr string) error {
	log.Printf("[soroban] SettleTrade user=%s pnl=%d token=%s", userAddr, pnlScaled, tokenAddr)

	userArg, err := accountScVal(userAddr)
	if err != nil {
		return fmt.Errorf("soroban: bad user address: %w", err)
	}
	tokenArg, err := contractScVal(tokenAddr)
	if err != nil {
		return fmt.Errorf("soroban: bad token address: %w", err)
	}
	pnlArg := i128ScVal(pnlScaled)

	return c.invoke(ctx, c.VaultContractID, "settle_pnl",
		xdr.ScVec{userArg, tokenArg, pnlArg})
}

// OpenPosition calls LeveragePool.open_synthetic_position.
//
//   - user              – G... address of the trader
//   - assetSymbol       – short symbol string, e.g. "XLM" (Soroban Symbol type)
//   - debtScaled        – notional debt in 7-decimal units
//   - collateralToken   – C... address of the collateral token
//   - collateralScaled  – amount of collateral to lock in 7-decimal units
func (c *Client) OpenPosition(
	ctx context.Context,
	user, assetSymbol string,
	debtScaled int64,
	collateralToken string,
	collateralScaled int64,
) error {
	log.Printf("[soroban] OpenPosition user=%s symbol=%s debt=%d collateral=%d",
		user, assetSymbol, debtScaled, collateralScaled)

	userArg, err := accountScVal(user)
	if err != nil {
		return fmt.Errorf("soroban: bad user address: %w", err)
	}
	symArg := symbolScVal(assetSymbol)
	debtArg := i128ScVal(debtScaled)
	collTokenArg, err := contractScVal(collateralToken)
	if err != nil {
		return fmt.Errorf("soroban: bad collateral token: %w", err)
	}
	collLockedArg := i128ScVal(collateralScaled)

	return c.invoke(ctx, c.PoolContractID, "open_synthetic_position",
		xdr.ScVec{userArg, symArg, debtArg, collTokenArg, collLockedArg})
}

// ClosePosition calls LeveragePool.close_position(user, collateral_token, pnl).
// Settles PnL directly against the LP pool: positive pnl credits the user from the
// pool; negative pnl credits the pool from the user's locked collateral.
func (c *Client) ClosePosition(ctx context.Context, user, collateralToken string, pnlScaled int64) error {
	log.Printf("[soroban] ClosePosition user=%s collateral=%s pnl=%d", user, collateralToken, pnlScaled)

	userArg, err := accountScVal(user)
	if err != nil {
		return fmt.Errorf("soroban: bad user address: %w", err)
	}
	collTokenArg, err := contractScVal(collateralToken)
	if err != nil {
		return fmt.Errorf("soroban: bad collateral token: %w", err)
	}
	pnlArg := i128ScVal(pnlScaled)

	return c.invoke(ctx, c.PoolContractID, "close_position",
		xdr.ScVec{userArg, collTokenArg, pnlArg})
}

// ── Core invoke loop ─────────────────────────────────────────────────────────

// invoke builds, simulates, signs, and submits a contract call.
// Retries up to 3 times on tx_bad_seq (nonce mismatch).
// A mutex ensures only one invocation is in-flight at a time so concurrent
// callers don't share the same sequence number.
func (c *Client) invoke(ctx context.Context, contractID, function string, args xdr.ScVec) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	adminKP, err := keypair.ParseFull(c.AdminSecret)
	if err != nil {
		return fmt.Errorf("soroban: parse admin key: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			log.Printf("[soroban] retry %d/%d for %s (reason: tx_bad_seq)", attempt+1, 3, function)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(2 * time.Second):
			}
		}
		lastErr = c.invokeOnce(ctx, adminKP, contractID, function, args)
		if lastErr == nil {
			return nil
		}
		if !isBadSeq(lastErr) {
			return lastErr
		}
	}
	return lastErr
}

func (c *Client) invokeOnce(
	ctx context.Context,
	adminKP *keypair.Full,
	contractID, function string,
	args xdr.ScVec,
) error {
	// ── 1. Fetch current sequence number ─────────────────────────────────────
	seq, err := getSequence(ctx, c.HorizonURL, adminKP.Address())
	if err != nil {
		return fmt.Errorf("soroban: fetch sequence: %w", err)
	}

	// ── 2. Parse contract address → xdr.ScAddress ────────────────────────────
	contractAddr, err := contractScAddress(contractID)
	if err != nil {
		return fmt.Errorf("soroban: parse contract id: %w", err)
	}

	// ── 3. Build unsigned transaction for simulation ──────────────────────────
	// The operation has no auth/ext yet; those come from simulateTransaction.
	fnSym := xdr.ScSymbol(function)
	invokeOp := &txnbuild.InvokeHostFunction{
		HostFunction: xdr.HostFunction{
			Type: xdr.HostFunctionTypeHostFunctionTypeInvokeContract,
			InvokeContract: &xdr.InvokeContractArgs{
				ContractAddress: contractAddr,
				FunctionName:    fnSym,
				Args:            args,
			},
		},
	}

	simAccount := txnbuild.SimpleAccount{AccountID: adminKP.Address(), Sequence: seq}
	simTx, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount:        &simAccount,
		IncrementSequenceNum: true,
		Operations:           []txnbuild.Operation{invokeOp},
		BaseFee:              txnbuild.MinBaseFee,
		Preconditions:        txnbuild.Preconditions{TimeBounds: txnbuild.NewInfiniteTimeout()},
	})
	if err != nil {
		return fmt.Errorf("soroban: build sim tx: %w", err)
	}

	// ── 4. Serialise for simulation ───────────────────────────────────────────
	unsignedB64, err := simTx.Base64()
	if err != nil {
		return fmt.Errorf("soroban: serialize sim tx: %w", err)
	}

	// ── 5. simulateTransaction → footprint + resource fee + auth entries ──────
	simRes, err := c.rpc.simulateTransaction(ctx, unsignedB64)
	if err != nil {
		return fmt.Errorf("soroban: simulate: %w", err)
	}
	if simRes.Error != "" {
		log.Printf("[soroban] simulation error (%s): %s", function, simRes.Error)
		return fmt.Errorf("soroban: simulation failed: %s", simRes.Error)
	}

	// ── 6. Decode SorobanTransactionData ─────────────────────────────────────
	var sorobanData xdr.SorobanTransactionData
	if err = xdr.SafeUnmarshalBase64(simRes.TransactionData, &sorobanData); err != nil {
		return fmt.Errorf("soroban: decode soroban data: %w", err)
	}

	// ── 7. Apply auth entries + ext onto the operation ────────────────────────
	// Setting these on the txnbuild.InvokeHostFunction before rebuilding ensures
	// that NewTransaction bakes them into t.envelope — the canonical source of
	// truth that tx.Sign() hashes.  This avoids the manual envelope-patching
	// approach that can cause the signed hash to diverge from the submitted XDR.
	if len(simRes.Results) > 0 && len(simRes.Results[0].Auth) > 0 {
		authEntries := make([]xdr.SorobanAuthorizationEntry, 0, len(simRes.Results[0].Auth))
		for _, authB64 := range simRes.Results[0].Auth {
			var entry xdr.SorobanAuthorizationEntry
			if err = xdr.SafeUnmarshalBase64(authB64, &entry); err != nil {
				return fmt.Errorf("soroban: decode auth entry: %w", err)
			}
			authEntries = append(authEntries, entry)
		}
		invokeOp.Auth = authEntries
		log.Printf("[soroban] applied %d auth entr(ies) from simulation", len(authEntries))
	}
	// Soroban ext carries the footprint & resource budget.
	// NewTransaction reads ResourceFee from here to compute the total fee.
	invokeOp.Ext = xdr.TransactionExt{V: 1, SorobanData: &sorobanData}

	// ── 8. Rebuild transaction with simulation data ───────────────────────────
	// Use the same sequence number (seq+1) but rebuild so that NewTransaction
	// constructs t.envelope fresh from the updated invokeOp.
	// BaseFee adds a 1000-stroop buffer on top of the minimum.
	buildAccount := txnbuild.SimpleAccount{AccountID: adminKP.Address(), Sequence: seq + 1}
	tx, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount:        &buildAccount,
		IncrementSequenceNum: false,
		Operations:           []txnbuild.Operation{invokeOp},
		BaseFee:              txnbuild.MinBaseFee + 1000,
		Preconditions:        txnbuild.Preconditions{TimeBounds: txnbuild.NewInfiniteTimeout()},
	})
	if err != nil {
		return fmt.Errorf("soroban: build tx: %w", err)
	}

	// ── 9. Sign via SDK (hashes t.envelope, same data that Base64() serialises)
	signedTx, err := tx.Sign(c.NetworkPassphrase, adminKP)
	if err != nil {
		return fmt.Errorf("soroban: sign tx: %w", err)
	}

	// ── 10. Serialise signed transaction ─────────────────────────────────────
	signedB64, err := signedTx.Base64()
	if err != nil {
		return fmt.Errorf("soroban: encode signed tx: %w", err)
	}

	// ── 11. sendTransaction ───────────────────────────────────────────────────
	sendRes, err := c.rpc.sendTransaction(ctx, signedB64)
	if err != nil {
		return err
	}
	if sendRes.Status == "ERROR" {
		if sendRes.ErrorResultXDR != "" {
			log.Printf("[soroban] sendTransaction error XDR: %s", sendRes.ErrorResultXDR)
		}
		return fmt.Errorf("soroban: sendTransaction status=ERROR")
	}

	log.Printf("[soroban] tx submitted hash=%s status=%s", sendRes.Hash, sendRes.Status)

	// ── 12. Poll until on-chain confirmed ─────────────────────────────────────
	return c.waitConfirmed(ctx, sendRes.Hash)
}

// waitConfirmed polls getTransaction until SUCCESS, FAILED, or 90s timeout.
func (c *Client) waitConfirmed(ctx context.Context, hash string) error {
	deadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(3 * time.Second):
		}
		res, err := c.rpc.getTransaction(ctx, hash)
		if err != nil {
			log.Printf("[soroban] getTransaction poll error: %v", err)
			continue
		}
		switch res.Status {
		case "SUCCESS":
			log.Printf("[soroban] tx confirmed hash=%s", hash)
			return nil
		case "FAILED":
			log.Printf("[soroban] tx FAILED hash=%s resultXdr=%s", hash, res.ResultXDR)
			return fmt.Errorf("soroban: tx failed hash=%s", hash)
		// NOT_FOUND = still pending, keep polling
		}
	}
	return fmt.Errorf("soroban: confirmation timeout hash=%s", hash)
}

// ── ScVal construction helpers ───────────────────────────────────────────────

// i128FromScaled converts a 7-decimal-scaled int64 to xdr.Int128Parts.
//
// Positive: Hi = 0, Lo = uint64(val)
// Negative: sign-extend — Hi = -1 (all ones), Lo = uint64 bit-pattern of val
func i128FromScaled(scaled int64) xdr.Int128Parts {
	if scaled >= 0 {
		return xdr.Int128Parts{Hi: 0, Lo: xdr.Uint64(uint64(scaled))}
	}
	// Negative: two's-complement sign extension into the upper 64 bits.
	return xdr.Int128Parts{Hi: xdr.Int64(-1), Lo: xdr.Uint64(uint64(scaled))}
}

func i128ScVal(scaled int64) xdr.ScVal {
	parts := i128FromScaled(scaled)
	return xdr.ScVal{Type: xdr.ScValTypeScvI128, I128: &parts}
}

// accountScVal builds a ScvAddress ScVal for a G... Stellar account address.
func accountScVal(addr string) (xdr.ScVal, error) {
	var accountID xdr.AccountId
	if err := accountID.SetAddress(addr); err != nil {
		return xdr.ScVal{}, err
	}
	scAddr := xdr.ScAddress{
		Type:      xdr.ScAddressTypeScAddressTypeAccount,
		AccountId: &accountID,
	}
	return xdr.ScVal{Type: xdr.ScValTypeScvAddress, Address: &scAddr}, nil
}

// contractScVal builds a ScvAddress ScVal for a C... Soroban contract address.
func contractScVal(contractID string) (xdr.ScVal, error) {
	scAddr, err := contractScAddress(contractID)
	if err != nil {
		return xdr.ScVal{}, err
	}
	return xdr.ScVal{Type: xdr.ScValTypeScvAddress, Address: &scAddr}, nil
}

// contractScAddress decodes a C... strkey into an xdr.ScAddress.
func contractScAddress(contractID string) (xdr.ScAddress, error) {
	decoded, err := strkey.Decode(strkey.VersionByteContract, contractID)
	if err != nil {
		return xdr.ScAddress{}, fmt.Errorf("decode contract id %q: %w", contractID, err)
	}
	var cid xdr.ContractId
	copy(cid[:], decoded)
	return xdr.ScAddress{
		Type:       xdr.ScAddressTypeScAddressTypeContract,
		ContractId: &cid,
	}, nil
}

// symbolScVal wraps a short string as a Soroban Symbol ScVal.
// The contract uses `symbol_short!("XLM")` etc., so pass the bare token name.
func symbolScVal(sym string) xdr.ScVal {
	s := xdr.ScSymbol(sym)
	return xdr.ScVal{Type: xdr.ScValTypeScvSymbol, Sym: &s}
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

func isBadSeq(err error) bool {
	return err != nil && strings.Contains(err.Error(), "tx_bad_seq")
}
