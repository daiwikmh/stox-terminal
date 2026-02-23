# Welcome to Stoxy

Stoxy is a Stellar-based trading platform combining a SDEX terminal, AI-assisted trading, and on-chain leveraged synthetic positions via Soroban smart contracts.

## What is Stoxy?

Stoxy has three layers:

| Layer | What it does |
|---|---|
| **Frontend** (`fin/`) | Next.js app — SDEX terminal, leveraged trading UI, portfolio view |
| **Agent Bridge** (`agent-bridge/`) | Go HTTP server — matching engine, AI agent API, Soroban contract controller |
| **Smart Contracts** | Soroban contracts on Stellar — AgentVault (PnL settlement), LeveragePool (synthetic positions) |

### Key features

- **SDEX Terminal** — limit and market orders on Stellar's native DEX, real-time TradingView charts
- **Leveraged positions** — open long/short synthetic positions on XLM, NVDA, AAPL with up to 20× leverage
- **AI agent (OpenClaw)** — connect any AI model to the platform via a token-based API; two modes: read-only market data and full trading
- **On-chain settlement** — all PnL settlement and position management is written to Stellar testnet via Soroban

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

## Quick links

- [Quick Start](getting-started/quick-start.md) — connect wallet and place your first trade
- [OpenClaw AI Agent](ai-agent/overview.md) — use an AI to trade on your behalf
- [API Reference](api-reference/overview.md) — integrate with agent-bridge
- [Smart Contracts](smart-contracts/overview.md) — Soroban contract details
- [Self-Hosting](self-hosting/requirements.md) — run Stoxy yourself
