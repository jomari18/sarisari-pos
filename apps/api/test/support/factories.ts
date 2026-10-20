import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { Db } from "../../src/db.js";

export const OWNER_PASSWORD = "owner-pass-1234";
export const BANTAY_PIN = "482915";

const HOUR = 60 * 60 * 1000;

export type TestStore = Awaited<ReturnType<typeof seedStore>>;

/**
 * A small store for API tests: an owner, a bantay, two categories, three products
 * (one already out of stock) and two suki (one with no utang allowed).
 */
export async function seedStore(db: Db, opts: { code?: string; expiresAt?: Date; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const code = opts.code ?? randomBytes(3).toString("hex").slice(0, 4);
  const store = await db.store.create({
    data: { code, name: `Test Store ${code}`, expiresAt: opts.expiresAt ?? new Date(now.getTime() + 24 * HOUR), createdAt: now },
  });
  const owner = await db.user.create({
    data: {
      storeId: store.id,
      role: "OWNER",
      username: `mayari.${code}`,
      displayName: "Mang Ben",
      secretHash: await hash(OWNER_PASSWORD),
      secretKind: "PASSWORD",
    },
  });
  const bantay = await db.user.create({
    data: {
      storeId: store.id,
      role: "BANTAY",
      username: `nena.${code}`,
      displayName: "Nena",
      secretHash: await hash(BANTAY_PIN),
      secretKind: "PIN",
    },
  });
  const snacks = await db.category.create({ data: { storeId: store.id, name: "Snacks" } });
  const drinks = await db.category.create({ data: { storeId: store.id, name: "Drinks" } });
  const productRows = [
    { categoryId: snacks.id, name: "Chicharon", brand: "Sikat", barcode: "2000000000015", unit: "pack", priceCentavos: 1500, costCentavos: 1100, stock: 10, reorderLevel: 3 },
    { categoryId: drinks.id, name: "Softdrink 1.5L", brand: "Bayani", barcode: "2000000000022", unit: "bottle", priceCentavos: 7500, costCentavos: 6200, stock: 5, reorderLevel: 2 },
    { categoryId: snacks.id, name: "Kape 3-in-1", brand: null, barcode: null, unit: "sachet", priceCentavos: 1200, costCentavos: 900, stock: 0, reorderLevel: 10, packSize: 30 },
  ];
  const products = [];
  for (const row of productRows) {
    const product = await db.product.create({ data: { storeId: store.id, ...row } });
    await db.stockMovement.create({
      data: { storeId: store.id, productId: product.id, change: row.stock, reason: "RESTOCK", userId: owner.id, stockAfter: row.stock },
    });
    products.push({ id: product.id, priceCentavos: product.priceCentavos, costCentavos: product.costCentavos, stock: product.stock });
  }
  const rosa = await db.customer.create({ data: { storeId: store.id, name: "Aling Rosa", creditLimitCentavos: 50000 } });
  const jun = await db.customer.create({ data: { storeId: store.id, name: "Kuya Jun", creditLimitCentavos: 0 } });
  return {
    store,
    owner,
    bantay,
    categories: [snacks, drinks],
    products,
    customers: [rosa, jun].map((c) => ({ id: c.id, creditLimitCentavos: c.creditLimitCentavos })),
  };
}
