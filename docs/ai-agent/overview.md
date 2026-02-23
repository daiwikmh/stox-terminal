# OpenClaw AI Agent — Overview

OpenClaw is the AI agent integration built into Stoxy. It lets any AI model (Claude, GPT-4, local LLMs) connect to the platform and interact with it via a token-based HTTP API.

## How it works

```
Browser (Agent tab)                 agent-bridge
───────────────────                 ────────────
1. Click "Connect OpenClaw"
   → POST /api/token/generate   →   Issues session token (UUID)
   ← { token }

2. Open SSE stream               →   GET /api/logs/stream?token=...
   ← Server-Sent Events               Live log feed from the agent

3. Copy the system prompt        ─────────────────────────────
   (contains token + base URL)

4. Paste into any AI model
   → AI calls /api/skills?token=...   Discovers capabilities
   → AI calls /api/context?token=...  Reads user's current view
   → AI trades, reads market data…
   ← Logs appear in the terminal     Live in the browser
```

The browser never holds the AI's secrets. The AI model runs outside the browser (in Claude.ai, a custom agent, or a local script) and communicates with agent-bridge over HTTP.

## Two modes

OpenClaw supports two modes, chosen at the start of each session:

### Read-Only Mode (Option A)

No secrets or wallet required. The AI can:
- Fetch live prices (`/api/prices`, `/api/bridge/price`)
- Read the order book (`/api/bridge/orderbook`)
- Look up trading pairs, offers, and trade history
- Check trustline status

Best for: market analysis, monitoring, educational demos.

See [Read-Only Mode](read-only-mode.md) for endpoint details.

### Full Trading Mode (Option B)

Requires a Stellar wallet secret key stored in 1Password. The AI can do everything in read-only mode plus:
- Place limit and market orders on the SDEX
- Open and close leveraged positions
- Build and submit signed transactions

The secret key is **never** passed directly to the AI — it is injected at runtime via `op run` and the AI never sees it. The AI receives only the session token.

See [Trading Mode](trading-mode.md) and [1Password Setup](1password-setup.md) for the full flow.

## Session lifecycle

| State | Description |
|---|---|
| `disconnected` | No session; "Connect OpenClaw" button shown |
| `generating` | `POST /api/token/generate` in flight |
| `token_ready` | Token issued; system prompt ready to copy; SSE stream open |
| `connected` | AI has called the API at least once; log stream is live |

Sessions are in-memory only — restarting agent-bridge clears all tokens.

## System prompt

When you click "Connect OpenClaw" and the token is ready, a system prompt is generated and available to copy. It contains:

- Step 0: mode selection (read-only vs trading)
- Step 1–3: the bridge base URL, the session token, and endpoint catalogue
- 1Password setup instructions (for trading mode)

Paste the system prompt into your AI model's system prompt or first message, then start interacting.

## Log stream

The terminal in the Agent tab displays logs emitted by the AI agent in real time via SSE. Three event types are shown:

| Event type | Color | Meaning |
|---|---|---|
| `message` (default) | white | Regular agent log line |
| `insight` | yellow | Market signal from order book heartbeat |
| `context_update` | green | New account transaction detected |
