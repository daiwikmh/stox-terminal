package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"

	"agent-bridge/internal/db"
	"agent-bridge/internal/handler"
	"agent-bridge/internal/matching"
	"agent-bridge/internal/middleware"
	"agent-bridge/internal/positions"
	"agent-bridge/internal/sdex"
	"agent-bridge/internal/soroban"
	"agent-bridge/internal/store"
	"agent-bridge/internal/watcher"
)

// resolveSecret resolves a 1Password secret reference (op:// URI) via the
// `op read` CLI command.  If the value does not start with "op://" or the CLI
// is unavailable the original value is returned unchanged.
//
// This enables zero-plaintext secret storage: instead of writing
//   ADMIN_SECRET=SXXXX...
// in .env, operators can write
//   ADMIN_SECRET=op://StellarTrading/AdminKey/credential
// and the real secret is fetched from 1Password at startup.
func resolveSecret(val string) string {
	if !strings.HasPrefix(val, "op://") {
		return val
	}
	out, err := exec.Command("op", "read", val).Output()
	if err != nil {
		log.Printf("[1password] could not resolve %q: %v — using raw value", val, err)
		return val
	}
	resolved := strings.TrimSpace(string(out))
	log.Printf("[1password] resolved secret reference %q", val)
	return resolved
}

// loadDotEnv reads a .env file and sets any variable that is not already set
// in the process environment.  Lines starting with # are ignored.
// Values matching the op:// URI scheme are resolved via the 1Password CLI
// before being written to the environment.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // no .env file — that's fine
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		// Strip optional surrounding quotes
		if len(val) >= 2 && val[0] == '"' && val[len(val)-1] == '"' {
			val = val[1 : len(val)-1]
		}
		// Only set if not already in the environment (so explicit exports win)
		if os.Getenv(key) == "" {
			os.Setenv(key, resolveSecret(val))
		}
	}
}

func main() {
	loadDotEnv(".env")

	// ── Persistent SQLite store ───────────────────────────────────────────────
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "bridge.db"
	}
	database, err := db.Open(dbPath)
	if err != nil {
		fmt.Printf("[db] WARNING: could not open %s: %v — running without persistence\n", dbPath, err)
	}
	if database != nil {
		defer database.Close()
	}

	s := store.NewStore(database)

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	adminSecret := resolveSecret(os.Getenv("ADMIN_SECRET"))

	// ── Background context for all long-running goroutines ───────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── Horizon order-book heartbeats (market insight SSE events) ────────────
	watcher.WatchOrderBooks(ctx, s, "MAINNET")
	watcher.WatchOrderBooks(ctx, s, "TESTNET")

	// ── Soroban Contract Controller ───────────────────────────────────────────
	// Holds ADMIN_SECRET and is the only entity authorised to call settle_pnl
	// and open_synthetic_position on-chain.
	rpcURL := os.Getenv("SOROBAN_RPC_URL")
	if rpcURL == "" {
		rpcURL = "https://soroban-testnet.stellar.org"
	}
	horizonURL := os.Getenv("HORIZON_URL")
	if horizonURL == "" {
		horizonURL = "https://horizon-testnet.stellar.org"
	}
	networkPassphrase := os.Getenv("NETWORK_PASSPHRASE")
	if networkPassphrase == "" {
		networkPassphrase = "Test SDF Network ; September 2015"
	}
	vaultContractID := os.Getenv("AGENT_VAULT_ID")
	if vaultContractID == "" {
		vaultContractID = "CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG"
	}
	poolContractID := os.Getenv("LEVERAGE_POOL_ID")
	if poolContractID == "" {
		poolContractID = "CCNF3JMO7MO5PSR7AS4GT3DKZU7MLDN5WS2ML7RWOGMGPLXTT7HXRY7L"
	}
	// Default settlement token: USDC on testnet (C... contract address)
	settlementToken := os.Getenv("SETTLEMENT_TOKEN")
	if settlementToken == "" {
		settlementToken = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
	}

	var sorobanClient *soroban.Client
	if adminSecret != "" {
		sorobanClient = soroban.New(
			rpcURL, horizonURL, networkPassphrase,
			adminSecret, vaultContractID, poolContractID,
		)
		fmt.Println("[soroban] contract controller initialised")
	} else {
		fmt.Println("[soroban] ADMIN_SECRET not set — on-chain settlement disabled")
	}

	// ── Matching engine ───────────────────────────────────────────────────────
	settleURL := os.Getenv("SETTLE_URL")
	if settleURL == "" {
		settleURL = frontendURL + "/api/admin/settle"
	}

	eng := matching.NewEngine(settleURL, adminSecret)

	// Wire the soroban client into the liquidation engine so settlements go
	// directly on-chain without an extra HTTP round-trip.
	// The settle func receives a session token, not a Stellar address — look it
	// up from the store before calling SettleTrade.
	if sorobanClient != nil {
		tok := settlementToken
		eng.SetSettleFunc(func(bCtx context.Context, userToken, _ string, pnl float64) error {
			conn := s.GetConnection(userToken)
			if conn == nil || conn.AccountID == "" {
				return fmt.Errorf("liquidation: no Stellar address for token %s", userToken)
			}
			pnlScaled := int64(pnl * float64(soroban.ScaleFactor))
			return sorobanClient.SettleTrade(bCtx, conn.AccountID, pnlScaled, tok)
		})
	}

	eng.Start(ctx)

	// ── SDEX client (uses Horizon for real DEX execution) ─────────────────────
	usdcIssuer := os.Getenv("USDC_ISSUER")
	if usdcIssuer == "" {
		usdcIssuer = sdex.USDCIssuerTestnet
	}
	var sdexClient *sdex.Client
	if adminSecret != "" {
		sdexClient = sdex.New(horizonURL, networkPassphrase, adminSecret, usdcIssuer)
		fmt.Println("[sdex] SDEX client initialised")
	}

	// ── Position store (SQLite-backed, survives restarts) ─────────────────────
	posStore := positions.New(database)

	// ── Re-register persisted positions into the liquidation engine ───────────
	for _, pos := range posStore.All() {
		eng.Liquidation.AddPosition(&matching.OpenPosition{
			UserToken:        pos.UserToken,
			Symbol:           pos.Symbol,
			Side:             string(pos.Side),
			EntryPrice:       pos.EntryPrice,
			Leverage:         pos.Leverage,
			CollateralAmount: pos.CollateralUSDC,
			DebtAmount:       pos.TotalUSDC,
		})
		fmt.Printf("[startup] restored liquidation watch: user=%s side=%s entry=%.6f\n",
			pos.UserAddr, pos.Side, pos.EntryPrice)
	}

	// ── HTTP handlers ─────────────────────────────────────────────────────────
	tokenH := &handler.TokenHandler{Store: s}
	logsH := &handler.LogsHandler{Store: s}
	streamH := &handler.StreamHandler{Store: s}
	skillsH := &handler.SkillsHandler{Store: s}
	proxyH := &handler.ProxyHandler{Store: s, FrontendURL: frontendURL}
	ctxH := &handler.ContextHandler{Store: s}
	ordersH := &handler.OrdersHandler{
		Engine:          eng,
		Store:           s,
		Soroban:         sorobanClient,
		SettlementToken: settlementToken,
	}
	pricesH := &handler.PricesHandler{Engine: eng}
	adminH := &handler.AdminHandler{Soroban: sorobanClient}
	posH := &handler.PositionsHandler{
		Store:           s,
		Positions:       posStore,
		SDEX:            sdexClient,
		Soroban:         sorobanClient,
		SettlementToken: settlementToken,
	}

	mux := http.NewServeMux()

	// Core routes
	mux.HandleFunc("/api/token/generate", tokenH.Generate)
	mux.HandleFunc("/api/logs", logsH.Post)
	mux.HandleFunc("/api/logs/stream", streamH.Stream)
	mux.HandleFunc("/api/skills", skillsH.List)
	mux.HandleFunc("/api/context", ctxH.Handle)
	mux.HandleFunc("/api/bridge/", proxyH.Handle)

	// Matching engine routes
	mux.HandleFunc("/api/orders", ordersH.Handle)
	mux.HandleFunc("/api/prices", pricesH.Get)
	mux.HandleFunc("/api/price/update", pricesH.Update)

	// Admin / Contract Controller routes (Bearer ADMIN_SECRET required)
	mux.HandleFunc("/api/admin/settle", adminH.Settle)
	mux.HandleFunc("/api/admin/position", adminH.OpenPosition)
	mux.HandleFunc("/api/admin/position/close", adminH.ClosePosition)

	// SDEX leveraged position routes
	mux.HandleFunc("/api/positions/open", posH.Open)
	mux.HandleFunc("/api/positions/close", posH.Close)
	mux.HandleFunc("/api/positions", posH.Get)

	allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "*"
	}
	wrapped := middleware.CORS(mux, allowedOrigin)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}
	fmt.Printf("listening on :%s (frontend=%s rpc=%s)\n", port, frontendURL, rpcURL)
	if err := http.ListenAndServe(":"+port, wrapped); err != nil {
		fmt.Printf("server error: %v\n", err)
	}
}
