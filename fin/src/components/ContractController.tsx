'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';

type Tab = 'vault' | 'leverage';
type Status = { ok: boolean; msg: string } | null;

const BRIDGE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_AGENT_BRIDGE_URL ?? 'http://localhost:8090')
    : 'http://localhost:8090';

const ADMIN_SECRET =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_ADMIN_SECRET ?? '')
    : '';

async function callAdmin(path: string, body: object): Promise<Status> {
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ADMIN_SECRET ? { Authorization: `Bearer ${ADMIN_SECRET}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, msg: text || `HTTP ${res.status}` };
    return { ok: true, msg: 'Transaction submitted ✓' };
  } catch (e) {
    return { ok: false, msg: String(e) };
  }
}

export default function ContractController() {
  const [tab, setTab] = useState<Tab>('vault');

  /* ── Vault state ── */
  const [vUserAddr, setVUserAddr] = useState('');
  const [vPnl, setVPnl] = useState('');
  const [vToken, setVToken] = useState('CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA');
  const [vSubmitting, setVSubmitting] = useState(false);
  const [vStatus, setVStatus] = useState<Status>(null);

  /* ── Leverage: open state ── */
  const [lUser, setLUser] = useState('');
  const [lSymbol, setLSymbol] = useState('XLM');
  const [lDebt, setLDebt] = useState('');
  const [lCollToken, setLCollToken] = useState('CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA');
  const [lCollLocked, setLCollLocked] = useState('');
  const [lSubmitting, setLSubmitting] = useState(false);
  const [lStatus, setLStatus] = useState<Status>(null);

  /* ── Leverage: close state ── */
  const [cUser, setCUser] = useState('');
  const [cCollToken, setCCollToken] = useState('CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA');
  const [cSubmitting, setCSubmitting] = useState(false);
  const [cStatus, setCStatus] = useState<Status>(null);

  /* ── Handlers ── */
  const handleSettle = async () => {
    if (!vUserAddr || !vPnl || !vToken) return;
    setVSubmitting(true);
    setVStatus(null);
    const res = await callAdmin('/api/admin/settle', {
      userAddr: vUserAddr,
      pnl: parseFloat(vPnl),
      tokenAddr: vToken,
    });
    setVStatus(res);
    setVSubmitting(false);
  };

  const handleOpenPosition = async () => {
    if (!lUser || !lSymbol || !lDebt || !lCollToken || !lCollLocked) return;
    setLSubmitting(true);
    setLStatus(null);
    const res = await callAdmin('/api/admin/position', {
      user: lUser,
      assetSymbol: lSymbol,
      debtAmount: parseFloat(lDebt),
      collateralToken: lCollToken,
      collateralLocked: parseFloat(lCollLocked),
    });
    setLStatus(res);
    setLSubmitting(false);
  };

  const handleClosePosition = async () => {
    if (!cUser || !cCollToken) return;
    setCSubmitting(true);
    setCStatus(null);
    const res = await callAdmin('/api/admin/position/close', {
      user: cUser,
      collateralToken: cCollToken,
    });
    setCStatus(res);
    setCSubmitting(false);
  };

  return (
    <div className="cc-wrapper">
      {/* Header */}
      <div className="cc-header">
        <span className="cc-title">Contract Controller</span>
        <span className="cc-subtitle">Admin only</span>
      </div>

      {/* Tabs */}
      <div className="cc-tabs">
        <button
          className={`cc-tab ${tab === 'vault' ? 'active' : ''}`}
          onClick={() => setTab('vault')}
        >
          AgentVault
        </button>
        <button
          className={`cc-tab ${tab === 'leverage' ? 'active' : ''}`}
          onClick={() => setTab('leverage')}
        >
          LeveragePool
        </button>
      </div>

      <div className="cc-body">
        {/* ── VAULT TAB ── */}
        {tab === 'vault' && (
          <div className="cc-section">
            <div className="cc-section-label">Settle PnL</div>
            <div className="cc-hint">
              Calls <code>AgentVault.settle_pnl</code>. Positive PnL credits the
              user; negative seizes funds.
            </div>

            <CCField label="USER ADDRESS (G…)">
              <input
                className="cc-input"
                value={vUserAddr}
                onChange={(e) => setVUserAddr(e.target.value)}
                placeholder="GABC…"
              />
            </CCField>

            <CCField label="PNL (USDC, e.g. -90.5)">
              <input
                className="cc-input"
                type="number"
                step="0.0000001"
                value={vPnl}
                onChange={(e) => setVPnl(e.target.value)}
                placeholder="0.0"
              />
            </CCField>

            <CCField label="TOKEN CONTRACT (C…)">
              <input
                className="cc-input mono"
                value={vToken}
                onChange={(e) => setVToken(e.target.value)}
              />
            </CCField>

            <button
              className="cc-btn-submit"
              onClick={handleSettle}
              disabled={vSubmitting || !vUserAddr || !vPnl}
            >
              {vSubmitting ? (
                <><Loader2 size={13} className="animate-spin" /> Submitting…</>
              ) : (
                'Settle PnL'
              )}
            </button>

            {vStatus && <CCToast status={vStatus} onClose={() => setVStatus(null)} />}
          </div>
        )}

        {/* ── LEVERAGE TAB ── */}
        {tab === 'leverage' && (
          <>
            {/* Open position */}
            <div className="cc-section">
              <div className="cc-section-label">Open Synthetic Position</div>
              <div className="cc-hint">
                Calls <code>LeveragePool.open_synthetic_position</code>. Locks
                collateral on-chain for the user.
              </div>

              <CCField label="USER (G…)">
                <input className="cc-input" value={lUser}
                  onChange={(e) => setLUser(e.target.value)} placeholder="GABC…" />
              </CCField>

              <CCField label="ASSET SYMBOL">
                <input className="cc-input" value={lSymbol}
                  onChange={(e) => setLSymbol(e.target.value)} placeholder="XLM" />
              </CCField>

              <div className="cc-row-2">
                <CCField label="DEBT AMOUNT">
                  <input className="cc-input" type="number" step="0.0000001"
                    value={lDebt} onChange={(e) => setLDebt(e.target.value)} placeholder="1000" />
                </CCField>
                <CCField label="COLLATERAL LOCKED">
                  <input className="cc-input" type="number" step="0.0000001"
                    value={lCollLocked} onChange={(e) => setLCollLocked(e.target.value)} placeholder="100" />
                </CCField>
              </div>

              <CCField label="COLLATERAL TOKEN (C…)">
                <input className="cc-input mono" value={lCollToken}
                  onChange={(e) => setLCollToken(e.target.value)} />
              </CCField>

              <button
                className="cc-btn-submit"
                onClick={handleOpenPosition}
                disabled={lSubmitting || !lUser || !lSymbol || !lDebt || !lCollLocked}
              >
                {lSubmitting ? (
                  <><Loader2 size={13} className="animate-spin" /> Submitting…</>
                ) : (
                  'Open Position'
                )}
              </button>

              {lStatus && <CCToast status={lStatus} onClose={() => setLStatus(null)} />}
            </div>

            {/* Close position */}
            <div className="cc-section">
              <div className="cc-section-label">Close Position</div>
              <div className="cc-hint">
                Calls <code>LeveragePool.close_position</code>. Run AFTER
                SettleTrade has handled the money.
              </div>

              <CCField label="USER (G…)">
                <input className="cc-input" value={cUser}
                  onChange={(e) => setCUser(e.target.value)} placeholder="GABC…" />
              </CCField>

              <CCField label="COLLATERAL TOKEN (C…)">
                <input className="cc-input mono" value={cCollToken}
                  onChange={(e) => setCCollToken(e.target.value)} />
              </CCField>

              <button
                className="cc-btn-submit"
                onClick={handleClosePosition}
                disabled={cSubmitting || !cUser}
              >
                {cSubmitting ? (
                  <><Loader2 size={13} className="animate-spin" /> Submitting…</>
                ) : (
                  'Close Position'
                )}
              </button>

              {cStatus && <CCToast status={cStatus} onClose={() => setCStatus(null)} />}
            </div>
          </>
        )}
      </div>

      {/* Contract addresses footer */}
      <div className="cc-footer">
        <div className="cc-contract-row">
          <span className="cc-contract-label">Vault</span>
          <span className="cc-contract-addr">CCNK5O3F…HXJFWG</span>
        </div>
        <div className="cc-contract-row">
          <span className="cc-contract-label">Pool</span>
          <span className="cc-contract-addr">CCNF3JMO…RY7L</span>
        </div>
      </div>
    </div>
  );
}

function CCField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cc-field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

function CCToast({ status, onClose }: { status: { ok: boolean; msg: string }; onClose: () => void }) {
  return (
    <div className={`cc-toast ${status.ok ? 'success' : 'error'}`}>
      <span>{status.msg}</span>
      <button className="tx-toast-close" onClick={onClose}><X size={13} /></button>
    </div>
  );
}
