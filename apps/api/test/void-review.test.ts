import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { signAccessToken } from "../src/services/tokens.js";
import { resetDb, testDb } from "./support/db.js";
import { seedStore, type TestStore } from "./support/factories.js";
import { saleBodies, type Item, type Payment } from "./support/sales.js";
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
  t = await seedStore(db, { code: "voi1", now: new Date(clock.getTime() - 3 * DAY), expiresAt: new Date(clock.getTime() + DAY) });
  app = createApp({ config, db, now: () => clock });
  owner = await signAccessToken({ userId: t.owner.id, storeId: t.store.id, role: "OWNER" }, config.JWT_SECRET, clock);
  bantay = await signAccessToken({ userId: t.bantay.id, storeId: t.store.id, role: "BANTAY" }, config.JWT_SECRET, clock);
});

async function call(method: "get" | "post", path: string, token: string, body?: object) {
  const req = request(app)[method](path).set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET)).set("Authorization", `Bearer ${token}`);
  return body ? req.send(body) : req;
}
async function sell(items: Item[], payment?: Payment): Promise<string> {
  const body = saleBody(items, payment);
  const res = await call("post", "/api/sales", bantay, body);
  expect(res.status).toBe(201);
  return body.id;
}
const voidSale = (id: string, token = owner, reason = "Rung up by mistake") => call("post", `/api/sales/${id}/void`, token, { reason });

const chips = (quantity = 1, unitPriceCentavos = 1500): Item => ({ productId: t.products[0]!.id, quantity, unitPriceCentavos });
const softdrink = (): Item => ({ productId: t.products[1]!.id, quantity: 1, unitPriceCentavos: 7500 });
const kape = (): Item => ({ productId: t.products[2]!.id, quantity: 1, unitPriceCentavos: 1200 }); // stock 0
const stockOf = async (i: number) => (await db.product.findUniqueOrThrow({ where: { id: t.products[i]!.id } })).stock;

describe("POST /api/sales/:id/void", () => {
  it("returns the stock with VOID movements and keeps the sale, marked with the reason (spec 6.7)", async () => {
    const id = await sell([chips(2), softdrink()]);
    expect([await stockOf(0), await stockOf(1)]).toEqual([8, 4]);

    const res = await voidSale(id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, voidedAt: clock.toISOString(), voidReason: "Rung up by mistake", receiptNo: 1 });
    expect([await stockOf(0), await stockOf(1)]).toEqual([10, 5]);
    expect(await db.stockMovement.findMany({ where: { saleId: id, reason: "VOID" }, orderBy: { stockAfter: "desc" } })).toEqual([
      expect.objectContaining({ productId: t.products[0]!.id, change: 2, stockAfter: 10, userId: t.owner.id, note: "Rung up by mistake" }),
      expect.objectContaining({ productId: t.products[1]!.id, change: 1, stockAfter: 5, userId: t.owner.id }),
    ]);
    expect((await db.sale.findUniqueOrThrow({ where: { id } })).voidedById).toBe(t.owner.id);
  });

  it("reverses an utang charge with a VOID ledger entry", async () => {
    const rosa = t.customers[0]!;
    const id = await sell([chips(2), softdrink()], { method: "UTANG", customerId: rosa.id });
    expect((await voidSale(id)).status).toBe(200);
    expect((await db.customer.findUniqueOrThrow({ where: { id: rosa.id } })).balanceCentavos).toBe(0);
    expect(await db.utangEntry.findMany({ where: { customerId: rosa.id }, orderBy: { balanceAfter: "desc" }, select: { kind: true, amountCentavos: true, balanceAfter: true, saleId: true } })).toEqual([
      { kind: "CHARGE", amountCentavos: 10_500, balanceAfter: 10_500, saleId: id },
      { kind: "VOID", amountCentavos: -10_500, balanceAfter: 0, saleId: id },
    ]);
  });

  it("writes no movement for a custom line", async () => {
    const id = await sell([chips(), { custom: { name: "Yelo", unitPriceCentavos: 500 }, quantity: 3 }]);
    await voidSale(id);
    expect(await db.stockMovement.count({ where: { saleId: id, reason: "VOID" } })).toBe(1);
  });

  it("answers already_voided the second time and changes nothing more, even when both arrive at once", async () => {
    const id = await sell([chips(2)]);
    const both = await Promise.all([voidSale(id), voidSale(id)]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    const again = await voidSale(id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_voided");
    expect(await stockOf(0)).toBe(10);
    expect(await db.stockMovement.count({ where: { saleId: id, reason: "VOID" } })).toBe(1);
  });

  it("is for the owner only", async () => {
    const id = await sell([chips()]);
    const res = await voidSale(id, bantay);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
    expect((await db.sale.findUniqueOrThrow({ where: { id } })).voidedAt).toBeNull();
  });

  it("answers not_found for an unknown id or another store's sale, and needs a reason of 3 to 120 characters", async () => {
    const other = await seedStore(db, { code: "voi2", now: clock });
    const outsider = await signAccessToken({ userId: other.owner.id, storeId: other.store.id, role: "OWNER" }, config.JWT_SECRET, clock);
    const id = await sell([chips()]);
    expect((await voidSale(randomUUID())).status).toBe(404);
    expect((await voidSale(id, outsider)).status).toBe(404);
    const short = await voidSale(id, owner, "no");
    expect(short.status).toBe(400);
    expect(short.body.error).toMatchObject({ code: "invalid_input", field: "reason" });
  });
});

describe("GET /api/review and POST /api/review/:saleId/done", () => {
  it("lists flagged sales that are neither reviewed nor voided, newest first; done takes one off the list", async () => {
    const negative = await sell([kape()]);
    const custom = await sell([{ custom: { name: "Load ₱50", unitPriceCentavos: 5000 }, quantity: 1 }]);
    await sell([chips()]);
    const voided = await sell([chips(1, 1400)]);
    await voidSale(voided);

    const list = await call("get", "/api/review", owner);
    expect(list.status).toBe(200);
    expect(list.body.map((s: { id: string; flags: string[] }) => [s.id, s.flags])).toEqual([
      [custom, ["CUSTOM_ITEM"]],
      [negative, ["NEGATIVE_STOCK"]],
    ]);
    expect(list.body[0].lines[0]).toEqual({ productId: null, name: "Load ₱50", quantity: 1, unitPriceCentavos: 5000, lineTotalCentavos: 5000 });

    expect((await call("post", `/api/review/${negative}/done`, owner)).status).toBe(204);
    expect((await call("post", `/api/review/${negative}/done`, owner)).status).toBe(204);
    expect((await call("get", "/api/review", owner)).body.map((s: { id: string }) => s.id)).toEqual([custom]);
    expect((await db.sale.findUniqueOrThrow({ where: { id: negative } })).reviewedAt).toEqual(clock);
  });

  it("is for the owner only, and an unknown sale answers not_found", async () => {
    expect((await call("get", "/api/review", bantay)).status).toBe(403);
    const id = await sell([kape()]);
    expect((await call("post", `/api/review/${id}/done`, bantay)).status).toBe(403);
    expect((await call("post", `/api/review/${randomUUID()}/done`, owner)).status).toBe(404);
  });
});
