# What is Stoxy?

Stoxy is a Stellar-native trading platform with three tiers: a SDEX trading terminal, on-chain leveraged synthetic positions, and an AI agent API that lets any AI model trade on a user's behalf.

## Platform overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (fin/)                        │
│  /terminal  ─  SDEX spot trading + TradingView charts   │
│  /pro       ─  Admin panel: ContractController + Vault  │
│  /portfolio ─  Portfolio overview (coming soon)          │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP / SSE
┌────────────────────▼────────────────────────────────────┐
│               agent-bridge  (Go, port 8090)              │
│  Matching engine  ·  AI agent API  ·  Soroban controller │
└────────┬───────────────────────────────┬────────────────┘
         │ Horizon REST                   │ Soroban RPC
┌────────▼──────────┐          ┌──────────▼──────────────┐
│  Stellar Network  │          │  Soroban Smart Contracts │
│  SDEX order book  │          │  AgentVault              │
│  Account data     │          │  LeveragePool            │
└───────────────────┘          └─────────────────────────┘
```

## The three layers

### 1. Frontend (`fin/`)

A Next.js application with three pages:

- **`/terminal`** — SDEX spot trading terminal. Live TradingView charts, limit and market orders, order book depth display, AI agent tab (OpenClaw / Helper).
- **`/pro`** — Admin-only page. ContractController panel for direct on-chain calls, UserVault panel for managing depositor balances.
- **`/portfolio`** — Portfolio summary (work in progress).

Trading pairs are defined in `fin/src/configs/tradingPairs.ts`: XLM/USDC, NVDA/USD, AAPL/USD.

### 2. Agent Bridge (`agent-bridge/`)

A pure Go HTTP server that acts as the hub between the browser, the AI agent, and the blockchain.

Key responsibilities:

| Component | Description |
|---|---|
| **Matching engine** | In-process synthetic CLOB. AI agents trade against this order book. |
| **Soroban controller** | Holds `ADMIN_SECRET`; the only component that can call admin contract functions. |
| **AI agent API** | Token-based API for AI models; SSE log streaming to the terminal. |
| **SDEX proxy** | Proxies order-building requests to the Next.js `/api/agent/*` route. |

### 3. Smart Contracts

Two Soroban contracts on Stellar testnet:

| Contract | Testnet ID | Purpose |
|---|---|---|
| AgentVault | `CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG` | Holds USDC margin; settles PnL |
| LeveragePool | `CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL` | Synthetic positions, LP pool |

## Who is Stoxy for?

| Audience | What they use |
|---|---|
| **Traders** | `/terminal` for SDEX spot; leveraged positions via the TradingTerminal component |
| **Liquidity providers** | Pool tab on the Pro page to deposit/withdraw USDC |
| **AI developers** | Agent Bridge API to build bots that can read market data or execute trades |
| **Protocol operators** | Self-host the full stack; `/pro` admin panel for contract management |
