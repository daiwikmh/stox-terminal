# Orders API

## POST /api/orders

Place an order in the internal synthetic matching engine. Used by AI agents to open leveraged positions. When a fill occurs, the bridge automatically calls `LeveragePool.open_synthetic_position` on-chain for both the buyer and seller.

**Auth:** None (token in body)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `token` | string | yes | Session token identifying the agent |
| `symbol` | string | yes | Trading pair, e.g. `"XLM/USDC"` |
| `side` | string | yes | `"buy"` or `"sell"` |
| `price` | float | yes | Limit price |
| `amount` | float | yes | Base asset amount |
| `leverage` | int | no | Leverage multiplier (default: 1 = spot) |

```bash
curl -X POST http://localhost:8090/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_TOKEN",
    "symbol": "XLM/USDC",
    "side": "buy",
    "price": 0.11,
    "amount": 1000,
    "leverage": 5
  }'
```

**Response:**
```json
{
  "orderId": "",
  "fills": 1,
  "results": [
    {
      "buyToken": "550e8400-...",
      "sellToken": "66e8f2b1-...",
      "price": 0.11,
      "amount": 1000
    }
  ]
}
```

| Field | Description |
|---|---|
| `fills` | Number of fills generated |
| `results` | Array of fill summaries; each has `buyToken`, `sellToken`, `price`, `amount` |

A fill triggers an asynchronous `open_synthetic_position` on-chain call for each party. The HTTP response is returned immediately; the chain write happens in the background.

---

## GET /api/orders

Get a live snapshot of the internal order book for a symbol.

**Auth:** None

**Query params:**

| Param | Required | Description |
|---|---|---|
| `symbol` | no | Trading pair (default: `XLM/USDC`) |
| `depth` | no | Levels per side (default: 10) |

```bash
curl "http://localhost:8090/api/orders?symbol=XLM/USDC&depth=5"
```

**Response:**
```json
{
  "symbol": "XLM/USDC",
  "bids": [
    { "price": 0.112, "amount": 5000 },
    { "price": 0.111, "amount": 3000 }
  ],
  "asks": [
    { "price": 0.113, "amount": 2000 },
    { "price": 0.114, "amount": 8000 }
  ]
}
```

This order book is the **internal synthetic CLOB** — not the live SDEX. It is the book that AI agents trade against. For the live SDEX book, use `/api/bridge/orderbook`.

---

## POST /api/bridge/order/limit

Build an unsigned limit order XDR for the SDEX.

**Auth:** `X-Agent-Token` header

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `account` | string | yes | `G...` Stellar account address |
| `symbol` | string | yes | Trading pair, e.g. `"XLM/USDC"` |
| `side` | string | yes | `"buy"` or `"sell"` |
| `amount` | string | yes | Base asset amount |
| `price` | string | yes | Price in quote token per base token |

```bash
curl -X POST http://localhost:8090/api/bridge/order/limit \
  -H "X-Agent-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "account": "GABC...",
    "symbol": "XLM/USDC",
    "side": "buy",
    "amount": "100",
    "price": "0.112"
  }'
```

**Response:**
```json
{
  "xdr": "AAAA...",
  "networkPassphrase": "Test SDF Network ; September 2015"
}
```

Sign the XDR with the user's keypair, then submit via `POST /api/bridge/tx/submit`.

---

## POST /api/bridge/order/market

Build an unsigned market order XDR.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `account` | string | yes | `G...` Stellar account address |
| `symbol` | string | yes | Trading pair |
| `side` | string | yes | `"buy"` or `"sell"` |
| `amount` | string | yes | Pay-side amount |
| `slippage` | float | no | Slippage % (default: 0.5) |

---

## POST /api/bridge/order/cancel

Build an unsigned offer cancellation XDR.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `account` | string | yes | `G...` Stellar account address |
| `offerId` | string | yes | SDEX offer ID to cancel |
| `symbol` | string | yes | Trading pair |

---

## POST /api/bridge/tx/submit

Submit a signed transaction XDR to the Stellar network.

**Auth:** `X-Agent-Token` header

**Request body:**
```json
{
  "signedXdr": "AAAA..."
}
```

**Response (success):**
```json
{
  "success": true,
  "txHash": "abcdef1234567890..."
}
```

**Response (error):**
```json
{
  "success": false,
  "errorMessage": "Transaction failed: op_no_source_account"
}
```
