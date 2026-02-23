# API Reference — Overview

The agent-bridge exposes an HTTP API on port `8090` (configurable via `PORT` env var). All endpoints return JSON unless otherwise noted.

## Base URL

```
http://localhost:8090
```

For a deployed instance, replace with your deployment URL (e.g. `https://your-app.leapcell.app`).

## Authentication

There are two authentication schemes:

### Session token (agent endpoints)

Most endpoints used by AI agents require a session token in the `X-Agent-Token` header:

```
X-Agent-Token: <uuid-token>
```

Tokens are obtained via `POST /api/token/generate`. They are in-memory only and lost on bridge restart.

### Bearer token (admin endpoints)

Admin endpoints (`/api/admin/*`) require the `ADMIN_SECRET` value:

```
Authorization: Bearer <ADMIN_SECRET>
```

If `ADMIN_SECRET` is not set in the environment, admin endpoints are accessible without authentication (development mode only — do not use in production).

## Network header

Bridge endpoints that proxy to the Stellar network accept an optional network override:

```
X-Stellar-Network: TESTNET
X-Stellar-Network: MAINNET
```

Default: `TESTNET`.

## SSE events

The `/api/logs/stream` endpoint uses Server-Sent Events (SSE). Three named event types are emitted:

| Event | Description |
|---|---|
| `message` (default) | Regular agent log entry |
| `insight` | Market signal from order book watcher |
| `context_update` | New on-chain transaction detected for the connected account |

Each event payload is a JSON object:
```json
{
  "message": "Agent connected",
  "source": "system",
  "timestamp": "2026-02-23T10:00:00Z",
  "event_type": "message"
}
```

## Error responses

Errors are returned as plain text with an appropriate HTTP status code:

| Status | Meaning |
|---|---|
| 400 | Bad request — missing or invalid fields |
| 401 | Unauthorized — missing or wrong auth |
| 405 | Method not allowed |
| 500 | Internal error — check bridge logs |

## Sections

- [Session](session.md) — token generation and context sync
- [Market Data](market-data.md) — prices, order book, pairs
- [Orders](orders.md) — place orders, order book snapshot
- [Positions](positions.md) — open/close/get leveraged positions
- [Admin](admin.md) — contract controller endpoints
