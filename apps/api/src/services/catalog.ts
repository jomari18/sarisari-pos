import type { CatalogSnapshot, CategoryInput, CategoryPatch, CategoryView, ProductInput, ProductPatch, ProductView, Role } from "@sari/shared";
import { z } from "zod";
import type { Db } from "../db.js";
import { Prisma, type Category, type Product } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { containsPattern } from "./search.js";
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
  const pattern = containsPattern(search);
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
async function findProduct(db: Db, user: AuthUser, id: string): Promise<Product> {
  if (!z.uuid().safeParse(id).success) throw productNotFound();
  const row = await db.product.findFirst({ where: { id, storeId: user.storeId } });
  if (!row) throw productNotFound();
  return row;
}

export async function getProduct(db: Db, user: AuthUser, id: string): Promise<ProductView> {
  return toProductView(await findProduct(db, user, id), user.role);
}

export async function listCategories(db: Db, user: AuthUser): Promise<CategoryView[]> {
  const rows = await db.category.findMany({ where: { storeId: user.storeId }, orderBy: { name: "asc" } });
  return rows.map(toCategoryView);
}

// Writes (spec 8.3): the owner only, which the routes enforce.

const MAX_PRODUCTS = 300;

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
const barcodeTaken = () => new AppError("invalid_input", "Another product already has this barcode.", { field: "barcode" });
const categoryNameTaken = () => new AppError("invalid_input", "You already have a category with this name.", { field: "name" });

async function assertOwnCategory(db: Db, storeId: string, categoryId: string): Promise<void> {
  if ((await db.category.count({ where: { id: categoryId, storeId } })) === 0) {
    throw new AppError("invalid_input", "Choose one of your categories.", { field: "categoryId" });
  }
}

/** Barcodes are unique within a store; another store may use the same code. */
async function assertBarcodeFree(db: Db, storeId: string, barcode: string | null | undefined, exceptId?: string): Promise<void> {
  if (!barcode) return;
  const taken = await db.product.count({ where: { storeId, barcode, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
  if (taken > 0) throw barcodeTaken();
}

/** "snacks" and "Snacks" are the same category to a person, so names are compared without case. */
async function assertCategoryNameFree(db: Db, storeId: string, name: string, exceptId?: string): Promise<void> {
  const taken = await db.category.count({
    where: { storeId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (taken > 0) throw categoryNameTaken();
}

/** A new product starts with no stock; stock arrives with a restock. At most 300 per store (spec 6.11). */
export async function createProduct(db: Db, user: AuthUser, input: ProductInput): Promise<ProductView> {
  const { storeId } = user;
  if ((await db.product.count({ where: { storeId } })) >= MAX_PRODUCTS) {
    throw new AppError("limit_reached", "A demo store can have up to 300 products. Edit or archive one you no longer sell.");
  }
  await assertOwnCategory(db, storeId, input.categoryId);
  await assertBarcodeFree(db, storeId, input.barcode);
  try {
    const row = await db.product.create({
      data: {
        storeId,
        categoryId: input.categoryId,
        name: input.name,
        brand: input.brand ?? null,
        barcode: input.barcode ?? null,
        unit: input.unit,
        priceCentavos: input.priceCentavos,
        costCentavos: input.costCentavos,
        stock: 0,
        reorderLevel: input.reorderLevel,
        packSize: input.packSize,
      },
    });
    return toProductView(row, user.role);
  } catch (err) {
    throw isUniqueViolation(err) ? barcodeTaken() : err;
  }
}

/**
 * Changes only the copy the editor loaded: if someone saved the product since, the edit is refused with
 * stale_edit (spec 8.3). Sales change stock without touching updatedAt, so selling never makes a copy old.
 */
export async function updateProduct(db: Db, user: AuthUser, id: string, patch: ProductPatch): Promise<ProductView> {
  const current = await findProduct(db, user, id);
  const { expectedUpdatedAt, ...fields } = patch;
  if (fields.categoryId) await assertOwnCategory(db, user.storeId, fields.categoryId);
  await assertBarcodeFree(db, user.storeId, fields.barcode, current.id);
  let count: number;
  try {
    ({ count } = await db.product.updateMany({ where: { id: current.id, updatedAt: new Date(expectedUpdatedAt) }, data: fields }));
  } catch (err) {
    throw isUniqueViolation(err) ? barcodeTaken() : err;
  }
  if (count === 0) {
    throw new AppError("stale_edit", "Someone saved this product while you were editing it. Reload it, then make your change again.");
  }
  return toProductView(await db.product.findUniqueOrThrow({ where: { id: current.id } }), user.role);
}

/** Products are archived, never deleted, so their history stays complete (spec 5). */
export async function setArchived(db: Db, user: AuthUser, id: string, archived: boolean): Promise<ProductView> {
  const current = await findProduct(db, user, id);
  return toProductView(await db.product.update({ where: { id: current.id }, data: { archived } }), user.role);
}

export async function createCategory(db: Db, user: AuthUser, input: CategoryInput): Promise<CategoryView> {
  await assertCategoryNameFree(db, user.storeId, input.name);
  try {
    return toCategoryView(await db.category.create({ data: { storeId: user.storeId, name: input.name } }));
  } catch (err) {
    throw isUniqueViolation(err) ? categoryNameTaken() : err;
  }
}

export async function updateCategory(db: Db, user: AuthUser, id: string, patch: CategoryPatch): Promise<CategoryView> {
  if (!z.uuid().safeParse(id).success) throw categoryNotFound();
  const current = await db.category.findFirst({ where: { id, storeId: user.storeId } });
  if (!current) throw categoryNotFound();
  if (patch.name !== undefined) await assertCategoryNameFree(db, user.storeId, patch.name, current.id);
  try {
    return toCategoryView(await db.category.update({ where: { id: current.id }, data: patch }));
  } catch (err) {
    throw isUniqueViolation(err) ? categoryNameTaken() : err;
  }
}

const categoryNotFound = () => new AppError("not_found", "This category does not exist.");
