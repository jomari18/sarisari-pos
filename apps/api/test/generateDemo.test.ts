import { demoBarcodes, isValidEan13, manilaDate, manilaHour } from "@sari/shared";
import { describe, expect, it } from "vitest";
import { generateDemoData } from "../src/seed/generateDemo.js";
import { mulberry32 } from "../src/seed/random.js";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-21T14:30:00+08:00");
const data = generateDemoData({ seed: 20261021, now });

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const countBy = <T, K>(items: T[], key: (item: T) => K) => {
  const counts = new Map<K, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
};
const inTimeOrder = (times: Date[]) => times.every((time, i) => i === 0 || time >= times[i - 1]!);

describe("mulberry32", () => {
  it("repeats the same numbers for a seed and stays within [0, 1)", () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    const numbers = Array.from({ length: 1000 }, () => first());
    expect(Array.from({ length: 1000 }, () => second())).toEqual(numbers);
    expect(numbers.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(new Set(numbers).size).toBeGreaterThan(990);
  });
});

describe("generateDemoData", () => {
  it("numbers barcodes exactly as the Sample barcodes page shows them", () => {
    const seeded = data.products.filter((product) => product.barcode).map(({ name, barcode }) => ({ name, barcode }));
    expect(seeded).toEqual(demoBarcodes().map(({ name, barcode }) => ({ name, barcode })));
  });

  it("gives the same store for the same seed and a different one for another seed", () => {
    expect(generateDemoData({ seed: 20261021, now })).toEqual(data);
    expect(generateDemoData({ seed: 7, now })).not.toEqual(data);
  });

  it("makes 8 categories, 60 products and 12 suki (spec 7.5)", () => {
    expect(data.categories).toHaveLength(8);
    expect(data.products).toHaveLength(60);
    expect(data.customers).toHaveLength(12);
    expect(new Set(data.products.map((p) => p.category)).size).toBe(8);
  });

  it("sells on each of the 30 Manila days before today, 25 to 60 sales a day, never after now", () => {
    for (const at of [now, new Date("2026-03-01T00:05:00+08:00")]) {
      const { sales } = generateDemoData({ seed: 99, now: at });
      const perDay = countBy(sales, (s) => manilaDate(s.soldAt));
      expect(perDay.size).toBe(30);
      expect([...perDay.values()].every((n) => n >= 25 && n <= 60)).toBe(true);
      expect(perDay.has(manilaDate(at))).toBe(false);
      expect(manilaDate(new Date(at.getTime() - 30 * DAY))).toBe([...perDay.keys()].sort()[0]);
      expect(sales.every((s) => s.soldAt <= at)).toBe(true);
    }
  });

  it("gives every barcoded product a unique in-store EAN-13 that starts with 2", () => {
    const codes = data.products.map((p) => p.barcode).filter((code): code is string => code !== null);
    expect(codes.length).toBeGreaterThanOrEqual(50);
    expect(codes.every((code) => isValidEan13(code) && code.startsWith("2"))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("restocks every product once, 31 days before now, before any sale", () => {
    const restocks = data.movements.filter((m) => m.reason === "RESTOCK");
    expect(restocks).toHaveLength(60);
    expect(new Set(restocks.map((m) => m.product)).size).toBe(60);
    expect(restocks.every((m) => m.createdAt.getTime() === now.getTime() - 31 * DAY)).toBe(true);
    expect(restocks.every((m) => m.createdAt < data.sales[0]!.soldAt)).toBe(true);
  });

  it("keeps each product's stock equal to the sum of its movements and never below zero", () => {
    expect(inTimeOrder(data.movements.map((m) => m.createdAt))).toBe(true);
    data.products.forEach((product, i) => {
      const moves = data.movements.filter((m) => m.product === i);
      expect(product.stock).toBe(sum(moves.map((m) => m.change)));
      let running = 0;
      for (const move of moves) {
        running += move.change;
        expect(move.stockAfter).toBe(running);
        expect(running).toBeGreaterThanOrEqual(0);
      }
    });
    expect(data.products.some((p) => p.stock <= p.reorderLevel)).toBe(true);
    expect(data.products.some((p) => p.stock > p.reorderLevel)).toBe(true);
  });

  it("writes one SALE movement per sale line, by the sale's cashier", () => {
    data.sales.forEach((sale, i) => {
      const moves = data.movements.filter((m) => m.sale === i);
      expect(moves).toEqual(
        sale.lines.map((line) =>
          expect.objectContaining({ product: line.product, change: -line.quantity, reason: "SALE", user: sale.cashier, createdAt: sale.soldAt }),
        ),
      );
    });
  });

  it("adds up every sale, with change for cash and a reference for GCash", () => {
    for (const sale of data.sales) {
      expect(sale.lines.length).toBeGreaterThanOrEqual(1);
      for (const line of sale.lines) expect(line.lineTotalCentavos).toBe(line.quantity * line.unitPriceCentavos);
      expect(sale.totalCentavos).toBe(sum(sale.lines.map((l) => l.lineTotalCentavos)));
      if (sale.method === "CASH") {
        expect(sale.tenderedCentavos).toBeGreaterThanOrEqual(sale.totalCentavos);
        expect(sale.changeCentavos).toBe(sale.tenderedCentavos! - sale.totalCentavos);
      } else {
        expect(sale.tenderedCentavos).toBeNull();
        expect(sale.changeCentavos).toBeNull();
      }
      expect(sale.gcashRef === null).toBe(sale.method !== "GCASH");
    }
    const methods = countBy(data.sales, (s) => s.method);
    expect(methods.get("CASH")! / data.sales.length).toBeGreaterThan(0.6);
    expect(methods.get("GCASH")).toBeGreaterThan(0);
  });

  it("keeps each suki's balance equal to the sum of their ledger, between 0 and the credit limit", () => {
    expect(inTimeOrder(data.utangEntries.map((e) => e.createdAt))).toBe(true);
    data.customers.forEach((customer, i) => {
      const entries = data.utangEntries.filter((e) => e.customer === i);
      expect(customer.balanceCentavos).toBe(sum(entries.map((e) => e.amountCentavos)));
      let running = 0;
      for (const entry of entries) {
        running += entry.amountCentavos;
        expect(entry.balanceAfter).toBe(running);
        expect(running).toBeGreaterThanOrEqual(0);
        expect(running).toBeLessThanOrEqual(customer.creditLimitCentavos);
      }
    });
    expect(data.customers.some((c) => c.creditLimitCentavos === 0)).toBe(true);
    expect(data.customers.some((c) => c.balanceCentavos > 0)).toBe(true);
    expect(data.utangEntries.some((e) => e.kind === "PAYMENT" && e.amountCentavos < 0 && e.method !== null)).toBe(true);
  });

  it("charges utang only to suki with a credit limit, once per utang sale", () => {
    const utangSales = data.sales.flatMap((sale, i) => (sale.method === "UTANG" ? [{ sale, i }] : []));
    expect(utangSales.length).toBeGreaterThan(0);
    for (const { sale, i } of utangSales) {
      expect(data.customers[sale.customer!]!.creditLimitCentavos).toBeGreaterThan(0);
      expect(data.utangEntries.filter((e) => e.sale === i)).toEqual([
        expect.objectContaining({ kind: "CHARGE", customer: sale.customer, amountCentavos: sale.totalCentavos, createdAt: sale.soldAt }),
      ]);
    }
    expect(data.sales.filter((s) => s.method !== "UTANG").every((s) => s.customer === null)).toBe(true);
  });

  it("is busiest in the evening: the top 3 Manila hours fall within 16:00–20:59", () => {
    const perHour = countBy(data.sales, (s) => manilaHour(s.soldAt));
    const top = [...perHour.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    expect(top.every(([hour]) => hour >= 16 && hour <= 20)).toBe(true);
  });

  it("numbers receipts 1..N in soldAt order", () => {
    expect(data.sales.map((s) => s.receiptNo)).toEqual(data.sales.map((_, i) => i + 1));
    expect(inTimeOrder(data.sales.map((s) => s.soldAt))).toBe(true);
  });
});
