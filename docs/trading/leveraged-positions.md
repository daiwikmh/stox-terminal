# Leveraged Positions

Stoxy supports synthetic leveraged long and short positions on XLM (and synthetic stocks) through the LeveragePool Soroban contract. Positions are recorded on-chain; PnL is computed by the contract at close.

## How it works

1. **Deposit collateral** — the user deposits USDC collateral into LeveragePool via `deposit_collateral`. This is signed by the user's wallet (Freighter).
2. **Open position** — the bridge calls `open_synthetic_position` with the admin key. The contract stores `entry_price`, `xlm_amount`, and `is_long`.
3. **Monitor** — the bridge liquidation engine polls open positions every 5 seconds against the current mark price.
4. **Close or liquidate** — either the user closes voluntarily (frontend signs `close_position`) or the liquidation engine closes it automatically when unrealised loss ≥ 90% of collateral.
5. **Settle PnL** — `close_position` computes PnL on-chain; `settle_pnl` on AgentVault credits or debits the user's margin balance.

## Economics

| Variable | Formula |
|---|---|
| Notional value | `xlm_amount × entry_price` |
| Collateral locked | `notional / leverage` |
| Leverage | `notional / collateral` |
| Long PnL | `(close_price − entry_price) × xlm_amount` |
| Short PnL | `(entry_price − close_price) × xlm_amount` |
| Liquidation threshold | Unrealised loss ≥ 90% of `collateral_locked` |

### Example

| Parameter | Value |
|---|---|
| XLM amount | 1000 XLM |
| Entry price | 0.11 USDC |
| Notional | 110 USDC |
| Leverage | 10× |
| Collateral locked | 11 USDC |
| Liquidation price (long) | entry − (collateral × 0.9 / xlm_amount) = 0.11 − 0.0099 ≈ 0.100 |

## Long positions

A long position profits when price rises.

```
PnL = (close_price - entry_price) × xlm_amount
```

- Entry: 0.11 USDC, close: 0.13 USDC, 1000 XLM → PnL = +20 USDC
- Entry: 0.11 USDC, close: 0.09 USDC, 1000 XLM → PnL = −20 USDC

## Short positions

A short position profits when price falls.

```
PnL = (entry_price - close_price) × xlm_amount
```

- Entry: 0.11 USDC, close: 0.09 USDC, 1000 XLM → PnL = +20 USDC
- Entry: 0.11 USDC, close: 0.13 USDC, 1000 XLM → PnL = −20 USDC

## Liquidation

The bridge's liquidation engine (`internal/matching/liquidation.go`) runs a check every 5 seconds:

```
unrealised_loss / collateral_locked ≥ 0.90  →  liquidate
```

When triggered:
1. The liquidation engine calls `settleFunc` with `pnl = -collateral × 0.9`.
2. If `ADMIN_SECRET` is set, this directly calls `soroban.Client.SettleTrade` (on-chain, no round-trip).
3. The position is removed from the monitoring list.

## Opening a position (UI)

1. In the TradingTerminal section, select **Long** or **Short**.
2. Enter leverage (2×–20×) and XLM amount.
3. Click **Open Long** / **Open Short**.
4. Freighter opens — approve the `deposit_collateral` transaction.
5. The bridge records entry price via `POST /api/positions/open`.
6. The bridge admin key opens the on-chain position via `LeveragePool.open_synthetic_position`.

## Closing a position (UI)

1. Click **Close Position** in the TradingTerminal.
2. Freighter opens — approve the `close_position` transaction (signs with user key).
3. The contract computes final PnL on-chain.
4. `POST /api/positions/close` removes the bridge-side record.

## Supported collateral token

The default settlement and collateral token is **testnet USDC**:

```
CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

(or whichever address is in `SETTLEMENT_TOKEN` env var).
