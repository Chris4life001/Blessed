import pino from "pino";
import { env, isProduction } from "./env";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      // Redact sensitive fields wherever they appear in log objects
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.secret",
      "*.apiKey",
      "*.accessToken",
      "*.refreshToken",
      "*.resetToken",
      "*.privateKey",
    ],
    censor: "[REDACTED]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
