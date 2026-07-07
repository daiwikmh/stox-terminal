<div align="center">

# Stox Terminal

### AI-Powered Leveraged Trading on Stellar

*Synthetic positions, real leverage, and on-chain PnL — no counterparty risk. Trade with an AI agent.*

[![Built on Stellar](https://img.shields.io/badge/Built%20on-Stellar%20Soroban-6fbcf0?logo=stellar&logoColor=white)](https://stellar.org/)
[![Smart Contracts: Rust/WASM](https://img.shields.io/badge/Smart%20Contracts-Rust%2FWASM-ce422b?logo=rust)](https://www.rust-lang.org/)
[![Agent Bridge: Go](https://img.shields.io/badge/Bridge-Go%201.24-00add8?logo=go&logoColor=white)](https://golang.org/)
[![Frontend: Next.js 15](https://img.shields.io/badge/Frontend-Next.js%2015-black?logo=next.js)](https://nextjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#-license)

[**Live Terminal**](https://stox-trading.vercel.app/terminal) · [**Docs**](https://daiwiks-organization.gitbook.io/stox-terminal) · [**Bridge API**](#-api-overview)

</div>

---

## What is Stox?

A full-stack trading protocol built on **Stellar Soroban**. Take synthetic long/short leveraged positions on XLM, BTC, ETH, or major stocks—priced from the live SDEX order book, with PnL and collateral managed by on-chain smart contracts and a Go agent bridge. No intermediaries, no repricing delays, no counterparty oracle.

Trade solo or connect an AI agent (OpenClaw) to automate execution and market analysis—the agent reads live data or executes trades with your blessing, all over a token-gated API.

---

## 🏗️ Architecture

Two services, one contract family — separation of concerns:

```
Browser (fin/)          agent-bridge (Go)           Stellar Network
─────────────           ─────────────────           ───────────────
/terminal    ──SSE──►  /api/logs/stream             Horizon REST
/pro         ──HTTP──► /api/admin/*   ──Soroban──►  AgentVault
AI agent     ──HTTP──► /api/bridge/*                LeveragePool
                        /api/orders
                        /api/prices
```

| Layer | Stack | What it does |
|---|---|---|
| **Frontend** (`fin/`) | Next.js 15, TailwindCSS, TradingView | Terminal UI, live agent logs (SSE), LP dashboard, Freighter wallet integration |
| **Agent Bridge** (`agent-bridge/`) | Go 1.24, HTTP/REST | In-process matching engine, Soroban caller, token auth, AI agent API, liquidation monitor |
| **Smart Contracts** | Soroban (Rust → WASM) | Collateral holding, PnL computation, LP pool mechanics, trustless settlement |

---

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

### The Terminal
- **Live SDEX Charts** — limit and market orders on Stellar's native DEX with TradingView candlesticks, order book depth, and fill price transparency.
- **2×–20× Leverage** — long/short synthetic positions on XLM, BTC, ETH, SOL, NVDA, AAPL, TSLA, MSFT, GOOGL, AMZN, META — without minting physical assets or fragmenting liquidity.
- **On-chain PnL** — LeveragePool v3 stores position data in the contract; PnL is computed at close by the chain, not by an oracle or off-chain agent.

### The AI Agent Layer (OpenClaw)
- **Token-gated API** — any LLM (Claude, GPT-4, etc.) gets a session token to read market data or execute trades autonomously with your blessing.
- **Read-only or autonomous** — watch prices and order book, or give the agent permission to place, amend, and settle trades.
- **No secrets on the browser** — the agent bridge holds the admin key; your browser only signs user operations via Freighter. Trades are submitted by the bridge, which is yours.

### For Liquidity Providers
- **LP Pool** — deposit USDC, earn from the spread on synthetic positions that route through the pool.
- **Auto-liquidation** — the Go bridge monitors every 5 s; positions at 90% loss are settled automatically so the pool doesn't go underwater.

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

## The AI Agent Layer — OpenClaw

A token-gated API that lets any LLM (Claude, GPT-4, Gemini) read market data or trade autonomously. You stay in control — the agent can only act on explicit approval.

### How it works

```
1. User clicks "Connect OpenClaw" in /terminal
   ▼
2. Bridge generates token: { token: "oc_..." } + system prompt
   ▼
3. User pastes prompt + token into any LLM
   ▼
4. LLM reads prices, order book, executes trades
   │
   └─ Read-only: GET /api/bridge/price, /orderbook, /pairs, /trades
   │
   └─ Trading: POST /api/bridge/order/{limit|market}
               → builds unsigned XDR
               → (you or agent signs with 1Password keypair)
               → POST /api/bridge/tx/submit
               → Horizon → Stellar
               ▼
5. Agent posts logs to /api/logs
   │
   └─ User sees live logs in /terminal right sidebar (SSE stream)
```

### Modes

| Mode | Capabilities | Credentials |
|---|---|---|
| **Read-only** | Prices, order book, pairs, trade history, open offers | `oc_...` token |
| **Trading** | Above + place/amend orders, submit signed transactions | Token + Stellar keypair (1Password) |

### Quick Start

1. **Open `/terminal`** → right sidebar → **Agent** → **OpenClaw** → **Connect**
2. **Copy** the generated token + system prompt
3. **Paste** into Claude, GPT-4, or your LLM of choice
4. **For trading:** complete the [1Password setup](#1password-configuration) to auto-sign transactions


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

### Self-host

**Bridge:**
```bash
cd agent-bridge && go build -tags netgo -ldflags '-s -w' -o app .
./app  # port :8090
```
---

## 📄 License

Released under the **MIT License**.

<div align="center">
<sub>Built on <a href="https://stellar.org/">Stellar</a> · <a href="https://soroban.stellar.org/">Soroban</a> · <a href="https://www.rust-lang.org/">Rust</a></sub>
</div>
