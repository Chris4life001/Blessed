/**
 * JWT authentication middleware.
 *
 * verifyToken: reads Bearer token → validates → attaches decoded payload to req.user
 *
 * Gate behaviour:
 *  - JWT_SECRET not in env → 503 "Authentication service not available"
 *  - Token missing         → 401 "No token provided"
 *  - Token invalid/expired → 401 "Invalid token"
 *  - Token valid           → req.user populated, next() called
 */
import type { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import type { AuthenticatedRequest, UserPayload } from "../types/index";

export function verifyToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!env.JWT_SECRET) {
    logger.warn("JWT_SECRET not configured — JWT auth unavailable");
    res.status(503).json({ error: "Authentication service not available" });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as UserPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * Optional token verification: populates req.user if a valid token is present,
 * but does NOT reject requests without a token. Useful for routes that are
 * public but behave differently when authenticated.
 */
export function optionalToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!env.JWT_SECRET) { next(); return; }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as UserPayload;
      req.user = payload;
    } catch {
      // Silently ignore invalid optional tokens
    }
  }
  next();
}
