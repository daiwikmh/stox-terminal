# Trading Mode

Full trading mode lets the AI agent place orders, open and close leveraged positions, and submit signed Stellar transactions. It requires a Stellar secret key stored securely in 1Password.

## Prerequisites

- 1Password account (personal or team)
- 1Password CLI (`op`) installed — see [1Password Setup](1password-setup.md)
- A funded Stellar testnet account (secret key starting with `S...`)
- agent-bridge running via `op run --env-file=.env -- go run .`

## Security model

The AI agent **never** sees your secret key. The flow is:

```
.env file  (contains op:// reference, not the raw secret)
    │
    ▼
op run     (resolves op:// → real secret, injects into process env)
    │
    ▼
agent-bridge  (has ADMIN_SECRET in memory, never returned over API)
    │
    ▼
AI agent   (only receives session token, not the secret)
```

The session token is a UUID with no cryptographic relationship to the secret key.

## Token flow

1. Browser calls `POST /api/token/generate` → receives `{ token }`.
2. Token is stored in the browser and passed as `X-Agent-Token` header.
3. When the AI calls write endpoints, the bridge resolves the token to a Stellar address via `/api/context`.
4. The bridge signs transactions with `ADMIN_SECRET` (for Soroban operations) or returns unsigned XDR for the user to sign via Freighter.

## Write endpoints

### POST /api/bridge/order/limit

Build an unsigned limit order XDR.

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

### POST /api/bridge/order/market

Build an unsigned market order XDR.

```bash
curl -X POST http://localhost:8090/api/bridge/order/market \
  -H "X-Agent-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "account": "GABC...",
    "symbol": "XLM/USDC",
    "side": "buy",
    "amount": "50",
    "slippage": 0.5
  }'
```

### POST /api/bridge/order/cancel

Cancel an open offer.

```json
{
  "account": "GABC...",
  "offerId": "123456789",
  "symbol": "XLM/USDC"
}
```

### POST /api/bridge/trustline/build

Build a trustline creation XDR.

```json
{
  "account": "GABC...",
  "asset": "USDC"
}
```

### POST /api/bridge/tx/submit

Submit a signed transaction XDR.

```bash
curl -X POST http://localhost:8090/api/bridge/tx/submit \
  -H "X-Agent-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "signedXdr": "AAAA..." }'
```

### POST /api/orders (matching engine)

Place an order in the internal synthetic matching engine (for leveraged positions).

```bash
curl -X POST http://localhost:8090/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_TOKEN",
    "symbol": "XLM/USDC",
    "side": "buy",
    "price": 0.11,
    "amount": 100,
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
      "buyToken": "...",
      "sellToken": "...",
      "price": 0.11,
      "amount": 100
    }
  ]
}
```

When a fill occurs, the bridge automatically calls `LeveragePool.open_synthetic_position` on-chain for both sides of the match.

## Signing flow for SDEX orders

The AI agent must sign transactions itself when acting autonomously. The recommended flow:

1. Call the build endpoint to get `{ xdr, networkPassphrase }`.
2. Load the secret key from the environment (`STELLAR_SECRET` or similar, injected by `op run`).
3. Sign the XDR using the Stellar SDK (`StellarSdk.Keypair.fromSecret(secret).sign(hash)`).
4. POST the signed XDR to `/api/bridge/tx/submit`.

> For a step-by-step guide on storing the secret in 1Password, see [1Password Setup](1password-setup.md).

## Positions API in trading mode

See [Positions API Reference](../api-reference/positions.md) for `POST /api/positions/open`, `POST /api/positions/close`, and `GET /api/positions`.
