/**
 * Soroban contract helpers — network-aware (TESTNET / MAINNET).
 *
 * Every public function accepts an optional `network` parameter
 * (defaults to 'TESTNET' for backwards compatibility).
 */
import { Networks, xdr } from 'stellar-sdk';

import { VaultClient, VAULT_CONTRACT_ID } from './vault_client';
import { LeverageClient, LEVERAGE_CONTRACT_ID } from './leverage_client';

export { VAULT_CONTRACT_ID, LEVERAGE_CONTRACT_ID };

export type AppNetwork = 'MAINNET' | 'TESTNET';

// ── Per-network configuration ──────────────────────────────────────────────────

const NET_CONFIG = {
  TESTNET: {
    leverageId:   'CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL',
    usdcContract: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    passphrase:   Networks.TESTNET,
    rpcUrl:       'https://soroban-testnet.stellar.org',
  },
  MAINNET: {
    leverageId:   'CBJGQAF7NDGSQOHG5ZXFB7PPXVPOUI7LQX7DNFWSRCUAT5OO4YRGBUPD',
    usdcContract: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    passphrase:   Networks.PUBLIC,
    rpcUrl:       'https://mainnet.sorobanrpc.com',
  },
} as const;

// Legacy single-network exports kept for any existing references
export const USDC_CONTRACT      = NET_CONFIG.TESTNET.usdcContract;
export const XLM_CONTRACT       = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
export const XLM_CONTRACT_MAINNET = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';
export const NETWORK_PASSPHRASE = Networks.TESTNET;

/** Returns the USDC contract address for the given network. */
export function getUSDCContract(network: AppNetwork): string {
  return NET_CONFIG[network].usdcContract;
}

/** Returns the LeveragePool contract ID for the given network. */
export function getLeverageContractId(network: AppNetwork): string {
  return NET_CONFIG[network].leverageId;
}

const SCALE = BigInt(10_000_000);

// ── Scale helpers ──────────────────────────────────────────────────────────────

function toI128(human: number): bigint {
  return BigInt(Math.round(human * Number(SCALE)));
}

function fromI128(raw: bigint | number | undefined): number {
  if (raw === undefined) return 0;
  return Number(raw) / Number(SCALE);
}

// ── Raw JSON-RPC submit ────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function jsonRpc(method: string, params: object, rpcUrl: string) {
  const res = await fetch(rpcUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return res.json();
}

async function submitAndWait(signedXdr: string, rpcUrl: string): Promise<void> {
  const sendJson = await jsonRpc('sendTransaction', { transaction: signedXdr }, rpcUrl);
  const hash     = sendJson?.result?.hash;

  if (!hash) {
    throw new Error(`sendTransaction failed: ${JSON.stringify(sendJson?.result ?? sendJson)}`);
  }
  if (sendJson?.result?.status === 'ERROR') {
    throw new Error(`sendTransaction error: ${JSON.stringify(sendJson.result.errorResultXdr ?? sendJson.result)}`);
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await sleep(3_000);
    const pollJson = await jsonRpc('getTransaction', { hash }, rpcUrl);
    const status   = pollJson?.result?.status;
    if (status === 'SUCCESS') return;
    if (status === 'FAILED')  throw new Error(`Transaction FAILED on-chain: ${hash}`);
  }
  throw new Error(`Transaction confirmation timeout: ${hash}`);
}

// ── WalletSignFn adapter ───────────────────────────────────────────────────────

export type WalletSignFn = (xdr: string, passphrase: string) => Promise<string>;

// ── Client factories ───────────────────────────────────────────────────────────

function vaultClient(user: string): VaultClient {
  return new VaultClient({
    contractId:        VAULT_CONTRACT_ID,
    networkPassphrase: NET_CONFIG.TESTNET.passphrase,
    rpcUrl:            NET_CONFIG.TESTNET.rpcUrl,
    publicKey:         user,
  });
}

function leverageClient(user: string, network: AppNetwork = 'TESTNET'): LeverageClient {
  const cfg = NET_CONFIG[network];
  return new LeverageClient({
    contractId:        cfg.leverageId,
    networkPassphrase: cfg.passphrase,
    rpcUrl:            cfg.rpcUrl,
    publicKey:         user,
  });
}

// ── Write operations ───────────────────────────────────────────────────────────

async function signAndSubmit(
  txXdr:      string,
  walletSign: WalletSignFn,
  passphrase: string,
  rpcUrl:     string,
): Promise<void> {
  const signedXdr = await walletSign(txXdr, passphrase);
  await submitAndWait(signedXdr, rpcUrl);
}

export async function depositCollateral(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
  network: AppNetwork = 'TESTNET',
): Promise<void> {
  const { passphrase, rpcUrl } = NET_CONFIG[network];
  const tx = await leverageClient(user, network).deposit_collateral({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign, passphrase, rpcUrl);
}

export async function withdrawCollateral(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
  network: AppNetwork = 'TESTNET',
): Promise<void> {
  const { passphrase, rpcUrl } = NET_CONFIG[network];
  const tx = await leverageClient(user, network).withdraw_collateral({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign, passphrase, rpcUrl);
}

export async function lpDeposit(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
  network: AppNetwork = 'TESTNET',
): Promise<void> {
  const { passphrase, rpcUrl } = NET_CONFIG[network];
  const tx = await leverageClient(user, network).lp_deposit({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign, passphrase, rpcUrl);
}

export async function lpWithdraw(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
  network: AppNetwork = 'TESTNET',
): Promise<void> {
  const { passphrase, rpcUrl } = NET_CONFIG[network];
  const tx = await leverageClient(user, network).lp_withdraw({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign, passphrase, rpcUrl);
}

/** Vault helpers (testnet only for now) */
export async function vaultDeposit(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
): Promise<void> {
  const { passphrase, rpcUrl } = NET_CONFIG.TESTNET;
  const tx = await vaultClient(user).deposit({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign, passphrase, rpcUrl);
}

export async function vaultWithdraw(
  user: string, token: string, amount: number, walletSign: WalletSignFn,
): Promise<void> {
  const { passphrase, rpcUrl } = NET_CONFIG.TESTNET;
  const tx = await vaultClient(user).withdraw({ user, token, amount: toI128(amount) });
  await signAndSubmit(tx.toXDR(), walletSign, passphrase, rpcUrl);
}

export async function openPosition(
  user: string,
  assetSymbol: string,
  xlmAmount: number,
  entryPrice: number,
  isLong: boolean,
  collateralToken: string,
  collateralLocked: number,
  walletSign: WalletSignFn,
  network: AppNetwork = 'TESTNET',
): Promise<void> {
  const { passphrase, rpcUrl } = NET_CONFIG[network];
  const tx = await leverageClient(user, network).open_synthetic_position({
    user,
    asset_symbol:      assetSymbol,
    xlm_amount:        toI128(xlmAmount),
    entry_price:       toI128(entryPrice),
    is_long:           isLong,
    collateral_token:  collateralToken,
    collateral_locked: toI128(collateralLocked),
  });

  const envelope = xdr.TransactionEnvelope.fromXDR(tx.toXDR(), 'base64');
  (envelope as any)
    .v1().tx().operations()[0]
    .body().invokeHostFunctionOp()
    .auth([]);

  await signAndSubmit(envelope.toXDR('base64'), walletSign, passphrase, rpcUrl);
}

export async function closePosition(
  user: string,
  collateralToken: string,
  closePrice: number,
  walletSign: WalletSignFn,
  network: AppNetwork = 'TESTNET',
): Promise<void> {
  const { passphrase, rpcUrl } = NET_CONFIG[network];
  const tx = await leverageClient(user, network).close_position({
    user,
    collateral_token: collateralToken,
    close_price:      toI128(closePrice),
  });
  await signAndSubmit(tx.toXDR(), walletSign, passphrase, rpcUrl);
}

// ── Read operations ────────────────────────────────────────────────────────────

const READ_ONLY_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export async function getTerminalPool(tokenAddr: string): Promise<number> {
  const tx = await new VaultClient({
    contractId:        VAULT_CONTRACT_ID,
    networkPassphrase: NET_CONFIG.TESTNET.passphrase,
    rpcUrl:            NET_CONFIG.TESTNET.rpcUrl,
    publicKey:         READ_ONLY_KEY,
  }).get_terminal_pool({ token: tokenAddr });
  return fromI128(tx.result as bigint);
}

export async function getVaultBalance(user: string, token: string): Promise<number> {
  const tx = await vaultClient(user).get_balance({ user, token });
  return fromI128(tx.result as bigint);
}

export async function getCollateralBalance(
  user: string, token: string, network: AppNetwork = 'TESTNET',
): Promise<number> {
  const tx = await leverageClient(user, network).get_collateral_balance({ user, token });
  return fromI128(tx.result as bigint);
}

export async function getPoolBalance(
  token: string, network: AppNetwork = 'TESTNET',
): Promise<number> {
  const cfg = NET_CONFIG[network];
  const tx = await new LeverageClient({
    contractId:        cfg.leverageId,
    networkPassphrase: cfg.passphrase,
    rpcUrl:            cfg.rpcUrl,
    publicKey:         READ_ONLY_KEY,
  }).get_pool_balance({ token });
  return fromI128(tx.result as bigint);
}

export async function getLPShare(
  user: string, token: string, network: AppNetwork = 'TESTNET',
): Promise<number> {
  const tx = await leverageClient(user, network).get_lp_share({ user, token });
  return fromI128(tx.result as bigint);
}

export interface PositionHuman {
  asset_symbol:      string;
  debt_amount:       number;
  collateral_locked: number;
  entry_price:       number;
  xlm_amount:        number;
  is_long:           boolean;
  user:              string;
}

export async function getPosition(
  user: string, network: AppNetwork = 'TESTNET',
): Promise<PositionHuman | null> {
  const tx = await leverageClient(user, network).get_position({ user });
  let pos: any;
  try {
    pos = tx.result as any;
  } catch (err) {
    console.error('[getPosition] result accessor threw:', err);
    return null;
  }
  if (pos === null || pos === undefined) return null;
  return {
    asset_symbol:      pos.asset_symbol ?? '',
    debt_amount:       fromI128(pos.debt_amount),
    collateral_locked: fromI128(pos.collateral_locked),
    entry_price:       fromI128(pos.entry_price),
    xlm_amount:        fromI128(pos.xlm_amount),
    is_long:           pos.is_long ?? true,
    user:              pos.user ?? user,
  };
}
