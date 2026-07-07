---
name: Production security stack
description: Security middleware added during production hardening — order matters.
---

## Middleware order in app.ts (deliberate, do not reorder)

1. `app.set("trust proxy", 1)` — must come before rate limiters so IPs resolve correctly
2. `helmet()` — security headers applied early before any response
3. `pinoHttp()` — logging
4. `cors()` — CORS gate before body parsing
5. `cookieParser()` — before webhook raw parsers and CSRF check
6. `express.raw()` — webhook-specific raw body (before JSON parser!)
7. `express.json({ limit: "10kb" })` + `urlencoded` — body parsing
8. `hpp()` — HTTP parameter pollution (after body parsing, needs req.body)
9. CSRF check middleware — after cookies + body
10. `attachSession` + `platformGate` — auth middleware
11. Rate limiters — after session so `req.userId` is available for keyed limits
12. `router` — routes
13. 4-arg error handler — must be last

## Packages installed
- `helmet ^8.2.0` + `@types/helmet`
- `hpp ^0.2.3` + `@types/hpp`

## Key behaviors
- Global rate limit: 100 req/15 min/IP, production only (skipped in dev)
- Auth endpoints: 10 req/15 min/IP  
- Live chat: 20 req/min keyed by userId (falls back to IP)
- `app.disable("x-powered-by")` prevents leaking Express version
- `uncaughtException` + `unhandledRejection` both call `process.exit(1)` immediately (fail-fast, not graceful)
