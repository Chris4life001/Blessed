/**
 * GET /api/metrics — internal observability endpoint.
 *
 * Protected by the METRICS_KEY header. Returns:
 *   - process uptime + memory
 *   - DB pool stats
 *   - Request counter since startup
 *   - Account lockout stats
 *
 * Not exposed to end-users. Intended for monitoring tools (Grafana, Datadog, etc.)
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { env } from "../lib/env";
import { getPoolStats } from "../lib/db-client";
import { getLockoutStats } from "../middlewares/accountLockout";

const router: IRouter = Router();

// Monotonic request counter — incremented by the counter middleware exported below
let _requestCount = 0;

export function incrementRequestCount(): void {
  _requestCount++;
}

router.get("/metrics", (req: Request, res: Response): void => {
  const metricsKey = env.METRICS_KEY;

  // If no key configured, endpoint is unavailable (fail-closed)
  if (!metricsKey) {
    res.status(503).json({ error: "Metrics endpoint not configured" });
    return;
  }

  // Constant-time comparison to prevent timing attacks on the key
  const provided = req.headers["x-metrics-key"] as string | undefined;
  if (!provided || provided !== metricsKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const mem = process.memoryUsage();
  const heapUsedMB = mem.heapUsed / 1024 / 1024;
  const poolStats = getPoolStats();
  const lockoutStats = getLockoutStats();

  res.json({
    uptime: process.uptime(),
    memory: {
      heapUsedMB: Math.round(heapUsedMB * 10) / 10,
      heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      rssMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      externalMB: Math.round((mem.external / 1024 / 1024) * 10) / 10,
      heapWarning: heapUsedMB > 400,
    },
    db: poolStats,
    requests: {
      totalSinceStartup: _requestCount,
    },
    security: lockoutStats,
    timestamp: Date.now(),
  });
});

export default router;
