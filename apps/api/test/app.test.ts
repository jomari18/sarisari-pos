import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { clientIp } from "../src/middleware/clientIp.js";
import { testDb } from "./support/db.js";
import { signNetlify, testEnv } from "./support/signing.js";

const config = loadConfig({ ...testEnv });
const app = createApp({ config, db: testDb() });

describe("health", () => {
  it("answers without a proxy signature and allows only the site origin", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["access-control-allow-origin"]).toBe("https://sari.test");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("Netlify proxy signature", () => {
  it("refuses requests that did not come through the proxy", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: "bad_proxy_signature", message: "This request must come through the ZariZari website." });
  });

  it("refuses a signature made with another secret", async () => {
    const res = await request(app).get("/api/me").set("x-nf-sign", await signNetlify("wrong-secret-".repeat(3)));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("bad_proxy_signature");
  });

  it("refuses an expired signature", async () => {
    const old = await signNetlify(config.PROXY_SIGNING_SECRET, new Date(Date.now() - 10 * 60_000));
    const res = await request(app).get("/api/me").set("x-nf-sign", old);
    expect(res.status).toBe(403);
  });

  it("lets a signed request through to the route", async () => {
    const res = await request(app).get("/api/me").set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "unauthenticated", message: expect.any(String) } });
  });
});

describe("error format", () => {
  it("answers unknown API routes with not_found", async () => {
    const res = await request(app).get("/api/nope").set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("refuses bodies over 64 KB as invalid input", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET))
      .send({ username: "x".repeat(70_000) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  it("refuses malformed JSON as invalid input", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET))
      .set("content-type", "application/json")
      .send('{"username":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });
});

describe("config", () => {
  it("refuses short secrets and a missing database URL", () => {
    expect(() => loadConfig({ ...testEnv, JWT_SECRET: "short" })).toThrow();
    expect(() => loadConfig({ ...testEnv, DATABASE_URL: "" })).toThrow();
  });

  it("defaults the port to 8080", () => {
    const { PORT: _port, ...withoutPort } = testEnv;
    expect(loadConfig(withoutPort).PORT).toBe(8080);
  });
});

describe("clientIp", () => {
  const fake = (headers: Record<string, string>) => ({ headers, socket: { remoteAddress: "10.0.0.9" } }) as never;

  it("prefers Netlify's client IP header, then the socket, never X-Forwarded-For", () => {
    expect(clientIp(fake({ "x-nf-client-connection-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
    // Review I3: the leftmost X-Forwarded-For entry is whatever the caller wrote, so it never names the visitor.
    expect(clientIp(fake({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("10.0.0.9");
    expect(clientIp(fake({}))).toBe("10.0.0.9");
  });
});
