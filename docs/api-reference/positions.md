# Positions API

The positions API records leveraged position metadata for PnL display. On-chain open/close calls are made directly by the frontend via Freighter. The bridge stores entry price, side, and leverage so the frontend (and AI agents) can compute unrealised PnL from the live oracle price.

---

## POST /api/positions/open

Record a new leveraged position. Call this after the frontend has successfully signed and submitted the on-chain `open_synthetic_position` transaction.

**Auth:** None (token in body)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `token` | string | yes | Session token |
| `side` | string | yes | `"long"` or `"short"` |
| `xlmAmount` | float | yes | XLM position size (must be > 0) |
| `leverage` | int | yes | Leverage multiplier (must be ≥ 2) |

```bash
curl -X POST http://localhost:8090/api/positions/open \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_TOKEN",
    "side": "long",
    "xlmAmount": 1000,
    "leverage": 5
  }'
```

**Response:**
```json
{
  "side": "long",
  "xlmAmount": 1000,
  "entryPrice": 0.112345,
  "totalUSDC": 112.345,
  "collateralUSDC": 22.469,
  "leverage": 5
}
```

| Field | Description |
|---|---|
| `entryPrice` | SDEX mid-price at the time of the call |
| `totalUSDC` | `xlmAmount × entryPrice` |
| `collateralUSDC` | `totalUSDC / leverage` |

The bridge fetches the current SDEX mid-price to record as the entry price. Ensure you call this immediately after the on-chain transaction confirms for accurate entry price recording.

---

## POST /api/positions/close

Remove the position record for a session. Call this after the frontend signs the on-chain `close_position` transaction.

**Auth:** None (token in body)

**Request body:**
```json
{
  "token": "YOUR_TOKEN"
}
```

```bash
curl -X POST http://localhost:8090/api/positions/close \
  -H "Content-Type: application/json" \
  -d '{ "token": "YOUR_TOKEN" }'
```

**Response:**
```json
{
  "pnl": 12.50,
  "closePrice": 0.12485
}
```

| Field | Description |
|---|---|
| `pnl` | Realised PnL in USDC at the time of closing. Positive = profit, negative = loss. |
| `closePrice` | SDEX mid-price at the time of the call |

If no position is recorded for the token, returns `{ "pnl": 0, "closePrice": 0 }` (treated as already closed).

---

## GET /api/positions

Get the current position and unrealised PnL for a session token.

**Auth:** None

**Query params:**

| Param | Required | Description |
|---|---|---|
| `token` | yes | Session token |

```bash
curl "http://localhost:8090/api/positions?token=YOUR_TOKEN"
```

**Response (position open):**
```json
{
  "userToken": "YOUR_TOKEN",
  "userAddr": "GABC...",
  "symbol": "XLM/USDC",
  "side": "long",
  "entryPrice": 0.112345,
  "xlmAmount": 1000,
  "totalUSDC": 112.345,
  "collateralUSDC": 22.469,
  "leverage": 5,
  "markPrice": 0.125,
  "unrealPnL": 12.655
}
```

**Response (no position):**
```json
null
```

The `unrealPnL` field is computed as:
- Long: `(markPrice - entryPrice) × xlmAmount`
- Short: `(entryPrice - markPrice) × xlmAmount`

`markPrice` is the current SDEX mid-price fetched live at query time.
