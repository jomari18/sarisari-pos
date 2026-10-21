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
let other: TestStore;
let owner: string;
let bantay: string;
let otherOwner: string;

afterAll(() => db.$disconnect());
beforeEach(async () => {
  await resetDb(db);
  t = await seedStore(db, { code: "pro1", now: new Date(clock.getTime() - 3 * DAY), expiresAt: new Date(clock.getTime() + DAY) });
  other = await seedStore(db, { code: "pro2", now: new Date(clock.getTime() - 3 * DAY), expiresAt: new Date(clock.getTime() + DAY) });
  app = createApp({ config, db, now: () => clock });
  const sign = (s: TestStore, who: "owner" | "bantay") =>
    signAccessToken({ userId: s[who].id, storeId: s.store.id, role: who === "owner" ? "OWNER" : "BANTAY" }, config.JWT_SECRET, clock);
  [owner, bantay, otherOwner] = await Promise.all([sign(t, "owner"), sign(t, "bantay"), sign(other, "owner")]);
});

async function call(method: "get" | "post" | "patch", path: string, token: string, body?: object) {
  const req = request(app)[method](path).set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET)).set("Authorization", `Bearer ${token}`);
  return body ? req.send(body) : req;
}
const newProduct = (overrides: Record<string, unknown> = {}) => ({
  name: "Chicharon",
  brand: "Bagong Sikat",
  barcode: "2000000000046",
  categoryId: t.categories[0]!.id,
  unit: "pack",
  priceCentavos: 1800,
  costCentavos: 1300,
  reorderLevel: 5,
  ...overrides,
});
const catalogIds = async () => (await call("get", "/api/catalog", bantay)).body.products.map((p: { id: string }) => p.id);

describe("POST /api/products", () => {
  it("adds a product of a new brand, which the POS catalog then has (spec 1.1)", async () => {
    const res = await call("post", "/api/products", owner, newProduct());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      categoryId: t.categories[0]!.id,
      name: "Chicharon",
      brand: "Bagong Sikat",
      barcode: "2000000000046",
      unit: "pack",
      priceCentavos: 1800,
      costCentavos: 1300,
      stock: 0,
      reorderLevel: 5,
      packSize: 1,
      archived: false,
      updatedAt: expect.any(String),
    });
    expect(await catalogIds()).toContain(res.body.id);
  });

  it("keeps a barcode unique within a store, while another store may use the same one", async () => {
    expect((await call("post", "/api/products", owner, newProduct())).status).toBe(201);
    const again = await call("post", "/api/products", owner, newProduct({ name: "Other chips" }));
    expect(again.status).toBe(400);
    expect(again.body.error).toMatchObject({ code: "invalid_input", field: "barcode" });
    const elsewhere = await call("post", "/api/products", otherOwner, newProduct({ categoryId: other.categories[0]!.id }));
    expect(elsewhere.status).toBe(201);

    const taken = await call("patch", `/api/products/${t.products[1]!.id}`, owner, {
      barcode: "2000000000046",
      expectedUpdatedAt: (await db.product.findUniqueOrThrow({ where: { id: t.products[1]!.id } })).updatedAt.toISOString(),
    });
    expect(taken.status).toBe(400);
    expect(taken.body.error).toMatchObject({ code: "invalid_input", field: "barcode" });
  });

  it("refuses another store's category", async () => {
    const res = await call("post", "/api/products", owner, newProduct({ categoryId: other.categories[0]!.id }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "invalid_input", field: "categoryId" });
  });

  it("answers the 301st product with limit_reached (spec 6.11)", async () => {
    await db.product.createMany({
      data: Array.from({ length: 297 }, (_, i) => ({ storeId: t.store.id, categoryId: t.categories[0]!.id, name: `Item ${i}`, unit: "pc", priceCentavos: 100, costCentavos: 50, stock: 0 })),
    });
    const res = await call("post", "/api/products", owner, newProduct());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("limit_reached");
    expect(await db.product.count({ where: { storeId: t.store.id } })).toBe(300);
  });
});

describe("PATCH /api/products/:id", () => {
  it("refuses an edit made from an old copy with stale_edit, but a sale in between does not make a copy old", async () => {
    const path = `/api/products/${t.products[0]!.id}`;
    const loaded = (await call("get", path, owner)).body.updatedAt;
    await call("post", "/api/sales", bantay, saleBody([{ productId: t.products[0]!.id, quantity: 1, unitPriceCentavos: 1500 }]));

    const first = await call("patch", path, owner, { priceCentavos: 1600, expectedUpdatedAt: loaded });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ priceCentavos: 1600, stock: 9 });
    expect(first.body.updatedAt).not.toBe(loaded);

    const stale = await call("patch", path, owner, { priceCentavos: 1700, expectedUpdatedAt: loaded });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("stale_edit");
    expect((await db.product.findUniqueOrThrow({ where: { id: t.products[0]!.id } })).priceCentavos).toBe(1600);
  });

  it("clears a brand or barcode with null", async () => {
    const product = await db.product.findUniqueOrThrow({ where: { id: t.products[0]!.id } });
    const res = await call("patch", `/api/products/${product.id}`, owner, { brand: null, barcode: null, expectedUpdatedAt: product.updatedAt.toISOString() });
    expect(res.body).toMatchObject({ brand: null, barcode: null });
  });
});

describe("archiving", () => {
  it("hides an archived product from the catalog; unarchiving brings it back", async () => {
    const id = t.products[0]!.id;
    const archived = await call("post", `/api/products/${id}/archive`, owner);
    expect(archived.status).toBe(200);
    expect(archived.body.archived).toBe(true);
    expect(await catalogIds()).not.toContain(id);
    expect((await call("post", `/api/products/${id}/unarchive`, owner)).body.archived).toBe(false);
    expect(await catalogIds()).toContain(id);
  });
});

describe("categories", () => {
  it("keeps category names unique in a store whatever the case, and renames and archives them", async () => {
    const duplicate = await call("post", "/api/categories", owner, { name: "snacks" });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error).toMatchObject({ code: "invalid_input", field: "name" });
    expect((await call("post", "/api/categories", owner, { name: "  Canned   goods " })).body).toEqual({ id: expect.any(String), name: "Canned goods", archived: false });

    const drinks = `/api/categories/${t.categories[1]!.id}`;
    expect((await call("patch", drinks, owner, { name: "Inumin" })).body).toMatchObject({ name: "Inumin" });
    expect((await call("patch", drinks, owner, { name: "inumin" })).status).toBe(200);
    expect((await call("patch", drinks, owner, { name: "SNACKS" })).status).toBe(400);
    expect((await call("patch", drinks, owner, { archived: true })).body).toMatchObject({ name: "inumin", archived: true });
  });
});

describe("permissions and store isolation", () => {
  it("lets only the owner manage products and categories (spec 7.4)", async () => {
    const id = t.products[0]!.id;
    const attempts = [
      call("post", "/api/products", bantay, newProduct()),
      call("patch", `/api/products/${id}`, bantay, { priceCentavos: 1, expectedUpdatedAt: clock.toISOString() }),
      call("post", `/api/products/${id}/archive`, bantay),
      call("post", "/api/categories", bantay, { name: "Frozen" }),
      call("patch", `/api/categories/${t.categories[0]!.id}`, bantay, { name: "Chips" }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    }
  });

  it("answers another store's product or category with not_found", async () => {
    const theirs = other.products[0]!.id;
    for (const res of [
      await call("patch", `/api/products/${theirs}`, owner, { priceCentavos: 1, expectedUpdatedAt: clock.toISOString() }),
      await call("post", `/api/products/${theirs}/archive`, owner),
      await call("patch", `/api/categories/${other.categories[0]!.id}`, owner, { name: "Mine now" }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
  });
});
