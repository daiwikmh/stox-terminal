# SDEX Terminal

The `/terminal` page is the main trading interface. It connects to Stellar's native DEX (SDEX) through Freighter wallet and the agent-bridge proxy.

## Layout

```
┌─────────────────────────────────────────────────────┐
│  Header — pair selector, wallet connect, network    │
├────────────────┬────────────────────────────────────┤
│  Left sidebar  │  Chart (TradingView)                │
│  • Asset info  ├────────────────────────────────────┤
│  • Order book  │  TradingTerminal (leverage section) │
│  • Trade hist  ├────────────────────┬───────────────┤
│                │                    │ Right sidebar  │
│                │                    │ • Trade form   │
│                │                    │ • Agent tab    │
└────────────────┴────────────────────┴───────────────┘
```

## Trading pairs

Available pairs are defined in `fin/src/configs/tradingPairs.ts`:

| Pair | Base | Quote | TradingView symbol |
|---|---|---|---|
| XLM/USDC | XLM | USDC | auto-mapped |
| NVDA/USD | NVDA | USD | NASDAQ:NVDA |
| AAPL/USD | AAPL | USD | NASDAQ:AAPL |

Switch pairs using the pair selector in the header. The TradingView chart, order book, and trade form all update to reflect the selected pair.

## Order types

### Limit orders

A limit order is filled at your specified price or better. The SDEX uses path payments under the hood.

Fields:
- **Price** — price in quote token per base token unit (e.g. USDC per XLM)
- **You Pay** — amount of the pay-side token
- **You Receive** — auto-calculated: `pay amount ÷ price` (for buys) or `pay amount × price` (for sells)

The **Rate** row shows: `1 {receiveToken} = {price} {payToken}`.

Best ask / best bid are shown as hints and pre-fill the price input if left empty.

### Market orders

A market order sweeps the order book up to the slippage limit.

Fields:
- **You Pay** — amount to spend
- **Slippage** — 0.1 %, 0.5 %, or 1.0 %

The transaction is built as a path payment with `send_max = pay_amount × (1 + slippage/100)`. If the market moves beyond slippage, the transaction fails (no partial fills on bad slippage).

## Order book

The left sidebar shows the live order book for the selected pair, pulled from the SDEX via `/api/bridge/orderbook`. Depth is displayed as 10 levels on each side (bids / asks).

## Trade history

Recent fills for the connected wallet are shown below the order book, fetched from `/api/bridge/trades`.

## Slippage tolerance

Three preset slippage values are available in the right sidebar: **0.1%**, **0.5%** (default), **1.0%**. These only apply to market orders — limit orders are exact.

## Network fee

Every Stellar transaction costs a base fee of **0.00001 XLM** (100 stroops). Soroban transactions may have a higher resource fee set by simulation.

## Transaction flow

1. Browser calls the agent-bridge proxy (`/api/bridge/order/limit` or `/api/bridge/order/market`).
2. Bridge calls the Next.js API route which builds an unsigned XDR transaction.
3. Bridge returns `{ xdr, networkPassphrase }`.
4. Frontend asks Freighter to sign the XDR.
5. Frontend POSTs `{ signedXdr }` to `/api/bridge/tx/submit`.
6. Bridge submits to Horizon and returns the result.
7. A toast shows success (with tx hash) or the error message.
