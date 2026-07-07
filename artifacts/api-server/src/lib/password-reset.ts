/**
 * Secure password-reset token store.
 *
 * Flow:
 *   1. createToken(email) → raw token (send in email link)
 *   2. verifyToken(rawToken) → email | null  (validate + consume; one-use)
 *
 * Tokens are stored as SHA-256 hashes — the raw token never persists in
 * memory beyond the moment of creation.  Expired tokens are pruned lazily.
 */
import { randomBytes, createHash } from "node:crypto";
import { logger } from "./logger";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

interface ResetEntry {
  emailHash: string; // SHA-256 of the email for lookup
  email: string;
  expiresAt: number;
  used: boolean;
}

// tokenHash → entry
const resetTokens = new Map<string, ResetEntry>();

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function prune(): void {
  const now = Date.now();
  for (const [hash, entry] of resetTokens) {
    if (entry.expiresAt < now || entry.used) resetTokens.delete(hash);
  }
}
// Prune every 10 minutes
setInterval(prune, 10 * 60 * 1000).unref();

/**
 * Generates and stores a password-reset token for the given email.
 * @returns rawToken — 64-char hex string to include in the reset link
 */
export function createResetToken(email: string): string {
  // Invalidate any existing tokens for this email first
  for (const [hash, entry] of resetTokens) {
    if (entry.email.toLowerCase() === email.toLowerCase()) {
      resetTokens.delete(hash);
    }
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  resetTokens.set(tokenHash, {
    emailHash: sha256(email.toLowerCase()),
    email: email.toLowerCase(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
    used: false,
  });

  logger.info({ email }, "[auth] Password reset token created");
  return rawToken;
}

/**
 * Verifies and consumes a raw reset token.
 * @returns the email associated with the token, or null if invalid/expired/used
 */
export function consumeResetToken(rawToken: string): string | null {
  const tokenHash = sha256(rawToken);
  const entry = resetTokens.get(tokenHash);

  if (!entry) return null;
  if (entry.used) return null;
  if (Date.now() > entry.expiresAt) {
    resetTokens.delete(tokenHash);
    return null;
  }

  // Mark as used immediately (one-time token)
  entry.used = true;
  resetTokens.set(tokenHash, entry);

  logger.info({ email: entry.email }, "[auth] Password reset token consumed");
  return entry.email;
}
