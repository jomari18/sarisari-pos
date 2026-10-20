import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { signAccessToken } from "../src/services/tokens.js";
import { resetDb, testDb } from "./support/db.js";
import { seedStore, type TestStore } from "./support/factories.js";
import { signNetlify, testEnv } from "./support/signing.js";

const config = loadConfig({ ...testEnv });
const db = testDb();
const clock = new Date("2026-10-21T09:00:00+08:00");
let app: Express;
let t: TestStore;
let other: TestStore;
let owner: string;
let bantay: string;

afterAll(() => db.$disconnect());
beforeEach(async () => {
  await resetDb(db);
  t = await seedStore(db, { code: "cat1", now: clock });
  other = await seedStore(db, { code: "cat2", now: clock });
  app = createApp({ config, db, now: () => clock });
  owner = await signAccessToken({ userId: t.owner.id, storeId: t.store.id, role: "OWNER" }, config.JWT_SECRET, clock);
  bantay = await signAccessToken({ userId: t.bantay.id, storeId: t.store.id, role: "BANTAY" }, config.JWT_SECRET, clock);
});

async function get(path: string, token?: string) {
  const req = request(app).get(path).set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET));
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
}

const names = (body: { name: string }[]) => body.map((p) => p.name);

describe("GET /api/catalog", () => {
  it("has the active products, every category and the suki who are not archived, with balances and limits", async () => {
    const [chicharon, softdrink] = t.products;
    await db.product.update({ where: { id: softdrink!.id }, data: { archived: true } });
    await db.category.update({ where: { id: t.categories[1]!.id }, data: { archived: true } });
    await db.customer.update({ where: { id: t.customers[0]!.id }, data: { balanceCentavos: 12000 } });
    await db.customer.create({ data: { storeId: t.store.id, name: "Dating Suki", archived: true } });

    const res = await get("/api/catalog", bantay);
    expect(res.status).toBe(200);
    expect(res.body.generatedAt).toBe(clock.toISOString());
    expect(names(res.body.products)).toEqual(["Chicharon", "Kape 3-in-1"]);
    expect(res.body.products[0]).toMatchObject({ id: chicharon!.id, priceCentavos: 1500, stock: 10, barcode: "2000000000015", archived: false });
    expect(res.body.categories).toEqual([
      { id: t.categories[1]!.id, name: "Drinks", archived: true },
      { id: t.categories[0]!.id, name: "Snacks", archived: false },
    ]);
    expect(res.body.customers).toEqual([
      { id: t.customers[0]!.id, name: "Aling Rosa", phone: null, creditLimitCentavos: 50000, balanceCentavos: 12000 },
      { id: t.customers[1]!.id, name: "Kuya Jun", phone: null, creditLimitCentavos: 0, balanceCentavos: 0 },
    ]);
  });

  it("needs a signed-in user", async () => {
    const res = await get("/api/catalog");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });
});

describe("role shaping (spec 7.4)", () => {
  it("never sends costCentavos to a bantay, anywhere in a response, and always sends it to the owner", async () => {
    const paths = ["/api/catalog", "/api/products", "/api/products/barcode/2000000000015", `/api/products/${t.products[0]!.id}`];
    for (const path of paths) {
      const asBantay = await get(path, bantay);
      expect(asBantay.status).toBe(200);
      expect(JSON.stringify(asBantay.body)).not.toContain("costCentavos");
      const asOwner = await get(path, owner);
      expect(JSON.stringify(asOwner.body)).toContain('"costCentavos":1100');
    }
  });
});

describe("GET /api/products", () => {
  it("searches name and brand without caring about case or accents", async () => {
    await db.product.create({
      data: { storeId: t.store.id, categoryId: t.categories[1]!.id, name: "Piña juice", unit: "pack", priceCentavos: 2000, costCentavos: 1500, stock: 3 },
    });
    await db.product.create({
      data: { storeId: t.store.id, categoryId: t.categories[0]!.id, name: "Pork rinds", brand: "Señora", unit: "pack", priceCentavos: 1800, costCentavos: 1300, stock: 3 },
    });
    expect(names((await get("/api/products?search=PINA", owner)).body)).toEqual(["Piña juice"]);
    expect(names((await get("/api/products?search=senora", owner)).body)).toEqual(["Pork rinds"]);
    expect(names((await get("/api/products?search=chich", owner)).body)).toEqual(["Chicharon"]);
    expect(names((await get("/api/products?search=bayani", owner)).body)).toEqual(["Softdrink 1.5L"]);
    expect((await get("/api/products?search=%25", owner)).body).toEqual([]);
  });

  it("lists products at or below their reorder level with lowStock=true", async () => {
    await db.product.update({ where: { id: t.products[1]!.id }, data: { stock: 2 } });
    expect(names((await get("/api/products?lowStock=true", owner)).body)).toEqual(["Kape 3-in-1", "Softdrink 1.5L"]);
  });

  it("filters by category and by status, active by default", async () => {
    await db.product.update({ where: { id: t.products[0]!.id }, data: { archived: true } });
    expect(names((await get(`/api/products?categoryId=${t.categories[1]!.id}`, owner)).body)).toEqual(["Softdrink 1.5L"]);
    expect(names((await get("/api/products", owner)).body)).toEqual(["Kape 3-in-1", "Softdrink 1.5L"]);
    expect(names((await get("/api/products?status=archived", owner)).body)).toEqual(["Chicharon"]);
  });

  it("refuses an unknown status with invalid_input", async () => {
    const res = await get("/api/products?status=deleted", owner);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "invalid_input", field: "status" });
  });
});

describe("GET /api/products/barcode/:code and /api/products/:id", () => {
  it("finds the store's own product by barcode", async () => {
    const res = await get("/api/products/barcode/2000000000015", bantay);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: t.products[0]!.id, name: "Chicharon" });
  });

  it("answers not_found for an unknown barcode and for one that only another store has", async () => {
    await db.product.create({
      data: { storeId: other.store.id, categoryId: other.categories[0]!.id, name: "Other store item", barcode: "2000000000039", unit: "pc", priceCentavos: 500, costCentavos: 300, stock: 1 },
    });
    for (const code of ["2999999999990", "2000000000039"]) {
      const res = await get(`/api/products/barcode/${code}`, bantay);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
  });

  it("answers a product id from another store with not_found, as if it did not exist (spec 6.10)", async () => {
    expect((await get(`/api/products/${t.products[0]!.id}`, bantay)).status).toBe(200);
    for (const id of [other.products[0]!.id, "not-a-uuid"]) {
      const res = await get(`/api/products/${id}`, bantay);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
  });
});

describe("GET /api/categories", () => {
  it("lists the store's categories by name for any signed-in user", async () => {
    const res = await get("/api/categories", bantay);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: t.categories[1]!.id, name: "Drinks", archived: false },
      { id: t.categories[0]!.id, name: "Snacks", archived: false },
    ]);
  });
});
