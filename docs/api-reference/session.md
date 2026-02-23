# Session API

## POST /api/token/generate

Generate a new session token. The token identifies an AI agent session and is required for all agent-facing endpoints.

**Auth:** None

**Request:** No body required.

```bash
curl -X POST http://localhost:8090/api/token/generate
```

**Response:**
```json
{
  "token": "550e8400-e29b-41d4-a716-446655440000"
}
```

Tokens are UUIDs stored in memory. They expire when the bridge restarts.

---

## GET /api/context

Read the current UI context for a token — what the user is viewing, their Stellar account, and recent SDEX activity.

**Auth:** `X-Agent-Token` header

**Query params:**

| Param | Required | Description |
|---|---|---|
| `token` | yes | Session token |

```bash
curl "http://localhost:8090/api/context?token=YOUR_TOKEN" \
  -H "X-Agent-Token: YOUR_TOKEN"
```

**Response:**
```json
{
  "network": "TESTNET",
  "account_id": "GABC...",
  "active_pair": "XLM/USDC",
  "recent_trades": [
    {
      "id": "...",
      "base_amount": "100.0000000",
      "counter_amount": "11.2000000",
      "price": "0.1120000",
      "created_at": "2026-02-23T09:55:00Z"
    }
  ],
  "open_offers": [
    {
      "id": "123",
      "amount": "500.0000000",
      "price": "0.1125000"
    }
  ]
}
```

If no wallet is connected, `account_id` is empty and `recent_trades` / `open_offers` are empty arrays.

---

## POST /api/context

Register or update the account associated with a session token. Called automatically by the frontend after the wallet connects.

**Auth:** `X-Agent-Token` header

**Request body:**
```json
{
  "token": "YOUR_TOKEN",
  "account_id": "GABC...",
  "network": "TESTNET"
}
```

| Field | Type | Description |
|---|---|---|
| `token` | string | Session token |
| `account_id` | string | `G...` Stellar account address |
| `network` | string | `"TESTNET"` or `"MAINNET"` |

```bash
curl -X POST http://localhost:8090/api/context \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_TOKEN",
    "account_id": "GABC...",
    "network": "TESTNET"
  }'
```

**Response:**
```json
{ "ok": true }
```

After this call, the account watcher starts monitoring the account for new transactions and emits `context_update` SSE events.

---

## GET /api/logs/stream

Subscribe to the live agent log stream for a session token via Server-Sent Events.

**Auth:** `token` query param (not a header — must be in the URL for EventSource compatibility)

**Query params:**

| Param | Required | Description |
|---|---|---|
| `token` | yes | Session token |

```bash
curl "http://localhost:8090/api/logs/stream?token=YOUR_TOKEN" \
  -H "Accept: text/event-stream"
```

Events are streamed as SSE. See [Overview — SSE events](overview.md#sse-events) for event types.

---

## POST /api/logs

Post a log entry from the agent to the stream. Used by the AI agent to emit messages visible in the browser terminal.

**Auth:** `X-Agent-Token` header

**Request body:**
```json
{
  "token": "YOUR_TOKEN",
  "message": "Analysing order book depth...",
  "source": "agent"
}
```

**Response:**
```json
{ "ok": true }
```

The message appears in the SSE stream as a `message` event.

---

## GET /api/skills

Return the list of skills (capabilities) available to the agent.

**Auth:** None required (but pass `token` as a query param to log the discovery)

```bash
curl "http://localhost:8090/api/skills?token=YOUR_TOKEN"
```

**Response:**
```json
{
  "skills": [
    {
      "name": "read_orderbook",
      "path": "/api/bridge/orderbook",
      "method": "GET",
      "description": "Read live SDEX order book for a trading pair"
    },
    ...
  ]
}
```
