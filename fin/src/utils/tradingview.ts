export const TRADINGVIEW_SCRIPT_URL =
  'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

export interface TradingViewConfig {
  allow_symbol_change: boolean;
  calendar: boolean;
  details: boolean;
  hide_side_toolbar: boolean;
  hide_top_toolbar: boolean;
  hide_legend: boolean;
  hide_volume: boolean;
  hotlist: boolean;
  interval: string;
  locale: string;
  save_image: boolean;
  style: string;
  symbol: string;
  theme: string;
  timezone: string;
  backgroundColor: string;
  gridColor: string;
  watchlist: string[];
  withdateranges: boolean;
  compareSymbols: string[];
  studies: string[];
  autosize: boolean;
}

/**
 * Map our SDEX pair symbols to TradingView symbols.
 * TradingView doesn't list SDEX directly, so we use Binance equivalents where available.
 */
const TV_SYMBOL_MAP: Record<string, string> = {
  // Crypto
  'XLM/USDC': 'BINANCE:XLMUSDC',
  'XLM/USDT': 'BINANCE:XLMUSDT',
  'BTC/USDC': 'BINANCE:BTCUSDC',
  'ETH/USDC': 'BINANCE:ETHUSDC',
  'SOL/USDC': 'BINANCE:SOLUSDC',
  // Stocks
  'NVDA/USD': 'NASDAQ:NVDA',
  'AAPL/USD': 'NASDAQ:AAPL',
  'TSLA/USD': 'NASDAQ:TSLA',
  'MSFT/USD': 'NASDAQ:MSFT',
  'GOOGL/USD': 'NASDAQ:GOOGL',
  'AMZN/USD': 'NASDAQ:AMZN',
  'META/USD': 'NASDAQ:META',
  // Fallbacks
  'SRT/XLM': 'BINANCE:XLMUSDC',
  'SRT/USDC': 'BINANCE:XLMUSDC',
  'AQUA/XLM': 'BINANCE:XLMUSDC',
};

export function getTradingViewSymbol(pair: string): string {
  return TV_SYMBOL_MAP[pair] ?? 'BINANCE:XLMUSDC';
}

export const defaultTradingViewConfig: TradingViewConfig = {
  allow_symbol_change: true,
  calendar: false,
  details: false,
  hide_side_toolbar: true,
  hide_top_toolbar: false,
  hide_legend: false,
  hide_volume: false,
  hotlist: false,
  interval: 'D',
  locale: 'en',
  save_image: true,
  style: '1',
  symbol: 'BINANCE:XLMUSDC',
  theme: 'dark',
  timezone: 'Etc/UTC',
  backgroundColor: '#0F0F0F',
  gridColor: 'rgba(242, 242, 242, 0.06)',
  watchlist: [],
  withdateranges: false,
  compareSymbols: [],
  studies: [],
  autosize: true,
};
