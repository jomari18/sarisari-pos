import { randomUUID } from "node:crypto";
import { manilaDate } from "@sari/shared";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { signAccessToken } from "../src/services/tokens.js";
import { resetDb, testDb } from "./support/db.js";
import { seedStore, type TestStore } from "./support/factories.js";
import { signNetlify, testEnv } from "./support/signing.js";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const LIMIT_MESSAGE = "This suki has reached their utang limit. Ask for cash or ask the owner to raise the limit.";

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
  // The store opened three days ago, so a sale from yesterday is believable.
  t = await seedStore(db, { code: "sal1", now: new Date(clock.getTime() - 3 * DAY), expiresAt: new Date(clock.getTime() + DAY) });
  app = createApp({ config, db, now: () => clock });
  owner = await signAccessToken({ userId: t.owner.id, storeId: t.store.id, role: "OWNER" }, config.JWT_SECRET, clock);
  bantay = await signAccessToken({ userId: t.bantay.id, storeId: t.store.id, role: "BANTAY" }, config.JWT_SECRET, clock);
});

type Item = { productId: string; quantity: number; unitPriceCentavos: number } | { custom: { name: string; unitPriceCentavos: number }; quantity: number };
type Payment = { method: "CASH"; tenderedCentavos: number } | { method: "GCASH"; gcashRef?: string } | { method: "UTANG"; customerId: string };

const priceOf = (item: Item) => ("custom" in item ? item.custom.unitPriceCentavos : item.unitPriceCentavos);
function saleBody(items: Item[], payment: Payment = { method: "CASH", tenderedCentavos: 100_000 }, soldAt = clock) {
  const totalCentavos = items.reduce((sum, item) => sum + item.quantity * priceOf(item), 0);
  return { id: randomUUID(), soldAt: soldAt.toISOString(), items, totalCentavos, payment };
}

async function call(method: "get" | "post", path: string, token: string, body?: object) {
  const req = request(app)[method](path).set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET)).set("Authorization", `Bearer ${token}`);
  return body ? req.send(body) : req;
}
const sell = (body: object, token = bantay) => call("post", "/api/sales", token, body);

const product = (i: number) => t.products[i]!;
const chips = (quantity = 1, unitPriceCentavos = 1500): Item => ({ productId: product(0).id, quantity, unitPriceCentavos });
const softdrink = (quantity = 1): Item => ({ productId: product(1).id, quantity, unitPriceCentavos: 7500 });
const stockOf = async (i: number) => (await db.product.findUniqueOrThrow({ where: { id: product(i).id } })).stock;
const rosa = () => t.customers[0]!;

describe("POST /api/sales: cash", () => {
  it("records the sale with the next receipt number, change, stock and one SALE movement per product line", async () => {
    const body = saleBody([chips(2), softdrink(1)], { method: "CASH", tenderedCentavos: 20_000 });
    const res = await sell(body);
    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.sale).toMatchObject({
      id: body.id,
      receiptNo: 1,
      soldAt: clock.toISOString(),
      method: "CASH",
      totalCentavos: 10_500,
      tenderedCentavos: 20_000,
      changeCentavos: 9_500,
      gcashRef: null,
      customer: null,
      cashier: { id: t.bantay.id, displayName: "Nena" },
      flags: [],
      voidedAt: null,
      voidReason: null,
    });
    expect(res.body.sale.lines).toEqual([
      { productId: product(0).id, name: "Chicharon", quantity: 2, unitPriceCentavos: 1500, lineTotalCentavos: 3000 },
      { productId: product(1).id, name: "Softdrink 1.5L", quantity: 1, unitPriceCentavos: 7500, lineTotalCentavos: 7500 },
    ]);
    expect(await stockOf(0)).toBe(8);
    expect(await stockOf(1)).toBe(4);
    const moves = await db.stockMovement.findMany({ where: { saleId: body.id }, orderBy: { stockAfter: "desc" } });
    expect(moves).toEqual([
      expect.objectContaining({ productId: product(0).id, change: -2, reason: "SALE", stockAfter: 8, userId: t.bantay.id }),
      expect.objectContaining({ productId: product(1).id, change: -1, reason: "SALE", stockAfter: 4, userId: t.bantay.id }),
    ]);

    const next = await sell(saleBody([chips()]));
    expect(next.body.sale.receiptNo).toBe(2);
  });

  it("answers a repeated id with the stored sale (200, duplicate) and changes nothing", async () => {
    const body = saleBody([chips(3)]);
    expect((await sell(body)).status).toBe(201);
    const again = await sell(body);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ duplicate: true, sale: { id: body.id, receiptNo: 1 } });
    expect(await stockOf(0)).toBe(7);
    expect(await db.sale.count()).toBe(1);
  });

  it("refuses a total that does not match the lines, and stores nothing", async () => {
    const res = await sell({ ...saleBody([chips(2)]), totalCentavos: 2_999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "invalid_input", field: "totalCentavos" });
    expect(await db.sale.count()).toBe(0);
  });

  it("refuses an archived, unknown or other store's product online", async () => {
    const other = await seedStore(db, { code: "sal2", now: clock });
    await db.product.update({ where: { id: product(2).id }, data: { archived: true } });
    for (const productId of [product(2).id, randomUUID(), other.products[0]!.id]) {
      const res = await sell(saleBody([chips(), { productId, quantity: 1, unitPriceCentavos: 1200 }]));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({ code: "invalid_input", field: "items.1.productId" });
    }
    expect(await db.sale.count()).toBe(0);
    expect(await stockOf(0)).toBe(10);
  });
});

describe("POST /api/sales: utang", () => {
  it("refuses utang over the limit online and leaves no trace at all (spec 6.1, 6.4)", async () => {
    await db.customer.update({ where: { id: rosa().id }, data: { balanceCentavos: 45_000 } });
    const res = await sell(saleBody([softdrink(1)], { method: "UTANG", customerId: rosa().id }));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "credit_limit_exceeded", message: LIMIT_MESSAGE });

    expect(await db.sale.count()).toBe(0);
    expect(await db.saleItem.count()).toBe(0);
    expect(await db.stockMovement.count({ where: { reason: "SALE" } })).toBe(0);
    expect(await db.utangEntry.count()).toBe(0);
    expect(await stockOf(1)).toBe(5);
    expect((await db.customer.findUniqueOrThrow({ where: { id: rosa().id } })).balanceCentavos).toBe(45_000);
    expect((await sell(saleBody([chips()]))).body.sale.receiptNo).toBe(1);
  });

  it("charges utang within the limit, with a CHARGE entry and the balance after the sale", async () => {
    const body = saleBody([chips(2), softdrink(1)], { method: "UTANG", customerId: rosa().id });
    const res = await sell(body);
    expect(res.status).toBe(201);
    expect(res.body.sale).toMatchObject({
      method: "UTANG",
      tenderedCentavos: null,
      changeCentavos: null,
      customer: { id: rosa().id, name: "Aling Rosa", balanceAfterCentavos: 10_500 },
    });
    expect((await db.customer.findUniqueOrThrow({ where: { id: rosa().id } })).balanceCentavos).toBe(10_500);
    expect(await db.utangEntry.findMany({ where: { customerId: rosa().id } })).toEqual([
      expect.objectContaining({ kind: "CHARGE", amountCentavos: 10_500, balanceAfter: 10_500, saleId: body.id, userId: t.bantay.id }),
    ]);
  });

  it("refuses utang for a suki of another store", async () => {
    const other = await seedStore(db, { code: "sal3", now: clock });
    const res = await sell(saleBody([chips()], { method: "UTANG", customerId: other.customers[0]!.id }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "invalid_input", field: "payment.customerId" });
  });
});

describe("POST /api/sales: flags", () => {
  it("sells a custom item with CUSTOM_ITEM and no stock movement for that line (spec 6.6)", async () => {
    const body = saleBody([chips(), { custom: { name: "Yelo", unitPriceCentavos: 500 }, quantity: 2 }], { method: "GCASH", gcashRef: "1234567890123" });
    const res = await sell(body);
    expect(res.status).toBe(201);
    expect(res.body.sale.flags).toEqual(["CUSTOM_ITEM"]);
    expect(res.body.sale.gcashRef).toBe("1234567890123");
    expect(res.body.sale.lines[1]).toEqual({ productId: null, name: "Yelo", quantity: 2, unitPriceCentavos: 500, lineTotalCentavos: 1000 });
    expect(await db.stockMovement.count({ where: { saleId: body.id } })).toBe(1);
    expect((await db.saleItem.findFirstOrThrow({ where: { saleId: body.id, productId: null } })).unitCostCentavos).toBeNull();
  });

  it("flags a stale price and selling beyond the recorded stock, which goes negative (spec 6.3, 6.5)", async () => {
    const stale = await sell(saleBody([chips(1, 1400)]));
    expect(stale.body.sale.flags).toEqual(["PRICE_CHANGED"]);
    const oversold = await sell(saleBody([{ productId: product(2).id, quantity: 1, unitPriceCentavos: 1200 }]));
    expect(oversold.status).toBe(201);
    expect(oversold.body.sale.flags).toEqual(["NEGATIVE_STOCK"]);
    expect(await stockOf(2)).toBe(-1);
  });

  it("does not touch the product's updatedAt, which guards edits of its details", async () => {
    const before = (await db.product.findUniqueOrThrow({ where: { id: product(0).id } })).updatedAt;
    await sell(saleBody([chips()]));
    expect((await db.product.findUniqueOrThrow({ where: { id: product(0).id } })).updatedAt).toEqual(before);
  });
});

describe("POST /api/sales: concurrency", () => {
  it("lets two sales of the last piece both through; stock ends at −1 and one is flagged NEGATIVE_STOCK", async () => {
    await db.product.update({ where: { id: product(1).id }, data: { stock: 1 } });
    const results = await Promise.all([sell(saleBody([softdrink()])), sell(saleBody([softdrink()]), owner)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(await stockOf(1)).toBe(-1);
    expect(results.some((r) => r.body.sale.flags.includes("NEGATIVE_STOCK"))).toBe(true);
    expect(results.map((r) => r.body.sale.receiptNo).sort()).toEqual([1, 2]);
  });

  it("records one sale when the same id arrives twice at once", async () => {
    const body = saleBody([chips(2)]);
    const results = await Promise.all([sell(body), sell(body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await db.sale.count()).toBe(1);
    expect(await stockOf(0)).toBe(8);
  });
});

describe("GET /api/sales and /api/sales/:id", () => {
  it("shows a bantay only their own sales of the Manila day; the owner sees any day and cashier", async () => {
    const mine = saleBody([chips()]);
    const ownersSale = saleBody([softdrink()], undefined, new Date(clock.getTime() + MINUTE));
    const yesterday = saleBody([chips()], undefined, new Date(clock.getTime() - DAY));
    await sell(mine);
    await sell(ownersSale, owner);
    await sell(yesterday);
    const ids = (res: { body: { id: string }[] }) => res.body.map((s) => s.id);

    expect(ids(await call("get", "/api/sales", bantay))).toEqual([mine.id]);
    const yesterdayDate = manilaDate(new Date(clock.getTime() - DAY));
    expect(ids(await call("get", `/api/sales?date=${yesterdayDate}&cashierId=${t.owner.id}`, bantay))).toEqual([mine.id]);

    expect(ids(await call("get", "/api/sales", owner))).toEqual([ownersSale.id, mine.id]);
    expect(ids(await call("get", `/api/sales?date=${yesterdayDate}`, owner))).toEqual([yesterday.id]);
    expect(ids(await call("get", `/api/sales?cashierId=${t.bantay.id}`, owner))).toEqual([mine.id]);
  });

  it("gives a bantay only their own receipts and hides other stores' sales from everyone", async () => {
    const mine = saleBody([chips()]);
    const ownersSale = saleBody([softdrink()]);
    await sell(mine);
    await sell(ownersSale, owner);
    const other = await seedStore(db, { code: "sal4", now: clock });
    const outsider = await signAccessToken({ userId: other.owner.id, storeId: other.store.id, role: "OWNER" }, config.JWT_SECRET, clock);

    expect((await call("get", `/api/sales/${mine.id}`, bantay)).body).toMatchObject({ id: mine.id, receiptNo: 1 });
    expect((await call("get", `/api/sales/${ownersSale.id}`, bantay)).status).toBe(404);
    expect((await call("get", `/api/sales/${ownersSale.id}`, owner)).status).toBe(200);
    expect((await call("get", `/api/sales/${mine.id}`, outsider)).status).toBe(404);
    expect((await call("get", "/api/sales/not-a-uuid", owner)).status).toBe(404);
  });

  it("refuses a malformed date", async () => {
    const res = await call("get", "/api/sales?date=2026-02-30", owner);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "invalid_input", field: "date" });
  });
});
