# Quick Start

Get from zero to your first trade in five steps.

## Prerequisites

- [Freighter wallet](https://freighter.app/) browser extension installed
- Some testnet XLM (use the [Stellar testnet faucet](https://laboratory.stellar.org/#account-creator))
- Testnet USDC (request from the testnet faucet or swap on the SDEX)

---

## Step 1 — Connect your wallet

1. Open the Stoxy terminal (default: `http://localhost:3000/terminal`).
2. Click **Connect Wallet** in the top-right header.
3. Freighter will prompt you to approve the connection.
4. Once connected, your abbreviated `G...` address appears in the header.

> The app automatically reads your current network from Freighter. If Freighter is on Testnet, the app trades on Testnet.

---

## Step 2 — Switch to Testnet (if needed)

1. Open Freighter → Settings → Network.
2. Select **Test SDF Network / Horizon Testnet**.
3. The network badge in the Stoxy header updates to **TESTNET**.

See [Networks](networks.md) for details on Mainnet vs Testnet differences.

---

## Step 3 — Place a SDEX spot order

The right sidebar has **Trade** and **Agent** tabs. Make sure **Trade** is selected.

### Limit order

1. Select **Limit** order type (default).
2. Choose **Buy** or **Sell**.
3. Enter a **Price** (USDC per XLM) — the best ask/bid auto-fills as a hint.
4. Enter the **amount** you want to pay.
5. Check the **You Receive** preview and the **Rate**.
6. Click **Buy XLM** / **Sell XLM**.
7. Freighter pops up — review and **Sign** the transaction.
8. A toast notification confirms submission with the first 12 chars of the tx hash.

### Market order

1. Select **Market** order type.
2. Choose side and enter your pay amount.
3. Set slippage tolerance (0.1 %, 0.5 %, or 1.0 %).
4. Click the trade button and sign in Freighter.

---

## Step 4 — Open a leveraged position

1. Navigate to `/terminal` and scroll to the **TradingTerminal** section below the chart.
2. Choose **Long** or **Short** and select your leverage (2×–20×).
3. Enter the XLM amount for the position.
4. Click **Open Long** / **Open Short**.
5. Freighter prompts you to sign the `deposit_collateral` call to LeveragePool.
6. After confirmation, the bridge records your entry price and starts monitoring for liquidation.

---

## Step 5 — Watch your P&L

- The TradingTerminal panel shows your open position: side, entry price, leverage, unrealised P&L.
- P&L updates live as the mark price moves.
- Click **Close Position** when you want to exit. Freighter signs the on-chain `close_position` call.
- The LeveragePool contract computes final PnL on-chain from `(close_price - entry_price) × xlm_amount × direction`.

---

## What's next?

- [AI Agent (OpenClaw)](../ai-agent/overview.md) — let an AI model trade for you
- [Leveraged Positions — full economics](../trading/leveraged-positions.md)
- [Vault — deposit USDC as a liquidity provider](../trading/vault.md)
