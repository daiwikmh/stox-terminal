# Stoxy — AI-Powered Leveraged Trading on Stellar

A full-stack trading protocol built on **Stellar Soroban**. Stoxy lets users take synthetic long/short leveraged positions on XLM/USDC (and synthetic stocks) priced from the live SDEX order book, with PnL and collateral managed by on-chain smart contracts and a Go agent bridge.

---

## Architecture

```
Browser (fin/)          agent-bridge (Go)           Stellar Network
─────────────           ─────────────────           ───────────────
/terminal    ──SSE──►  /api/logs/stream             Horizon REST
/pro (admin) ──HTTP──► /api/admin/*   ──Soroban──►  AgentVault
AI agent     ──HTTP──► /api/bridge/*                LeveragePool
                        /api/orders
                        /api/prices
```

| Layer | Stack | Purpose |
|---|---|---|
| **Frontend** (`fin/`) | Next.js 15, TailwindCSS, TradingView | Trading terminal, AI agent UI, admin panel |
| **Agent Bridge** (`agent-bridge/`) | Go 1.24, pure HTTP | Matching engine, Soroban controller, AI agent API |
| **Smart Contracts** | Soroban (Rust → WASM) | On-chain collateral, PnL settlement, LP pool |

---

## Smart Contracts (Testnet)

All monetary values are `i128` with **7 decimal places** — `ScaleFactor = 10_000_000`.

| Contract | Address | Purpose |
|---|---|---|
| **AgentVault** | `CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG` | Holds USDC margin; settles PnL |
| **LeveragePool v3** | `CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL` | Synthetic positions, LP pool; on-chain PnL computation |
| **USDC (SAC)** | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | Testnet USDC Stellar Asset Contract |

TypeScript SDK bindings in `contracts/packages/vault_sdk` and `leverage_sdk` are used by the frontend for user-signed calls.

---

## Features

- **SDEX Terminal** — limit and market orders on Stellar's native DEX with live TradingView charts
- **Leveraged Positions** — 2×–20× long/short synthetic positions on XLM, NVDA, AAPL
- **On-chain PnL** — LeveragePool v3 stores `entry_price + xlm_amount + is_long`; PnL computed in the contract at close
- **AI Agent (OpenClaw)** — token-based API for any LLM; two modes: read-only market data or full trading
- **LP Pool** — deposit USDC as a liquidity provider and earn from trading activity
- **Liquidation Engine** — Go process polls every 5s; auto-liquidates positions at 90% loss threshold

---

## Leveraged Position Lifecycle

```
1. User deposits collateral → LeveragePool.deposit_collateral (Freighter)
2. Bridge admin key opens position → LeveragePool.open_synthetic_position
   stores: entry_price, xlm_amount, is_long
3. Liquidation engine monitors: loss ≥ 90% collateral → auto-settle
4. User closes → LeveragePool.close_position (bridge admin key)
   contract computes: pnl = (close_price - entry_price) × xlm_amount  [long]
                             (entry_price - close_price) × xlm_amount  [short]
5. Bridge forwards pnl → AgentVault.settle_pnl → updates user margin balance
```

---

## Getting Started

### Prerequisites

- Go 1.24+ (`/usr/local/go/bin/go`)
- Node.js 18+
- [Freighter wallet](https://freighter.app/) browser extension
- Funded Stellar testnet account ([faucet](https://laboratory.stellar.org/#account-creator))

### 1. Clone

```bash
git clone https://github.com/your-org/stoxy.git
cd stoxy
```

### 2. Configure the bridge

Create `agent-bridge/.env`:

```env
ADMIN_SECRET=S...                  # Stellar secret key for admin contract calls
AGENT_VAULT_ID=CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG
LEVERAGE_POOL_ID=CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL
SETTLEMENT_TOKEN=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
FRONTEND_URL=http://localhost:3000
PORT=8090
```

**Recommended:** Store `ADMIN_SECRET` in 1Password and inject it at runtime:

```bash
# Store secret
op item create --vault StellarTrading --category Password --title AdminKey \
  --field-name credential --value SXXX...

# Update .env
echo "ADMIN_SECRET=op://StellarTrading/AdminKey/credential" >> agent-bridge/.env

# Run
op run --env-file=agent-bridge/.env -- /usr/local/go/bin/go run .
```

### 3. Start the bridge

```bash
cd agent-bridge
export $(cat .env | xargs) && /usr/local/go/bin/go run .
# Listening on :8090
```

### 4. Configure the frontend

Create `fin/.env.local`:

```env
NEXT_PUBLIC_AGENT_BRIDGE_URL=http://localhost:8090
```

### 5. Start the frontend

```bash
cd fin
npm install
npm run dev
# http://localhost:3000
```

Open `/terminal` in your browser and connect Freighter.

---

## Project Structure

```
stoxy/
├── agent-bridge/           Go HTTP server (port 8090)
│   ├── internal/
│   │   ├── handler/        HTTP handlers (orders, positions, admin, …)
│   │   ├── matching/       In-process CLOB + liquidation engine
│   │   ├── soroban/        Contract controller (simulate → sign → submit)
│   │   ├── sdex/           Horizon SDEX client
│   │   └── store/          In-memory session store
│   └── main.go
├── fin/                    Next.js frontend
│   └── src/
│       ├── app/            Pages: /terminal, /pro, /portfolio
│       ├── components/     UI components
│       ├── configs/        Trading pairs config
│       └── utils/          Wallet, bridge, TradingView helpers
├── contracts/
│   └── packages/
│       ├── vault_sdk/      TypeScript bindings for AgentVault
│       └── leverage_sdk/   TypeScript bindings for LeveragePool
└── docs/                   GitBook documentation
```

---

## API Overview

Base URL: `http://localhost:8090`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/token/generate` | none | Create AI agent session token |
| GET | `/api/logs/stream?token=` | token | SSE log stream |
| GET/POST | `/api/context` | token | Sync UI state / account watcher |
| GET/POST | `/api/orders` | token | Order book snapshot / place order |
| GET | `/api/prices` | none | All mark prices |
| `*` | `/api/bridge/*` | token | Proxy to Next.js SDEX API |
| POST | `/api/positions/open` | token | Record open position |
| POST | `/api/positions/close` | token | Record close position |
| GET | `/api/positions` | token | Get position + unrealised PnL |
| POST | `/api/admin/settle` | Bearer | `AgentVault.settle_pnl` |
| POST | `/api/admin/position` | Bearer | `LeveragePool.open_synthetic_position` |
| POST | `/api/admin/position/close` | Bearer | `LeveragePool.close_position` |

Full API docs: [`docs/api-reference/`](docs/api-reference/overview.md)

---

## AI Agent (OpenClaw)

Connect any LLM to Stoxy via a session token:

1. Open `/terminal` → right sidebar → **Agent** → **OpenClaw** → **Connect**
2. Copy the generated system prompt (contains your token + base URL)
3. Paste into Claude, GPT-4, or any AI model
4. Choose **Option A** (read-only) or **Option B** (full trading)

**Read-only endpoints:** prices, order book, pairs, offers, trade history, trustlines — no secrets needed.

**Trading endpoints:** place orders, open/close leveraged positions, submit signed XDRs — requires a Stellar keypair in 1Password.

Docs: [`docs/ai-agent/`](docs/ai-agent/overview.md)

---

## Design Decisions

- **Admin key never touches the browser** — all privileged Soroban calls are gated behind the Go bridge. The browser signs only user operations (deposit, withdraw) via Freighter.
- **Synthetic positions** — no physical asset fragmentation; pure economic exposure via on-chain state.
- **On-chain PnL (v3)** — `close_position` computes PnL in the contract from stored position data, removing the need for a trusted off-chain oracle at close time.
- **Mutex-serialised Soroban calls** — a single `sync.Mutex` in `soroban.Client` prevents concurrent admin calls from racing on the account sequence number.
- **1Password for secrets** — `ADMIN_SECRET` is stored as an `op://` reference; `op run` injects the real value at process start.

---

## Documentation

Full documentation is in [`docs/`](docs/README.md) and published via GitBook.

| Section | Link |
|---|---|
| Quick Start | [docs/getting-started/quick-start.md](docs/getting-started/quick-start.md) |
| Trading | [docs/trading/](docs/trading/terminal.md) |
| AI Agent | [docs/ai-agent/](docs/ai-agent/overview.md) |
| API Reference | [docs/api-reference/](docs/api-reference/overview.md) |
| Smart Contracts | [docs/smart-contracts/](docs/smart-contracts/overview.md) |
| Self-Hosting | [docs/self-hosting/](docs/self-hosting/requirements.md) |

---

## Deployment

**Bridge (Leapcell):**
- Root: `.`
- Build: `cd agent-bridge && go build -tags netgo -ldflags '-s -w' -o app .`
- Start: `./agent-bridge/app`
- Port: `8090`

**Frontend:** Deploy `fin/` to Vercel with `NEXT_PUBLIC_AGENT_BRIDGE_URL` pointing to your bridge URL.

Full guide: [docs/self-hosting/deployment.md](docs/self-hosting/deployment.md)
