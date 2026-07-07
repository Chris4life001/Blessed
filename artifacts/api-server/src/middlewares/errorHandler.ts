/**
 * Global error handler — must be registered LAST in app.ts (4-arg signature).
 *
 * Maps AppError subclasses to their HTTP status codes.
 * In production: zero stack traces, zero internal detail.
 * In development: full error + stack trace for debugging.
 */
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { isProduction } from "../lib/env";
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  DatabaseError,
} from "../errors/AppError";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const userId = (req as Request & { userId?: string }).userId;

  // Structured error log — stack only in dev, never in prod
  logger.error({
    err: err.message,
    stack: isProduction ? undefined : err.stack,
    method: req.method,
    path: req.path,
    userId,
  }, "Request error");

  // Already sent — nothing we can do
  if (res.headersSent) return;

  // Operational AppError subclasses
  if (err instanceof ValidationError) {
    res.status(422).json({
      error: err.message,
      errors: err.errors,
    });
    return;
  }
  if (err instanceof UnauthorizedError) {
    res.status(401).json({ error: err.message });
    return;
  }
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof DatabaseError) {
    res.status(503).json({ error: err.message });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Unknown / programming error — never leak details in production
  if (isProduction) {
    res.status(500).json({ error: "Internal Server Error" });
  } else {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
