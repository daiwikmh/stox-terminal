# How to Run agent-bridge

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Go | 1.24+ | `sudo rm -rf /usr/local/go && curl -fsSL https://go.dev/dl/go1.24.3.linux-amd64.tar.gz \| sudo tar -C /usr/local -xz` |
| Stellar testnet account | funded | [Stellar Lab](https://laboratory.stellar.org/) → Accounts → Create |

---

## 1. Configure environment

The `.env` file is **never committed** (it's in `.gitignore`).
Copy the example and fill in your values:

```bash
cp .env.example .env
```

The only mandatory field is `ADMIN_SECRET` — the secret key of the Stellar
account that was set as `admin` when the contracts were initialised.
Every other variable has a working testnet default.

```
ADMIN_SECRET=S...          # Stellar secret key — NEVER share or commit
AGENT_VAULT_ID=CCNK5O3F…  # AgentVault contract (testnet default already set)
LEVERAGE_POOL_ID=CCNF3J…   # LeveragePool contract (testnet default already set)
SETTLEMENT_TOKEN=GBB…      # USDC contract on testnet (default already set)
```

---

## 2. Build

```bash
# From the agent-bridge directory
/usr/local/go/bin/go build ./...

# Or build a single binary
/usr/local/go/bin/go build -o agent-bridge .
```

---

## 3. Run

```bash
# Load .env and start
export $(cat .env | xargs) && /usr/local/go/bin/go run .
# or with the binary:
export $(cat .env | xargs) && ./agent-bridge
```

The server starts on `:8090` by default.

```
[soroban] contract controller initialised
listening on :8090 (frontend=http://localhost:3000 rpc=https://soroban-testnet.stellar.org)
```

---

## 4. Admin endpoints

All require `Authorization: Bearer $ADMIN_SECRET`.

### Settle PnL — `POST /api/admin/settle`

Calls `AgentVault.settle_pnl`. Use after a trade closes.

```bash
curl -X POST http://localhost:8090/api/admin/settle \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddr":  "GABC...user G address",
    "pnl":       -90.5,
    "tokenAddr": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
  }'
```

- `pnl > 0` → profit is credited to the user's vault balance
- `pnl < 0` → loss is seized from the user's vault balance
- Amount is in **human units** (e.g. `-90.5` = −90.5 USDC); the bridge scales
  by `10_000_000` internally before calling the contract.

### Open synthetic position — `POST /api/admin/position`

Calls `LeveragePool.open_synthetic_position`. Run after matching-engine fill.

```bash
curl -X POST http://localhost:8090/api/admin/position \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "user":             "GABC...user G address",
    "assetSymbol":      "XLM",
    "debtAmount":       1000.0,
    "collateralToken":  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    "collateralLocked": 100.0
  }'
```

### Close position — `POST /api/admin/position/close`

Calls `LeveragePool.close_position`. **Always call Settle first.**

```bash
curl -X POST http://localhost:8090/api/admin/position/close \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "user":            "GABC...user G address",
    "collateralToken": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
  }'
```

---

## 5. Pro page — browser admin UI

The `/pro` page in the frontend exposes the same three endpoints via a UI.
Set these in `fin/.env.local`:

```
NEXT_PUBLIC_AGENT_BRIDGE_URL=http://localhost:8090
NEXT_PUBLIC_ADMIN_SECRET=your_admin_secret_here
```

> **Warning:** `NEXT_PUBLIC_*` variables are visible in the browser bundle.
> Only use the Pro page on a private / local network, never in production.

---

## 6. Liquidation (automatic)

When `ADMIN_SECRET` is set, the matching engine's liquidation loop calls
`soroban.Client.SettleTrade` **directly** — no HTTP round-trip.

Trigger conditions checked every 5 s:
- Long position: `(entryPrice − markPrice) / entryPrice × leverage × collateral ≥ 90 % × collateral`
- Short position: `(markPrice − entryPrice) / entryPrice × leverage × collateral ≥ 90 % × collateral`

Push a new mark price to trigger re-checks:

```bash
curl -X POST http://localhost:8090/api/price/update \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"XLM/USDC","price":0.08}'
```

---

## 7. Transaction retry (tx_bad_seq)

If two settlements race on the same admin nonce, the bridge detects
`tx_bad_seq` from the Soroban RPC, re-fetches the sequence number, and
retries automatically up to 3 times with a 2 s backoff.

---

## 8. Normal-user flow (browser)

Normal users interact directly with the contracts from the browser via the
**Pro page** (`/pro`) using their Stellar wallet (Freighter / any Wallets Kit
supported wallet). No admin secret is involved.

### Contract addresses (testnet)

| Token | Address |
|---|---|
| USDC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| XLM (wrapped) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| AgentVault | `CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG` |
| LeveragePool | `CCNF3JMO7MO5PSR7AS4GT3DKZU7MLDN5WS2ML7RWOGMGPLXTT7HXRY7L` |

### Step-by-step

1. **Connect wallet** — click "Connect Wallet" in the header.

2. **Deposit USDC into AgentVault** (`AgentVault` tab → Deposit)
   Calls `AgentVault.deposit(user, USDC_CONTRACT, amount × 10_000_000)`.
   Freighter prompts for approval; once signed the balance updates.

3. **Deposit collateral into LeveragePool** (`Collateral` tab → Deposit)
   Calls `LeveragePool.deposit_collateral(user, USDC_CONTRACT, amount × 10_000_000)`.
   This is the free collateral that the matching engine locks when a leveraged
   order fills.

4. **Place a leveraged order** — the AI agent or the order form on the Terminal
   page sends `POST /api/orders`.
   When matched the bridge admin automatically calls
   `LeveragePool.open_synthetic_position` and the position appears in the
   Collateral tab.

5. **View open position** — the Collateral tab shows asset symbol, notional debt,
   locked collateral, and effective leverage (debt ÷ locked collateral).

6. **Withdraw collateral** (Collateral tab → Withdraw) — only available on
   the free (unlocked) balance. Locked collateral is released after the admin
   calls Close Position.

### What each contract stores

| Contract | User-readable state |
|---|---|
| AgentVault | `get_balance(user, token)` — vault balance |
| LeveragePool | `get_collateral_balance(user, token)` — free collateral |
| LeveragePool | `get_position(user)` — open position (asset, debt, locked) |

---

## 9. Fly.io deployment

```bash
fly secrets set ADMIN_SECRET=S...
fly secrets set SETTLEMENT_TOKEN=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
fly deploy
```

All other variables are already set in `fly.toml` or use the testnet defaults.
The `ADMIN_SECRET` must **only** ever be set via `fly secrets` — never in
`fly.toml` or source code.
