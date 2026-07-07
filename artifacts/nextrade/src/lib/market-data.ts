/**
 * market-data
 * -----------
 * Hybrid price feed: fetches real prices from the API server (/api/market/prices)
 * every 30 seconds, then applies micro-jitter between fetches to keep the
 * UI feeling alive. Falls back to deterministic simulation when the API is
 * unavailable (e.g. local dev without the server running).
 */
import { useEffect, useState, useRef } from "react";

export type MarketCategory = "forex" | "crypto" | "indices" | "commodities" | "stocks";

export interface MarketInstrument {
  symbol: string;
  name: string;
  category: MarketCategory;
  base: number;
  spreadPct: number;
  volatility: number;
}

export interface MarketTick extends MarketInstrument {
  bid: number;
  ask: number;
  changePct: number;
  high: number;
  low: number;
}

export const INSTRUMENTS: MarketInstrument[] = [
  { symbol: "EUR/USD", name: "Euro / US Dollar",             category: "forex",       base: 1.0832,   spreadPct: 0.0001,  volatility: 0.0006 },
  { symbol: "GBP/USD", name: "British Pound / US Dollar",    category: "forex",       base: 1.2674,   spreadPct: 0.00012, volatility: 0.0008 },
  { symbol: "USD/JPY", name: "US Dollar / Japanese Yen",     category: "forex",       base: 151.84,   spreadPct: 0.0001,  volatility: 0.08   },
  { symbol: "AUD/USD", name: "Australian Dollar / US Dollar",category: "forex",       base: 0.6589,   spreadPct: 0.00014, volatility: 0.0005 },
  { symbol: "USD/CAD", name: "US Dollar / Canadian Dollar",  category: "forex",       base: 1.3645,   spreadPct: 0.00012, volatility: 0.0006 },
  { symbol: "USD/CHF", name: "US Dollar / Swiss Franc",      category: "forex",       base: 0.9043,   spreadPct: 0.00013, volatility: 0.0005 },

  { symbol: "BTC/USD",  name: "Bitcoin",    category: "crypto", base: 67812, spreadPct: 0.0005, volatility: 180  },
  { symbol: "ETH/USD",  name: "Ethereum",   category: "crypto", base: 3284,  spreadPct: 0.0005, volatility: 12   },
  { symbol: "SOL/USD",  name: "Solana",     category: "crypto", base: 148.6, spreadPct: 0.0006, volatility: 1.4  },
  { symbol: "XRP/USD",  name: "Ripple",     category: "crypto", base: 0.512, spreadPct: 0.0008, volatility: 0.008},
  { symbol: "DOGE/USD", name: "Dogecoin",   category: "crypto", base: 0.158, spreadPct: 0.001,  volatility: 0.003},

  { symbol: "US500", name: "S&P 500",    category: "indices", base: 5212.4,  spreadPct: 0.0002, volatility: 4  },
  { symbol: "US100", name: "Nasdaq 100", category: "indices", base: 18234.7, spreadPct: 0.0002, volatility: 18 },
  { symbol: "US30",  name: "Dow Jones",  category: "indices", base: 39482.1, spreadPct: 0.0002, volatility: 22 },
  { symbol: "GER40", name: "DAX 40",     category: "indices", base: 18112.3, spreadPct: 0.0002, volatility: 14 },
  { symbol: "UK100", name: "FTSE 100",   category: "indices", base: 8023.4,  spreadPct: 0.0002, volatility: 6  },

  { symbol: "XAU/USD", name: "Gold",         category: "commodities", base: 2392.8, spreadPct: 0.0003, volatility: 1.6  },
  { symbol: "XAG/USD", name: "Silver",       category: "commodities", base: 28.46,  spreadPct: 0.0004, volatility: 0.06 },
  { symbol: "WTI",     name: "Crude Oil WTI",category: "commodities", base: 82.34,  spreadPct: 0.0003, volatility: 0.18 },
  { symbol: "BRENT",   name: "Brent Oil",    category: "commodities", base: 86.92,  spreadPct: 0.0003, volatility: 0.2  },
  { symbol: "NATGAS",  name: "Natural Gas",  category: "commodities", base: 2.18,   spreadPct: 0.0006, volatility: 0.02 },

  { symbol: "AAPL",  name: "Apple Inc.",      category: "stocks", base: 169.84, spreadPct: 0.0002, volatility: 0.6 },
  { symbol: "TSLA",  name: "Tesla Inc.",      category: "stocks", base: 168.23, spreadPct: 0.0003, volatility: 1.2 },
  { symbol: "NVDA",  name: "NVIDIA Corp.",    category: "stocks", base: 854.6,  spreadPct: 0.0002, volatility: 4   },
  { symbol: "AMZN",  name: "Amazon.com Inc.", category: "stocks", base: 184.21, spreadPct: 0.0002, volatility: 0.7 },
  { symbol: "MSFT",  name: "Microsoft Corp.", category: "stocks", base: 423.18, spreadPct: 0.0002, volatility: 1.1 },
  { symbol: "GOOGL", name: "Alphabet Inc.",   category: "stocks", base: 158.67, spreadPct: 0.0002, volatility: 0.5 },
];

/** Build a tick from a mid-price, applying spread and tiny noise for realism */
function buildTick(inst: MarketInstrument, mid: number, prevMid?: number): MarketTick {
  const noise = (Math.random() - 0.5) * inst.volatility * 0.05; // ±2.5% of volatility
  const price = mid + noise;
  const spread = price * inst.spreadPct;
  const base = prevMid ?? inst.base;
  const changePct = ((price - base) / base) * 100;
  return {
    ...inst,
    bid: price - spread / 2,
    ask: price + spread / 2,
    changePct,
    high: price + inst.volatility * 0.8,
    low: price - inst.volatility * 0.8,
  };
}

/** Pure simulation tick — used when API is unavailable */
function simulateTick(inst: MarketInstrument, t: number): MarketTick {
  const drift = Math.sin(t / 9 + inst.symbol.length) * inst.volatility;
  const noise = (Math.random() - 0.5) * inst.volatility * 0.8;
  const mid = inst.base + drift + noise;
  return buildTick(inst, mid);
}

const PRICE_REFRESH_MS = 30_000; // fetch from API every 30 seconds
const TICK_INTERVAL_MS = 1_200;  // UI tick every 1.2 seconds

/** Global shared price state so all hook instances share one fetch */
let livePrices: Record<string, number> = {};
let lastFetch = 0;
let fetchPromise: Promise<void> | null = null;

async function fetchLivePrices(): Promise<void> {
  try {
    const res = await fetch("/api/market/prices", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const json = await res.json() as { prices: Record<string, number> };
    if (json.prices && typeof json.prices === "object") {
      livePrices = json.prices;
      lastFetch = Date.now();
    }
  } catch {
    // Silently fall back to simulation / stale prices
  }
}

function maybeRefresh() {
  if (Date.now() - lastFetch > PRICE_REFRESH_MS && !fetchPromise) {
    fetchPromise = fetchLivePrices().finally(() => { fetchPromise = null; });
  }
}

export function useLiveMarkets(category?: MarketCategory) {
  const instruments = INSTRUMENTS.filter((i) => !category || i.category === category);
  const [ticks, setTicks] = useState<MarketTick[]>(() =>
    instruments.map((i) => simulateTick(i, 0)),
  );
  const tickRef = useRef(0);

  useEffect(() => {
    // Kick off an immediate price fetch
    maybeRefresh();

    const id = window.setInterval(() => {
      tickRef.current += 1;
      maybeRefresh(); // schedule refresh if stale

      setTicks(instruments.map((inst) => {
        const liveBase = livePrices[inst.symbol];
        return liveBase
          ? buildTick(inst, liveBase, liveBase)
          : simulateTick(inst, tickRef.current);
      }));
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return ticks;
}

export function formatPrice(value: number) {
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value >= 10)   return value.toFixed(2);
  if (value >= 1)    return value.toFixed(4);
  return value.toFixed(5);
}
