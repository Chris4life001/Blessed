---
name: PM2 cluster vs in-memory state
description: Why PM2 cluster mode breaks auth/sessions in this API — and what to change first before enabling it.
---

## Rule
Keep `exec_mode: "fork"` and `instances: 1` in `ecosystem.config.js`.

**Why:** The API server stores user sessions, platform config, and stateful data in process memory (the `store.ts` module). PM2 cluster mode forks N worker processes, each with isolated memory. A request to one worker has no knowledge of a session established in another worker. Auth becomes non-deterministic — users randomly get logged out or see stale state depending on which worker handles their request.

**How to apply:** Before switching to `instances: "max"` + `exec_mode: "cluster"`:
1. Externalize session storage to Redis (`express-session` + `connect-redis`) or the PostgreSQL database.
2. Externalize the in-memory store (`store.ts`) to the DB — the shadow-write pattern is partially in place; full DB-as-source-of-truth is needed.
3. Add sticky routing in nginx (`ip_hash` upstream) as a short-term mitigation during migration.
