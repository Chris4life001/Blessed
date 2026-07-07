/**
 * Request sanitization middleware.
 *
 * Two layers of protection against injection attacks:
 *
 * 1. Injection pattern detector — rejects requests whose body or query params
 *    contain well-known attack strings: NoSQL operators, eval(), script tags.
 *
 * 2. MongoDB operator sanitizer — strips keys starting with $ from nested
 *    objects to neutralize NoSQL injection (mirrors express-mongo-sanitize
 *    behaviour as a defence-in-depth layer).
 */
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

// Patterns that indicate likely injection attempts
const INJECTION_RE =
  /(\$where|\$gt|\$ne|\$in|\$or|\$and|\$regex|eval\s*\(|<script\b)/i;

function containsInjectionPattern(val: unknown, depth = 0): boolean {
  if (depth > 10) return false; // prevent DoS via deep nesting
  if (typeof val === "string") return INJECTION_RE.test(val);
  if (Array.isArray(val)) {
    return val.some((item) => containsInjectionPattern(item, depth + 1));
  }
  if (val !== null && typeof val === "object") {
    return Object.entries(val as Record<string, unknown>).some(
      ([k, v]) =>
        INJECTION_RE.test(k) || containsInjectionPattern(v, depth + 1),
    );
  }
  return false;
}

/** Strip MongoDB $ operators from object keys (recursive) */
function stripDollarKeys(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(stripDollarKeys);
  if (val !== null && typeof val === "object") {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>)
        .filter(([k]) => !k.startsWith("$"))
        .map(([k, v]) => [k, stripDollarKeys(v)]),
    );
  }
  return val;
}

/**
 * Injection rejection middleware.
 * Returns HTTP 400 if the request body or query contains injection patterns.
 */
export function rejectInjection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    containsInjectionPattern(req.body) ||
    containsInjectionPattern(req.query)
  ) {
    logger.warn(
      { ip: req.ip, method: req.method, path: req.path },
      "[security] Injection pattern detected in request — rejected",
    );
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  next();
}

/**
 * MongoDB operator sanitizer — strips $ keys from req.body and req.query.
 * Run this AFTER body parsing and BEFORE route handlers.
 */
export function mongoSanitize(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.body && typeof req.body === "object") {
    req.body = stripDollarKeys(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = stripDollarKeys(req.query) as typeof req.query;
  }
  next();
}
