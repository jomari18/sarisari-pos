import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
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
  t = await seedStore(db, { code: "stk1", now: new Date(clock.getTime() - 3 * DAY), expiresAt: new Date(clock.getTime() + DAY) });
  app = createApp({ config, db, now: () => clock });
  owner = await signAccessToken({ userId: t.owner.id, storeId: t.store.id, role: "OWNER" }, config.JWT_SECRET, clock);
  bantay = await signAccessToken({ userId: t.bantay.id, storeId: t.store.id, role: "BANTAY" }, config.JWT_SECRET, clock);
});

async function call(method: "get" | "post", path: string, token: string, body?: object) {
  const req = request(app)[method](path).set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET)).set("Authorization", `Bearer ${token}`);
  return body ? req.send(body) : req;
}
const chips = () => t.products[0]!; // stock 10, reorder level 3, brand Sikat
const softdrink = () => t.products[1]!; // stock 5, reorder level 2, brand Bayani
const kape = () => t.products[2]!; // stock 0, reorder level 10, no brand
const restock = (body: object, token = owner) => call("post", "/api/stock/restock", token, body);
const adjust = (body: object, token = owner) => call("post", "/api/stock/adjust", token, body);

describe("POST /api/stock/restock", () => {
  it("adds boxes at the pack size plus loose pieces, and the cost per piece becomes the product's cost (spec 6.9)", async () => {
    await db.product.update({ where: { id: chips().id }, data: { packSize: 20 } });
    const res = await restock({ productId: chips().id, boxes: 2, pieces: 5, unitCostCentavos: 1200 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: chips().id, stock: 55, costCentavos: 1200 });
    expect(await db.stockMovement.findFirstOrThrow({ where: { productId: chips().id, reason: "RESTOCK" }, orderBy: { seq: "desc" } })).toMatchObject({
      change: 45,
      stockAfter: 55,
      userId: t.owner.id,
      note: "2 boxes of 20 + 5 pieces",
    });
  });
});

describe("POST /api/stock/adjust", () => {
  it("records a count as the difference: counting 7 when 10 are recorded is COUNT −3", async () => {
    const res = await adjust({ productId: chips().id, counted: 7, note: "Monday count" });
    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(7);
    expect(await db.stockMovement.findFirstOrThrow({ where: { productId: chips().id, reason: "COUNT" } })).toMatchObject({ change: -3, stockAfter: 7, note: "Monday count" });
  });

  it("takes away spoiled and expired stock with its reason", async () => {
    expect((await adjust({ productId: chips().id, quantity: 2, reason: "SPOILAGE" })).body.stock).toBe(8);
    expect((await adjust({ productId: chips().id, quantity: 1, reason: "EXPIRED", note: "Past the date" })).body.stock).toBe(7);
    const moves = await db.stockMovement.findMany({ where: { productId: chips().id, reason: { in: ["SPOILAGE", "EXPIRED"] } }, orderBy: { seq: "asc" } });
    expect(moves.map((m) => [m.reason, m.change, m.stockAfter])).toEqual([
      ["SPOILAGE", -2, 8],
      ["EXPIRED", -1, 7],
    ]);
  });

  it("refuses a count and a spoilage in one request", async () => {
    const res = await adjust({ productId: chips().id, counted: 7, quantity: 2, reason: "SPOILAGE" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });
});

describe("GET /api/products/:id/movements", () => {
  it("shows the stock history newest first, each with the stock after it and a link to its sale", async () => {
    await restock({ productId: chips().id, pieces: 6, unitCostCentavos: 1100 });
    const sale = saleBody([{ productId: chips().id, quantity: 2, unitPriceCentavos: 1500 }]);
    await call("post", "/api/sales", bantay, sale);
    await adjust({ productId: chips().id, counted: 13 });

    const res = await call("get", `/api/products/${chips().id}/movements`, owner);
    expect(res.status).toBe(200);
    expect(res.body.map((m: { reason: string; change: number; stockAfter: number }) => [m.reason, m.change, m.stockAfter])).toEqual([
      ["COUNT", -1, 13],
      ["SALE", -2, 14],
      ["RESTOCK", 6, 16],
      ["RESTOCK", 10, 10],
    ]);
    expect(res.body[1]).toMatchObject({ sale: { id: sale.id, receiptNo: 1 }, user: { id: t.bantay.id, displayName: "Nena" } });
    expect(res.body[0].sale).toBeNull();
  });
});

describe("GET /api/stock/restock-list", () => {
  it("lists products at or below their reorder level, biggest shortage first, with text to copy", async () => {
    await db.product.update({ where: { id: softdrink().id }, data: { stock: 1 } });
    await db.product.update({ where: { id: chips().id }, data: { stock: 3 } });
    const archived = await db.product.create({
      data: { storeId: t.store.id, categoryId: t.categories[0]!.id, name: "Old candy", unit: "pc", priceCentavos: 100, costCentavos: 50, stock: 0, reorderLevel: 50, archived: true },
    });

    const res = await call("get", "/api/stock/restock-list", owner);
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: { id: string }) => p.id)).toEqual([kape().id, softdrink().id, chips().id]);
    expect(res.body.items.map((p: { id: string }) => p.id)).not.toContain(archived.id);
    expect(res.body.text).toBe(
      ["- Kape 3-in-1: 0 left, reorder at 10", "- Softdrink 1.5L (Bayani): 1 left, reorder at 2", "- Chicharon (Sikat): 3 left, reorder at 3"].join("\n"),
    );
  });
});

describe("permissions and store isolation", () => {
  it("lets only the owner restock, adjust, see history and the restock list (spec 7.4)", async () => {
    for (const res of await Promise.all([
      restock({ productId: chips().id, pieces: 1, unitCostCentavos: 1100 }, bantay),
      adjust({ productId: chips().id, counted: 1 }, bantay),
      call("get", `/api/products/${chips().id}/movements`, bantay),
      call("get", "/api/stock/restock-list", bantay),
    ])) {
      expect(res.status).toBe(403);
    }
    expect((await db.product.findUniqueOrThrow({ where: { id: chips().id } })).stock).toBe(10);
  });

  it("answers another store's or an unknown product with not_found", async () => {
    const other = await seedStore(db, { code: "stk2", now: clock });
    for (const productId of [other.products[0]!.id, randomUUID()]) {
      for (const res of [
        await restock({ productId, pieces: 1, unitCostCentavos: 100 }),
        await adjust({ productId, counted: 1 }),
        await call("get", `/api/products/${productId}/movements`, owner),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe("not_found");
      }
    }
    expect((await db.product.findUniqueOrThrow({ where: { id: other.products[0]!.id } })).stock).toBe(10);
  });
});
