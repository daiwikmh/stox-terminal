# Admin API

Admin endpoints call Soroban smart contracts directly using the `ADMIN_SECRET` key. All requests must include an `Authorization: Bearer` header.

> **Security note:** If `ADMIN_SECRET` is not set in the environment, admin endpoints accept any request (development mode). Never deploy without setting `ADMIN_SECRET`.

---

## Authentication

```
Authorization: Bearer <ADMIN_SECRET>
```

Where `<ADMIN_SECRET>` is the value of the `ADMIN_SECRET` environment variable — the Stellar secret key (`S...`) used for signing admin transactions.

---

## POST /api/admin/settle

Call `AgentVault.settle_pnl(user, token, pnl)` to credit or debit a trader's margin balance.

**Auth:** Bearer token (ADMIN_SECRET)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `userAddr` | string | yes | `G...` Stellar address of the trader |
| `pnl` | float | yes | PnL in human USDC units. Positive = profit credited; negative = loss seized. |
| `tokenAddr` | string | yes | `C...` contract address of the settlement token |

```bash
curl -X POST http://localhost:8090/api/admin/settle \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddr": "GABC...",
    "pnl": -50.0,
    "tokenAddr": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
  }'
```

**Response:**
```json
{ "ok": true }
```

Internally, the bridge multiplies `pnl` by `ScaleFactor = 10_000_000` before calling the contract. For example, `pnl: -50.0` becomes `pnlScaled: -500_000_000` as an i128.

**Error responses:**
- `400` — `userAddr`, `pnl`, and `tokenAddr` are required
- `401` — Missing or wrong Authorization header
- `500` — On-chain call failed (check bridge logs for the Soroban error)

---

## POST /api/admin/position

Call `LeveragePool.open_synthetic_position(user, assetSymbol, xlmAmount, entryPrice, isLong, collateralToken, collateralLocked)`.

**Auth:** Bearer token (ADMIN_SECRET)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user` | string | yes | `G...` Stellar address of the trader |
| `assetSymbol` | string | yes | Short asset name, e.g. `"XLM"` |
| `xlmAmount` | float | yes | Position size in base-asset units |
| `entryPrice` | float | yes | Entry price in USDC per token |
| `isLong` | bool | yes | `true` = long, `false` = short |
| `collateralToken` | string | yes | `C...` address of collateral token |
| `collateralLocked` | float | yes | Collateral amount to lock |

```bash
curl -X POST http://localhost:8090/api/admin/position \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "GABC...",
    "assetSymbol": "XLM",
    "xlmAmount": 1000.0,
    "entryPrice": 0.112,
    "isLong": true,
    "collateralToken": "CDLZFC3S...",
    "collateralLocked": 22.4
  }'
```

**Response:**
```json
{ "ok": true }
```

All float amounts are scaled by `ScaleFactor = 10_000_000` before the on-chain call.

---

## POST /api/admin/position/close

Call `LeveragePool.close_position(user, collateralToken, closePrice)`. The contract computes PnL on-chain from the stored `entry_price`, `xlm_amount`, and `is_long`.

**Auth:** Bearer token (ADMIN_SECRET)

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `user` | string | yes | `G...` Stellar address of the trader |
| `collateralToken` | string | yes | `C...` address of the collateral token |
| `closePrice` | float | yes | Current mark price in USDC per token |

```bash
curl -X POST http://localhost:8090/api/admin/position/close \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "GABC...",
    "collateralToken": "CDLZFC3S...",
    "closePrice": 0.125
  }'
```

**Response:**
```json
{ "ok": true }
```

The bridge scales `closePrice` by `ScaleFactor` before passing it to the contract. The contract then computes and settles the final PnL based on the on-chain stored entry data.
