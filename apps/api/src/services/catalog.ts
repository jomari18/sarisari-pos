import type { CatalogSnapshot, CategoryView, ProductView, Role } from "@sari/shared";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Category, Product } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import type { AuthUser } from "./tokens.js";

/** Cost (and so profit) is for the owner only: a bantay's view has no `costCentavos` key at all (spec 7.4). */
export function toProductView(row: Product, role: Role): ProductView {
  const view: ProductView = {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    unit: row.unit,
    priceCentavos: row.priceCentavos,
    stock: row.stock,
    reorderLevel: row.reorderLevel,
    packSize: row.packSize,
    archived: row.archived,
    updatedAt: row.updatedAt.toISOString(),
  };
  return role === "OWNER" ? { ...view, costCentavos: row.costCentavos } : view;
}

export function toCategoryView(row: Category): CategoryView {
  return { id: row.id, name: row.name, archived: row.archived };
}

const productNotFound = () => new AppError("not_found", "This product does not exist.");

/** What the POS keeps on the device for offline selling (spec 9). */
export async function getCatalog(db: Db, user: AuthUser, now: Date): Promise<CatalogSnapshot> {
  const { storeId } = user;
  const [products, categories, customers] = await Promise.all([
    db.product.findMany({ where: { storeId, archived: false }, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { storeId }, orderBy: { name: "asc" } }),
    db.customer.findMany({
      where: { storeId, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, creditLimitCentavos: true, balanceCentavos: true },
    }),
  ]);
  return {
    generatedAt: now.toISOString(),
    products: products.map((row) => toProductView(row, user.role)),
    categories: categories.map(toCategoryView),
    customers,
  };
}

export type ProductQuery = { search?: string; categoryId?: string; status?: "active" | "archived"; lowStock?: boolean };

export async function listProducts(db: Db, user: AuthUser, query: ProductQuery): Promise<ProductView[]> {
  const ids = query.search ? await searchProductIds(db, user.storeId, query.search) : undefined;
  const rows = await db.product.findMany({
    where: {
      storeId: user.storeId,
      archived: query.status === "archived",
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(ids ? { id: { in: ids } } : {}),
      ...(query.lowStock ? { stock: { lte: db.product.fields.reorderLevel } } : {}),
    },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => toProductView(row, user.role));
}

/** Case- and accent-insensitive match on name or brand: "pina" finds "Piña". */
async function searchProductIds(db: Db, storeId: string, search: string): Promise<string[]> {
  // ILIKE reads % and _ as wildcards, so a typed % or _ is escaped to match itself.
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Product"
    WHERE "storeId" = ${storeId}::uuid
      AND (unaccent("name") ILIKE unaccent(${pattern}) OR unaccent(coalesce("brand", '')) ILIKE unaccent(${pattern}))`;
  return rows.map((row) => row.id);
}

/** Archived products are found too, so the owner can bring one back instead of adding a duplicate barcode. */
export async function findByBarcode(db: Db, user: AuthUser, code: string): Promise<ProductView> {
  const row = await db.product.findFirst({ where: { storeId: user.storeId, barcode: code } });
  if (!row) throw new AppError("not_found", "No product has this barcode.");
  return toProductView(row, user.role);
}

/** Another store's product answers exactly like a product that does not exist (spec 6.10). */
export async function getProduct(db: Db, user: AuthUser, id: string): Promise<ProductView> {
  if (!z.uuid().safeParse(id).success) throw productNotFound();
  const row = await db.product.findFirst({ where: { id, storeId: user.storeId } });
  if (!row) throw productNotFound();
  return toProductView(row, user.role);
}

export async function listCategories(db: Db, user: AuthUser): Promise<CategoryView[]> {
  const rows = await db.category.findMany({ where: { storeId: user.storeId }, orderBy: { name: "asc" } });
  return rows.map(toCategoryView);
}
