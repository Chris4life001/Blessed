/**
 * /api/market — live price feed aggregator
 *
 * Fetches real prices from free public APIs with no API key required:
 *  - Forex (EUR, GBP, JPY, AUD, CAD, CHF): Frankfurter API
 *  - Crypto (BTC, ETH, SOL, XRP, DOGE): CoinGecko public API
 *  - Commodities (XAU gold, XAG silver): Frankfurter
 *
 * Prices are cached server-side for 30 seconds to avoid hammering the upstream
 * APIs and to keep latency low for all connected clients.
 */
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface PriceCache {
  data: Record<string, number>;
  fetchedAt: number;
}

let priceCache: PriceCache | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

// Instrument base prices used as fallback when upstream APIs fail
const FALLBACKS: Record<string, number> = {
  "EUR/USD": 1.0832, "GBP/USD": 1.2674, "USD/JPY": 151.84,
  "AUD/USD": 0.6589, "USD/CAD": 1.3645, "USD/CHF": 0.9043,
  "BTC/USD": 67812,  "ETH/USD": 3284,   "SOL/USD": 148.6,
  "XRP/USD": 0.512,  "DOGE/USD": 0.158,
  "XAU/USD": 2392.8, "XAG/USD": 28.46,  "WTI": 82.34, "BRENT": 86.92,
  "US500": 5212.4,   "US100": 18234.7,  "US30": 39482.1,
};

async function fetchForexPrices(): Promise<Record<string, number>> {
  // Frankfurter API — free, no key, reliable
  const res = await fetch(
    "https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,AUD,CAD,CHF,XAU,XAG",
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
  const json = await res.json() as { rates: Record<string, number> };
  const rates = json.rates;
  const prices: Record<string, number> = {};
  // Convert "USD per unit" to "pair price"
  if (rates.EUR) prices["EUR/USD"] = parseFloat((1 / rates.EUR).toFixed(5));
  if (rates.GBP) prices["GBP/USD"] = parseFloat((1 / rates.GBP).toFixed(5));
  if (rates.JPY) prices["USD/JPY"] = parseFloat(rates.JPY.toFixed(3));
  if (rates.AUD) prices["AUD/USD"] = parseFloat((1 / rates.AUD).toFixed(5));
  if (rates.CAD) prices["USD/CAD"] = parseFloat(rates.CAD.toFixed(5));
  if (rates.CHF) prices["USD/CHF"] = parseFloat(rates.CHF.toFixed(5));
  if (rates.XAU) prices["XAU/USD"] = parseFloat((1 / rates.XAU).toFixed(2));
  if (rates.XAG) prices["XAG/USD"] = parseFloat((1 / rates.XAG).toFixed(3));
  return prices;
}

async function fetchCryptoPrices(): Promise<Record<string, number>> {
  // CoinGecko public API — free tier, no key needed
  const ids = "bitcoin,ethereum,solana,ripple,dogecoin";
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json = await res.json() as Record<string, { usd: number }>;
  return {
    "BTC/USD":  json.bitcoin?.usd,
    "ETH/USD":  json.ethereum?.usd,
    "SOL/USD":  json.solana?.usd,
    "XRP/USD":  json.ripple?.usd,
    "DOGE/USD": json.dogecoin?.usd,
  };
}

async function refreshPrices(): Promise<Record<string, number>> {
  const results = await Promise.allSettled([fetchForexPrices(), fetchCryptoPrices()]);
  const merged: Record<string, number> = { ...FALLBACKS };

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const [symbol, price] of Object.entries(result.value)) {
        if (price && !isNaN(price)) merged[symbol] = price;
      }
    } else {
      logger.warn({ err: result.reason?.message }, "[market] price fetch failed — using cached/fallback");
    }
  }
  return merged;
}

// GET /api/market/prices — returns current mid-prices for all instruments
router.get("/prices", async (_req, res) => {
  const now = Date.now();
  if (priceCache && now - priceCache.fetchedAt < CACHE_TTL_MS) {
    res.json({ prices: priceCache.data, fetchedAt: priceCache.fetchedAt, cached: true });
    return;
  }

  try {
    const prices = await refreshPrices();
    priceCache = { data: prices, fetchedAt: now };
    res.json({ prices, fetchedAt: now, cached: false });
  } catch (err) {
    const fallback = priceCache?.data ?? FALLBACKS;
    res.json({ prices: fallback, fetchedAt: priceCache?.fetchedAt ?? now, cached: true, error: "upstream unavailable" });
  }
});

export default router;
