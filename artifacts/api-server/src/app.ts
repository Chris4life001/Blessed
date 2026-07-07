import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachSession } from "./lib/session";
import { platformGate } from "./lib/platform-gate";
import { env, isProduction } from "./lib/env";

const app: Express = express();

// Remove X-Powered-By to avoid leaking server info
app.disable("x-powered-by");

// Trust the platform's TLS-terminating reverse proxy in production so that
// rate-limiting middleware keys on real client IPs rather than the proxy's IP.
if (isProduction) {
  app.set("trust proxy", 1);
}

if (isProduction && !env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET is required in production. Set it as an environment secret before starting the server.",
  );
}
const SESSION_SECRET = env.SESSION_SECRET ?? "xpfx-dev-secret-change-me";

// ─── Security headers ────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // Allow cross-origin iframes (payment widgets)
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
  }),
);

// ─── Structured logging ──────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// ─── CORS ────────────────────────────────────────────────────────────────────
// Build an explicit allowlist of frontend origins from the Replit-provided
// REPLIT_DOMAINS variable (comma-separated hostnames, e.g. "foo.repl.co,bar.repl.co").
// In development all origins are permitted so local work is unimpeded.
// In production, if REPLIT_DOMAINS is unset the allowlist is an empty Set,
// which causes all credentialed cross-origin requests to be denied (fail-closed).
const allowedOrigins: Set<string> | null = (() => {
  if (!isProduction) return null; // null == allow-all in dev

  const origins = new Set<string>();

  // ALLOWED_ORIGINS: generic full-URL list for Render, Railway, VPS, etc.
  // e.g. "https://example.com,https://www.example.com"
  const allowedOriginsRaw = env.ALLOWED_ORIGINS ?? "";
  for (const origin of allowedOriginsRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
    origins.add(origin);
  }

  // REPLIT_DOMAINS: Replit-provided hostnames (host-only, no scheme)
  // e.g. "foo.repl.co,bar.repl.co"
  const replitDomainsRaw = env.REPLIT_DOMAINS ?? "";
  for (const host of replitDomainsRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
    origins.add(`https://${host}`);
  }

  if (origins.size === 0) {
    logger.warn(
      "Neither ALLOWED_ORIGINS nor REPLIT_DOMAINS is set in production — " +
      "credentialed cross-origin requests will be denied. " +
      "Set ALLOWED_ORIGINS to your frontend URL(s).",
    );
  }
  return origins; // may be empty; empty == deny all cross-origin credentialed requests
})();

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header → server-to-server or same-origin request; pass through.
      if (!origin) return callback(null, false);
      if (allowedOrigins === null) return callback(null, true); // dev: allow all
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false); // unknown origin — deny credentials
    },
    credentials: true,
  }),
);

// ─── Body parsing ────────────────────────────────────────────────────────────
// cookieParser must run before the CSRF middleware so req.signedCookies is
// populated when we check for the session cookie below.
app.use(cookieParser(SESSION_SECRET));

// MoonPay signs the *raw* webhook body. Capture it as a Buffer on the
// request before the JSON parser turns it into an object, so the
// /moonpay/webhook handler can HMAC the exact bytes MoonPay signed.
app.use(
  "/api/moonpay/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
);
app.use(
  "/api/coinbase/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── HTTP parameter pollution protection ─────────────────────────────────────
app.use(hpp());

// ─── CSRF defense-in-depth ───────────────────────────────────────────────────
// For cookie-authenticated mutating requests in production, reject any
// Origin/Referer that is not on the allowlist. This is a secondary layer;
// the CORS policy above is the primary guard.
app.use((req, res, next) => {
  if (
    isProduction &&
    allowedOrigins !== null &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
  ) {
    const originHeader = req.headers.origin as string | undefined;
    let checkOrigin: string | undefined = originHeader;
    if (!checkOrigin && req.headers.referer) {
      try {
        checkOrigin = new URL(req.headers.referer as string).origin;
      } catch {
        checkOrigin = undefined;
      }
    }
    // Only enforce when an origin is present and the request carries a session
    // cookie — unauthenticated mutations (signup, login) don't need protection.
    const hasCookie = Boolean(
      req.signedCookies?.["xpfx_sid"] ?? req.cookies?.["xpfx_sid"],
    );
    if (checkOrigin && hasCookie && !allowedOrigins.has(checkOrigin)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  next();
});

// ─── Session & routing middleware ─────────────────────────────────────────────
app.use(attachSession);
app.use(platformGate);

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Global rate limit — 100 requests per 15 minutes per IP
const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  skip: () => !isProduction,
});
app.use(globalRateLimit);

// Auth endpoints — tighter limit to resist brute-force / credential stuffing
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  limit: 10,                 // max 10 auth attempts per IP per window
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  skip: () => !isProduction,
});

const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  skip: () => !isProduction,
});

app.use("/api/auth/login", authRateLimit);
app.use("/api/auth/signup", authRateLimit);
app.use("/api/auth/verify-otp", otpRateLimit);
app.use("/api/auth/resend-otp", otpRateLimit);

// Live-chat — keyed per authenticated user to prevent cost/availability abuse
const liveChatRateLimit = rateLimit({
  windowMs: 60 * 1000,           // 1-minute window
  limit: 20,                     // max 20 messages per user per minute
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => (req as typeof req & { userId?: string }).userId ?? req.ip ?? "unknown",
  message: { error: "Too many messages. Please wait before sending another." },
  skip: () => !isProduction,
});
app.use("/api/live-chat", liveChatRateLimit);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", router);

// ─── Global error handler ─────────────────────────────────────────────────────
// Must be last — 4-arg signature tells Express this is an error handler.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err: err.message, stack: isProduction ? undefined : err.stack }, "Unhandled error");
  if (isProduction) {
    res.status(500).json({ error: "Internal Server Error" });
  } else {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

export default app;
