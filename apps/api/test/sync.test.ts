import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { signAccessToken } from "../src/services/tokens.js";
import { resetDb, testDb } from "./support/db.js";
import { seedStore, type TestStore } from "./support/factories.js";
import { saleBodies, type Item } from "./support/sales.js";
import { signNetlify, testEnv } from "./support/signing.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const config = loadConfig({ ...testEnv });
const db = testDb();
const clock = new Date("2026-10-21T15:00:00+08:00");
const saleBody = saleBodies(clock);
let app: Express;
let t: TestStore;
let bantay: string;

afterAll(() => db.$disconnect());
beforeEach(async () => {
  await resetDb(db);
  t = await seedStore(db, { code: "syn1", now: new Date(clock.getTime() - 3 * DAY), expiresAt: new Date(clock.getTime() + DAY) });
  app = createApp({ config, db, now: () => clock });
  bantay = await signAccessToken({ userId: t.bantay.id, storeId: t.store.id, role: "BANTAY" }, config.JWT_SECRET, clock);
});

async function sync(sales: unknown[]) {
  return request(app)
    .post("/api/sales/sync")
    .set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET))
    .set("Authorization", `Bearer ${bantay}`)
    .send({ sales });
}

const chips = (quantity = 1): Item => ({ productId: t.products[0]!.id, quantity, unitPriceCentavos: 1500 });
const softdrink = (): Item => ({ productId: t.products[1]!.id, quantity: 1, unitPriceCentavos: 7500 });
const accepted = (id: string, receiptNo: number, flags: string[] = []) => ({ id, status: "accepted", receiptNo, flags });

describe("POST /api/sales/sync", () => {
  it("accepts queued sales in batch order, with ascending receipt numbers (spec 9)", async () => {
    const sales = [saleBody([chips()]), saleBody([softdrink()]), saleBody([chips(2)])];
    const res = await sync(sales);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sales.map((sale, i) => accepted(sale.id, i + 1)));
    expect(await db.sale.findMany({ select: { source: true } })).toEqual(sales.map(() => ({ source: "OFFLINE_SYNC" })));
  });

  it("answers a repeated id in the same batch with duplicate and records it once", async () => {
    const sale = saleBody([chips()]);
    const res = await sync([sale, sale]);
    expect(res.body).toEqual([accepted(sale.id, 1), { id: sale.id, status: "duplicate", receiptNo: 1, flags: [] }]);
    expect(await db.sale.count()).toBe(1);
  });

  it("never refuses utang for the limit: an over-limit sale is accepted with OVER_CREDIT_LIMIT (spec 6.4)", async () => {
    const jun = t.customers[1]!; // credit limit 0
    const sale = saleBody([softdrink()], { method: "UTANG", customerId: jun.id });
    const res = await sync([sale]);
    expect(res.body).toEqual([accepted(sale.id, 1, ["OVER_CREDIT_LIMIT"])]);
    expect((await db.customer.findUniqueOrThrow({ where: { id: jun.id } })).balanceCentavos).toBe(7500);
    expect(await db.utangEntry.count({ where: { saleId: sale.id, kind: "CHARGE" } })).toBe(1);
  });

  it("marks only the sale with an unknown product as invalid and accepts the others", async () => {
    const first = saleBody([chips()]);
    const unknown = saleBody([{ productId: randomUUID(), quantity: 1, unitPriceCentavos: 100 }]);
    const last = saleBody([softdrink()]);
    const res = await sync([first, unknown, last]);
    expect(res.body).toEqual([
      accepted(first.id, 1),
      { id: unknown.id, status: "invalid", flags: [], error: { code: "invalid_input", message: expect.any(String) } },
      accepted(last.id, 2),
    ]);
  });

  it("marks a malformed sale as invalid without holding back the rest of the queue", async () => {
    const malformed = { ...saleBody([chips()]), totalCentavos: "lots" };
    const good = saleBody([chips()]);
    const res = await sync([malformed, good]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: malformed.id, status: "invalid", flags: [], error: { code: "invalid_input", message: expect.any(String) } },
      accepted(good.id, 1),
    ]);
  });

  it("accepts an archived product, because the device sold it from its snapshot", async () => {
    await db.product.update({ where: { id: t.products[0]!.id }, data: { archived: true } });
    const sale = saleBody([chips()]);
    expect((await sync([sale])).body).toEqual([accepted(sale.id, 1)]);
  });

  it("refuses an empty batch and one of more than 100 sales", async () => {
    for (const sales of [[], Array.from({ length: 101 }, () => saleBody([chips()]))]) {
      const res = await sync(sales);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("invalid_input");
    }
    expect(await db.sale.count()).toBe(0);
  });

  it("keeps a sale from a phone whose clock is 2 hours ahead, at the server time, flagged CLOCK_ADJUSTED (Review Focus 1)", async () => {
    const sale = saleBody([chips()], undefined, new Date(clock.getTime() + 2 * HOUR));
    expect((await sync([sale])).body).toEqual([accepted(sale.id, 1, ["CLOCK_ADJUSTED"])]);
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).soldAt).toEqual(clock);
  });

  it("does the same for a sale dated a year before the store existed (Review Focus 1)", async () => {
    const sale = saleBody([chips()], undefined, new Date(t.store.createdAt.getTime() - 365 * DAY));
    expect((await sync([sale])).body).toEqual([accepted(sale.id, 1, ["CLOCK_ADJUSTED"])]);
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).soldAt).toEqual(clock);
  });
});
