# Market Data API

## GET /api/prices

Return all mark prices tracked by the matching engine. Updated via the TradingView price webhook or the mock price updater.

**Auth:** None

```bash
curl http://localhost:8090/api/prices
```

**Response:**
```json
{
  "XLM/USDC": 0.112345,
  "NVDA/USD": 142.80,
  "AAPL/USD": 228.50
}
```

---

## POST /api/price/update

Push a new mark price for a symbol (called by TradingView webhook or test scripts).

**Auth:** None (restrict access via firewall/reverse proxy in production)

**Request body:**
```json
{
  "symbol": "XLM/USDC",
  "price": 0.115
}
```

**Response:**
```json
{ "ok": true }
```

---

## GET /api/bridge/pairs

List all available trading pairs on the SDEX.

**Auth:** `X-Agent-Token` header

**Headers:**
```
X-Agent-Token: YOUR_TOKEN
X-Stellar-Network: TESTNET
```

```bash
curl http://localhost:8090/api/bridge/pairs \
  -H "X-Agent-Token: YOUR_TOKEN"
```

---

## GET /api/bridge/orderbook

Live order book for a trading pair from the SDEX.

**Auth:** `X-Agent-Token` header

**Query params:**

| Param | Required | Description |
|---|---|---|
| `symbol` | yes | Trading pair, e.g. `XLM/USDC` |

```bash
curl "http://localhost:8090/api/bridge/orderbook?symbol=XLM/USDC" \
  -H "X-Agent-Token: YOUR_TOKEN"
```

**Response:**
```json
{
  "bids": [
    { "price": "0.1123000", "amount": "5000.0000000" },
    { "price": "0.1122000", "amount": "12000.0000000" }
  ],
  "asks": [
    { "price": "0.1124000", "amount": "3200.0000000" },
    { "price": "0.1126000", "amount": "8500.0000000" }
  ]
}
```

---

## GET /api/bridge/price

Mid-price (arithmetic mean of best bid and best ask) for a pair.

**Auth:** `X-Agent-Token` header

**Query params:**

| Param | Required | Description |
|---|---|---|
| `symbol` | yes | Trading pair, e.g. `XLM/USDC` |

```bash
curl "http://localhost:8090/api/bridge/price?symbol=XLM/USDC" \
  -H "X-Agent-Token: YOUR_TOKEN"
```

**Response:**
```json
{
  "symbol": "XLM/USDC",
  "price": "0.1123500"
}
```

---

## GET /api/bridge/offers

Open SDEX offers for a Stellar account.

**Auth:** `X-Agent-Token` header

**Query params:**

| Param | Required | Description |
|---|---|---|
| `account` | yes | `G...` Stellar account address |

```bash
curl "http://localhost:8090/api/bridge/offers?account=GABC..." \
  -H "X-Agent-Token: YOUR_TOKEN"
```

---

## GET /api/bridge/trades

Recent trade history for a Stellar account.

**Auth:** `X-Agent-Token` header

**Query params:**

| Param | Required | Description |
|---|---|---|
| `account` | yes | `G...` Stellar account address |
| `limit` | no | Number of trades to return (default: 20) |

```bash
curl "http://localhost:8090/api/bridge/trades?account=GABC...&limit=10" \
  -H "X-Agent-Token: YOUR_TOKEN"
```

---

## GET /api/bridge/trustline

Check whether an account holds a trustline for an asset.

**Auth:** `X-Agent-Token` header

**Query params:**

| Param | Required | Description |
|---|---|---|
| `account` | yes | `G...` Stellar account address |
| `asset` | yes | Asset code, e.g. `USDC` |

```bash
curl "http://localhost:8090/api/bridge/trustline?account=GABC...&asset=USDC" \
  -H "X-Agent-Token: YOUR_TOKEN"
```

**Response:**
```json
{
  "has_trustline": true,
  "balance": "250.0000000"
}
```
