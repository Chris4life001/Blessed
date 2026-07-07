/**
 * Shared TypeScript types for the API server.
 * Import from here instead of reaching into Express internals directly.
 */
import type { Request } from "express";

/** JWT payload stored inside the access token */
export interface UserPayload {
  sub: string;       // user UUID
  email: string;
  role: "user" | "admin" | "demo";
  iat?: number;
  exp?: number;
}

/** Express Request augmented with the decoded JWT user */
export interface AuthenticatedRequest extends Request {
  user?: UserPayload;
  userId?: string; // populated by session middleware for cookie-auth routes
}

/** Standard API response envelope */
export interface ApiResponse<T = void> {
  data?: T;
  error?: string;
  errors?: Array<{ field?: string; message: string }>;
  message?: string;
}
