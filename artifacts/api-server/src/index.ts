import app from "./app";
import { adminSeedStatus } from "./lib/store";
import { logger } from "./lib/logger";
import { startSweeper } from "./lib/sweeper";
import { assertRequiredEnv } from "./lib/env";
import { hydrateFromDb } from "./lib/hydrate";

// ─── Global error handlers ────────────────────────────────────────────────────
// Catch any synchronous exception that escapes all try/catch blocks.
process.on("uncaughtException", (err: Error) => {
  logger.fatal({ err: err.message, stack: err.stack }, "FATAL: uncaughtException — shutting down");
  process.exit(1);
});

// Catch any unhandled Promise rejection.
process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.fatal({ reason: msg }, "FATAL: unhandledRejection — shutting down");
  process.exit(1);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info({ signal }, "Graceful shutdown initiated");
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Startup ──────────────────────────────────────────────────────────────────
const { port } = assertRequiredEnv();

if (adminSeedStatus.provisioned) {
  logger.info(
    { adminEmail: adminSeedStatus.email },
    "[admin] Admin account provisioned from environment.",
  );
} else {
  logger.warn(
    { reason: adminSeedStatus.reason },
    "[admin] No admin account provisioned. Set ADMIN_EMAIL and ADMIN_PASSWORD as Replit Secrets to enable admin login.",
  );
}

// Register root-level health check alias so platforms that probe /healthz
// (not /api/healthz) also get a 200.
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: Date.now() });
});

// Hydrate in-memory store from DB before accepting requests.
// Errors here are non-fatal — the server falls back to in-memory-only mode.
hydrateFromDb()
  .catch((err: Error) => {
    logger.warn({ err: err.message }, "[hydrate] Startup hydration failed — continuing with in-memory only");
  })
  .finally(() => {
    // Bind to 0.0.0.0 so the server is reachable from outside the container
    app.listen(port, "0.0.0.0", () => {
      logger.info({ port }, `Server running on port ${port}`);
      startSweeper();
    });
  });
