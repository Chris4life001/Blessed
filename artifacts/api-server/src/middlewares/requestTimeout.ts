/**
 * Request timeout middleware.
 *
 * After TIMEOUT_MS the response is automatically closed with HTTP 408.
 * The timer is cleared immediately when the response finishes normally,
 * so there is no overhead for fast requests.
 */
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

const DEFAULT_TIMEOUT_MS = 30_000;

export function requestTimeout(timeoutMs = DEFAULT_TIMEOUT_MS) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (res.headersSent) return;
      logger.warn(
        { method: req.method, path: req.path, timeoutMs },
        "[timeout] Request exceeded timeout",
      );
      res.status(408).json({ error: "Request timeout" });
    }, timeoutMs);

    // Clear on any terminal response event
    const cleanup = () => clearTimeout(timer);
    res.on("finish", cleanup);
    res.on("close", cleanup);

    next();
  };
}
