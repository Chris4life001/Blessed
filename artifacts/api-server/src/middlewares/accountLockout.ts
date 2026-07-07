/**
 * Account lockout — in-memory brute-force protection.
 *
 * After MAX_FAILURES failed attempts the identifier is locked for LOCKOUT_MS.
 * Between failures, exponential backoff is applied: delay doubles each attempt.
 *
 * Usage:
 *   1. Call checkLockout(identifier) before processing credentials.
 *      If locked → return 429 immediately.
 *   2. Call recordFailure(identifier) when credentials are wrong.
 *      Apply the returned backoffMs delay before responding.
 *   3. Call resetCounter(identifier) on successful auth.
 */
import { logger } from "../lib/logger";

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_BACKOFF_MS = 30_000;      // 30 second ceiling

interface LockoutEntry {
  count: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

// Module-level store — survives across requests in the same process
const store = new Map<string, LockoutEntry>();

/** Sweep expired lockouts to prevent unbounded memory growth */
function sweep(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (
      entry.lockedUntil !== null &&
      now > entry.lockedUntil + LOCKOUT_MS
    ) {
      store.delete(key);
    }
  }
}
// Sweep every 5 minutes
setInterval(sweep, 5 * 60 * 1000).unref();

function getEntry(identifier: string): LockoutEntry {
  return (
    store.get(identifier) ?? { count: 0, lockedUntil: null, lastAttempt: 0 }
  );
}

/**
 * Returns the lockout state for an identifier.
 * @returns { locked: true, remainingMs } or { locked: false }
 */
export function checkLockout(
  identifier: string,
): { locked: true; remainingMs: number } | { locked: false } {
  const entry = getEntry(identifier);
  if (entry.lockedUntil !== null) {
    const remaining = entry.lockedUntil - Date.now();
    if (remaining > 0) return { locked: true, remainingMs: remaining };
    // Lockout expired — clear it
    store.delete(identifier);
  }
  return { locked: false };
}

/**
 * Record a failed authentication attempt.
 * @returns backoffMs — the caller should delay the response by this many milliseconds
 */
export function recordFailure(
  identifier: string,
  context?: { ip?: string; path?: string },
): number {
  const entry = getEntry(identifier);
  entry.count += 1;
  entry.lastAttempt = Date.now();

  // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at MAX_BACKOFF_MS)
  const backoffMs = Math.min(
    Math.pow(2, entry.count - 1) * 1_000,
    MAX_BACKOFF_MS,
  );

  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    logger.warn(
      { identifier, count: entry.count, ...context },
      "[security] Account locked after repeated failed attempts",
    );
  } else {
    logger.warn(
      { identifier, count: entry.count, backoffMs, ...context },
      "[security] Failed authentication attempt",
    );
  }

  store.set(identifier, entry);
  return backoffMs;
}

/** Reset the failure counter after a successful authentication */
export function resetCounter(identifier: string): void {
  store.delete(identifier);
}

/** Return lockout stats for the metrics endpoint */
export function getLockoutStats(): {
  lockedAccounts: number;
  trackedIdentifiers: number;
} {
  const now = Date.now();
  let locked = 0;
  for (const entry of store.values()) {
    if (entry.lockedUntil !== null && entry.lockedUntil > now) locked++;
  }
  return { lockedAccounts: locked, trackedIdentifiers: store.size };
}
