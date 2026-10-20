import { PinSchema, manilaDate } from "@sari/shared";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDemoStore } from "../src/services/demo.js";
import { ipHash } from "../src/services/ipHash.js";
import { resetDb, testDb } from "./support/db.js";
import { seedStore } from "./support/factories.js";
import { signNetlify, testEnv } from "./support/signing.js";

const HOUR = 60 * 60 * 1000;
const SLOW = 60_000;

const config = loadConfig({ ...testEnv });
const db = testDb();
let clock: Date;
let app: Express;

afterAll(() => db.$disconnect());
beforeEach(async () => {
  await resetDb(db);
  clock = new Date("2026-10-21T09:00:00+08:00");
  app = createApp({ config, db, now: () => clock });
});

/** Sends a signed POST, as Netlify's proxy would, and resolves to the response. */
async function post(path: string, opts: { ip?: string; body?: object; headers?: Record<string, string> } = {}) {
  let req = request(app)
    .post(path)
    .set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET))
    .set("x-nf-client-connection-ip", opts.ip ?? "203.0.113.20");
  for (const [name, value] of Object.entries(opts.headers ?? {})) req = req.set(name, value);
  return opts.body ? req.send(opts.body) : req;
}
const createDemo = (ip?: string) => post("/api/demo", { ip });
const login = (username: string, secret: string) => post("/api/auth/login", { body: { username, secret } });

describe("POST /api/demo", () => {
  it(
    "creates Tindahan ni Mang Ben with a month of data, signs in the owner and returns both logins (spec 7.5)",
    async () => {
      const res = await createDemo();
      expect(res.status).toBe(201);
      const { demoLogins, store, user, expiresAt } = res.body;
      expect(demoLogins.owner.username).toMatch(/^mayari\.[a-z2-9]{4}$/);
      expect(demoLogins.owner.password).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(demoLogins.bantay.username).toMatch(/^nena\.[a-z2-9]{4}$/);
      expect(PinSchema.safeParse(demoLogins.bantay.pin).success).toBe(true);
      expect(demoLogins.owner.username.slice("mayari.".length)).toBe(store.code);
      expect(store.name).toBe("Tindahan ni Mang Ben");
      expect(expiresAt).toBe(new Date(clock.getTime() + 24 * HOUR).toISOString());
      expect(store.expiresAt).toBe(expiresAt);
      expect(user).toEqual({ id: expect.any(String), role: "OWNER", username: demoLogins.owner.username, displayName: "Mang Ben" });
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(String(res.headers["set-cookie"])).toContain("__Host-sari_refresh=");

      const storeId: string = store.id;
      expect(await db.category.count({ where: { storeId } })).toBe(8);
      expect(await db.product.count({ where: { storeId } })).toBe(60);
      expect(await db.customer.count({ where: { storeId } })).toBe(12);
      const sales = await db.sale.count({ where: { storeId } });
      expect(sales).toBeGreaterThanOrEqual(30 * 25);
      expect((await db.store.findUniqueOrThrow({ where: { id: storeId } })).nextReceiptNo).toBe(sales + 1);
      expect((await db.sale.aggregate({ where: { storeId }, _max: { receiptNo: true } }))._max.receiptNo).toBe(sales);

      // The rows point at each other correctly once inserted (spec 5 invariants).
      const products = await db.product.findMany({ where: { storeId }, select: { id: true, stock: true } });
      const stockSums = await db.stockMovement.groupBy({ by: ["productId"], where: { storeId }, _sum: { change: true } });
      for (const product of products) expect(stockSums.find((s) => s.productId === product.id)?._sum.change).toBe(product.stock);
      const customers = await db.customer.findMany({ where: { storeId }, select: { id: true, balanceCentavos: true } });
      const ledgerSums = await db.utangEntry.groupBy({ by: ["customerId"], where: { storeId }, _sum: { amountCentavos: true } });
      for (const customer of customers) {
        expect(ledgerSums.find((s) => s.customerId === customer.id)?._sum.amountCentavos ?? 0).toBe(customer.balanceCentavos);
      }
      const itemTotal = await db.saleItem.aggregate({ where: { sale: { storeId } }, _sum: { lineTotalCentavos: true } });
      const saleTotal = await db.sale.aggregate({ where: { storeId }, _sum: { totalCentavos: true } });
      expect(itemTotal._sum.lineTotalCentavos).toBe(saleTotal._sum.totalCentavos);

      const owner = await login(demoLogins.owner.username, demoLogins.owner.password);
      expect(owner.status).toBe(200);
      const bantay = await login(demoLogins.bantay.username, demoLogins.bantay.pin);
      expect(bantay.status).toBe(200);
      expect(bantay.body.user).toMatchObject({ role: "BANTAY", displayName: "Nena" });
    },
    SLOW,
  );

  it(
    "allows 5 demo stores per IP per Manila day: the 6th answers demo_limit until the next day",
    async () => {
      for (let i = 0; i < 5; i++) expect((await createDemo("203.0.113.30")).status).toBe(201);
      const limited = await createDemo("203.0.113.30");
      expect(limited.status).toBe(429);
      expect(limited.body.error).toEqual({
        code: "demo_limit",
        message: expect.any(String),
        retryAfter: new Date("2026-10-22T00:00:00+08:00").toISOString(),
      });
      expect((await createDemo("198.51.100.30")).status).toBe(201);

      clock = new Date("2026-10-22T00:00:01+08:00");
      expect((await createDemo("203.0.113.30")).status).toBe(201);
    },
    SLOW,
  );

  it("answers demo_full when 200 demo stores are active", async () => {
    const expiresAt = new Date(clock.getTime() + HOUR);
    await db.store.createMany({ data: Array.from({ length: 200 }, (_, i) => ({ code: `f${String(i).padStart(3, "0")}`, name: "Full", expiresAt })) });
    const res = await createDemo();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("demo_full");
    expect(await db.demoQuota.count()).toBe(0);
  });

  it(
    "deletes an expired store and all of its rows when the next demo is created",
    async () => {
      const old = await seedStore(db, { code: "old1", now: new Date(clock.getTime() - 25 * HOUR), expiresAt: new Date(clock.getTime() - HOUR) });
      expect((await createDemo()).status).toBe(201);
      const storeId = old.store.id;
      expect(await db.store.findUnique({ where: { id: storeId } })).toBeNull();
      expect(await db.user.count({ where: { storeId } })).toBe(0);
      expect(await db.product.count({ where: { storeId } })).toBe(0);
      expect(await db.stockMovement.count({ where: { storeId } })).toBe(0);
      expect(await db.customer.count({ where: { storeId } })).toBe(0);
    },
    SLOW,
  );

  it(
    "picks a new store code when the first one is taken",
    async () => {
      await seedStore(db, { code: "abcd", now: clock });
      const codes = ["abcd", "wxyz"];
      const result = await createDemoStore(db, config, ipHash("203.0.113.40", config.IP_HASH_SALT), clock, () => codes.shift()!);
      expect(result.store.code).toBe("wxyz");
      expect(result.demoLogins.owner.username).toBe("mayari.wxyz");
    },
    SLOW,
  );
});

describe("POST /api/admin/cleanup", () => {
  it("needs the cleanup secret, then deletes expired stores and forgets earlier days' demo quotas", async () => {
    const expired = await seedStore(db, { code: "exp1", now: new Date(clock.getTime() - 25 * HOUR), expiresAt: new Date(clock.getTime() - HOUR) });
    const active = await seedStore(db, { code: "act1", now: clock });
    const yesterday = manilaDate(new Date(clock.getTime() - 24 * HOUR));
    await db.demoQuota.createMany({
      data: [
        { ipHash: "a".repeat(64), day: yesterday, count: 3 },
        { ipHash: "b".repeat(64), day: manilaDate(clock), count: 1 },
      ],
    });

    const wrong = await post("/api/admin/cleanup", { headers: { "x-cleanup-secret": "not-the-secret" } });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe("forbidden");
    expect(await db.store.count()).toBe(2);

    const res = await post("/api/admin/cleanup", { headers: { "x-cleanup-secret": config.CLEANUP_SECRET } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 1 });
    expect(await db.store.findUnique({ where: { id: expired.store.id } })).toBeNull();
    expect(await db.store.findUnique({ where: { id: active.store.id } })).not.toBeNull();
    expect(await db.demoQuota.findMany({ select: { day: true } })).toEqual([{ day: manilaDate(clock) }]);
  });
});

describe("ipHash", () => {
  it("is a salted SHA-256 hex that groups an IPv6 network, so rotating addresses does not dodge the limit", () => {
    const salt = config.IP_HASH_SALT;
    expect(ipHash("203.0.113.7", salt)).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHash("203.0.113.7", salt)).not.toBe(ipHash("203.0.113.8", salt));
    expect(ipHash("203.0.113.7", salt)).not.toBe(ipHash("203.0.113.7", "another-salt-0123456789abcdefghijk"));
    expect(ipHash("2001:db8:abcd:1200::1", salt)).toBe(ipHash("2001:db8:abcd:12ff:ffff::9", salt));
    expect(ipHash("2001:db8:abcd:1200::1", salt)).not.toBe(ipHash("2001:db8:abcd:1300::1", salt));
  });
});
