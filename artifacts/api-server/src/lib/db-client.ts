/**
 * Lazy PostgreSQL client + fire-and-forget shadow-write helper.
 *
 * The server starts and runs normally without DATABASE_URL — all calls to
 * dbRun() / dbGet() become no-ops and warnings are logged once.  When
 * DATABASE_URL is present the pool is initialised on first use.
 *
 * Rules:
 *  - Never pass in-memory IDs to insert .values() — they are not valid UUIDs.
 *    Let Drizzle auto-generate UUIDs via defaultRandom().
 *  - dbRun() is fire-and-forget: the HTTP response is sent before it completes.
 *  - dbGet() awaits and returns a typed fallback on error.
 */
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import { logger } from "./logger";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let _db: DbClient | null = null;
let _warned = false;

export function getDb(): DbClient | null {
  if (_db) return _db;
  // Strip accidental `psql '...'` or `psql "..."` wrapper users sometimes paste instead of the bare URL
  const raw = (process.env.DATABASE_URL ?? "").trim();
  const url = raw.replace(/^psql\s+['"]?/, "").replace(/['"]$/, "") || undefined;
  if (!url) {
    if (!_warned) {
      logger.warn("[db] DATABASE_URL not set — DB persistence disabled");
      _warned = true;
    }
    return null;
  }
  try {
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    _db = drizzle(pool, { schema });
    logger.info("[db] PostgreSQL connection pool initialised");
    return _db;
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[db] Failed to initialise pool");
    return null;
  }
}

/**
 * Fire-and-forget DB write. Errors are logged but never thrown.
 * The in-memory store is the source of truth for reads.
 */
export function dbRun(
  label: string,
  fn: (db: DbClient) => Promise<void>,
): void {
  const db = getDb();
  if (!db) return;
  fn(db).catch((err: Error) => {
    logger.warn({ label, err: err.message }, "[db] shadow write failed");
  });
}

/**
 * Awaited DB read with typed fallback on error or when DB is unavailable.
 * Use for startup hydration only — all runtime reads should use in-memory.
 */
export async function dbGet<T>(
  label: string,
  fn: (db: DbClient) => Promise<T>,
  fallback: T,
): Promise<T> {
  const db = getDb();
  if (!db) return fallback;
  try {
    return await fn(db);
  } catch (err) {
    logger.warn({ label, err: (err as Error).message }, "[db] read failed");
    return fallback;
  }
}
