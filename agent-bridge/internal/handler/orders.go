package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"agent-bridge/internal/matching"
	"agent-bridge/internal/soroban"
	"agent-bridge/internal/store"
)

// OrdersHandler exposes the matching engine's order placement over HTTP.
// POST /api/orders — place a limit order
// GET  /api/orders?symbol=XLM/USDC&depth=10 — view the live order book
type OrdersHandler struct {
	Engine          *matching.Engine
	Store           *store.Store
	Soroban         *soroban.Client // nil when ADMIN_SECRET is unset
	SettlementToken string          // C... USDC contract address
}

type placeOrderRequest struct {
	Token    string  `json:"token"`
	Symbol   string  `json:"symbol"`
	Side     string  `json:"side"`     // "buy" | "sell"
	Price    float64 `json:"price"`    // limit price
	Amount   float64 `json:"amount"`   // base asset amount
	Leverage int     `json:"leverage"` // 1 = spot
}

type placeOrderResponse struct {
	OrderID string        `json:"orderId"`
	Fills   int           `json:"fills"`
	Results []fillSummary `json:"results,omitempty"`
}

type fillSummary struct {
	BuyToken  string  `json:"buyToken"`
	SellToken string  `json:"sellToken"`
	Price     float64 `json:"price"`
	Amount    float64 `json:"amount"`
}

func (h *OrdersHandler) Handle(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		h.place(w, r)
	case http.MethodGet:
		h.snapshot(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *OrdersHandler) place(w http.ResponseWriter, r *http.Request) {
	var req placeOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request body", http.StatusBadRequest)
		return
	}
	if req.Token == "" || req.Symbol == "" || req.Amount <= 0 || req.Price <= 0 {
		http.Error(w, "token, symbol, amount, price are required", http.StatusBadRequest)
		return
	}
	if req.Leverage < 1 {
		req.Leverage = 1
	}

	o := matching.Order{
		UserToken: req.Token,
		Symbol:    req.Symbol,
		Side:      matching.Side(req.Side),
		Price:     req.Price,
		Amount:    req.Amount,
		Leverage:  req.Leverage,
	}

	fills, err := h.Engine.PlaceOrder(o)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Trigger on-chain OpenPosition for every fill in a background goroutine.
	// The HTTP response is returned immediately; the chain write is async.
	for _, fill := range fills {
		f := fill
		go h.processFill(f)
	}

	resp := placeOrderResponse{Fills: len(fills)}
	for _, f := range fills {
		resp.Results = append(resp.Results, fillSummary{
			BuyToken:  f.BuyOrder.UserToken,
			SellToken: f.SellOrder.UserToken,
			Price:     f.FillPrice,
			Amount:    f.FillAmount,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// processFill is called in a goroutine for each matched order pair.
// It resolves the Stellar address for each party and calls OpenPosition on-chain,
// then registers the position with the liquidation engine.
func (h *OrdersHandler) processFill(fill matching.MatchResult) {
	if h.Soroban == nil {
		log.Printf("[orders] fill: soroban client not set — skipping on-chain position (no ADMIN_SECRET?)")
		return
	}

	ctx := context.Background()
	notional := fill.FillPrice * fill.FillAmount // total USDC value of the trade

	// Extract base asset symbol: "XLM/USDC" → "XLM"
	assetSymbol := fill.BuyOrder.Symbol
	if idx := strings.Index(assetSymbol, "/"); idx >= 0 {
		assetSymbol = assetSymbol[:idx]
	}

	type party struct {
		order matching.Order
		side  string
	}
	parties := []party{
		{fill.BuyOrder, "long"},
		{fill.SellOrder, "short"},
	}

	for _, p := range parties {
		conn := h.Store.GetConnection(p.order.UserToken)
		if conn == nil || conn.AccountID == "" {
			log.Printf("[orders] fill: no Stellar address for token %s (side=%s) — open /api/context first",
				p.order.UserToken, p.side)
			continue
		}

		// collateral_locked = notional / leverage
		// debt_amount       = notional  (= collateral * leverage)
		collateral := notional / float64(p.order.Leverage)
		debtScaled := int64(notional * float64(soroban.ScaleFactor))
		collScaled := int64(collateral * float64(soroban.ScaleFactor))

		if err := h.Soroban.OpenPosition(
			ctx,
			conn.AccountID, assetSymbol,
			debtScaled,
			h.SettlementToken,
			collScaled,
		); err != nil {
			log.Printf("[orders] OpenPosition failed for %s (%s): %v", conn.AccountID, p.side, err)
			continue
		}

		// Register with the liquidation engine for ongoing monitoring.
		h.Engine.Liquidation.AddPosition(&matching.OpenPosition{
			UserToken:        p.order.UserToken,
			Symbol:           fill.BuyOrder.Symbol,
			Side:             p.side,
			EntryPrice:       fill.FillPrice,
			Leverage:         p.order.Leverage,
			CollateralAmount: collateral,
			DebtAmount:       notional,
		})

		log.Printf("[orders] position opened: user=%s side=%s leverage=%dx notional=%.4f collateral=%.4f",
			conn.AccountID, p.side, p.order.Leverage, notional, collateral)
	}
}

// ── Order book snapshot ───────────────────────────────────────────────────────

type bookLevel struct {
	Price  float64 `json:"price"`
	Amount float64 `json:"amount"`
}

type bookSnapshot struct {
	Symbol string      `json:"symbol"`
	Bids   []bookLevel `json:"bids"`
	Asks   []bookLevel `json:"asks"`
}

func (h *OrdersHandler) snapshot(w http.ResponseWriter, r *http.Request) {
	symbol := r.URL.Query().Get("symbol")
	if symbol == "" {
		symbol = "XLM/USDC"
	}
	depth := 10

	bids, asks := h.Engine.BookSnapshot(symbol, depth)

	snap := bookSnapshot{Symbol: symbol}
	for _, o := range bids {
		snap.Bids = append(snap.Bids, bookLevel{Price: o.Price, Amount: o.Amount})
	}
	for _, o := range asks {
		snap.Asks = append(snap.Asks, bookLevel{Price: o.Price, Amount: o.Amount})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snap)
}
