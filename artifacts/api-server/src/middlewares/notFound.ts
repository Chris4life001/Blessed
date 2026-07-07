/**
 * 404 catch-all — register as the last middleware before errorHandler.
 */
import type { Request, Response } from "express";

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: "Route not found", path: req.path });
}
