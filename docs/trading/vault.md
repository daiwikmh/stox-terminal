# Vault (LP Pool)

The Vault is the liquidity pool backing leveraged positions on Stoxy. Liquidity providers deposit USDC and earn a share of trading fees and liquidation proceeds.

## Overview

The LeveragePool contract maintains two accounting namespaces:

| Store | Purpose |
|---|---|
| `PoolBalance` | Total USDC available for covering leveraged positions |
| `LPShares` | Each LP's proportional stake in the pool |
| `UserMargin` | Each trader's USDC collateral |

Depositing USDC mints LP shares proportional to your contribution. Withdrawing burns shares and returns the underlying USDC plus any accrued yield.

## Depositing USDC (LP)

1. Navigate to `/pro` → **Pool** tab.
2. Enter the USDC amount you want to deposit.
3. Click **Deposit**.
4. Freighter signs the `lp_deposit` call on LeveragePool.
5. Your LP shares are credited on-chain.

## Withdrawing USDC (LP)

1. Navigate to `/pro` → **Pool** tab.
2. Enter the amount to withdraw (or click **Max**).
3. Click **Withdraw**.
4. Freighter signs the `lp_withdraw` call.
5. USDC returns to your wallet; LP shares are burned proportionally.

## Pool mechanics

- The pool acts as the counterparty for all leveraged positions.
- When a trader profits, the pool pays out the gain.
- When a trader loses (or is liquidated), the pool captures the loss up to collateral locked.
- LP yield comes from: trading fees, liquidation bonuses, and the spread between entry and exit prices.

## Checking your balance

From the Pro page **Pool** tab you can view:
- Your current USDC deposited
- Your LP share percentage
- Total pool size

You can also query the contract directly using the TypeScript SDK (`leverage_sdk`) or by reading contract state via Stellar Laboratory.

## AgentVault vs LeveragePool

| Contract | Role in the vault flow |
|---|---|
| **AgentVault** | Holds trader margin USDC; `settle_pnl` credits/debits balances |
| **LeveragePool** | Holds LP liquidity; `lp_deposit` / `lp_withdraw` manage LP shares |

The two contracts work together: LeveragePool tracks position collateral and on-chain PnL computation; AgentVault handles the final settlement transfer to/from the trader's margin account.
