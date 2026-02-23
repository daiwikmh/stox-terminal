'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Wallet, ChevronLeft, ChevronRight, Copy, Check, Loader2, X, ArrowDown } from 'lucide-react';
import { useWallet } from '@/utils/wallet';
import type { OrderBook, TransactionResult } from '@/types/sdex.types';
import { storeBridgeToken, registerAccountWithBridge } from '@/utils/bridge';
import HelperChat from '@/components/HelperChat';

const BRIDGE_URL = process.env.NEXT_PUBLIC_AGENT_BRIDGE_URL || 'http://localhost:8090';

type ConnectionState = 'disconnected' | 'generating' | 'token_ready' | 'connected';
type SidebarTab = 'trade' | 'agent';
type AgentMode = 'helper' | 'openclaw';
type TradeSide = 'buy' | 'sell';

interface LogEntry {
  message: string;
  source: string;
  timestamp: string;
  event_type?: string;
}

interface RightSidebarProps {
  isVisible: boolean;
  onToggle: () => void;
  baseToken: string;
  quoteToken: string;
  orderBook: OrderBook | null;
  isSubmitting: boolean;
  lastResult: TransactionResult | null;
  selectedPair?: string;
  network?: string;
  onPlaceOrder: (side: 'buy' | 'sell', amount: string, price: string) => Promise<TransactionResult>;
  onMarketOrder: (side: 'buy' | 'sell', amount: string, slippage: number) => Promise<TransactionResult>;
  onClearResult: () => void;
}

const SLIPPAGES = ['0.1', '0.5', '1.0'];
const PERCENTAGES = [25, 50, 75, 100];

function TokenPill({ symbol }: { symbol: string }) {
  return (
    <span className="token-pill">
      <span className="token-pill-dot" />
      {symbol}
    </span>
  );
}

export default function RightSidebar({
  isVisible, onToggle,
  baseToken, quoteToken,
  orderBook, isSubmitting, lastResult,
  selectedPair, network,
  onPlaceOrder, onMarketOrder, onClearResult,
}: RightSidebarProps) {
  const { isConnected, address } = useWallet();

  const [activeTab, setActiveTab] = useState<SidebarTab>('trade');
  const [agentMode, setAgentMode] = useState<AgentMode>('helper');

  // Trade state
  const [tradeSide, setTradeSide] = useState<TradeSide>('buy');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [buyAmount, setBuyAmount] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyPct, setBuyPct] = useState(0);
  const [sellPct, setSellPct] = useState(0);
  const [slippage, setSlippage] = useState('0.5');

  // Agent state
  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [token, setToken] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  // Derived trade values
  const bestAsk = orderBook?.asks[0]?.price ?? '';
  const bestBid = orderBook?.bids[0]?.price ?? '';
  const isBuy = tradeSide === 'buy';
  const activeBuyPrice = buyPrice || bestAsk;
  const activeSellPrice = sellPrice || bestBid;
  const amount = isBuy ? buyAmount : sellAmount;
  const price = isBuy ? buyPrice : sellPrice;
  const activePrice = isBuy ? activeBuyPrice : activeSellPrice;
  const bestPrice = isBuy ? bestAsk : bestBid;
  const payToken = isBuy ? quoteToken : baseToken;
  const receiveToken = isBuy ? baseToken : quoteToken;
  const buyReceiveAmount = buyAmount && activeBuyPrice
    ? (parseFloat(buyAmount) / parseFloat(activeBuyPrice)).toFixed(7) : '';
  const sellReceiveAmount = sellAmount && activeSellPrice
    ? (parseFloat(sellAmount) * parseFloat(activeSellPrice)).toFixed(7) : '';
  const receiveAmount = isBuy ? buyReceiveAmount : sellReceiveAmount;
  const canSubmit = isConnected && !isSubmitting && !!amount && (orderType === 'market' || !!activePrice);

  const handleSubmit = async () => {
    if (!amount) return;
    if (isBuy) {
      if (orderType === 'market') await onMarketOrder('buy', amount, parseFloat(slippage));
      else if (activeBuyPrice) await onPlaceOrder('buy', amount, activeBuyPrice);
    } else {
      if (orderType === 'market') await onMarketOrder('sell', amount, parseFloat(slippage));
      else if (activeSellPrice) await onPlaceOrder('sell', amount, activeSellPrice);
    }
  };

  // Register account with bridge whenever wallet connects and we have a token.
  useEffect(() => {
    if (token && address && network) {
      registerAccountWithBridge(token, address, network);
    }
  }, [token, address, network]);

  // Agent handlers
  const handleConnect = useCallback(async () => {
    setConnState('generating');
    try {
      const res = await fetch(`${BRIDGE_URL}/api/token/generate`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate token');
      const data = await res.json();
      const newToken = data.token;
      setToken(newToken);
      storeBridgeToken(newToken); // persist for cross-component bridge sync
      setConnState('token_ready');

      const es = new EventSource(`${BRIDGE_URL}/api/logs/stream?token=${newToken}`);
      eventSourceRef.current = es;

      // Default "message" event — regular agent logs.
      es.onmessage = (event) => {
        try {
          const entry: LogEntry = JSON.parse(event.data);
          setLogs((prev) => [...prev, entry]);
          if (entry.source === 'system' && entry.message.includes('Agent connected')) {
            setConnState('connected');
          }
        } catch { /* ignore parse errors */ }
      };

      // Named "insight" events — market signals from order book heartbeat.
      es.addEventListener('insight', (event) => {
        try {
          const entry: LogEntry = JSON.parse((event as MessageEvent).data);
          setLogs((prev) => [...prev, { ...entry, event_type: 'insight' }]);
        } catch { /* ignore */ }
      });

      // Named "context_update" events — new account transactions detected.
      es.addEventListener('context_update', (event) => {
        try {
          const entry: LogEntry = JSON.parse((event as MessageEvent).data);
          setLogs((prev) => [...prev, { ...entry, event_type: 'context_update' }]);
        } catch { /* ignore */ }
      });

      es.onerror = () => { /* auto-reconnect */ };
    } catch {
      setConnState('disconnected');
    }
  }, []);

  const getAgentPrompt = useCallback(() => {
    return `# Stellar AI Trading Platform (Stoxy)

**Step 0 — Security & Secrets (1Password)**
This platform is 1Password-aware. OpenClaw can resolve secrets without plaintext exposure.

Docs: https://developer.1password.com/docs/sdks/ai-agent/

Secret reference syntax: https://developer.1password.com/docs/cli/secret-references/
Service accounts / auth: https://developer.1password.com/docs/cli/service-accounts/
CLI \`op run\` reference: https://developer.1password.com/docs/cli/reference/commands/run/

The bridge resolves secrets stored as \`op://\` URIs (e.g. \`op://StellarTrading/AdminKey/credential\`).
Run the bridge via: \`op run --env-file=.env -- go run .\`
To run an automated session, execute commands via: \`op run -- [command]\`

---

You are now connected to a Stellar DEX trading platform. Use these HTTP API endpoints to trade on the user's behalf.

**Authentication:** Include header \`X-Agent-Token: ${token}\` on every request.
**Base URL:** ${BRIDGE_URL}

**Step 1 — Discover available skills:**
GET ${BRIDGE_URL}/api/skills?token=${token}

**Step 2 — Check what the user is currently viewing:**
GET ${BRIDGE_URL}/api/context?token=${token}
Returns: { network, account_id, active_pair, recent_trades, open_offers }

**Step 3 — Use skills by calling the returned paths.**

READ endpoints (GET, pass params as query string):
- /api/bridge/pairs — list trading pairs
- /api/bridge/orderbook?symbol=XLM/USDC — live order book
- /api/bridge/price?symbol=XLM/USDC — mid-price
- /api/bridge/offers?account=G... — open offers
- /api/bridge/trades?account=G...&limit=20 — trade history
- /api/bridge/trustline?account=G...&asset=USDC — trustline check

WRITE endpoints (POST, JSON body, return unsigned XDR):
- /api/bridge/order/limit — body: { account, symbol, side, amount, price }
- /api/bridge/order/market — body: { account, symbol, side, amount, slippage? }
- /api/bridge/order/cancel — body: { account, offerId, symbol }
- /api/bridge/trustline/build — body: { account, asset }
- /api/bridge/tx/submit — body: { signedXdr } (submit signed transaction)

**Network:** Add header \`X-Stellar-Network: MAINNET\` or \`X-Stellar-Network: TESTNET\` to switch networks.
**Write flow:** call build endpoint → get { xdr, networkPassphrase } → sign XDR → POST to /api/bridge/tx/submit with { signedXdr }.

Start by calling GET ${BRIDGE_URL}/api/context?token=${token} to see the user's current view, then confirm you're connected.`;
  }, [token]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [token]);

  const handleCopyConfig = useCallback(() => {
    navigator.clipboard.writeText(getAgentPrompt());
    setConfigCopied(true);
    setTimeout(() => setConfigCopied(false), 2000);
  }, [getAgentPrompt]);

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString(); } catch { return ''; }
  };

  return (
    <>
      <button
        onClick={onToggle}
        className="sidebar-toggle right"
        style={{ right: isVisible ? '320px' : '0px' }}
      >
        {isVisible ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className={`sidebar sidebar-right ${!isVisible ? 'hidden' : ''}`}>
        {/* Trade / Agent tab bar */}
        <div className="sidebar-header" style={{ padding: '0.5rem 1rem' }}>
          <div className="rs-tabs">
            <button
              className={`rs-tab ${activeTab === 'trade' ? 'active' : ''}`}
              onClick={() => setActiveTab('trade')}
            >
              Trade
            </button>
            <button
              className={`rs-tab ${activeTab === 'agent' ? 'active' : ''}`}
              onClick={() => setActiveTab('agent')}
            >
              Agent
            </button>
          </div>
        </div>

        {/* ── TRADE TAB ── */}
        {activeTab === 'trade' && (
          <div className="rs-trade-panel">
            {lastResult && (
              <div className={`tx-toast ${lastResult.success ? 'success' : 'error'}`}>
                <span>
                  {lastResult.success
                    ? `Submitted · ${lastResult.txHash?.slice(0, 12)}…`
                    : lastResult.errorMessage}
                </span>
                <button className="tx-toast-close" onClick={onClearResult}>
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Order type */}
            <div className="tt-tabs">
              {(['limit', 'market'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={`tt-tab ${orderType === t ? 'active' : ''}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Buy / Sell sub-tabs */}
            <div className="rs-side-tabs">
              <button
                className={`rs-side-tab buy ${tradeSide === 'buy' ? 'active' : ''}`}
                onClick={() => setTradeSide('buy')}
              >
                Buy
              </button>
              <button
                className={`rs-side-tab sell ${tradeSide === 'sell' ? 'active' : ''}`}
                onClick={() => setTradeSide('sell')}
              >
                Sell
              </button>
            </div>

            {/* Order form */}
            <div className={`order-card ${tradeSide}`} style={{ borderRadius: '0.75rem' }}>
              <div className="order-card-header">
                <span className="order-card-title">{isBuy ? 'Buy' : 'Sell'} {baseToken}</span>
                {bestPrice && (
                  <span className="order-card-best">
                    Best: <span>{parseFloat(bestPrice).toFixed(6)}</span>
                  </span>
                )}
              </div>

              {orderType === 'limit' && (
                <div>
                  <span className="field-label">Price</span>
                  <div className="input-row">
                    <input
                      type="number"
                      placeholder={bestPrice || '0.00'}
                      value={price}
                      onChange={(e) => isBuy ? setBuyPrice(e.target.value) : setSellPrice(e.target.value)}
                    />
                    <TokenPill symbol={quoteToken} />
                  </div>
                </div>
              )}

              <div>
                <span className="field-label">You Pay</span>
                <div className="input-row">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => isBuy ? setBuyAmount(e.target.value) : setSellAmount(e.target.value)}
                  />
                  <TokenPill symbol={payToken} />
                </div>
              </div>

              <div className="pct-selector">
                {PERCENTAGES.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => isBuy ? setBuyPct(pct) : setSellPct(pct)}
                    className={`pct-btn ${tradeSide} ${(isBuy ? buyPct : sellPct) === pct ? 'active' : ''}`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              <div className="arrow-divider">
                <span className="arrow-divider-icon"><ArrowDown size={14} /></span>
              </div>

              <div>
                <span className="field-label">You Receive</span>
                <div className="input-row">
                  <input
                    type="text"
                    placeholder={activePrice ? '0.00' : '—'}
                    value={receiveAmount}
                    readOnly
                    className={receiveAmount ? (isBuy ? 'receive-value' : 'receive-value-sell') : ''}
                  />
                  <TokenPill symbol={receiveToken} />
                </div>
                {activePrice && (
                  <p className="input-rate">
                    Rate: 1 {receiveToken} = {parseFloat(activePrice).toFixed(7)} {payToken}
                  </p>
                )}
              </div>

              <div className="meta-bar">
                <span className="meta-bar-label">Slippage</span>
                <div className="slippage-group">
                  {SLIPPAGES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSlippage(s)}
                      className={`slip-btn ${tradeSide} ${slippage === s ? 'active' : ''}`}
                    >
                      {s}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="fee-row">
                <span>Network fee</span>
                <span>0.00001 XLM</span>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={isBuy ? 'btn-buy' : 'btn-sell'}
              >
                {!isConnected ? (
                  'Connect Wallet'
                ) : isSubmitting ? (
                  <span className="btn-submitting">
                    <Loader2 size={16} className="animate-spin" />
                    Submitting…
                  </span>
                ) : (
                  `${isBuy ? 'Buy' : 'Sell'} ${baseToken}`
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── AGENT TAB ── */}
        {activeTab === 'agent' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

            {/* Sub-toggle: Helper / OpenClaw */}
            <div style={{ padding: '6px 12px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
              <div className="tt-tabs">
                <button
                  className={`tt-tab ${agentMode === 'helper' ? 'active' : ''}`}
                  onClick={() => setAgentMode('helper')}
                >
                  Helper
                </button>
                <button
                  className={`tt-tab ${agentMode === 'openclaw' ? 'active' : ''}`}
                  onClick={() => setAgentMode('openclaw')}
                >
                  OpenClaw
                </button>
              </div>
            </div>

            {/* ── Helper: AI chat assistant ── */}
            {agentMode === 'helper' && (
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <HelperChat
                  selectedPair={selectedPair || 'XLM/USDC'}
                  network={network || 'TESTNET'}
                />
              </div>
            )}

            {/* ── OpenClaw: bridge terminal (unchanged) ── */}
            {agentMode === 'openclaw' && (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {connState === 'disconnected' && (
                  <div className="portfolio-content">
                    <div className="portfolio-cta">
                      <div className="portfolio-icon-wrapper">
                        <div className="portfolio-icon-bg">
                          <div className="portfolio-icon-gradient"></div>
                          <div className="portfolio-icon">
                            <Wallet className="w-12 h-12" />
                          </div>
                        </div>
                      </div>
                      <h4 className="portfolio-title">Connect OpenClaw</h4>
                      <p className="portfolio-description">
                        Connect your Openclaw to start your agentic journey
                      </p>
                      <button className="connect-wallet-btn" onClick={handleConnect}>
                        Connect Openclaw
                      </button>
                    </div>
                  </div>
                )}

                {connState === 'generating' && (
                  <div className="portfolio-content">
                    <div className="portfolio-cta">
                      <div className="portfolio-icon-wrapper">
                        <div className="portfolio-icon-bg">
                          <div className="portfolio-icon-gradient"></div>
                          <div className="portfolio-icon">
                            <Wallet className="w-12 h-12" />
                          </div>
                        </div>
                      </div>
                      <button className="connect-wallet-btn" disabled>
                        Generating...
                      </button>
                    </div>
                  </div>
                )}

                {(connState === 'token_ready' || connState === 'connected') && (
                  <div className="agent-panel">
                    {connState === 'token_ready' && (
                      <>
                        <div className="agent-token-display">
                          <span className="agent-token-label">Your token:</span>
                          <div className="agent-token-row">
                            <code className="agent-token-value">{token}</code>
                            <button className="agent-token-copy-btn" onClick={handleCopy}>
                              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <span className="agent-token-hint">Copy the prompt below and paste it to your OpenClaw bot</span>
                        </div>

                        <div className="agent-config-snippet">
                          <div className="agent-config-header">
                            <span className="agent-config-label">Send to OpenClaw</span>
                            <button className="agent-token-copy-btn" onClick={handleCopyConfig}>
                              {configCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <pre className="agent-config-code">{getAgentPrompt()}</pre>
                        </div>
                      </>
                    )}

                    {connState === 'connected' && (
                      <div className="agent-token-display">
                        <div className="agent-token-row">
                          <span className="agent-terminal-dot live" />
                          <span className="agent-token-label" style={{ color: '#00ff94' }}>Agent Connected</span>
                        </div>
                        <span className="agent-token-hint">OpenClaw is actively using your trading endpoints</span>
                      </div>
                    )}

                    <div className="agent-terminal">
                      <div className="agent-terminal-header">
                        <span className="agent-terminal-title">Agent Logs</span>
                        <span className={`agent-terminal-dot ${connState === 'connected' ? 'live' : ''}`} />
                      </div>
                      <div className="agent-terminal-body">
                        {logs.length === 0 && (
                          <div className="agent-terminal-empty">Waiting for agent logs...</div>
                        )}
                        {logs.map((entry, i) => (
                          <div className="agent-log-entry" key={i}>
                            <span className="agent-log-time">{formatTime(entry.timestamp)}</span>
                            <span
                              className="agent-log-msg"
                              style={
                                entry.event_type === 'insight'
                                  ? { color: '#facc15' }
                                  : entry.event_type === 'context_update'
                                  ? { color: '#00ff94' }
                                  : undefined
                              }
                            >
                              {entry.message}
                            </span>
                          </div>
                        ))}
                        <div ref={logsEndRef} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
