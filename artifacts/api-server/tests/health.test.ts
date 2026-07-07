import request from "supertest";
import app from "../src/app";

describe("Health endpoints", () => {
  describe("GET /healthz", () => {
    it("returns HTTP 200", async () => {
      const res = await request(app).get("/healthz");
      expect(res.status).toBe(200);
    });

    it("response body contains status, uptime, timestamp", async () => {
      const res = await request(app).get("/healthz");
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("uptime");
      expect(res.body).toHaveProperty("timestamp");
    });

    it("status field is 'ok'", async () => {
      const res = await request(app).get("/healthz");
      expect(res.body.status).toBe("ok");
    });
  });

  describe("GET /api/healthz", () => {
    it("returns HTTP 200", async () => {
      const res = await request(app).get("/api/healthz");
      expect(res.status).toBe(200);
    });

    it("response body contains status, db, uptime, timestamp", async () => {
      const res = await request(app).get("/api/healthz");
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("db");
      expect(res.body).toHaveProperty("uptime");
      expect(res.body).toHaveProperty("timestamp");
    });

    it("db field indicates connection state", async () => {
      const res = await request(app).get("/api/healthz");
      // Without DATABASE_URL in tests, db should be 'disconnected' → 503
      // or 'connected' if somehow connected; either is acceptable
      expect(["connected", "disconnected"]).toContain(res.body.db);
    });

    it("uptime is a non-negative number", async () => {
      const res = await request(app).get("/api/healthz");
      expect(typeof res.body.uptime).toBe("number");
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it("timestamp is a Unix epoch millisecond value", async () => {
      const before = Date.now();
      const res = await request(app).get("/api/healthz");
      const after = Date.now();
      expect(res.body.timestamp).toBeGreaterThanOrEqual(before - 1000);
      expect(res.body.timestamp).toBeLessThanOrEqual(after + 1000);
    });
  });
});
