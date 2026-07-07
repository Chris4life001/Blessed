/**
 * Cache-Control middleware for API routes.
 *
 * All /api responses must carry no-store to prevent sensitive data from
 * being cached by browsers, CDNs, or shared proxies.
 */
import type { Request, Response, NextFunction } from "express";

/** Sets Cache-Control: no-store on every response. Register on the /api router. */
export function noStore(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  next();
}
