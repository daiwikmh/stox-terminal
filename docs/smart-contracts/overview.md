# Smart Contracts — Overview

Stoxy uses two Soroban smart contracts on Stellar. Soroban is Stellar's smart contract platform, using WebAssembly execution and a deterministic state model.

## Why Soroban?

- **On-chain PnL settlement** — profit and loss is computed and settled in the contract, not in the backend. No off-chain oracle trust required for final settlement.
- **Trustless collateral** — collateral is held in the contract, not in a centralised hot wallet.
- **Composability** — TypeScript SDK bindings (`vault_sdk`, `leverage_sdk`) let the browser call read functions and user-signed write functions without going through the bridge.

## Contracts (testnet)

| Contract | ID | Purpose |
|---|---|---|
| **AgentVault** | `CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG` | Holds user margin USDC; settles PnL |
| **LeveragePool** | `CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL` | LP pool; synthetic positions; on-chain PnL computation |

## Who can call what

| Function | Caller | Signed by |
|---|---|---|
| `deposit`, `withdraw` | User | User wallet (Freighter) |
| `deposit_collateral` | User | User wallet (Freighter) |
| `get_balance`, `get_position` | Anyone (read) | Not signed |
| `lp_deposit`, `lp_withdraw` | LP | LP wallet (Freighter) |
| `settle_pnl` | Admin only | Admin keypair (bridge) |
| `open_synthetic_position` | Admin only | Admin keypair (bridge) |
| `close_position` | Admin only | Admin keypair (bridge) |
| `fund_terminal_pool`, `add_supported_token` | Admin only | Admin keypair (bridge) |

**Admin keypair** = the `ADMIN_SECRET` held by agent-bridge. It never touches the browser.

**User wallet** = Freighter. The browser SDK calls these functions and Freighter prompts the user to sign.

## TypeScript SDK bindings

Located in `contracts/packages/`:

| Package | Used for |
|---|---|
| `vault_sdk` | AgentVault read calls (`get_balance`) and user-signed writes (`deposit`, `withdraw`) |
| `leverage_sdk` | LeveragePool read calls (`get_position`) and user-signed writes (`deposit_collateral`, `lp_deposit`, `lp_withdraw`) |

These are generated from the contract ABI and used by the Next.js frontend.

## Sections

- [AgentVault](agent-vault.md) — contract functions and settle_pnl detail
- [LeveragePool](leverage-pool.md) — contract functions and open_synthetic_position detail
- [i128 Scaling](i128-scaling.md) — how monetary amounts are encoded
- [Transaction Lifecycle](transaction-lifecycle.md) — the 12-step simulate → sign → confirm flow
