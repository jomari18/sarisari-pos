import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, testDb } from "./support/db.js";
import { seedStore } from "./support/factories.js";

const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => resetDb(db));

describe("database schema", () => {
  it("deletes all of a store's data when the store is deleted", async () => {
    const t = await seedStore(db);
    await db.sale.create({
      data: {
        id: crypto.randomUUID(),
        storeId: t.store.id,
        cashierId: t.bantay.id,
        receiptNo: 1,
        soldAt: new Date(),
        source: "ONLINE",
        method: "UTANG",
        totalCentavos: 1500,
        customerId: t.customers[0]!.id,
        items: { create: [{ productId: t.products[0]!.id, name: "Chicharon", quantity: 1, unitPriceCentavos: 1500, unitCostCentavos: 1100, lineTotalCentavos: 1500 }] },
      },
    });
    await db.session.create({ data: { userId: t.owner.id, familyId: crypto.randomUUID(), tokenHash: "h1", expiresAt: new Date(Date.now() + 60_000) } });

    await db.store.delete({ where: { id: t.store.id } });

    for (const count of [db.user.count(), db.session.count(), db.category.count(), db.product.count(), db.customer.count(), db.sale.count(), db.saleItem.count(), db.stockMovement.count()]) {
      expect(await count).toBe(0);
    }
  });

  it("refuses two products with the same barcode in one store", async () => {
    const t = await seedStore(db);
    await expect(
      db.product.create({
        data: { storeId: t.store.id, categoryId: t.categories[0]!.id, name: "Copy", barcode: "2000000000015", unit: "pc", priceCentavos: 1, costCentavos: 1, stock: 0, reorderLevel: 0 },
      }),
    ).rejects.toThrow();
  });

  it("allows the same barcode in another store and many products without a barcode", async () => {
    await seedStore(db, { code: "aaaa" });
    const other = await seedStore(db, { code: "bbbb" });
    const extra = { storeId: other.store.id, categoryId: other.categories[0]!.id, unit: "pc", priceCentavos: 1, costCentavos: 1, stock: 0, reorderLevel: 0 };
    await expect(db.product.create({ data: { ...extra, name: "No barcode 1", barcode: null } })).resolves.toBeDefined();
    await expect(db.product.create({ data: { ...extra, name: "No barcode 2", barcode: null } })).resolves.toBeDefined();
    expect(await db.product.count({ where: { barcode: "2000000000015" } })).toBe(2);
  });

  it("keeps receipt numbers unique per store", async () => {
    const t = await seedStore(db);
    const sale = { storeId: t.store.id, cashierId: t.bantay.id, receiptNo: 7, soldAt: new Date(), source: "ONLINE" as const, method: "CASH" as const, totalCentavos: 100 };
    await db.sale.create({ data: { id: crypto.randomUUID(), ...sale } });
    await expect(db.sale.create({ data: { id: crypto.randomUUID(), ...sale } })).rejects.toThrow();
  });
});
