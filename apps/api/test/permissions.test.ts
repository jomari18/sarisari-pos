import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createSale } from "../src/services/sales.js";
import { signAccessToken, type AuthUser } from "../src/services/tokens.js";
import { resetDb, testDb } from "./support/db.js";
import { seedStore, type TestStore } from "./support/factories.js";
import { ROUTES, fillPath, routeKey, targetsARow, type RouteIds, type RouteRow } from "./support/routes.js";
import { signNetlify, testEnv } from "./support/signing.js";

const DAY = 24 * 60 * 60 * 1000;
const config = loadConfig({ ...testEnv });
const db = testDb();
const clock = new Date("2026-10-21T15:00:00+08:00");
let app: Express;
let ownIds: RouteIds;
let otherIds: RouteIds;
let owner: string;
let bantay: string;

/** One sale in the store, so sale routes have a real id to aim at. */
async function oneSale(t: TestStore): Promise<string> {
  const cashier: AuthUser = { userId: t.bantay.id, storeId: t.store.id, role: "BANTAY" };
  const id = randomUUID();
  const items = [{ productId: t.products[0]!.id, quantity: 1, unitPriceCentavos: 1500 }];
  await createSale(db, cashier, { id, soldAt: clock.toISOString(), items, totalCentavos: 1500, payment: { method: "CASH", tenderedCentavos: 2000 } }, "online", clock);
  return id;
}

const ids = (t: TestStore, sale: string, barcode: string): RouteIds => ({
  product: t.products[0]!.id,
  barcode,
  category: t.categories[0]!.id,
  sale,
  customer: t.customers[0]!.id,
  staff: t.bantay.id,
});

// The checks only read or are refused, so one pair of stores serves the whole file.
beforeAll(async () => {
  await resetDb(db);
  const seed = { now: new Date(clock.getTime() - 3 * DAY), expiresAt: new Date(clock.getTime() + DAY) };
  const a = await seedStore(db, { code: "prm1", ...seed });
  const b = await seedStore(db, { code: "prm2", ...seed });
  // Both stores share the factory barcodes, so store B gets one of its own.
  await db.product.create({
    data: { storeId: b.store.id, categoryId: b.categories[0]!.id, name: "Only in B", barcode: "2000000000091", unit: "pc", priceCentavos: 100, costCentavos: 50, stock: 1 },
  });
  ownIds = ids(a, await oneSale(a), "2000000000015");
  otherIds = ids(b, await oneSale(b), "2000000000091");
  app = createApp({ config, db, now: () => clock });
  owner = await signAccessToken({ userId: a.owner.id, storeId: a.store.id, role: "OWNER" }, config.JWT_SECRET, clock);
  bantay = await signAccessToken({ userId: a.bantay.id, storeId: a.store.id, role: "BANTAY" }, config.JWT_SECRET, clock);
}, 60_000);
afterAll(() => db.$disconnect());

async function send(row: RouteRow, opts: { ids: RouteIds; token?: string; signed?: boolean }) {
  let req = request(app)[row.method](fillPath(row.path, opts.ids));
  if (opts.signed !== false) req = req.set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET));
  if (opts.token) req = req.set("Authorization", `Bearer ${opts.token}`);
  const body = row.body?.(opts.ids);
  return body ? req.send(body) : req;
}

const cases = (rows: RouteRow[]) => rows.map((row) => [routeKey(row.method, row.path), row] as const);

describe("every route except /api/health refuses a request that did not come through Netlify's proxy", () => {
  it.each(cases(ROUTES.filter((row) => row.path !== "/api/health")))("%s", async (_, row) => {
    const res = await send(row, { ids: ownIds, signed: false });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("bad_proxy_signature");
  });
});

describe("every signed-in route refuses a request without a bearer token", () => {
  it.each(cases(ROUTES.filter((row) => row.access !== "public")))("%s", async (_, row) => {
    const res = await send(row, { ids: ownIds });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });
});

describe("every owner-only route refuses a bantay (spec 7.4)", () => {
  it.each(cases(ROUTES.filter((row) => row.access === "owner")))("%s", async (_, row) => {
    const res = await send(row, { ids: ownIds, token: bantay });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });
});

describe("every route that aims at one row answers another store's id with not_found (spec 6.10)", () => {
  it.each(cases(ROUTES.filter((row) => row.access !== "public" && targetsARow(row))))("%s", async (_, row) => {
    const res = await send(row, { ids: otherIds, token: owner });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

type Layer = { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: Layer[] } };

/** Every method and path the Express app answers, read from its router. */
function registeredRoutes(express: Express): string[] {
  const found: string[] = [];
  const walk = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const [method, on] of Object.entries(layer.route.methods)) if (on) found.push(routeKey(method, layer.route.path));
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk((express as unknown as { router: { stack: Layer[] } }).router.stack);
  return found.sort();
}

describe("the route table", () => {
  it("lists exactly the routes the app has, so a new route cannot skip these checks", () => {
    expect(registeredRoutes(app)).toEqual(ROUTES.map((row) => routeKey(row.method, row.path)).sort());
  });
});
