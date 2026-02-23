# Pro Page

The `/pro` page is an admin-facing panel that exposes direct contract management and LP pool operations. It is not intended for regular traders.

## Access

Navigate to `http://localhost:3000/pro` (or your deployment URL + `/pro`). There is no authentication gate in the UI — access control is enforced at the bridge level via the `ADMIN_SECRET` header.

## Layout

The Pro page contains two main panels:

### ContractController

A direct interface to the admin endpoints of agent-bridge. Lets the operator:

- **Settle PnL** — trigger `AgentVault.settle_pnl` for a specific user address and PnL amount.
- **Open Synthetic Position** — call `LeveragePool.open_synthetic_position` manually (for testing or recovery).
- **Close Position** — call `LeveragePool.close_position` for a user.

Each action corresponds to a `POST /api/admin/*` endpoint that requires `Authorization: Bearer $ADMIN_SECRET`.

See [Admin API Reference](../api-reference/admin.md) for request/response shapes.

### UserVault

The UserVault panel (`fin/src/components/UserVault.tsx`) lets the operator:

- **View depositor balances** — read `get_balance` from AgentVault for any `G...` address.
- **Fund the terminal pool** — call `fund_terminal_pool` to seed the vault with initial USDC.
- **Add supported tokens** — call `add_supported_token` to whitelist a new settlement token.

These are user-signed operations that go through Freighter (not the admin key).

## Pool tab

The Pool tab on the Pro page is the LP interface described in [Vault](vault.md). Operators and LPs use this to:

- Deposit USDC into LeveragePool
- Withdraw USDC
- View pool stats

## When to use /pro vs /terminal

| Task | Use |
|---|---|
| Spot trading, leverage positions, AI agent | `/terminal` |
| LP deposit/withdrawal | `/pro` → Pool tab |
| Emergency settle or admin position management | `/pro` → ContractController |
| Check depositor balances | `/pro` → UserVault |
