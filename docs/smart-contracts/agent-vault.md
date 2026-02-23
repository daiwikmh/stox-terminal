# AgentVault Contract

AgentVault is the USDC margin vault. It holds trader collateral, tracks balances, and executes PnL settlement.

## Contract ID (testnet)

```
CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG
```

## Functions

### `deposit(user: Address, token: Address, amount: i128)`

Deposit USDC into the vault margin account.

- **Caller:** user (Freighter)
- **Effect:** Transfers `amount` of `token` from `user` to the vault; increments `user`'s `UserMargin` balance.
- **Amount encoding:** i128, 7 decimal places. `100 USDC = 1_000_000_000` (i.e. `100 × 10^7`).

### `withdraw(user: Address, token: Address, amount: i128)`

Withdraw USDC from the vault margin account.

- **Caller:** user (Freighter)
- **Effect:** Decrements `UserMargin` balance; transfers `amount` back to `user`.
- **Constraint:** Fails if `amount > get_balance(user, token)`.

### `get_balance(user: Address, token: Address) → i128`

Read the current margin balance for a user and token. No auth required.

### `settle_pnl(user: Address, token: Address, pnl: i128)`

Apply a PnL delta to a user's margin balance.

- **Caller:** Admin only (signed by ADMIN_SECRET via agent-bridge)
- **pnl > 0:** Profit — vault credits the user's balance.
- **pnl < 0:** Loss — vault debits the user's balance (seized collateral).
- **pnl encoding:** Negative values use two's-complement i128 (see [i128 Scaling](i128-scaling.md)).

### `fund_terminal_pool(token: Address, amount: i128)`

Seed the vault with initial USDC from the admin account.

- **Caller:** Admin only
- **Use case:** Initial protocol setup; topping up the vault after large payouts.

### `add_supported_token(token: Address)`

Whitelist a new token for use as margin/settlement.

- **Caller:** Admin only
- **Default token:** Testnet USDC (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`)

## `settle_pnl` detail

`settle_pnl` is called by the bridge in two situations:

1. **Voluntary close** — the user closes their position. The contract-computed PnL from `LeveragePool.close_position` is forwarded to `settle_pnl`.
2. **Liquidation** — the bridge's liquidation engine detects loss ≥ 90% of collateral and calls `SettleTrade` directly.

The bridge converts float PnL to i128 before calling:

```go
pnlScaled := int64(req.PnL * float64(soroban.ScaleFactor))
// e.g. -50.0 USDC → int64(-500_000_000)
// encoded as: xdr.Int128Parts{ Hi: -1, Lo: uint64(-500_000_000) }
```

See [i128 Scaling](i128-scaling.md) for the full encoding table.

## Storage layout

| Key | Value type | Description |
|---|---|---|
| `UserMargin(user, token)` | i128 | Margin balance per user per token |
| `SupportedTokens` | Vec\<Address\> | Whitelisted settlement tokens |

## Viewing on Stellar Laboratory

You can inspect contract state at:
```
https://laboratory.stellar.org/#explorer?resource=contract_data&endpoint=getContractData
```

Set network to testnet and enter the contract ID.
