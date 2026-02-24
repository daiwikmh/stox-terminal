'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import LeftSidebar from '@/components/LeftSidebar';
import ChartSection from '@/components/ChartSection';
import TradingTerminal from '@/components/TradingTerminal';
import UserVault from '@/components/UserVault';
import { useSdex } from '@/hooks/useSdex';

export default function ProPage() {
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const sdex = useSdex();

  const baseToken = sdex.baseAsset?.code ?? 'XLM';
  const quoteToken = sdex.quoteAsset?.code ?? 'USDC';

  return (
    <div className="min-h-screen bg-[#060606]">
      <Header />

      <div className="flex h-[calc(100vh-73px)] gap-2 px-2 py-2">
        {/* Left sidebar — pairs list (same as terminal) */}
        <LeftSidebar
          isVisible={showLeftSidebar}
          onToggle={() => setShowLeftSidebar(!showLeftSidebar)}
          selectedPair={sdex.selectedPair}
          onSelectPair={sdex.selectPair}
          network={sdex.network}
        />

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Chart */}
          <div className="shrink-0 h-[450px] px-6 pt-6">
            <ChartSection pair={sdex.selectedPair} />
          </div>

          {/* Order Book + Open Orders */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <TradingTerminal
              baseToken={baseToken}
              quoteToken={quoteToken}
              orderBook={sdex.orderBook}
              openOffers={sdex.openOffers}
              isLoadingOrderBook={sdex.isLoadingOrderBook}
              isSubmitting={sdex.isSubmitting}
              onCancelOrder={sdex.cancelOrder}
            />
          </div>
        </div>

        {/* Right panel — User vault */}
        <div className="pro-cc-panel">
          <UserVault />
        </div>
      </div>
    </div>
  );
}
