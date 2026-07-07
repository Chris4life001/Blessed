import request from "supertest";
import app from "../src/app";

describe("Security headers", () => {
  let res: Awaited<ReturnType<typeof request>>;

  beforeAll(async () => {
    res = await request(app).get("/api/healthz");
  });

  it("sets X-Frame-Options: DENY", () => {
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sets X-Content-Type-Options: nosniff", () => {
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("does not expose X-Powered-By", () => {
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets X-XSS-Protection or CSP (helmet)", () => {
    // Helmet sets one of these — accept either
    const hasXxss = "x-xss-protection" in res.headers;
    const hasCsp = "content-security-policy" in res.headers;
    expect(hasXxss || hasCsp).toBe(true);
  });
});

describe("Cache-Control on API routes", () => {
  it("/api/healthz returns Cache-Control: no-store", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });

  it("/api/auth/me returns Cache-Control: no-store (even 401 response)", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });
});

describe("Body size limit", () => {
  it("rejects JSON body over 10kb with HTTP 413", async () => {
    const bigBody = { data: "x".repeat(11 * 1024) };
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(bigBody));
    // Express returns 413 for oversized payloads
    expect(res.status).toBe(413);
  });
});

describe("Injection protection", () => {
  it("rejects NoSQL injection patterns in body", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: { $gt: "" }, password: "test" });
    // Should be rejected at injection check or validation level
    expect([400, 422]).toContain(res.status);
  });

  it("rejects <script> tag in body", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "<script>alert(1)</script>", password: "test" });
    expect([400, 422]).toContain(res.status);
  });
});

describe("Rate limiting", () => {
  // Note: global rate limit is disabled in non-production (skip=() => !isProduction)
  // Auth rate limits are also skipped in test/dev. This test just verifies the
  // endpoint is reachable and that 429 would be the right status if limits were active.
  it("/api/auth/login responds (not 429) in dev/test mode", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com" });
    // Should reach the handler (OTP challenge), not be rate-limited in test mode
    expect(res.status).not.toBe(429);
  });
});
