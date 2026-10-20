import express, { type Express } from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { errorHandler } from "../src/http/errors.js";
import { requireAuth, requireRole } from "../src/middleware/auth.js";
import { revokeUserSessions } from "../src/services/auth.js";
import { resetDb, testDb } from "./support/db.js";
import { BANTAY_PIN, OWNER_PASSWORD, seedStore, type TestStore } from "./support/factories.js";
import { signNetlify, testEnv } from "./support/signing.js";

const COOKIE = "__Host-sari_refresh";
const MINUTE = 60_000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const config = loadConfig({ ...testEnv });
const db = testDb();
let clock: Date;
let app: Express;
let t: TestStore;

afterAll(() => db.$disconnect());
beforeEach(async () => {
  await resetDb(db);
  clock = new Date("2026-10-21T09:00:00+08:00");
  t = await seedStore(db, { code: "ab12", now: clock });
  app = createApp({ config, db, now: () => clock });
});

type CallOptions = { body?: object; cookie?: string; bearer?: string; ip?: string; csrfHeader?: boolean };

async function call(method: "get" | "post", path: string, opts: CallOptions = {}) {
  let req = request(app)[method](path).set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET));
  if (opts.ip) req = req.set("x-nf-client-connection-ip", opts.ip);
  if (opts.cookie !== undefined) req = req.set("Cookie", `${COOKIE}=${opts.cookie}`);
  if (opts.bearer) req = req.set("Authorization", `Bearer ${opts.bearer}`);
  if (opts.csrfHeader) req = req.set("X-Requested-With", "sari-pos");
  return opts.body ? req.send(opts.body) : req;
}

const login = (username: string, secret: string, ip?: string) => call("post", "/api/auth/login", { body: { username, secret }, ip });
const refreshWith = (cookie: string) => call("post", "/api/auth/refresh", { cookie, csrfHeader: true });

/** The refresh cookie's Set-Cookie line, or "" when the response sets none. */
function cookieLine(res: { headers: Record<string, unknown> }): string {
  const header = res.headers["set-cookie"];
  const lines: unknown[] = Array.isArray(header) ? header : [];
  return lines.find((line): line is string => typeof line === "string" && line.startsWith(`${COOKIE}=`)) ?? "";
}

const cookieValue = (res: { headers: Record<string, unknown> }) => cookieLine(res).split(";")[0]!.slice(COOKIE.length + 1);

describe("POST /api/auth/login", () => {
  it("signs the owner in and sets the refresh cookie until the store expires (spec 7.2)", async () => {
    const res = await login(t.owner.username, OWNER_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      accessToken: expect.any(String),
      user: { id: t.owner.id, role: "OWNER", username: "mayari.ab12", displayName: "Mang Ben" },
      store: { id: t.store.id, code: "ab12", name: "Test Store ab12", expiresAt: t.store.expiresAt.toISOString() },
    });
    const cookie = cookieLine(res);
    expect(cookie).toMatch(/^__Host-sari_refresh=[A-Za-z0-9_-]{43};/);
    for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", `Expires=${t.store.expiresAt.toUTCString()}`]) {
      expect(cookie).toContain(flag);
    }
  });

  it("answers a wrong secret and an unknown user with the same invalid_credentials error", async () => {
    const wrong = await login(t.owner.username, "not-the-password");
    const unknown = await login("nobody.zz99", "not-the-password");
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: { code: "invalid_credentials", message: expect.any(String) } });
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("locks the account for 15 minutes at the 5th wrong PIN, then lets the right PIN in (spec 7.1)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await login(t.bantay.username, "000001")).status);
    expect(statuses).toEqual([401, 401, 401, 401, 423]);

    const locked = await login(t.bantay.username, BANTAY_PIN);
    expect(locked.status).toBe(423);
    expect(locked.body.error).toEqual({
      code: "account_locked",
      message: expect.any(String),
      retryAfter: new Date(clock.getTime() + 15 * MINUTE).toISOString(),
    });

    clock = new Date(clock.getTime() + 15 * MINUTE + 1000);
    const ok = await login(t.bantay.username, BANTAY_PIN);
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe("BANTAY");
    expect(await db.user.findUniqueOrThrow({ where: { id: t.bantay.id } })).toMatchObject({ failedAttempts: 0, lockedUntil: null });
  });

  it("refuses a deactivated user exactly like a wrong secret", async () => {
    await db.user.update({ where: { id: t.bantay.id }, data: { active: false } });
    const res = await login(t.bantay.username, BANTAY_PIN);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
  });

  it("refuses to sign in to a store that has expired", async () => {
    clock = new Date(t.store.expiresAt.getTime() + 1000);
    const res = await login(t.owner.username, OWNER_PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("session_expired");
    expect(cookieLine(res)).toBe("");
  });

  it("allows 20 sign-in requests per client IP in 15 minutes, whatever the username", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await login(`nobody${i}.zz99`, "not-the-password", "203.0.113.7")).status).toBe(401);
    }
    const limited = await login(t.owner.username, OWNER_PASSWORD, "203.0.113.7");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toEqual({ code: "rate_limited", message: expect.any(String), retryAfter: expect.stringMatching(ISO) });
    expect((await login(t.owner.username, OWNER_PASSWORD, "198.51.100.4")).status).toBe(200);
  });
});

describe("POST /api/auth/refresh", () => {
  it("needs the X-Requested-With: sari-pos header (CSRF, spec 7.2)", async () => {
    const cookie = cookieValue(await login(t.owner.username, OWNER_PASSWORD));
    const res = await call("post", "/api/auth/refresh", { cookie });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("answers unauthenticated without a cookie", async () => {
    const res = await call("post", "/api/auth/refresh", { csrfHeader: true });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("rotates the cookie, and reusing a replaced cookie revokes the whole session family", async () => {
    const a = cookieValue(await login(t.owner.username, OWNER_PASSWORD));
    const first = await refreshWith(a);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ accessToken: expect.any(String) });
    const b = cookieValue(first);
    expect(b).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b).not.toBe(a);
    expect(cookieLine(first)).toContain(`Expires=${t.store.expiresAt.toUTCString()}`);

    const reuse = await refreshWith(a);
    expect(reuse.status).toBe(401);
    expect(cookieLine(reuse)).toMatch(/^__Host-sari_refresh=;/);
    expect((await refreshWith(b)).status).toBe(401);
  });

  it("answers session_expired once the store has expired", async () => {
    const cookie = cookieValue(await login(t.owner.username, OWNER_PASSWORD));
    clock = new Date(t.store.expiresAt.getTime() + 1000);
    const res = await refreshWith(cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("session_expired");
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the session and clears the cookie", async () => {
    const cookie = cookieValue(await login(t.owner.username, OWNER_PASSWORD));
    const res = await call("post", "/api/auth/logout", { cookie });
    expect(res.status).toBe(204);
    expect(cookieLine(res)).toMatch(/^__Host-sari_refresh=;/);
    expect((await refreshWith(cookie)).status).toBe(401);
  });
});

describe("revokeUserSessions", () => {
  it("ends every session of that user, on every device", async () => {
    const phone = cookieValue(await login(t.bantay.username, BANTAY_PIN));
    const tablet = cookieValue(await login(t.bantay.username, BANTAY_PIN));
    await revokeUserSessions(db, t.bantay.id, clock);
    expect((await refreshWith(phone)).status).toBe(401);
    expect((await refreshWith(tablet)).status).toBe(401);
  });
});

describe("GET /api/me and roles", () => {
  it("returns the signed-in user and store for a bearer token", async () => {
    const { accessToken } = (await login(t.bantay.username, BANTAY_PIN)).body;
    const res = await call("get", "/api/me", { bearer: accessToken });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: t.bantay.id, role: "BANTAY", username: "nena.ab12", displayName: "Nena" },
      store: { id: t.store.id, code: "ab12", name: "Test Store ab12", expiresAt: t.store.expiresAt.toISOString() },
    });
  });

  it("answers unauthenticated without a bearer token or with a bad one", async () => {
    for (const bearer of [undefined, "not-a-token"]) {
      const res = await call("get", "/api/me", { bearer });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("unauthenticated");
    }
  });

  it("keeps a bantay out of an owner-only route with forbidden", async () => {
    const ownerOnly = express()
      .get("/owner-only", requireAuth(config.JWT_SECRET, () => clock), requireRole("OWNER"), (_req, res) => {
        res.json({ ok: true });
      })
      .use(errorHandler);
    const bantay = (await login(t.bantay.username, BANTAY_PIN)).body.accessToken;
    const owner = (await login(t.owner.username, OWNER_PASSWORD)).body.accessToken;

    const refused = await request(ownerOnly).get("/owner-only").set("Authorization", `Bearer ${bantay}`);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("forbidden");
    expect((await request(ownerOnly).get("/owner-only").set("Authorization", `Bearer ${owner}`)).status).toBe(200);
  });
});
