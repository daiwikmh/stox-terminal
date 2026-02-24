import { getCurrentNetworkId } from './assets';

export interface TradingPair {
  symbol: string;
  baseToken: string;
  quoteToken: string;
  price: number;
  change24h: number;
  volume24h: number;
  baseLogo: string;   // path relative to /public
  quoteLogo: string;
}

const XLM_USDC: TradingPair = {
  symbol: 'XLM/USDC',
  baseToken: 'XLM',
  quoteToken: 'USDC',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/slogo.svg',
  quoteLogo: '/usdc.png',
};

const NVDA_USD: TradingPair = {
  symbol: 'NVDA/USD',
  baseToken: 'NVDA',
  quoteToken: 'USD',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

const AAPL_USD: TradingPair = {
  symbol: 'AAPL/USD',
  baseToken: 'AAPL',
  quoteToken: 'USD',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

const BTC_USDC: TradingPair = {
  symbol: 'BTC/USDC',
  baseToken: 'BTC',
  quoteToken: 'USDC',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

const ETH_USDC: TradingPair = {
  symbol: 'ETH/USDC',
  baseToken: 'ETH',
  quoteToken: 'USDC',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

const SOL_USDC: TradingPair = {
  symbol: 'SOL/USDC',
  baseToken: 'SOL',
  quoteToken: 'USDC',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

const TSLA_USD: TradingPair = {
  symbol: 'TSLA/USD',
  baseToken: 'TSLA',
  quoteToken: 'USD',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

const MSFT_USD: TradingPair = {
  symbol: 'MSFT/USD',
  baseToken: 'MSFT',
  quoteToken: 'USD',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

const GOOGL_USD: TradingPair = {
  symbol: 'GOOGL/USD',
  baseToken: 'GOOGL',
  quoteToken: 'USD',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

const AMZN_USD: TradingPair = {
  symbol: 'AMZN/USD',
  baseToken: 'AMZN',
  quoteToken: 'USD',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

const META_USD: TradingPair = {
  symbol: 'META/USD',
  baseToken: 'META',
  quoteToken: 'USD',
  price: 0,
  change24h: 0,
  volume24h: 0,
  baseLogo: '/image.png',
  quoteLogo: '/usdc.png',
};

export function getTradingPairs(): TradingPair[] {
  void getCurrentNetworkId(); // keep import live
  return [
    XLM_USDC,
    BTC_USDC,
    ETH_USDC,
    SOL_USDC,
    NVDA_USD,
    AAPL_USD,
    TSLA_USD,
    MSFT_USD,
    GOOGL_USD,
    AMZN_USD,
    META_USD,
  ];
}

// Backward compat — static export used by legacy consumers
export const tradingPairs: TradingPair[] = [
  XLM_USDC,
  BTC_USDC,
  ETH_USDC,
  SOL_USDC,
  NVDA_USD,
  AAPL_USD,
  TSLA_USD,
  MSFT_USD,
  GOOGL_USD,
  AMZN_USD,
  META_USD,
];
