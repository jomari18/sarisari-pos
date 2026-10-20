import { describe, expect, it } from "vitest";
import { lineTotal, resolveSoldAt, saleFlags, saleTotal } from "../src/domain/saleRules.js";

const MINUTE = 60_000;

describe("sale totals", () => {
  it("multiplies quantity by unit price and adds up the lines", () => {
    expect(lineTotal(3, 1500)).toBe(4500);
    expect(lineTotal(1, 0)).toBe(0);
    expect(saleTotal([{ quantity: 3, unitPriceCentavos: 1500 }, { quantity: 1, unitPriceCentavos: 7550 }])).toBe(12050);
    expect(saleTotal([])).toBe(0);
  });
});

describe("resolveSoldAt", () => {
  const storeCreatedAt = new Date("2026-10-21T08:00:00+08:00");
  const receivedAt = new Date("2026-10-21T15:00:00+08:00");
  const fromServer = (ms: number) => new Date(receivedAt.getTime() + ms);

  it("keeps the device time up to 10 minutes ahead of the server, and any time since the store opened", () => {
    expect(resolveSoldAt(fromServer(10 * MINUTE), receivedAt, storeCreatedAt)).toEqual({ soldAt: fromServer(10 * MINUTE), adjusted: false });
    expect(resolveSoldAt(fromServer(-3 * 60 * MINUTE), receivedAt, storeCreatedAt)).toEqual({ soldAt: fromServer(-3 * 60 * MINUTE), adjusted: false });
    const justBefore = new Date(storeCreatedAt.getTime() - MINUTE);
    expect(resolveSoldAt(justBefore, receivedAt, storeCreatedAt)).toEqual({ soldAt: justBefore, adjusted: false });
  });

  it("uses the server time when the device clock is more than 10 minutes ahead", () => {
    expect(resolveSoldAt(fromServer(11 * MINUTE), receivedAt, storeCreatedAt)).toEqual({ soldAt: receivedAt, adjusted: true });
  });

  it("uses the server time for a time from before the store existed", () => {
    const tooEarly = new Date(storeCreatedAt.getTime() - MINUTE - 1000);
    expect(resolveSoldAt(tooEarly, receivedAt, storeCreatedAt)).toEqual({ soldAt: receivedAt, adjusted: true });
  });
});

describe("saleFlags", () => {
  type Line = Parameters<typeof saleFlags>[0]["lines"][number];
  const clean: Line = { productId: "p1", unitPriceCentavos: 1500, currentPriceCentavos: 1500, stockAfter: 4 };
  const custom: Line = { productId: null, unitPriceCentavos: 2000, currentPriceCentavos: null, stockAfter: null };
  const flags = (lines: Line[], extra: { overCreditLimit?: boolean; clockAdjusted?: boolean } = {}) =>
    saleFlags({ lines, overCreditLimit: extra.overCreditLimit ?? false, clockAdjusted: extra.clockAdjusted ?? false });

  it("is empty for a sale with no issues", () => {
    expect(flags([clean, { ...clean, productId: "p2", stockAfter: 0 }])).toEqual([]);
  });

  it("flags a custom item (spec 6.6)", () => {
    expect(flags([clean, custom])).toEqual(["CUSTOM_ITEM"]);
  });

  it("flags a price that differs from the product's current price (spec 6.5)", () => {
    expect(flags([{ ...clean, unitPriceCentavos: 1400 }])).toEqual(["PRICE_CHANGED"]);
  });

  it("flags stock that went below zero (spec 6.3)", () => {
    expect(flags([{ ...clean, stockAfter: -1 }])).toEqual(["NEGATIVE_STOCK"]);
  });

  it("flags utang over the credit limit and an adjusted clock", () => {
    expect(flags([clean], { overCreditLimit: true })).toEqual(["OVER_CREDIT_LIMIT"]);
    expect(flags([clean], { clockAdjusted: true })).toEqual(["CLOCK_ADJUSTED"]);
  });

  it("lists each flag once, sorted", () => {
    const lines = [custom, custom, { ...clean, unitPriceCentavos: 1, stockAfter: -2 }, { ...clean, productId: "p3", unitPriceCentavos: 2, stockAfter: -1 }];
    expect(flags(lines, { overCreditLimit: true, clockAdjusted: true })).toEqual([
      "CLOCK_ADJUSTED",
      "CUSTOM_ITEM",
      "NEGATIVE_STOCK",
      "OVER_CREDIT_LIMIT",
      "PRICE_CHANGED",
    ]);
  });
});
