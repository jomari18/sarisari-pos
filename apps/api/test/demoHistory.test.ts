import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generateDemoData } from "../src/seed/generateDemo.js";
import { insertHistory } from "../src/services/demo.js";
import { resetDb, testDb } from "./support/db.js";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

const NOW = new Date("2026-10-21T10:00:00+08:00");

/** A bare store with its owner and bantay, the way createDemoStore makes them before the history goes in. */
async function bareStore() {
  const store = await db.store.create({ data: { code: "h1st", name: "Tindahan ni Mang Ben", expiresAt: new Date(NOW.getTime() + 86_400_000) } });
  const owner = await db.user.create({ data: { storeId: store.id, role: "OWNER", username: "mayari.h1st", displayName: "Mang Ben", secretHash: "x", secretKind: "PASSWORD" } });
  const bantay = await db.user.create({ data: { storeId: store.id, role: "BANTAY", username: "nena.h1st", displayName: "Nena", secretHash: "x", secretKind: "PIN" } });
  return { storeId: store.id, users: { OWNER: owner.id, BANTAY: bantay.id } };
}

describe("a demo store's history", () => {
  // The history is most of a demo store's rows; this pins every column of every row, and the order the
  // stock history and the utang ledger are read in, whatever way the rows are written.
  it("stores every generated row as generated, stock movements and utang entries in order", async () => {
    const data = generateDemoData({ seed: 7, now: NOW });
    const { storeId, users } = await bareStore();
    const roleOf = (id: string) => (id === users.OWNER ? "OWNER" : "BANTAY");

    await db.$transaction((tx) => insertHistory(tx, storeId, users, data), { timeout: 60_000 });

    const categories = await db.category.findMany({ where: { storeId } });
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    expect([...categoryName.values()].sort()).toEqual(data.categories.map((c) => c.name).sort());

    const products = await db.product.findMany({ where: { storeId } });
    const productName = new Map(products.map((p) => [p.id, p.name]));
    expect(
      products.map(({ categoryId, name, brand, barcode, unit, priceCentavos, costCentavos, stock, reorderLevel, packSize }) => ({
        category: categoryName.get(categoryId),
        name,
        brand,
        barcode,
        unit,
        priceCentavos,
        costCentavos,
        stock,
        reorderLevel,
        packSize,
      })),
    ).toEqual(
      expect.arrayContaining(
        data.products.map(({ category, name, brand, barcode, unit, priceCentavos, costCentavos, stock, reorderLevel, packSize }) => ({
          category: data.categories[category]!.name,
          name,
          brand,
          barcode,
          unit,
          priceCentavos,
          costCentavos,
          stock,
          reorderLevel,
          packSize,
        })),
      ),
    );
    expect(products).toHaveLength(data.products.length);

    const customers = await db.customer.findMany({ where: { storeId } });
    const customerName = new Map(customers.map((c) => [c.id, c.name]));
    expect(customers.map(({ name, phone, creditLimitCentavos, balanceCentavos, createdAt }) => ({ name, phone, creditLimitCentavos, balanceCentavos, createdAt }))).toEqual(
      expect.arrayContaining(data.customers.map(({ name, phone, creditLimitCentavos, balanceCentavos, createdAt }) => ({ name, phone, creditLimitCentavos, balanceCentavos, createdAt }))),
    );
    expect(customers).toHaveLength(data.customers.length);

    const sales = await db.sale.findMany({ where: { storeId }, orderBy: { receiptNo: "asc" }, include: { items: { orderBy: { line: "asc" } } } });
    const receiptOf = new Map(sales.map((s) => [s.id, s.receiptNo]));
    expect(
      sales.map((s) => ({
        receiptNo: s.receiptNo,
        soldAt: s.soldAt,
        receivedAt: s.receivedAt,
        source: s.source,
        cashier: roleOf(s.cashierId),
        method: s.method,
        totalCentavos: s.totalCentavos,
        tenderedCentavos: s.tenderedCentavos,
        changeCentavos: s.changeCentavos,
        gcashRef: s.gcashRef,
        customer: s.customerId === null ? null : customerName.get(s.customerId),
        flags: s.flags,
        voidedAt: s.voidedAt,
        lines: s.items.map((item) => ({
          product: item.productId === null ? null : productName.get(item.productId),
          name: item.name,
          quantity: item.quantity,
          unitPriceCentavos: item.unitPriceCentavos,
          unitCostCentavos: item.unitCostCentavos,
          lineTotalCentavos: item.lineTotalCentavos,
        })),
      })),
    ).toEqual(
      data.sales.map((s) => ({
        receiptNo: s.receiptNo,
        soldAt: s.soldAt,
        receivedAt: s.soldAt,
        source: "ONLINE",
        cashier: s.cashier,
        method: s.method,
        totalCentavos: s.totalCentavos,
        tenderedCentavos: s.tenderedCentavos,
        changeCentavos: s.changeCentavos,
        gcashRef: s.gcashRef,
        customer: s.customer === null ? null : data.customers[s.customer]!.name,
        flags: [],
        voidedAt: null,
        lines: s.lines.map((line) => ({
          product: data.products[line.product]!.name,
          name: line.name,
          quantity: line.quantity,
          unitPriceCentavos: line.unitPriceCentavos,
          unitCostCentavos: line.unitCostCentavos,
          lineTotalCentavos: line.lineTotalCentavos,
        })),
      })),
    );

    const movements = await db.stockMovement.findMany({ where: { storeId }, orderBy: { seq: "asc" } });
    expect(
      movements.map((m) => ({
        product: productName.get(m.productId),
        change: m.change,
        reason: m.reason,
        sale: m.saleId === null ? null : receiptOf.get(m.saleId),
        user: roleOf(m.userId),
        note: m.note,
        stockAfter: m.stockAfter,
        createdAt: m.createdAt,
      })),
    ).toEqual(
      data.movements.map((m) => ({
        product: data.products[m.product]!.name,
        change: m.change,
        reason: m.reason,
        sale: m.sale === null ? null : data.sales[m.sale]!.receiptNo,
        user: m.user,
        note: m.note,
        stockAfter: m.stockAfter,
        createdAt: m.createdAt,
      })),
    );

    const entries = await db.utangEntry.findMany({ where: { storeId }, orderBy: { seq: "asc" } });
    expect(
      entries.map((e) => ({
        customer: customerName.get(e.customerId),
        kind: e.kind,
        amountCentavos: e.amountCentavos,
        method: e.method,
        sale: e.saleId === null ? null : receiptOf.get(e.saleId),
        user: roleOf(e.userId),
        note: e.note,
        balanceAfter: e.balanceAfter,
        createdAt: e.createdAt,
      })),
    ).toEqual(
      data.utangEntries.map((e) => ({
        customer: data.customers[e.customer]!.name,
        kind: e.kind,
        amountCentavos: e.amountCentavos,
        method: e.method,
        sale: e.sale === null ? null : data.sales[e.sale]!.receiptNo,
        user: e.user,
        note: e.note,
        balanceAfter: e.balanceAfter,
        createdAt: e.createdAt,
      })),
    );
  }, 120_000);
});
