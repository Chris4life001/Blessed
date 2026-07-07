---
name: Market data aggregation
description: How live prices flow from public APIs to the NeXTrade frontend — servers, cache, fallbacks.
---

## Server side: GET /api/market/prices

File: `artifacts/api-server/src/routes/market.ts`

- **Frankfurter API** (`api.frankfurter.app/latest?from=USD&to=EUR,GBP,...`) — forex pairs + XAU/XAG gold/silver
- **CoinGecko public API** — BTC, ETH, SOL, XRP, DOGE
- Both fetches run via `Promise.allSettled` — one failure doesn't block the other
- **30-second server-side cache** — `priceCache` module-level singleton
- Response: `{ prices: Record<string, number>, fetchedAt, cached }`
- On total failure: returns stale cache or static fallbacks (never 5xx)

**Numeric guard:** CoinGecko responses must pass `typeof price === "number" && isFinite(price) && price > 0` before being merged — raw `.usd` can be `undefined`.

## Client side: useLiveMarkets hook

File: `artifacts/nextrade/src/lib/market-data.ts`

- Polls `/api/market/prices` every 30 seconds (module-level timer, shared across hook instances)
- Applies micro-jitter (±2.5% of volatility) between fetches so the UI animates at 1.2s intervals
- Falls back to deterministic simulation when API is unreachable (e.g. no server in dev)
- `livePrices` is a module-level variable — all hook instances share one fetch cycle

## Instruments covered by live data
Forex + commodities (via Frankfurter): EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, XAU/USD, XAG/USD
Crypto (via CoinGecko): BTC/USD, ETH/USD, SOL/USD, XRP/USD, DOGE/USD

Simulation-only (no free live source): WTI, BRENT, NATGAS, US500, US100, US30, GER40, UK100, AAPL, TSLA, NVDA, AMZN, MSFT, GOOGL
