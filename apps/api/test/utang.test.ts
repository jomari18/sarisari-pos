import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { reminderText } from "../src/services/utang.js";
import { signAccessToken } from "../src/services/tokens.js";
import { resetDb, testDb } from "./support/db.js";
import { seedStore, type TestStore } from "./support/factories.js";
import { saleBodies } from "./support/sales.js";
import { signNetlify, testEnv } from "./support/signing.js";

const DAY = 24 * 60 * 60 * 1000;
const config = loadConfig({ ...testEnv });
const db = testDb();
const clock = new Date("2026-10-21T15:00:00+08:00");
const saleBody = saleBodies(clock);
let app: Express;
let t: TestStore;
let owner: string;
let bantay: string;

afterAll(() => db.$disconnect());
beforeEach(async () => {
  await resetDb(db);
  t = await seedStore(db, { code: "ut01", now: new Date(clock.getTime() - 3 * DAY), expiresAt: new Date(clock.getTime() + DAY) });
  app = createApp({ config, db, now: () => clock });
  owner = await signAccessToken({ userId: t.owner.id, storeId: t.store.id, role: "OWNER" }, config.JWT_SECRET, clock);
  bantay = await signAccessToken({ userId: t.bantay.id, storeId: t.store.id, role: "BANTAY" }, config.JWT_SECRET, clock);
});

async function call(method: "get" | "post" | "patch", path: string, token: string, body?: object) {
  const req = request(app)[method](path).set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET)).set("Authorization", `Bearer ${token}`);
  return body ? req.send(body) : req;
}
const rosa = () => t.customers[0]!;
const balanceOf = async (id: string) => (await db.customer.findUniqueOrThrow({ where: { id } })).balanceCentavos;
/** Rosa buys ₱105.00 on utang. */
async function chargeRosa(): Promise<string> {
  const body = saleBody([{ productId: t.products[0]!.id, quantity: 2, unitPriceCentavos: 1500 }, { productId: t.products[1]!.id, quantity: 1, unitPriceCentavos: 7500 }], {
    method: "UTANG",
    customerId: rosa().id,
  });
  expect((await call("post", "/api/sales", bantay, body)).status).toBe(201);
  return body.id;
}
const pay = (amountCentavos: number, id: string = randomUUID(), token = bantay) =>
  call("post", `/api/customers/${rosa().id}/payments`, token, { id, amountCentavos, method: "CASH" });

describe("suki", () => {
  it("lets a bantay add a suki, who starts with no utang allowed (spec 8.5)", async () => {
    const res = await call("post", "/api/customers", bantay, { name: "  Ate   Liza ", phone: "09171234567" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: "Ate Liza",
      phone: "09171234567",
      creditLimitCentavos: 0,
      balanceCentavos: 0,
      oldestUnpaidDays: null,
    });
  });

  it("leaves credit limits to the owner; anyone can fix a name or phone", async () => {
    const path = `/api/customers/${rosa().id}`;
    const refused = await call("patch", path, bantay, { creditLimitCentavos: 80_000 });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("forbidden");
    expect((await call("patch", path, bantay, { name: "Aling Rosario", phone: "09181234567" })).body).toMatchObject({ name: "Aling Rosario", phone: "09181234567" });
    const raised = await call("patch", path, owner, { creditLimitCentavos: 80_000, phone: null });
    expect(raised.status).toBe(200);
    expect(raised.body).toMatchObject({ creditLimitCentavos: 80_000, phone: null });
  });

  it("lists suki with balance, limit and aging, and finds a name without its accents", async () => {
    await chargeRosa();
    await call("post", "/api/customers", owner, { name: "Lola Niña" });
    const all = await call("get", "/api/customers", bantay);
    expect(all.body).toEqual([
      { id: rosa().id, name: "Aling Rosa", phone: null, creditLimitCentavos: 50_000, balanceCentavos: 10_500, oldestUnpaidDays: 0 },
      { id: t.customers[1]!.id, name: "Kuya Jun", phone: null, creditLimitCentavos: 0, balanceCentavos: 0, oldestUnpaidDays: null },
      expect.objectContaining({ name: "Lola Niña" }),
    ]);
    expect((await call("get", "/api/customers?search=NINA", bantay)).body.map((c: { name: string }) => c.name)).toEqual(["Lola Niña"]);
  });

  it("answers another store's suki with not_found everywhere", async () => {
    const other = await seedStore(db, { code: "ut02", now: clock });
    const id = other.customers[0]!.id;
    for (const [method, path, body] of [
      ["patch", `/api/customers/${id}`, { name: "X" }],
      ["get", `/api/customers/${id}/ledger`, undefined],
      ["post", `/api/customers/${id}/payments`, { id: randomUUID(), amountCentavos: 100, method: "CASH" }],
      ["post", `/api/customers/${id}/adjustments`, { amountCentavos: 100, note: "Test" }],
      ["get", `/api/customers/${id}/reminder`, undefined],
    ] as const) {
      const res = await call(method, path, owner, body);
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
  });
});

describe("payments and adjustments", () => {
  it("records a payment with a PAYMENT entry; the same payment id again is applied once (spec 6.2)", async () => {
    await chargeRosa();
    const paymentId = randomUUID();
    const first = await pay(5_000, paymentId);
    expect(first.status).toBe(201);
    expect(first.body.customer.balanceCentavos).toBe(5_500);
    expect(first.body.entry).toMatchObject({ id: paymentId, kind: "PAYMENT", amountCentavos: -5_000, method: "CASH", balanceAfter: 5_500 });

    const again = await pay(5_000, paymentId);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ duplicate: true, customer: { balanceCentavos: 5_500 } });
    expect(await balanceOf(rosa().id)).toBe(5_500);
    expect(await db.utangEntry.count({ where: { kind: "PAYMENT" } })).toBe(1);
  });

  it("refuses a payment above the balance with overpayment", async () => {
    await chargeRosa();
    const res = await pay(10_501);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("overpayment");
    expect(await balanceOf(rosa().id)).toBe(10_500);
  });

  it("applies one of two simultaneous payments that would together pay too much", async () => {
    await chargeRosa();
    const results = await Promise.all([pay(8_000), pay(8_000)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await balanceOf(rosa().id)).toBe(2_500);
  });

  it("lets the owner adjust up and down with a note, but not below zero; a bantay cannot adjust", async () => {
    const path = `/api/customers/${rosa().id}/adjustments`;
    const up = await call("post", path, owner, { amountCentavos: 2_000, note: "Lumang utang sa notebook" });
    expect(up.status).toBe(201);
    expect(up.body.entry).toMatchObject({ kind: "ADJUSTMENT", amountCentavos: 2_000, balanceAfter: 2_000, note: "Lumang utang sa notebook" });
    expect((await call("post", path, owner, { amountCentavos: -500, note: "Discount" })).body.customer.balanceCentavos).toBe(1_500);

    const tooMuch = await call("post", path, owner, { amountCentavos: -1_501, note: "Too much" });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.code).toBe("invalid_input");
    expect((await call("post", path, bantay, { amountCentavos: 100, note: "Test" })).status).toBe(403);
    expect(await balanceOf(rosa().id)).toBe(1_500);
  });

  it("shows the ledger in order: the charge with its receipt, then payments and adjustments", async () => {
    const saleId = await chargeRosa();
    await pay(3_000);
    await call("post", `/api/customers/${rosa().id}/adjustments`, owner, { amountCentavos: -500, note: "Discount" });
    const res = await call("get", `/api/customers/${rosa().id}/ledger`, bantay);
    expect(res.status).toBe(200);
    expect(res.body.customer).toMatchObject({ id: rosa().id, balanceCentavos: 7_000, oldestUnpaidDays: 0 });
    expect(res.body.entries).toEqual([
      expect.objectContaining({ kind: "CHARGE", amountCentavos: 10_500, sale: { id: saleId, receiptNo: 1 }, balanceAfter: 10_500, user: { id: t.bantay.id, displayName: "Nena" } }),
      expect.objectContaining({ kind: "PAYMENT", amountCentavos: -3_000, method: "CASH", sale: null, balanceAfter: 7_500 }),
      expect.objectContaining({ kind: "ADJUSTMENT", amountCentavos: -500, note: "Discount", balanceAfter: 7_000, user: { id: t.owner.id, displayName: "Mang Ben" } }),
    ]);
  });
});

describe("reminders", () => {
  it("writes a polite reminder with the balance and the store name", () => {
    expect(reminderText({ name: "Aling Rosa", balanceCentavos: 32_000 }, { name: "Tindahan ni Mang Ben" })).toBe(
      "Hi Aling Rosa, paalala lang po sa utang ninyo na ₱320.00 sa Tindahan ni Mang Ben. Salamat po!",
    );
  });

  it("gives the reminder text to copy", async () => {
    await chargeRosa();
    const res = await call("get", `/api/customers/${rosa().id}/reminder`, bantay);
    expect(res.body).toEqual({ text: "Hi Aling Rosa, paalala lang po sa utang ninyo na ₱105.00 sa Test Store ut01. Salamat po!" });
  });
});
