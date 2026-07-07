/**
 * JWT authentication routes — full system, gated on JWT_SECRET.
 *
 * POST /auth/register          — register new user with password
 * POST /auth/refresh           — rotate refresh token → issue new access token
 * POST /auth/logout-jwt        — clear JWT refresh token cookie
 * GET  /auth/me                — return authenticated user profile (JWT-protected)
 * POST /auth/forgot-password   — send reset link (always 200, prevents enumeration)
 * POST /auth/reset-password    — consume reset token, update password
 *
 * Note: POST /auth/login JWT branch is handled in the extended auth.ts.
 */
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import {
  users,
  usersByEmail,
  hashPassword,
  freshUserData,
  userData,
  newReferralCode,
  referralCodeIndex,
  referrals,
  NOW,
  newSessionId,
  sessions,
  logActivity,
} from "../lib/store";
import { dbRun } from "../lib/db-client";
import { usersTable } from "@workspace/db/schema";
import { sendEmail } from "../lib/email";
import { verifyToken } from "../middlewares/auth";
import {
  validateBody,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../middlewares/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { createResetToken, consumeResetToken } from "../lib/password-reset";
import {
  checkLockout,
  recordFailure,
  resetCounter,
} from "../middlewares/accountLockout";
import { setSessionCookie } from "../lib/session";
import type { AuthenticatedRequest, UserPayload } from "../types/index";

const router: IRouter = Router();

const REFRESH_COOKIE = "xpfx_refresh";
const ACCESS_TTL_SECS = 15 * 60;          // 15 minutes
const REFRESH_TTL_SECS = 7 * 24 * 60 * 60; // 7 days
const REFRESH_TTL_MS = REFRESH_TTL_SECS * 1000;

// ── Token helpers ─────────────────────────────────────────────────────────────

export function issueAccessToken(payload: UserPayload): string {
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET not configured");
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TTL_SECS });
}

export function issueRefreshToken(userId: string): string {
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET not configured");
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: REFRESH_TTL_SECS,
  });
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_TTL_MS,
    path: "/api/auth",
  });
}

/** Returns false and sends 503 if JWT_SECRET is not configured */
function assertJwt(res: Response): boolean {
  if (!env.JWT_SECRET) {
    logger.warn("JWT_SECRET not configured — JWT auth unavailable");
    res.status(503).json({ error: "Authentication service not available" });
    return false;
  }
  return true;
}

// ── POST /auth/register ───────────────────────────────────────────────────────

router.post(
  "/auth/register",
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    if (!assertJwt(res)) return;

    const { email, password, username, firstName, lastName, country } =
      req.body as z.infer<typeof registerSchema>;

    if (usersByEmail.has(email)) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const id = randomUUID();
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || username;
    const referralCode = newReferralCode();
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}&backgroundColor=b6e3f4`;
    const passwordHash = hashPassword(password);

    users.set(id, {
      user: {
        id,
        username: username,
        email,
        fullName,
        country: country ?? "",
        kycVerified: false,
        avatarUrl,
        createdAt: NOW(),
        selectedManagerId: null,
        buyVerified: false,
      },
      passwordHash,
      role: "user",
      referralCode,
      referredBy: null,
      merchant: false,
      tradingLocked: false,
      demoMode: false,
      phone: null,
      accountFlag: null,
      suspended: false,
      disabled: false,
    });

    usersByEmail.set(email, id);
    referralCodeIndex.set(referralCode, id);
    referrals.set(id, []);
    userData.set(id, freshUserData(id, { country: country ?? "" }));

    dbRun("jwt.register", async (db) => {
      await db
        .insert(usersTable)
        .values({
          id,
          username,
          email,
          fullName,
          country: country ?? "",
          passwordHash,
          role: "user",
          referralCode,
          kycVerified: false,
          emailVerified: true,
          phoneVerified: false,
          avatarUrl,
        })
        .onConflictDoNothing();
    });

    logger.info({ userId: id, email }, "[auth] JWT register: user created");
    res.status(201).json({ message: "Account created" });
  }),
);

// ── POST /auth/refresh ────────────────────────────────────────────────────────

router.post(
  "/auth/refresh",
  asyncHandler(async (req, res) => {
    if (!assertJwt(res)) return;

    const refreshToken =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ??
      (req.signedCookies?.[REFRESH_COOKIE] as string | undefined);

    if (!refreshToken) {
      res.status(401).json({ error: "No refresh token" });
      return;
    }

    let decoded: { sub?: string };
    try {
      decoded = jwt.verify(refreshToken, env.JWT_SECRET!) as { sub?: string };
    } catch {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    const stored = decoded.sub ? users.get(decoded.sub) : null;
    if (!stored) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const payload: UserPayload = {
      sub: stored.user.id,
      email: stored.user.email,
      role: stored.role as UserPayload["role"],
    };

    const newAccess = issueAccessToken(payload);
    const newRefresh = issueRefreshToken(stored.user.id); // rotate every use
    setRefreshCookie(res, newRefresh);

    res.json({ accessToken: newAccess });
  }),
);

// ── POST /auth/logout-jwt ─────────────────────────────────────────────────────

router.post("/auth/logout-jwt", (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.json({ message: "Logged out" });
});

// ── GET /auth/me (JWT-protected) ──────────────────────────────────────────────

router.get(
  "/auth/me",
  verifyToken,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const stored = req.user?.sub ? users.get(req.user.sub) : null;
    if (!stored) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const { passwordHash: _ph, ...safeStored } = stored;
    void _ph;
    res.json(safeStored);
  }),
);

// ── POST /auth/forgot-password ────────────────────────────────────────────────

router.post(
  "/auth/forgot-password",
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof forgotPasswordSchema>;

    const userId = usersByEmail.get(email);
    if (userId && users.has(userId)) {
      const rawToken = createResetToken(email);
      const origin = req.headers.origin ?? `https://${req.hostname}`;
      const resetUrl = `${origin}/reset-password?token=${rawToken}`;

      await sendEmail({
        to: email,
        subject: "Reset your XpressPro FX password",
        html: `
          <p>You requested a password reset. Click the link below to set a new password:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>
        `,
        text: `Reset your password: ${resetUrl}\n\nExpires in 1 hour.`,
      });

      logger.info({ userId }, "[auth] Password reset email dispatched");
    }

    // Always return 200 — prevents email enumeration
    res.json({
      message: "If that email is registered, a reset link has been sent.",
    });
  }),
);

// ── POST /auth/reset-password ─────────────────────────────────────────────────

router.post(
  "/auth/reset-password",
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as z.infer<typeof resetPasswordSchema>;

    const email = consumeResetToken(token);
    if (!email) {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

    const userId = usersByEmail.get(email);
    const stored = userId ? users.get(userId) : null;
    if (!stored || !userId) {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

    stored.passwordHash = hashPassword(password);
    users.set(userId, stored);

    dbRun("jwt.resetPassword", async (db) => {
      const { eq } = await import("drizzle-orm");
      await db
        .update(usersTable)
        .set({ passwordHash: stored.passwordHash, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
    });

    resetCounter(email);

    await sendEmail({
      to: email,
      subject: "Your XpressPro FX password has been changed",
      html: "<p>Your password was successfully reset. If you did not do this, contact support immediately.</p>",
      text: "Your password was successfully reset. If you did not do this, contact support immediately.",
    });

    logger.info({ userId }, "[auth] Password reset completed");
    res.json({ message: "Password updated successfully" });
  }),
);

export default router;
