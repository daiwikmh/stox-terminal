package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"agent-bridge/internal/positions"
	"agent-bridge/internal/sdex"
	"agent-bridge/internal/store"
)

// PositionsHandler tracks leveraged position metadata for PnL display.
//
// On-chain open/close calls are now made directly from the frontend via
// Freighter wallet. The bridge stores entry price / side / leverage so
// the frontend can compute unrealised PnL from the live oracle price.
//
//	POST /api/positions/open   — record a position (called after frontend signs on-chain tx)
//	POST /api/positions/close  — remove position record (called after frontend signs close tx)
//	GET  /api/positions        — get the caller's current position record
type PositionsHandler struct {
	Store     *store.Store
	Positions *positions.Store
	SDEX      *sdex.Client // nil when ADMIN_SECRET is unset
}

// ── Open position ─────────────────────────────────────────────────────────────

type sdexOpenRequest struct {
	Token     string  `json:"token"`
	Side      string  `json:"side"`      // "long" | "short"
	XLMAmount float64 `json:"xlmAmount"` // XLM amount
	Leverage  int     `json:"leverage"`  // 2–20
}

type openPositionResponse struct {
	Side           string  `json:"side"`
	XLMAmount      float64 `json:"xlmAmount"`
	EntryPrice     float64 `json:"entryPrice"`
	TotalUSDC      float64 `json:"totalUSDC"`
	CollateralUSDC float64 `json:"collateralUSDC"`
	Leverage       int     `json:"leverage"`
}

func (h *PositionsHandler) Open(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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

	ctx := r.Context()

	// Fetch current SDEX mark price for entry price recording.
	var midPrice float64
	if h.SDEX != nil {
		var err error
		midPrice, err = h.SDEX.GetMidPrice(ctx)
		if err != nil {
			log.Printf("[positions] GetMidPrice error: %v", err)
		}
	}

	totalUSDC := req.XLMAmount * midPrice
	collateral := totalUSDC / float64(req.Leverage)

	log.Printf("[positions] record open: user=%s side=%s xlm=%.4f price=%.6f leverage=%dx",
		conn.AccountID, req.Side, req.XLMAmount, midPrice, req.Leverage)

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
	PnL        float64 `json:"pnl"`
	ClosePrice float64 `json:"closePrice"`
}

func (h *PositionsHandler) Close(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct{ Token string `json:"token"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		http.Error(w, "token is required", http.StatusBadRequest)
		return
	}

	pos := h.Positions.Get(req.Token)
	if pos == nil {
		// Not tracking this token — treat as already closed.
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(closePositionResponse{})
		return
	}

	var closePrice float64
	if h.SDEX != nil {
		closePrice, _ = h.SDEX.GetMidPrice(r.Context())
	}
	pnl := pos.PnL(closePrice)

	log.Printf("[positions] record close: user=%s side=%s entry=%.6f close=%.6f pnl=%.4f USDC",
		pos.UserAddr, pos.Side, pos.EntryPrice, closePrice, pnl)

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
