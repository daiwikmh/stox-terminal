# Networks

Stoxy supports Stellar Testnet and Mainnet. The active network is determined by whichever network Freighter is configured to use when you connect.

## Testnet (default)

| Parameter | Value |
|---|---|
| Network passphrase | `Test SDF Network ; September 2015` |
| Horizon URL | `https://horizon-testnet.stellar.org` |
| Soroban RPC | `https://soroban-testnet.stellar.org` |
| AgentVault contract | `CCNK5O3FFCOC5KEBRK6ORUUPPHYDUITTH2XCLLG7P2IBQRX2L6HXJFWG` |
| LeveragePool contract | `CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL` |

Use the [Stellar Laboratory account creator](https://laboratory.stellar.org/#account-creator) to fund a testnet account with 10,000 XLM.

## Mainnet

Mainnet support is not yet enabled in the default deployment. To enable it you must:

1. Deploy `AgentVault` and `LeveragePool` to mainnet via `soroban contract deploy`.
2. Update the bridge environment variables (`AGENT_VAULT_ID`, `LEVERAGE_POOL_ID`, `SOROBAN_RPC_URL`, `HORIZON_URL`, `NETWORK_PASSPHRASE`).
3. Update `fin/.env.local` with the new `NEXT_PUBLIC_AGENT_BRIDGE_URL` and contract IDs used by the TypeScript SDK bindings.

## Switching networks in the UI

The network badge in the Stoxy header reflects Freighter's active network. To switch:

1. Click the Freighter extension icon.
2. Go to **Settings → Network**.
3. Select **Public Global Stellar Network** (mainnet) or **Test SDF Network** (testnet).
4. Reload the Stoxy page — the badge updates and all SDEX queries switch endpoints.

## API network header

When calling agent-bridge endpoints that proxy to the SDEX (all `/api/bridge/*` routes), include the header:

```
X-Stellar-Network: TESTNET
```

or

```
X-Stellar-Network: MAINNET
```

If the header is omitted, the bridge defaults to testnet.
