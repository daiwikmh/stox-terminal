'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useWallet } from '@/utils/wallet';
import * as contracts from '@/utils/contracts';

type UVTab  = 'pool' | 'trade';
type Action = 'deposit' | 'withdraw';
type Status = { ok: boolean; msg: string } | null;

interface SDEXPosition {
  side: string;
  xlmAmount: number;
  entryPrice: number;
  totalUSDC: number;
  collateralUSDC: number;
  leverage: number;
  markPrice: number;
  unrealPnL: number;
  openTxHash?: string;
}

const BRIDGE_URL   = process.env.NEXT_PUBLIC_AGENT_BRIDGE_URL ?? 'http://localhost:8090';
const LS_TOKEN_KEY = 'uv-bridge-token';

export default function UserVault() {
  const { address, isConnected, network, connectWallet, signTransaction } = useWallet();
  const usdcContract = contracts.getUSDCContract(network);
  const [tab,    setTab]    = useState<UVTab>('pool');
  const [action, setAction] = useState<Action>('deposit');

  // Pool
  const [vAmount,     setVAmount]     = useState('');
  const [vBalance,    setVBalance]    = useState<number | null>(null);
  const [poolBalance, setPoolBalance] = useState<number | null>(null);
  const [vBusy,       setVBusy]       = useState(false);
  const [vStatus,     setVStatus]     = useState<Status>(null);

  // Trade
  const [tradeToken,   setTradeToken]   = useState('');
  const [markPrice,    setMarkPrice]    = useState<number | null>(null);
  const [freeMargin,   setFreeMargin]   = useState<number | null>(null);
  const [tradeSide,    setTradeSide]    = useState<'long' | 'short'>('long');
  const [tradeXLM,     setTradeXLM]     = useState('');
  const [tradeLev,     setTradeLev]     = useState(5);
  const [tradeBusy,    setTradeBusy]    = useState(false);
  const [closeBusy,    setCloseBusy]    = useState(false);
  const [tradeStatus,  setTradeStatus]  = useState<Status>(null);
  const [sdexPos,      setSdexPos]      = useState<SDEXPosition | null>(null);

  // Deposit margin inline (for Trade tab)
  const [mAmount, setMAmount] = useState('');
  const [mBusy,   setMBusy]   = useState(false);

  const tokenInit = useRef(false);

  // Reset all state when the user switches networks
  useEffect(() => {
    setSdexPos(null);
    setVBalance(null);
    setFreeMargin(null);
    setPoolBalance(null);
    setMarkPrice(null);
    setVStatus(null);
    setTradeStatus(null);
    setTradeXLM('');
    setMAmount('');
    tokenInit.current = false;
  }, [network]);

  // ── Token init ─────────────────────────────────────────────────────────────

  // Register a token+address pair with the bridge.
  // Returns true on success, false if the bridge doesn't know the token (stale).
  const registerAddress = useCallback(async (tok: string, addr: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/context`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: tok, account_id: addr, network }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [network]);

  useEffect(() => {
    if (!isConnected || !address || tokenInit.current) return;
    tokenInit.current = true;

    (async () => {
      const stored = localStorage.getItem(LS_TOKEN_KEY);

      // Try the cached token first — if the bridge was restarted it won't know it.
      if (stored) {
        const ok = await registerAddress(stored, address);
        if (ok) {
          setTradeToken(stored);
          fetchOnChainPos(address);
          return;
        }
        // Bridge doesn't recognise the token (restarted) — discard it.
        localStorage.removeItem(LS_TOKEN_KEY);
      }

      // Generate a fresh token and register immediately.
      try {
        const genRes  = await fetch(`${BRIDGE_URL}/api/token/generate`, { method: 'POST' });
        const { token } = await genRes.json() as { token: string };
        localStorage.setItem(LS_TOKEN_KEY, token);
        setTradeToken(token);
        await registerAddress(token, address);
      } catch (err) {
        console.error('[UserVault] token init failed:', err);
      }
    })();
  }, [isConnected, address, registerAddress]); // fetchSdexPos intentionally omitted (called inline)

  // ── Data fetching ──────────────────────────────────────────────────────────

  /** Fetch position from the on-chain contract (source of truth). */
  const fetchOnChainPos = useCallback(async (addr: string) => {
    try {
      const pos = await contracts.getPosition(addr, network);
      if (!pos) { setSdexPos(null); return; }
      setSdexPos({
        side:           pos.is_long ? 'long' : 'short',
        xlmAmount:      pos.xlm_amount,
        entryPrice:     pos.entry_price,
        totalUSDC:      pos.debt_amount,
        collateralUSDC: pos.collateral_locked,
        leverage:       pos.collateral_locked > 0
                          ? Math.round(pos.debt_amount / pos.collateral_locked)
                          : 1,
        markPrice:      0,
        unrealPnL:      0,
      });
    } catch (err) { console.error('[fetchOnChainPos]', err); }
  }, [network]);

  const fetchMarkPrice = useCallback(async () => {
    try {
      const data = await fetch(`${BRIDGE_URL}/api/prices`).then(r => r.json()) as Record<string, number>;
      setMarkPrice(data['XLM/USDC'] ?? null);
    } catch { /* ignore */ }
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!address) return;
    try {
      const [lpShare, cBal, pool] = await Promise.all([
        contracts.getLPShare(address, usdcContract, network),
        contracts.getCollateralBalance(address, usdcContract, network),
        contracts.getPoolBalance(usdcContract, network),
      ]);
      setVBalance(lpShare);
      setFreeMargin(cBal);
      setPoolBalance(pool);
    } catch { /* ignore */ }
  }, [address, usdcContract, network]);

  useEffect(() => {
    if (isConnected && address) {
      refreshBalances();
      fetchMarkPrice();
      // Poll mark price every 15 s so it stays fresh
      const id = setInterval(fetchMarkPrice, 15_000);
      return () => clearInterval(id);
    }
  }, [isConnected, address, refreshBalances, fetchMarkPrice]);

  // refresh on-chain position whenever address is known
  useEffect(() => { if (address) fetchOnChainPos(address); }, [address, fetchOnChainPos]);

  const handleRefresh = () => {
    refreshBalances();
    fetchMarkPrice();
    if (address) fetchOnChainPos(address);
  };

  // ── Pool actions ───────────────────────────────────────────────────────────

  const handlePool = async () => {
    if (!address || !vAmount) return;
    setVBusy(true); setVStatus(null);
    try {
      const amount = parseFloat(vAmount);
      const fn = action === 'deposit' ? contracts.lpDeposit : contracts.lpWithdraw;
      await fn(address, usdcContract, amount, signTransaction, network);
      setVStatus({ ok: true, msg: `${action === 'deposit' ? 'Deposited' : 'Withdrawn'} ${amount} USDC` });
      setVAmount('');
      refreshBalances();
    } catch (err) {
      setVStatus({ ok: false, msg: String(err) });
    } finally { setVBusy(false); }
  };

  // ── Margin deposit (inline in Trade tab) ──────────────────────────────────

  const handleDepositMargin = async () => {
    if (!address || !mAmount) return;
    setMBusy(true);
    try {
      await contracts.depositCollateral(address, usdcContract, parseFloat(mAmount), signTransaction, network);
      setMAmount('');
      refreshBalances();
    } catch (err) {
      setTradeStatus({ ok: false, msg: 'Margin deposit failed: ' + String(err) });
    } finally { setMBusy(false); }
  };

  // ── Open synthetic position (user-signed, direct contract call) ───────────

  const handleOpen = async () => {
    if (!address || !tradeXLM || markPrice === null) return;
    setTradeBusy(true); setTradeStatus(null);
    const xlmAmt   = parseFloat(tradeXLM);
    const notional = xlmAmt * markPrice;
    const margin   = notional / tradeLev;
    try {
      await contracts.openPosition(
        address,
        'XLM',
        xlmAmt,
        markPrice,
        tradeSide === 'long',
        usdcContract,
        margin,
        signTransaction,
        network,
      );
      // Show the position card immediately — don't wait for fetchOnChainPos
      setSdexPos({
        side:           tradeSide,
        xlmAmount:      xlmAmt,
        entryPrice:     markPrice,
        totalUSDC:      xlmAmt * markPrice,
        collateralUSDC: margin,
        leverage:       tradeLev,
        markPrice:      0,
        unrealPnL:      0,
      });
      setTradeStatus({ ok: true, msg: `${tradeSide === 'long' ? 'Long' : 'Short'} ${tradeLev}× opened @ ${markPrice.toFixed(6)}` });
      setTradeXLM('');
      refreshBalances();
      // Sync with on-chain state after a short delay
      setTimeout(() => { if (address) fetchOnChainPos(address); }, 4000);
    } catch (err) {
      console.error('[handleOpen]', err);
      const msg = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null)
        ? JSON.stringify(err)
        : String(err);
      setTradeStatus({ ok: false, msg });
      // Refresh — maybe a position already exists on-chain
      if (address) fetchOnChainPos(address);
    } finally { setTradeBusy(false); }
  };

  // ── Close synthetic position (user-signed, direct contract call) ───────────

  const handleClose = async () => {
    if (!address || !sdexPos) return;
    const closePrice = markPrice ?? sdexPos.entryPrice;
    setCloseBusy(true); setTradeStatus(null);
    try {
      await contracts.closePosition(address, usdcContract, closePrice, signTransaction, network);
      setTradeStatus({ ok: true, msg: `Closed @ ${closePrice.toFixed(6)}` });
      setSdexPos(null);
      refreshBalances();
    } catch (err) {
      setTradeStatus({ ok: false, msg: String(err) });
    } finally { setCloseBusy(false); }
  };

  /* ── Not connected ── */
  if (!isConnected) {
    return (
      <div className="uv-wrapper">
        <div className="uv-header">
          <span className="uv-title">Trade</span>
          <span className="uv-badge" style={{ color: network === 'MAINNET' ? '#00ff94' : '#facc15' }}>
            {network === 'MAINNET' ? 'Mainnet' : 'Testnet'}
          </span>
        </div>
        <div className="uv-connect-prompt">
          <p>Connect your wallet to deposit and trade.</p>
          <button className="uv-btn-submit" style={{ marginTop: '0.75rem' }} onClick={connectWallet}>
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  const notional = tradeXLM && markPrice ? parseFloat(tradeXLM) * markPrice : 0;
  const marginReq = notional / tradeLev;
  const liveUnrealPnL = sdexPos && markPrice !== null
    ? (sdexPos.side === 'long'
        ? (markPrice - sdexPos.entryPrice) * sdexPos.xlmAmount
        : (sdexPos.entryPrice - markPrice) * sdexPos.xlmAmount)
    : 0;

  return (
    <div className="uv-wrapper">
      {/* Header */}
      <div className="uv-header">
        <div>
          <span className="uv-title">Trade</span>
          <div className="uv-addr">{address!.slice(0, 6)}…{address!.slice(-4)}</div>
        </div>
        <button className="uv-refresh" onClick={handleRefresh} title="Refresh"><RefreshCw size={12} /></button>
      </div>

      {/* Tabs */}
      <div className="uv-tabs">
        <button className={`uv-tab ${tab === 'pool'  ? 'active' : ''}`} onClick={() => setTab('pool')}>Pool</button>
        <button className={`uv-tab ${tab === 'trade' ? 'active' : ''}`} onClick={() => { setTab('trade'); fetchMarkPrice(); if (address) fetchOnChainPos(address); }}>Leverage</button>
      </div>

      <div className="uv-body">

        {/* ── POOL TAB ── */}
        {tab === 'pool' && (
          <>
            <div className="uv-balance-row">
              <span className="uv-balance-label">Total Pool</span>
              <span className="uv-balance-value">{poolBalance !== null ? `${poolBalance.toFixed(4)} USDC` : '—'}</span>
            </div>
            <div className="uv-balance-row" style={{ opacity: 0.6 }}>
              <span className="uv-balance-label" style={{ fontSize: '0.7rem' }}>Your share</span>
              <span className="uv-balance-value" style={{ fontSize: '0.8rem' }}>{vBalance !== null ? `${vBalance.toFixed(4)} USDC` : '—'}</span>
            </div>

            <div className="uv-action-toggle" style={{ marginTop: '0.75rem' }}>
              <button className={`uv-action-btn ${action === 'deposit'  ? 'active' : ''}`} onClick={() => setAction('deposit')}>Deposit</button>
              <button className={`uv-action-btn ${action === 'withdraw' ? 'active' : ''}`} onClick={() => setAction('withdraw')}>Withdraw</button>
            </div>

            <div className="uv-field">
              <span className="uv-field-label">USDC AMOUNT</span>
              <input className="uv-input" type="number" step="0.01" min="0"
                value={vAmount} onChange={e => setVAmount(e.target.value)} placeholder="0.00" />
            </div>

            <button className="uv-btn-submit" onClick={handlePool}
              disabled={vBusy || !vAmount || parseFloat(vAmount) <= 0}>
              {vBusy ? <><Loader2 size={13} className="animate-spin" /> Processing…</> : action === 'deposit' ? 'Deposit to Pool' : 'Withdraw from Pool'}
            </button>

            {vStatus && <UVToast status={vStatus} onClose={() => setVStatus(null)} />}
          </>
        )}

        {/* ── LEVERAGE TAB ── */}
        {tab === 'trade' && (
          <>
            {/* Stats row */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1, background: '#111', borderRadius: '0.5rem', padding: '0.5rem 0.6rem' }}>
                <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', marginBottom: '0.2rem' }}>XLM/USDC</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>{markPrice !== null ? markPrice.toFixed(6) : '—'}</div>
              </div>
              <div style={{ flex: 1, background: '#111', borderRadius: '0.5rem', padding: '0.5rem 0.6rem' }}>
                <div style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Free Margin</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>{freeMargin !== null ? `${freeMargin.toFixed(2)} USDC` : '—'}</div>
              </div>
            </div>

            {/* ── Open position form ── */}
            {!sdexPos ? (
              <>
                {/* Margin deposit (compact) */}
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <div className="uv-field-label" style={{ marginBottom: '0.25rem' }}>ADD MARGIN (USDC)</div>
                    <input className="uv-input" type="number" step="0.01" min="0"
                      value={mAmount} onChange={e => setMAmount(e.target.value)} placeholder="0.00"
                      style={{ marginBottom: 0 }} />
                  </div>
                  <button
                    onClick={handleDepositMargin}
                    disabled={mBusy || !mAmount || parseFloat(mAmount) <= 0}
                    style={{ padding: '0.45rem 0.75rem', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '0.5rem', color: '#aaa', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    {mBusy ? <Loader2 size={12} className="animate-spin" /> : 'Deposit'}
                  </button>
                </div>

                {/* Long / Short */}
                <div className="uv-action-toggle">
                  <button className={`uv-action-btn ${tradeSide === 'long'  ? 'active' : ''}`}
                    style={tradeSide === 'long'  ? { background: '#0d9060', color: '#fff' } : {}}
                    onClick={() => setTradeSide('long')}>Long</button>
                  <button className={`uv-action-btn ${tradeSide === 'short' ? 'active' : ''}`}
                    style={tradeSide === 'short' ? { background: '#c0392b', color: '#fff' } : {}}
                    onClick={() => setTradeSide('short')}>Short</button>
                </div>

                <div className="uv-field">
                  <span className="uv-field-label">XLM AMOUNT</span>
                  <input className="uv-input" type="number" step="1" min="0"
                    value={tradeXLM} onChange={e => setTradeXLM(e.target.value)} placeholder="e.g. 1000" />
                </div>

                <div className="uv-field">
                  <span className="uv-field-label">LEVERAGE — {tradeLev}×</span>
                  <input type="range" min={2} max={20} value={tradeLev}
                    onChange={e => setTradeLev(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#3ecf8e', marginTop: '0.25rem' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#555', marginTop: '0.1rem' }}>
                    <span>2×</span><span>10×</span><span>20×</span>
                  </div>
                </div>

                {notional > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#666', marginBottom: '0.5rem' }}>
                    <span>Notional: <b style={{ color: '#aaa' }}>{notional.toFixed(2)} USDC</b></span>
                    <span>Margin: <b style={{ color: freeMargin !== null && marginReq > freeMargin ? '#e74c3c' : '#aaa' }}>{marginReq.toFixed(2)} USDC</b></span>
                  </div>
                )}

                <button className="uv-btn-submit" onClick={handleOpen}
                  disabled={tradeBusy || !tradeXLM || parseFloat(tradeXLM) <= 0 || markPrice === null}
                  style={tradeSide === 'long' ? { background: '#0d9060' } : { background: '#c0392b' }}>
                  {tradeBusy
                    ? <><Loader2 size={13} className="animate-spin" /> Opening…</>
                    : markPrice === null
                      ? 'Loading price…'
                      : `${tradeSide === 'long' ? 'Long' : 'Short'} ${tradeLev}×`}
                </button>
              </>
            ) : (
              /* ── Active position card ── */
              <div className="uv-position-card">
                <div className="uv-position-title" style={{ color: sdexPos.side === 'long' ? '#3ecf8e' : '#e74c3c' }}>
                  {sdexPos.side === 'long' ? '▲ Long' : '▼ Short'} {sdexPos.leverage}× · XLM/USDC
                </div>

                <div className="uv-position-row"><span>Size</span><span>{sdexPos.xlmAmount.toFixed(4)} XLM</span></div>
                <div className="uv-position-row"><span>Entry</span><span>{sdexPos.entryPrice.toFixed(6)}</span></div>
                <div className="uv-position-row"><span>Mark</span><span>{markPrice !== null ? markPrice.toFixed(6) : '—'}</span></div>
                <div className="uv-position-row"><span>Margin</span><span>{sdexPos.collateralUSDC.toFixed(4)} USDC</span></div>
                <div className="uv-position-row">
                  <span>PnL</span>
                  <span style={{ color: liveUnrealPnL >= 0 ? '#3ecf8e' : '#e74c3c', fontWeight: 700 }}>
                    {liveUnrealPnL >= 0 ? '+' : ''}{liveUnrealPnL.toFixed(4)} USDC
                  </span>
                </div>

                <button className="uv-btn-submit" onClick={handleClose} disabled={closeBusy}
                  style={{ background: '#c0392b', marginTop: '0.5rem' }}>
                  {closeBusy ? <><Loader2 size={13} className="animate-spin" /> Closing…</> : 'Close Position'}
                </button>
              </div>
            )}

            {tradeStatus && <UVToast status={tradeStatus} onClose={() => setTradeStatus(null)} />}
          </>
        )}
      </div>

      <div className="uv-footer">
        <div className="uv-contract-row">
          <span style={{ color: network === 'MAINNET' ? '#00ff94' : '#facc15' }}>
            {network === 'MAINNET' ? 'Mainnet' : 'Testnet'}
          </span>
          <span>{contracts.getLeverageContractId(network).slice(0, 8)}…</span>
        </div>
        <div className="uv-contract-row"><span>USDC</span><span>{usdcContract.slice(0, 8)}…</span></div>
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
