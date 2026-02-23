package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"agent-bridge/internal/positions"
	"agent-bridge/internal/sdex"
	"agent-bridge/internal/soroban"
	"agent-bridge/internal/store"
)

// PositionsHandler handles leveraged SDEX position lifecycle.
//
//	POST /api/positions/open   — open a leveraged long or short
//	POST /api/positions/close  — close the caller's open position
//	GET  /api/positions        — get the caller's current position
type PositionsHandler struct {
	Store           *store.Store
	Positions       *positions.Store
	SDEX            *sdex.Client    // nil when ADMIN_SECRET is unset
	Soroban         *soroban.Client // nil when ADMIN_SECRET is unset
	SettlementToken string          // Soroban USDC contract (C...)
}

// ── Open position ─────────────────────────────────────────────────────────────

type sdexOpenRequest struct {
	Token     string  `json:"token"`
	Side      string  `json:"side"`      // "long" | "short"
	XLMAmount float64 `json:"xlmAmount"` // XLM to trade
	Leverage  int     `json:"leverage"`  // 2–20
}

type openPositionResponse struct {
	Side           string  `json:"side"`
	XLMAmount      float64 `json:"xlmAmount"`
	EntryPrice     float64 `json:"entryPrice"`
	TotalUSDC      float64 `json:"totalUSDC"`
	CollateralUSDC float64 `json:"collateralUSDC"`
	Leverage       int     `json:"leverage"`
	TxHash         string  `json:"txHash,omitempty"` // only for long
}

func (h *PositionsHandler) Open(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.SDEX == nil || h.Soroban == nil {
		http.Error(w, "ADMIN_SECRET not set — on-chain positions disabled", http.StatusServiceUnavailable)
		return
	}

	var req sdexOpenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request body", http.StatusBadRequest)
		return
	}
	if req.Token == "" || req.XLMAmount <= 0 || req.Leverage < 2 {
		http.Error(w, "token, xlmAmount (>0), leverage (≥2) are required", http.StatusBadRequest)
		return
	}
	if req.Side != "long" && req.Side != "short" {
		http.Error(w, "side must be 'long' or 'short'", http.StatusBadRequest)
		return
	}

	conn := h.Store.GetConnection(req.Token)
	if conn == nil || conn.AccountID == "" {
		http.Error(w, "no Stellar address registered for this token — POST /api/context first", http.StatusUnauthorized)
		return
	}

	// Check: user must not already have an open position.
	if existing := h.Positions.Get(req.Token); existing != nil {
		http.Error(w, "position already open — close it first", http.StatusConflict)
		return
	}

	ctx := r.Context()

	// ── 1. Fetch current SDEX mark price ─────────────────────────────────────
	midPrice, err := h.SDEX.GetMidPrice(ctx)
	if err != nil {
		log.Printf("[positions] GetMidPrice error: %v", err)
		http.Error(w, "failed to fetch SDEX price: "+err.Error(), http.StatusBadGateway)
		return
	}

	// ── 2. Calculate position economics ──────────────────────────────────────
	// totalUSDC = XLM amount × price (= full notional)
	// collateral = totalUSDC / leverage
	totalUSDC := req.XLMAmount * midPrice
	collateral := totalUSDC / float64(req.Leverage)

	log.Printf("[positions] open: user=%s side=%s xlm=%.4f price=%.6f total_usdc=%.4f collateral=%.4f leverage=%dx",
		conn.AccountID, req.Side, req.XLMAmount, midPrice, totalUSDC, collateral, req.Leverage)

	// ── 3. Positions are synthetic: entry/exit at SDEX oracle price ──────────
	// Both long and short use the real SDEX mid-price for entry and exit, but
	// execution is settled numerically from the pool — no classic USDC needed.

	// ── 4. Open on-chain position (LeveragePool) ─────────────────────────────
	debtScaled := int64(totalUSDC * float64(soroban.ScaleFactor))
	collScaled := int64(collateral * float64(soroban.ScaleFactor))

	// Extract base asset symbol ("XLM" from "XLM/USDC").
	assetSymbol := "XLM"

	// Clear any stale on-chain position before opening. If a prior position
	// exists (e.g. from a session the bridge forgot on restart), the contract
	// returns PositionAlreadyOpen. Attempt close_position first; if no stale
	// position exists the simulation fails fast (~1s) without submitting a tx.
	if cerr := h.Soroban.ClosePosition(ctx, conn.AccountID, h.SettlementToken); cerr == nil {
		log.Printf("[positions] cleared stale on-chain position for %s", conn.AccountID)
	}

	if err = h.Soroban.OpenPosition(ctx,
		conn.AccountID, assetSymbol,
		debtScaled, h.SettlementToken, collScaled,
	); err != nil {
		log.Printf("[positions] OpenPosition on-chain failed: %v", err)
	}

	// ── 5. Register in local store ────────────────────────────────────────────
	pos := &positions.Position{
		UserToken:      req.Token,
		UserAddr:       conn.AccountID,
		Symbol:         "XLM/USDC",
		Side:           positions.Side(req.Side),
		EntryPrice:     midPrice,
		XLMAmount:      req.XLMAmount,
		TotalUSDC:      totalUSDC,
		CollateralUSDC: collateral,
		Leverage:       req.Leverage,
	}
	h.Positions.Add(pos)

	log.Printf("[positions] position opened: user=%s side=%s entry=%.6f",
		conn.AccountID, req.Side, midPrice)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(openPositionResponse{
		Side:           req.Side,
		XLMAmount:      req.XLMAmount,
		EntryPrice:     midPrice,
		TotalUSDC:      totalUSDC,
		CollateralUSDC: collateral,
		Leverage:       req.Leverage,
	})
}

// ── Close position ────────────────────────────────────────────────────────────

type closePositionResponse struct {
	PnL        float64 `json:"pnl"`        // USDC, positive = profit
	ClosePrice float64 `json:"closePrice"`
	TxHash     string  `json:"txHash,omitempty"`
}

func (h *PositionsHandler) Close(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.SDEX == nil || h.Soroban == nil {
		http.Error(w, "ADMIN_SECRET not set", http.StatusServiceUnavailable)
		return
	}

	var req struct{ Token string `json:"token"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		http.Error(w, "token is required", http.StatusBadRequest)
		return
	}

	pos := h.Positions.Get(req.Token)
	if pos == nil {
		http.Error(w, "no open position for this token", http.StatusNotFound)
		return
	}

	ctx := r.Context()

	// ── 1. Get current SDEX price ─────────────────────────────────────────────
	closePrice, err := h.SDEX.GetMidPrice(ctx)
	if err != nil {
		http.Error(w, "failed to fetch close price: "+err.Error(), http.StatusBadGateway)
		return
	}

	// ── 2. Calculate P&L at oracle close price (synthetic settlement) ─────────
	pnl := pos.PnL(closePrice)

	log.Printf("[positions] close: user=%s side=%s entry=%.6f close=%.6f pnl=%.4f USDC",
		pos.UserAddr, pos.Side, pos.EntryPrice, closePrice, pnl)

	// ── 3. Close on-chain position record (LeveragePool.close_position) ───────
	// Do this first so pool collateral is always released regardless of PnL
	// settlement outcome.
	if err = h.Soroban.ClosePosition(ctx, pos.UserAddr, h.SettlementToken); err != nil {
		log.Printf("[positions] ClosePosition failed: %v", err)
		// Non-fatal: pool collateral reconciliation may need manual review.
	}

	// ── 4. Settle P&L on-chain (AgentVault.settle_pnl) ───────────────────────
	// Skip if PnL rounds to zero — contract returns Ok() for pnl==0 but
	// simulation overhead isn't worth it.
	// Non-fatal: if the user has no AgentVault balance to cover a small loss,
	// we still allow the close rather than leaving the position stuck.
	pnlScaled := int64(pnl * float64(soroban.ScaleFactor))
	if pnlScaled != 0 {
		if serr := h.Soroban.SettleTrade(ctx, pos.UserAddr, pnlScaled, h.SettlementToken); serr != nil {
			log.Printf("[positions] SettleTrade failed (non-fatal): %v", serr)
		}
	}

	// ── 5. Remove from local store ────────────────────────────────────────────
	h.Positions.Remove(req.Token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(closePositionResponse{
		PnL:        pnl,
		ClosePrice: closePrice,
	})
}

// ── Get position ──────────────────────────────────────────────────────────────

func (h *PositionsHandler) Get(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "token query param required", http.StatusBadRequest)
		return
	}

	pos := h.Positions.Get(token)
	if pos == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("null\n"))
		return
	}

	// Fetch current mark price for live P&L.
	var markPrice float64
	if h.SDEX != nil {
		markPrice, _ = h.SDEX.GetMidPrice(context.Background())
	}

	resp := struct {
		*positions.Position
		MarkPrice float64 `json:"markPrice"`
		UnrealPnL float64 `json:"unrealPnL"`
	}{
		Position:  pos,
		MarkPrice: markPrice,
		UnrealPnL: pos.PnL(markPrice),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
