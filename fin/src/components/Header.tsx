'use client';

import { ChevronDown, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { initWalletKit, useWallet } from '@/utils/wallet';

export default function Header() {
  const { address, isConnecting, isConnected, network, connectWallet, disconnectWallet, changeNetwork, formatAddress } = useWallet();
  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    initWalletKit();
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setShowNetworkDropdown(false);
    if (showNetworkDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showNetworkDropdown]);

  const handleNetworkChange = async (newNetwork: 'MAINNET' | 'TESTNET') => {
    setShowNetworkDropdown(false);
    if (newNetwork !== network) {
      await changeNetwork(newNetwork);
    }
  };

  return (
    <header className="header">
      <div className="header-container">
        {/* Logo + compact nav */}
        <div className="flex items-center gap-3">
          <div className="header-logo" style={{ cursor: 'pointer' }} onClick={() => router.push('/terminal')}>
            <Image src="/headlogo.png" alt="Stox" width={28} height={28} style={{ objectFit: 'contain' }} />
          </div>
          <nav className="header-nav">
            <button
              className={`header-nav-item ${pathname === '/terminal' ? 'active' : ''}`}
              onClick={() => router.push('/terminal')}
            >
              Terminal
            </button>
            <button
              className={`header-nav-item ${pathname === '/pro' ? 'active' : ''}`}
              onClick={() => router.push('/pro')}
            >
              Pro
            </button>
            <button
              className={`header-nav-item ${pathname === '/portfolio' ? 'active' : ''}`}
              onClick={() => router.push('/portfolio')}
            >
              Portfolio
            </button>
          </nav>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* Network pill */}
          <div style={{ position: 'relative' }}>
            <button
              className="network-selector"
              onClick={(e) => {
                e.stopPropagation();
                setShowNetworkDropdown(!showNetworkDropdown);
              }}
            >
              <span
                style={{
                  width: '0.45rem',
                  height: '0.45rem',
                  borderRadius: '50%',
                  background: network === 'MAINNET' ? '#00ff94' : '#facc15',
                  flexShrink: 0,
                }}
              />
              <span className="network-name">{network === 'MAINNET' ? 'Mainnet' : 'Testnet'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            </button>

            {showNetworkDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  background: '#111',
                  border: '1px solid #1e1e1e',
                  borderRadius: '0.75rem',
                  minWidth: '160px',
                  zIndex: 1000,
                  overflow: 'hidden',
                }}
              >
                {(['MAINNET', 'TESTNET'] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => handleNetworkChange(n)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: network === n ? '#1a1a1a' : 'transparent',
                      border: 'none',
                      color: '#fff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                    }}
                    onMouseEnter={(e) => {
                      if (network !== n) e.currentTarget.style.background = '#141414';
                    }}
                    onMouseLeave={(e) => {
                      if (network !== n) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span
                      style={{
                        width: '0.4rem',
                        height: '0.4rem',
                        borderRadius: '50%',
                        background: n === 'MAINNET' ? '#00ff94' : '#facc15',
                        flexShrink: 0,
                      }}
                    />
                    <span>{n === 'MAINNET' ? 'Mainnet' : 'Testnet'}</span>
                    {network === n && (
                      <span style={{ marginLeft: 'auto', color: '#00ff94', fontSize: '11px' }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Wallet button */}
          {isConnected ? (
            <button className="wallet-btn connected" onClick={disconnectWallet} title={address || ''}>
              <span className="wallet-btn-dot" />
              <span className="wallet-btn-address">{formatAddress(address || '')}</span>
            </button>
          ) : (
            <button
              className="wallet-btn"
              onClick={connectWallet}
              disabled={isConnecting}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{isConnecting ? 'Connecting…' : 'Connect Wallet'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
