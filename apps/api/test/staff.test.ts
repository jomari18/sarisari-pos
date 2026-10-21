import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { signAccessToken } from "../src/services/tokens.js";
import { resetDb, testDb } from "./support/db.js";
import { BANTAY_PIN, seedStore, type TestStore } from "./support/factories.js";
import { signNetlify, testEnv } from "./support/signing.js";

const DAY = 24 * 60 * 60 * 1000;
const config = loadConfig({ ...testEnv });
const db = testDb();
const clock = new Date("2026-10-21T15:00:00+08:00");
let app: Express;
let t: TestStore;
let owner: string;
let bantay: string;

afterAll(() => db.$disconnect());
beforeEach(async () => {
  await resetDb(db);
  t = await seedStore(db, { code: "stf1", now: new Date(clock.getTime() - 3 * DAY), expiresAt: new Date(clock.getTime() + DAY) });
  app = createApp({ config, db, now: () => clock });
  owner = await signAccessToken({ userId: t.owner.id, storeId: t.store.id, role: "OWNER" }, config.JWT_SECRET, clock);
  bantay = await signAccessToken({ userId: t.bantay.id, storeId: t.store.id, role: "BANTAY" }, config.JWT_SECRET, clock);
});

async function call(method: "get" | "post" | "patch", path: string, opts: { token?: string; body?: object; cookie?: string; csrf?: boolean } = {}) {
  let req = request(app)[method](path).set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET));
  if (opts.token) req = req.set("Authorization", `Bearer ${opts.token}`);
  if (opts.cookie) req = req.set("Cookie", `__Host-sari_refresh=${opts.cookie}`);
  if (opts.csrf) req = req.set("X-Requested-With", "sari-pos");
  return opts.body ? req.send(opts.body) : req;
}
const addBantay = (displayName: string, pin = "731905") => call("post", "/api/staff", { token: owner, body: { displayName, pin } });
const patchStaff = (id: string, body: object, token = owner) => call("patch", `/api/staff/${id}`, { token, body });
const login = (username: string, secret: string) => call("post", "/api/auth/login", { body: { username, secret } });

describe("POST /api/staff", () => {
  it("names the account after the bantay and the store, numbering it when the name is taken", async () => {
    const second = await addBantay("Nena");
    expect(second.status).toBe(201);
    expect(second.body).toEqual({ id: expect.any(String), role: "BANTAY", username: "nena2.stf1", displayName: "Nena", active: true });
    expect((await addBantay("Ate Niña Joy")).body.username).toBe("ateninajoy.stf1");
    expect((await addBantay("Maria Clarita Dela Cruz")).body.username).toBe("mariaclarita.stf1");

    const signIn = await login("nena2.stf1", "731905");
    expect(signIn.status).toBe(200);
    expect(signIn.body.user).toMatchObject({ role: "BANTAY", displayName: "Nena" });
  });

  it("refuses a PIN that is easy to guess", async () => {
    const res = await addBantay("Liza", "123456");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "invalid_input", field: "pin" });
  });

  it("allows 5 bantay in a store; the 6th answers limit_reached (spec 6.11)", async () => {
    for (const name of ["Liza", "Joy", "Mila", "Cora"]) expect((await addBantay(name)).status).toBe(201);
    const sixth = await addBantay("Bebang");
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("limit_reached");
  });
});

describe("PATCH /api/staff/:id", () => {
  it("resets a PIN: the old PIN stops working and the new one works", async () => {
    const res = await patchStaff(t.bantay.id, { pin: "605381" });
    expect(res.status).toBe(200);
    expect((await login(t.bantay.username, BANTAY_PIN)).status).toBe(401);
    expect((await login(t.bantay.username, "605381")).status).toBe(200);
  });

  it("deactivates a bantay: sign-in is refused and their sessions end at once (spec 7.2)", async () => {
    const signedIn = await login(t.bantay.username, BANTAY_PIN);
    const cookie = String(signedIn.headers["set-cookie"]).match(/__Host-sari_refresh=([^;]+)/)![1]!;

    const res = await patchStaff(t.bantay.id, { active: false });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    const refused = await login(t.bantay.username, BANTAY_PIN);
    expect(refused.status).toBe(401);
    expect(refused.body.error.code).toBe("invalid_credentials");
    expect((await call("post", "/api/auth/refresh", { cookie, csrf: true })).status).toBe(401);

    expect((await patchStaff(t.bantay.id, { active: true })).body.active).toBe(true);
    expect((await login(t.bantay.username, BANTAY_PIN)).status).toBe(200);
  });

  it("answers another store's bantay and the owner's own account with not_found", async () => {
    const other = await seedStore(db, { code: "stf2", now: clock });
    for (const id of [other.bantay.id, t.owner.id]) {
      const res = await patchStaff(id, { active: false });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
  });
});

describe("GET /api/staff and permissions", () => {
  it("lists the store's bantay with their status", async () => {
    await addBantay("Liza");
    await patchStaff(t.bantay.id, { active: false });
    const res = await call("get", "/api/staff", { token: owner });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: t.bantay.id, role: "BANTAY", username: "nena.stf1", displayName: "Nena", active: false },
      expect.objectContaining({ username: "liza.stf1", active: true }),
    ]);
  });

  it("is for the owner only", async () => {
    for (const res of [
      await call("get", "/api/staff", { token: bantay }),
      await call("post", "/api/staff", { token: bantay, body: { displayName: "Liza", pin: "731905" } }),
      await patchStaff(t.bantay.id, { active: false }, bantay),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    }
  });
});
