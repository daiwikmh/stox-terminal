'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useWallet } from '@/utils/wallet';
import * as contracts from '@/utils/contracts';

type UVTab    = 'vault' | 'collateral' | 'trade';
type Action   = 'deposit' | 'withdraw';
type TxStatus = { ok: boolean; msg: string } | null;

const BRIDGE_URL = process.env.NEXT_PUBLIC_AGENT_BRIDGE_URL ?? 'http://localhost:8090';
const LS_TOKEN_KEY = 'uv-bridge-token';

export default function UserVault() {
  const { address, isConnected, connectWallet, signTransaction } = useWallet();

  const [tab,    setTab]    = useState<UVTab>('vault');
  const [action, setAction] = useState<Action>('deposit');

  // Vault
  const [vAmount,      setVAmount]      = useState('');
  const [vBalance,     setVBalance]     = useState<number | null>(null);
  const [poolBalance,  setPoolBalance]  = useState<number | null>(null);
  const [vBusy,        setVBusy]        = useState(false);
  const [vStatus,      setVStatus]      = useState<TxStatus>(null);

  // Collateral
  const [cAmount,  setCAmount]  = useState('');
  const [cBalance, setCBalance] = useState<number | null>(null);
  const [position, setPosition] = useState<contracts.PositionHuman | null>(null);
  const [cBusy,    setCBusy]    = useState(false);
  const [cStatus,  setCStatus]  = useState<TxStatus>(null);

  // Trade
  const [tradeToken,  setTradeToken]  = useState('');
  const [markPrice,   setMarkPrice]   = useState<number | null>(null);
  const [tradeSide,   setTradeSide]   = useState<'buy' | 'sell'>('buy');
  const [tradePrice,  setTradePrice]  = useState('');
  const [tradeAmt,    setTradeAmt]    = useState('');
  const [tradeLev,    setTradeLev]    = useState(5);
  const [tradeBusy,   setTradeBusy]   = useState(false);
  const [tradeStatus, setTradeStatus] = useState<TxStatus>(null);
  const [orderResult, setOrderResult] = useState<{ fills: number; id?: string } | null>(null);

  const tokenInit = useRef(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const registerAddress = useCallback(async (tok: string, addr: string) => {
    try {
      await fetch(`${BRIDGE_URL}/api/context`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: tok, account_id: addr, network: 'TESTNET' }),
      });
    } catch { /* best-effort */ }
  }, []);

  const fetchMarkPrice = useCallback(async () => {
    try {
      const res  = await fetch(`${BRIDGE_URL}/api/prices`);
      const data = await res.json() as Record<string, number>;
      const p    = data['XLM/USDC'] ?? null;
      setMarkPrice(p);
      if (p && !tradePrice) setTradePrice(p.toFixed(6));
    } catch { /* ignore */ }
  }, [tradePrice]);

  // ── Init bridge token ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isConnected || !address || tokenInit.current) return;
    tokenInit.current = true;

    const stored = localStorage.getItem(LS_TOKEN_KEY);
    if (stored) {
      setTradeToken(stored);
      registerAddress(stored, address);
      return;
    }
    fetch(`${BRIDGE_URL}/api/token/generate`, { method: 'POST' })
      .then(r => r.json())
      .then(({ token }) => {
        localStorage.setItem(LS_TOKEN_KEY, token);
        setTradeToken(token);
        registerAddress(token, address);
      })
      .catch(console.error);
  }, [isConnected, address, registerAddress]);

  // ── Refresh balances ───────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const [vBal, cBal, pos, pool] = await Promise.all([
        contracts.getVaultBalance(address, contracts.USDC_CONTRACT),
        contracts.getCollateralBalance(address, contracts.USDC_CONTRACT),
        contracts.getPosition(address),
        contracts.getTerminalPool(contracts.USDC_CONTRACT),
      ]);
      setVBalance(vBal);
      setCBalance(cBal);
      setPosition(pos);
      setPoolBalance(pool);
    } catch (err) {
      console.error('[UserVault] refresh:', err);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      refresh();
      fetchMarkPrice();
    }
  }, [isConnected, address, refresh, fetchMarkPrice]);

  // ── Vault deposit / withdraw ───────────────────────────────────────────────

  const handleVault = async () => {
    if (!address || !vAmount) return;
    setVBusy(true); setVStatus(null);
    try {
      const amount = parseFloat(vAmount);
      const fn = action === 'deposit' ? contracts.vaultDeposit : contracts.vaultWithdraw;
      await fn(address, contracts.USDC_CONTRACT, amount, signTransaction);
      setVStatus({ ok: true, msg: `${action === 'deposit' ? 'Deposited' : 'Withdrawn'} ${amount} USDC ✓` });
      setVAmount('');
      await refresh();
    } catch (err) {
      setVStatus({ ok: false, msg: String(err) });
    } finally {
      setVBusy(false);
    }
  };

  // ── Collateral deposit / withdraw ──────────────────────────────────────────

  const handleCollateral = async () => {
    if (!address || !cAmount) return;
    setCBusy(true); setCStatus(null);
    try {
      const amount = parseFloat(cAmount);
      const fn = action === 'deposit' ? contracts.depositCollateral : contracts.withdrawCollateral;
      await fn(address, contracts.USDC_CONTRACT, amount, signTransaction);
      setCStatus({ ok: true, msg: `Collateral ${action === 'deposit' ? 'deposited' : 'withdrawn'}: ${amount} USDC ✓` });
      setCAmount('');
      await refresh();
    } catch (err) {
      setCStatus({ ok: false, msg: String(err) });
    } finally {
      setCBusy(false);
    }
  };

  // ── Place leveraged order ──────────────────────────────────────────────────

  const handleTrade = async () => {
    if (!tradeToken || !tradePrice || !tradeAmt) return;
    setTradeBusy(true); setTradeStatus(null); setOrderResult(null);
    try {
      const res = await fetch(`${BRIDGE_URL}/api/orders`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          token:    tradeToken,
          symbol:   'XLM/USDC',
          side:     tradeSide,
          price:    parseFloat(tradePrice),
          amount:   parseFloat(tradeAmt),
          leverage: tradeLev,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = await res.json() as { orderId?: string; fills: number };
      setOrderResult({ fills: data.fills, id: data.orderId });
      setTradeStatus({
        ok:  true,
        msg: data.fills > 0
          ? `Filled ${data.fills} match(es) ✓ — position will be opened by the bridge`
          : 'Order resting in book ✓',
      });
      if (data.fills > 0) await refresh();
    } catch (err) {
      setTradeStatus({ ok: false, msg: String(err) });
    } finally {
      setTradeBusy(false);
    }
  };

  /* ── Not connected ── */
  if (!isConnected) {
    return (
      <div className="uv-wrapper">
        <div className="uv-header">
          <span className="uv-title">User Vault</span>
          <span className="uv-badge">Testnet</span>
        </div>
        <div className="uv-connect-prompt">
          <p>Connect your Stellar wallet to deposit funds and take leveraged positions.</p>
          <button className="uv-btn-submit" style={{ marginTop: '0.75rem' }} onClick={connectWallet}>
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  /* ── Connected ── */
  return (
    <div className="uv-wrapper">
      {/* Header */}
      <div className="uv-header">
        <div>
          <span className="uv-title">User Vault</span>
          <div className="uv-addr">{address!.slice(0, 6)}…{address!.slice(-4)}</div>
        </div>
        <button className="uv-refresh" onClick={() => { refresh(); fetchMarkPrice(); }} title="Refresh">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Tabs */}
      <div className="uv-tabs">
        <button className={`uv-tab ${tab === 'vault'      ? 'active' : ''}`} onClick={() => setTab('vault')}>AgentVault</button>
        <button className={`uv-tab ${tab === 'collateral' ? 'active' : ''}`} onClick={() => setTab('collateral')}>Collateral</button>
        <button className={`uv-tab ${tab === 'trade'      ? 'active' : ''}`} onClick={() => { setTab('trade'); fetchMarkPrice(); }}>Trade</button>
      </div>

      {/* Body */}
      <div className="uv-body">

        {/* ── VAULT TAB ── */}
        {tab === 'vault' && (
          <>
            {/* Total pool (shared liquidity pool) */}
            <div className="uv-balance-row" style={{ marginBottom: '0.25rem' }}>
              <span className="uv-balance-label">Total Pool</span>
              <span className="uv-balance-value" style={{ fontSize: '1rem', fontWeight: 700 }}>
                {poolBalance !== null ? `${poolBalance.toFixed(4)} USDC` : '—'}
              </span>
            </div>
            {/* User's own vault balance */}
            <div className="uv-balance-row" style={{ marginBottom: '0.75rem', opacity: 0.7 }}>
              <span className="uv-balance-label" style={{ fontSize: '0.7rem' }}>Your deposit</span>
              <span className="uv-balance-value" style={{ fontSize: '0.8rem' }}>
                {vBalance !== null ? `${vBalance.toFixed(4)} USDC` : '—'}
              </span>
            </div>

            <div className="uv-hint">
              This is a shared liquidity pool — anyone can deposit USDC to earn yield
              backing leveraged traders. Your deposit and the total pool balance are shown above.
            </div>

            <div className="uv-action-toggle">
              <button className={`uv-action-btn ${action === 'deposit'  ? 'active' : ''}`} onClick={() => setAction('deposit')}>Deposit</button>
              <button className={`uv-action-btn ${action === 'withdraw' ? 'active' : ''}`} onClick={() => setAction('withdraw')}>Withdraw</button>
            </div>

            <div className="uv-field">
              <span className="uv-field-label">AMOUNT (USDC)</span>
              <input className="uv-input" type="number" step="0.01" min="0"
                value={vAmount} onChange={(e) => setVAmount(e.target.value)} placeholder="0.00" />
            </div>

            <div className="uv-contract-hint">USDC · {contracts.USDC_CONTRACT.slice(0, 8)}…</div>

            <button className="uv-btn-submit" onClick={handleVault}
              disabled={vBusy || !vAmount || parseFloat(vAmount) <= 0}>
              {vBusy
                ? <><Loader2 size={13} className="animate-spin" /> Waiting for wallet…</>
                : action === 'deposit' ? 'Deposit to Pool' : 'Withdraw from Pool'}
            </button>

            {vStatus && <UVToast status={vStatus} onClose={() => setVStatus(null)} />}
          </>
        )}

        {/* ── COLLATERAL TAB ── */}
        {tab === 'collateral' && (
          <>
            <div className="uv-balance-row">
              <span className="uv-balance-label">Free Collateral</span>
              <span className="uv-balance-value">
                {cBalance !== null ? `${cBalance.toFixed(4)} USDC` : '—'}
              </span>
            </div>

            {position ? (
              <div className="uv-position-card">
                <div className="uv-position-title">Open Position</div>
                <div className="uv-position-row"><span>Asset</span><span>{position.asset_symbol}</span></div>
                <div className="uv-position-row"><span>Notional debt</span><span>{position.debt_amount.toFixed(4)} USDC</span></div>
                <div className="uv-position-row"><span>Locked collateral</span><span>{position.collateral_locked.toFixed(4)} USDC</span></div>
                <div className="uv-position-row">
                  <span>Effective leverage</span>
                  <span>
                    {position.collateral_locked > 0
                      ? `${(position.debt_amount / position.collateral_locked).toFixed(1)}×`
                      : '—'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="uv-no-position">No open position</div>
            )}

            <div className="uv-hint">
              Deposit USDC here as free collateral. When a leveraged order fills,
              the bridge locks part of this balance and records the position on-chain.
            </div>

            <div className="uv-action-toggle">
              <button className={`uv-action-btn ${action === 'deposit'  ? 'active' : ''}`} onClick={() => setAction('deposit')}>Deposit</button>
              <button className={`uv-action-btn ${action === 'withdraw' ? 'active' : ''}`} onClick={() => setAction('withdraw')}>Withdraw</button>
            </div>

            <div className="uv-field">
              <span className="uv-field-label">AMOUNT (USDC)</span>
              <input className="uv-input" type="number" step="0.01" min="0"
                value={cAmount} onChange={(e) => setCAmount(e.target.value)} placeholder="0.00" />
            </div>

            <div className="uv-contract-hint">USDC · {contracts.USDC_CONTRACT.slice(0, 8)}…</div>

            <button className="uv-btn-submit" onClick={handleCollateral}
              disabled={cBusy || !cAmount || parseFloat(cAmount) <= 0}>
              {cBusy
                ? <><Loader2 size={13} className="animate-spin" /> Waiting for wallet…</>
                : action === 'deposit' ? 'Deposit Collateral' : 'Withdraw Collateral'}
            </button>

            {cStatus && <UVToast status={cStatus} onClose={() => setCStatus(null)} />}
          </>
        )}

        {/* ── TRADE TAB ── */}
        {tab === 'trade' && (
          <>
            {/* Mark price */}
            <div className="uv-balance-row" style={{ marginBottom: '0.75rem' }}>
              <span className="uv-balance-label">XLM/USDC Mark Price</span>
              <span className="uv-balance-value">
                {markPrice !== null ? markPrice.toFixed(6) : '—'}
              </span>
            </div>

            <div className="uv-hint">
              Place a leveraged limit order. When matched, the bridge opens your synthetic
              position on-chain. Ensure you have collateral deposited in the Collateral tab.
            </div>

            {/* Long / Short */}
            <div className="uv-action-toggle">
              <button
                className={`uv-action-btn ${tradeSide === 'buy'  ? 'active' : ''}`}
                style={tradeSide === 'buy' ? { background: '#0d9060', color: '#fff' } : {}}
                onClick={() => setTradeSide('buy')}
              >Long</button>
              <button
                className={`uv-action-btn ${tradeSide === 'sell' ? 'active' : ''}`}
                style={tradeSide === 'sell' ? { background: '#c0392b', color: '#fff' } : {}}
                onClick={() => setTradeSide('sell')}
              >Short</button>
            </div>

            {/* Price */}
            <div className="uv-field">
              <span className="uv-field-label">LIMIT PRICE (USDC)</span>
              <input className="uv-input" type="number" step="0.000001" min="0"
                value={tradePrice} onChange={(e) => setTradePrice(e.target.value)} placeholder="0.000000" />
            </div>

            {/* Amount */}
            <div className="uv-field">
              <span className="uv-field-label">AMOUNT (XLM)</span>
              <input className="uv-input" type="number" step="1" min="0"
                value={tradeAmt} onChange={(e) => setTradeAmt(e.target.value)} placeholder="100" />
            </div>

            {/* Leverage */}
            <div className="uv-field">
              <span className="uv-field-label">LEVERAGE — {tradeLev}×</span>
              <input type="range" min={1} max={10} value={tradeLev}
                onChange={(e) => setTradeLev(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#3ecf8e', marginTop: '0.25rem' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#666', marginTop: '0.15rem' }}>
                <span>1×</span><span>5×</span><span>10×</span>
              </div>
            </div>

            {/* Notional */}
            {tradePrice && tradeAmt && (
              <div className="uv-contract-hint" style={{ marginBottom: '0.5rem' }}>
                Notional: {(parseFloat(tradePrice) * parseFloat(tradeAmt) * tradeLev).toFixed(2)} USDC
                &nbsp;·&nbsp; Collateral needed: {(parseFloat(tradePrice) * parseFloat(tradeAmt)).toFixed(2)} USDC
              </div>
            )}

            <button className="uv-btn-submit" onClick={handleTrade}
              disabled={tradeBusy || !tradeToken || !tradePrice || !tradeAmt || parseFloat(tradePrice) <= 0 || parseFloat(tradeAmt) <= 0}
              style={tradeSide === 'buy' ? { background: '#0d9060' } : { background: '#c0392b' }}>
              {tradeBusy
                ? <><Loader2 size={13} className="animate-spin" /> Placing order…</>
                : `Place ${tradeSide === 'buy' ? 'Long' : 'Short'} ${tradeLev}× Order`}
            </button>

            {orderResult && orderResult.fills === 0 && (
              <div className="uv-no-position" style={{ marginTop: '0.5rem' }}>
                Order is resting in the book waiting for a counterparty.
              </div>
            )}

            {tradeStatus && <UVToast status={tradeStatus} onClose={() => setTradeStatus(null)} />}

            {/* Token info */}
            {tradeToken && (
              <div className="uv-contract-hint" style={{ marginTop: '0.5rem' }}>
                Session token: {tradeToken}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="uv-footer">
        <div className="uv-contract-row"><span>Vault</span><span>{contracts.VAULT_CONTRACT_ID.slice(0, 8)}…</span></div>
        <div className="uv-contract-row"><span>Pool</span><span>{contracts.LEVERAGE_CONTRACT_ID.slice(0, 8)}…</span></div>
      </div>
    </div>
  );
}

function UVToast({ status, onClose }: { status: { ok: boolean; msg: string }; onClose: () => void }) {
  return (
    <div className={`uv-toast ${status.ok ? 'success' : 'error'}`}>
      <span style={{ flex: 1 }}>{status.msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', paddingLeft: '0.5rem' }}>×</button>
    </div>
  );
}
