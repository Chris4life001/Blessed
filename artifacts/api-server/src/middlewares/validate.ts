/**
 * Zod-based request validation factory.
 *
 * Usage:
 *   import { validateBody } from '../middlewares/validate';
 *   import { z } from 'zod';
 *
 *   const schema = z.object({ email: z.string().email(), name: z.string().trim().min(1) });
 *   router.post('/path', validateBody(schema), handler);
 *
 * On failure: HTTP 422 { error, errors: [{ field, message }] }
 * On success: req.body is replaced with the parsed+stripped output (no extra fields).
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Recursively sanitize string values in a parsed object */
function sanitizeStrings(val: unknown): unknown {
  if (typeof val === "string") return escapeHtml(val.trim());
  if (Array.isArray(val)) return val.map(sanitizeStrings);
  if (val !== null && typeof val === "object") {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [
        k,
        sanitizeStrings(v),
      ]),
    );
  }
  return val;
}

/**
 * Middleware factory: validates req.body against a Zod schema.
 * Unknown keys are stripped (Zod's default `.strip()` mode).
 * String values are trimmed and HTML-escaped.
 */
export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join(".") || undefined,
        message: e.message,
      }));
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }
    req.body = sanitizeStrings(result.data);
    next();
  };
}

/**
 * Middleware factory: validates req.query against a Zod schema.
 */
export function validateQuery<T extends z.ZodTypeAny>(
  schema: T,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join(".") || undefined,
        message: e.message,
      }));
      res.status(422).json({ error: "Validation failed", errors });
      return;
    }
    req.query = result.data as typeof req.query;
    next();
  };
}

// ── Common field schemas ──────────────────────────────────────────────────────

/** Email: trims, lowercases, validates RFC format */
export const emailField = z
  .string({ required_error: "Email is required" })
  .trim()
  .toLowerCase()
  .email("Must be a valid email address");

/**
 * Strong password: min 12 chars, at least 1 uppercase, 1 number, 1 special char.
 * Matches the requirement from Phase 2.1 of the security spec.
 */
export const strongPasswordField = z
  .string({ required_error: "Password is required" })
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character",
  );

/** Username: 3-30 alphanumeric + underscore + hyphen */
export const usernameField = z
  .string({ required_error: "Username is required" })
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username may only contain letters, numbers, underscores and hyphens",
  );

// ── Pre-built schemas ─────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: emailField,
  password: strongPasswordField,
  username: usernameField,
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  referralCode: z.string().trim().optional(),
  country: z.string().trim().length(2).optional(),
});

export const jwtLoginSchema = z.object({
  email: emailField,
  password: z.string({ required_error: "Password is required" }).min(1),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  token: z.string({ required_error: "Token is required" }).min(1),
  password: strongPasswordField,
});
