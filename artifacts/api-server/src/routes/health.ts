import { Router, type IRouter } from "express";
import { adminSeedStatus } from "../lib/store";
import { getDb } from "../lib/db-client";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// Singleton probe — reuse the existing DB pool from db-client rather than
// opening a new connection on every health check.
async function checkDb(): Promise<{ connected: boolean; latencyMs?: number }> {
  const db = getDb();
  if (!db) return { connected: false };
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    return { connected: true, latencyMs: Date.now() - start };
  } catch {
    return { connected: false };
  }
}

// GET /api/healthz — primary health check used by Railway / load balancers
router.get("/healthz", async (_req, res) => {
  const dbStatus = await checkDb();
  const payload = {
    status: dbStatus.connected ? "ok" : "degraded",
    db: dbStatus.connected ? "connected" : "disconnected",
    dbLatencyMs: dbStatus.latencyMs,
    uptime: Math.round(process.uptime()),
    timestamp: Date.now(),
  };
  res.status(dbStatus.connected ? 200 : 503).json(payload);
});

// Public — lets the admin portal show a "no admin provisioned" banner
router.get("/admin/provisioning-status", (_req, res) => {
  res.json({ provisioned: adminSeedStatus.provisioned });
});

export default router;
