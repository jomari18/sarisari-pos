import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { signAccessToken } from "../src/services/tokens.js";
import { resetDb, testDb } from "./support/db.js";
import { REPORT_NOW, buildReportFixture, type ReportFixture } from "./support/reportFixture.js";
import { signNetlify, testEnv } from "./support/signing.js";

const config = loadConfig({ ...testEnv });
const db = testDb();
let app: Express;
let f: ReportFixture;
let owner: string;
let bantay: string;

// One fixture for the whole file: these tests only read.
beforeAll(async () => {
  await resetDb(db);
  f = await buildReportFixture(db);
  app = createApp({ config, db, now: () => REPORT_NOW });
  owner = await signAccessToken(f.ownerUser, config.JWT_SECRET, REPORT_NOW);
  bantay = await signAccessToken(f.bantayUser, config.JWT_SECRET, REPORT_NOW);
}, 60_000);
afterAll(() => db.$disconnect());

async function get(path: string, token = owner) {
  return request(app).get(path).set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET)).set("Authorization", `Bearer ${token}`);
}

describe("GET /api/reports/summary", () => {
  it("counts today's sales without the voided one; profit leaves out the custom item (spec 8.6)", async () => {
    const res = await get("/api/reports/summary?range=today");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      salesCentavos: 12_400,
      count: 3,
      byMethod: { CASH: 4_900, GCASH: 0, UTANG: 7_500 },
      expectedCashCentavos: 6_400,
      profitCentavos: 2_300,
      profitExcludesCustom: true,
    });
  });

  it("covers the last 7 and 30 Manila days, today included; 23:59 and 00:01 fall on their own days", async () => {
    expect((await get("/api/reports/summary?range=7d")).body).toEqual({
      salesCentavos: 25_600,
      count: 6,
      byMethod: { CASH: 7_900, GCASH: 7_500, UTANG: 10_200 },
      expectedCashCentavos: 9_400,
      profitCentavos: 5_100,
      profitExcludesCustom: true,
    });
    expect((await get("/api/reports/summary?range=30d")).body).toEqual({
      salesCentavos: 33_100,
      count: 7,
      byMethod: { CASH: 15_400, GCASH: 7_500, UTANG: 10_200 },
      expectedCashCentavos: 16_900,
      profitCentavos: 6_400,
      profitExcludesCustom: true,
    });
  });

  it("refuses an unknown range", async () => {
    const res = await get("/api/reports/summary?range=1y");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "invalid_input", field: "range" });
  });
});

describe("GET /api/reports/products", () => {
  it("ranks products by quantity and by profit, and lists active products that did not sell", async () => {
    const res = await get("/api/reports/products?range=7d");
    expect(res.status).toBe(200);
    const [chips, softdrink, kape] = f.products.map((p) => p.id);
    expect(res.body.bestByQuantity).toEqual([
      { productId: chips, name: "Chicharon", quantity: 4, salesCentavos: 6_000, profitCentavos: 1_600 },
      { productId: kape, name: "Kape 3-in-1", quantity: 3, salesCentavos: 3_600, profitCentavos: 900 },
      { productId: softdrink, name: "Softdrink 1.5L", quantity: 2, salesCentavos: 15_000, profitCentavos: 2_600 },
    ]);
    expect(res.body.bestByProfit.map((row: { productId: string }) => row.productId)).toEqual([softdrink, chips, kape]);
    expect(res.body.slowMovers).toEqual([{ productId: f.bondPaperId, name: "Bond paper", stock: 400 }]);
  });
});

describe("GET /api/reports/hourly", () => {
  it("buckets a day's sales by Manila hour, all 24 of them", async () => {
    const today = (await get("/api/reports/hourly?date=2026-10-21")).body;
    expect(today).toHaveLength(24);
    expect(today.filter((b: { count: number }) => b.count > 0)).toEqual([
      { hour: 0, count: 1, salesCentavos: 2_400 },
      { hour: 9, count: 1, salesCentavos: 2_500 },
      { hour: 14, count: 1, salesCentavos: 7_500 },
    ]);
    const yesterday = (await get("/api/reports/hourly?date=2026-10-20")).body;
    expect(yesterday.filter((b: { count: number }) => b.count > 0).map((b: { hour: number }) => b.hour)).toEqual([8, 12, 23]);
  });
});

describe("GET /api/reports/utang", () => {
  it("totals what suki owe, lists who owes most, and ages it oldest charges first", async () => {
    const res = await get("/api/reports/utang");
    expect(res.status).toBe(200);
    expect(res.body.totalCentavos).toBe(12_700);
    expect(res.body.top.map((c: { name: string; balanceCentavos: number; oldestUnpaidDays: number | null }) => [c.name, c.balanceCentavos, c.oldestUnpaidDays])).toEqual([
      ["Aling Rosa", 7_700, 1],
      ["Ate Liza", 5_000, 15],
    ]);
    expect(res.body.aging).toEqual({ d0to7: 7_700, d8to30: 5_000, d31plus: 0 });
  });
});

describe("GET /api/reports/my-shift and permissions", () => {
  it("shows a bantay only their own sales of today", async () => {
    const res = await get("/api/reports/my-shift", bantay);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 2, byMethod: { CASH: 4_900, GCASH: 0, UTANG: 0 } });
    expect((await get("/api/reports/my-shift", owner)).body).toEqual({ count: 1, byMethod: { CASH: 0, GCASH: 0, UTANG: 7_500 } });
  });

  it("keeps the owner reports from a bantay (spec 7.4)", async () => {
    for (const path of ["/api/reports/summary?range=today", "/api/reports/products?range=7d", "/api/reports/hourly?date=2026-10-21", "/api/reports/utang"]) {
      const res = await get(path, bantay);
      expect(res.status, path).toBe(403);
    }
  });
});
