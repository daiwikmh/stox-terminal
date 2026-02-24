# Stox — AI-Powered Leveraged Trading on Stellar

A full-stack trading protocol built on **Stellar Soroban**. Stoxy lets users take synthetic long/short leveraged positions on XLM/USDC (and synthetic stocks) priced from the live SDEX order book, with PnL and collateral managed by on-chain smart contracts and a Go agent bridge.

---

## Architecture

```
Browser (fin/)          agent-bridge (Go)           Stellar Network
─────────────           ─────────────────           ───────────────
/terminal    ──SSE──►  /api/logs/stream             Horizon REST
/pro         ──HTTP──► /api/admin/*   ──Soroban──►  AgentVault
AI agent     ──HTTP──► /api/bridge/*                LeveragePool
                        /api/orders
                        /api/prices
```

| Layer | Stack | Purpose |
|---|---|---|
| **Frontend** (`fin/`) | Next.js 15, TailwindCSS, TradingView | Trading terminal, AI agent UI, LP pool |
| **Agent Bridge** (`agent-bridge/`) | Go 1.24, pure HTTP | Matching engine, Soroban controller, AI agent API |
| **Smart Contracts** | Soroban (Rust → WASM) | On-chain collateral, PnL settlement, LP pool |

---

## Smart Contracts

All monetary values are `i128` with **7 decimal places** — `ScaleFactor = 10_000_000`.

### Mainnet

| Contract | Address | Purpose |
|---|---|---|
| **LeveragePool v3** | `CBJGQAF7NDGSQOHG5ZXFB7PPXVPOUI7LQX7DNFWSRCUAT5OO4YRGBUPD` | Synthetic positions, LP pool; on-chain PnL computation |

> Additional mainnet contracts will be listed as they are deployed.

### Testnet

| Contract | Address | Purpose |
|---|---|---|
| **AgentVault** | `CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG` | Holds USDC margin; settles PnL |
| **LeveragePool v3** | `CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL` | Synthetic positions, LP pool; on-chain PnL computation |
| **USDC (SAC)** | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | Testnet USDC Stellar Asset Contract |

TypeScript SDK bindings in `contracts/packages/vault_sdk` and `leverage_sdk` are used by the frontend for user-signed calls.

---

## Features

- **SDEX Terminal** — limit and market orders on Stellar's native DEX with live TradingView charts
- **Leveraged Positions** — 2×–20× long/short synthetic positions on XLM, BTC, ETH, SOL, NVDA, AAPL, TSLA, MSFT, GOOGL, AMZN, META
- **On-chain PnL** — LeveragePool v3 stores `entry_price + xlm_amount + is_long`; PnL computed in the contract at close
- **AI Agent (OpenClaw)** — token-based API for any LLM; read-only market data or full autonomous trading
- **LP Pool** — deposit USDC as a liquidity provider and earn from trading activity
- **Liquidation Engine** — Go process polls every 5 s; auto-liquidates positions at 90% loss threshold

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

## AI Agent — OpenClaw

OpenClaw is a token-gated bridge that lets any LLM (Claude, GPT-4, etc.) read market data or execute trades autonomously on Stoxy.

### How it works

```
┌─────────────────────────────────────────────────────────────────┐
│                      OpenClaw Workflow                          │
└─────────────────────────────────────────────────────────────────┘

  User (/terminal)
      │
      │  1. Click "Connect OpenClaw"
      ▼
  agent-bridge
      │  POST /api/token/generate
      │  ◄── returns { token: "oc_..." }
      │
      │  2. System prompt auto-generated
      │     (token + base URL + endpoint list + 1Password instructions)
      ▼
  User copies prompt
      │
      │  3. Paste into any LLM (Claude / GPT-4 / etc.)
      ▼
  LLM (OpenClaw agent)
      │
      ├─ Read-only mode ──────────────────────────────────────────►
      │    GET /api/bridge/price                  no secrets needed
      │    GET /api/bridge/orderbook
      │    GET /api/bridge/pairs
      │    GET /api/bridge/offers
      │    GET /api/bridge/trades
      │
      └─ Trading mode ────────────────────────────────────────────►
           GET  /api/context          (view user's current pair/account)
           POST /api/bridge/order/limit    ──► build unsigned XDR
           POST /api/bridge/order/market   ──► build unsigned XDR
           POST /api/bridge/trustline/build
               │
               │  sign XDR using keypair from 1Password
               ▼
           POST /api/bridge/tx/submit  ──► Horizon ──► Stellar Network
               │
               ▼
           POST /api/logs              (agent posts execution log)
               │
               ▼
  SSE stream (/api/logs/stream?token=...)
      │
      ▼
  User sees live logs in /terminal right sidebar
```

### Modes

| Mode | What the agent can do | Credentials required |
|---|---|---|
| **Read-only** | Prices, order book, pairs, trade history, open offers | Session token only |
| **Trading** | All read-only + place orders, cancel orders, submit signed XDRs | Session token + Stellar keypair in 1Password |

### Quick start

1. Open `/terminal` → right sidebar → **Agent** tab → **OpenClaw** → **Connect**
2. Copy the generated session token and system prompt
3. Paste the prompt into your LLM
4. For trading mode, complete the [1Password setup](#1password-configuration) below

### Agent endpoints

All requests require `X-Agent-Token: <token>` header.

| Method | Path | Description |
|---|---|---|
| GET | `/api/context` | Current user view + account state |
| GET | `/api/bridge/pairs` | All trading pairs |
| GET | `/api/bridge/orderbook?symbol=` | Order book snapshot |
| GET | `/api/bridge/price?symbol=` | Mid price |
| GET | `/api/bridge/offers?account=` | User's open SDEX offers |
| GET | `/api/bridge/trades?account=` | Trade history |
| POST | `/api/bridge/order/limit` | Build limit order XDR |
| POST | `/api/bridge/order/market` | Build market order XDR |
| POST | `/api/bridge/order/cancel` | Build cancel XDR |
| POST | `/api/bridge/trustline/build` | Build trustline XDR |
| POST | `/api/bridge/tx/submit` | Submit a signed XDR |

---

## 1Password Configuration

OpenClaw trading mode requires the agent to sign Stellar transactions. The keypair is stored in 1Password and injected at runtime — the secret key never touches the browser or the agent's context window.

### 1. Install the 1Password CLI

```bash
# macOS
brew install 1password-cli

# Linux
curl -sS https://downloads.1password.com/linux/keys/1password.asc | \
  sudo gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] \
  https://downloads.1password.com/linux/debian/$(dpkg --print-architecture) stable main" | \
  sudo tee /etc/apt/sources.list.d/1password.list
sudo apt update && sudo apt install 1password-cli

# Verify
op --version
```

### 2. Sign in

```bash
op signin
```

### 3. Store your Stellar secret key

```bash
op item create \
  --vault StellarTrading \
  --category Password \
  --title AdminKey \
  --field-name credential \
  --value SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 4. Reference it in your `.env`

In `agent-bridge/.env`, replace the raw secret with an `op://` URI:

```env
ADMIN_SECRET=op://StellarTrading/AdminKey/credential
```

### 5. Run the bridge with secret injection

```bash
op run --env-file=agent-bridge/.env -- /usr/local/go/bin/go run .
```

`op run` resolves all `op://` references before the process starts. The secret is present in memory only — it is never written to disk or logged.

### Why 1Password?

- The raw secret key never appears in your shell history, environment exports, or log output
- Rotating a compromised key requires one `op item edit` — no code changes
- The same pattern works in CI/CD: replace `op run` with the 1Password GitHub Actions integration

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
ADMIN_SECRET=S...                  # Stellar secret key (or op:// reference)
AGENT_VAULT_ID=CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG
LEVERAGE_POOL_ID=CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL
SETTLEMENT_TOKEN=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
FRONTEND_URL=http://localhost:3000
PORT=8090
```

### 3. Start the bridge

```bash
# Without 1Password
cd agent-bridge
export $(cat .env | xargs) && /usr/local/go/bin/go run .

# With 1Password (recommended)
op run --env-file=agent-bridge/.env -- /usr/local/go/bin/go run .

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
│       ├── app/            Pages: /terminal, /pro
│       ├── components/     UI components
│       ├── configs/        Trading pairs config
│       └── utils/          Wallet, bridge, TradingView helpers
└── contracts/
    └── packages/
        ├── vault_sdk/      TypeScript bindings for AgentVault
        └── leverage_sdk/   TypeScript bindings for LeveragePool
```

---

## API Overview

Base URL (local): `http://localhost:8090`
Base URL (deployed): `https://fin-14qn.onrender.com`

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

Full API docs: `agent-bridge/ARCHITECTURE.md`

---

## Design Decisions

- **Admin key never touches the browser** — all privileged Soroban calls are gated behind the Go bridge. The browser signs only user operations (deposit, withdraw) via Freighter.
- **Synthetic positions** — no physical asset fragmentation; pure economic exposure via on-chain state.
- **On-chain PnL (v3)** — `close_position` computes PnL in the contract from stored position data, removing the need for a trusted off-chain oracle at close time.
- **Mutex-serialised Soroban calls** — a single `sync.Mutex` in `soroban.Client` prevents concurrent admin calls from racing on the account sequence number.
- **1Password for secrets** — `ADMIN_SECRET` is stored as an `op://` reference; `op run` injects the real value at process start, keeping it out of shell history and logs.

---

## Documentation

| Section | Location |
|---|---|
| Bridge architecture & API | `agent-bridge/ARCHITECTURE.md` |
| Smart contract source | `contracts/contracts/agent_vault/` · `contracts/contracts/leverage_pool/` |
| TypeScript SDK bindings | `contracts/packages/vault_sdk/` · `contracts/packages/leverage_sdk/` |
| User-facing docs | [GitBook](https://daiwiks-organization.gitbook.io/stox-terminal) |

---

## Deployment

### Live

| Service | Network | Platform | URL |
|---|---|---|---|
| **Frontend** | Mainnet + Testnet | Vercel | `https://stox-trading.vercel.app` |
| **Agent Bridge** | Testnet | Render | `https://fin-14qn.onrender.com` |

### Self-hosting

**Bridge:**
- Build: `cd agent-bridge && go build -tags netgo -ldflags '-s -w' -o app .`
- Start: `./agent-bridge/app`
- Port: `8090`
- Set `FRONTEND_URL` and `ALLOWED_ORIGIN` in `.env` for your domain.

**Frontend:** Deploy `fin/` to Vercel with `NEXT_PUBLIC_AGENT_BRIDGE_URL` pointing to your bridge URL.
