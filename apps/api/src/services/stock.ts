import type { AdjustInput, ProductView, RestockInput, StockMovementView } from "@sari/shared";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Product } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { toProductView } from "./catalog.js";
import type { AuthUser } from "./tokens.js";

const HISTORY_LIMIT = 200;

/** The owner works on their own store's products; any other id answers as if it did not exist (spec 6.10). */
async function ownProduct(db: Db, user: AuthUser, id: string): Promise<Product> {
  const row = z.uuid().safeParse(id).success ? await db.product.findFirst({ where: { id, storeId: user.storeId } }) : null;
  if (!row) throw new AppError("not_found", "This product does not exist.");
  return row;
}

/** "2 boxes of 20 + 5 pieces": how the delivery was counted, kept in the stock history. */
function restockNote(boxes: number | undefined, pieces: number | undefined, packSize: number): string {
  const parts: string[] = [];
  if (boxes) parts.push(`${boxes} ${boxes === 1 ? "box" : "boxes"} of ${packSize}`);
  if (pieces) parts.push(`${pieces} ${pieces === 1 ? "piece" : "pieces"}`);
  return parts.join(" + ");
}

/**
 * Spec 6.9: a delivery arrives as boxes × pack size and/or loose pieces, and its cost per piece becomes the
 * product's cost. The cost is a product detail, so a restock updates updatedAt like any edit.
 */
export async function restock(db: Db, user: AuthUser, input: RestockInput, now: Date): Promise<ProductView> {
  const product = await ownProduct(db, user, input.productId);
  const quantity = (input.boxes ?? 0) * product.packSize + (input.pieces ?? 0);
  const note = restockNote(input.boxes, input.pieces, product.packSize);
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.product.update({ where: { id: product.id }, data: { stock: { increment: quantity }, costCentavos: input.unitCostCentavos } });
    await tx.stockMovement.create({
      data: { storeId: user.storeId, productId: product.id, change: quantity, reason: "RESTOCK", userId: user.userId, note, stockAfter: row.stock, createdAt: now },
    });
    return row;
  });
  return toProductView(updated, user.role);
}

/**
 * A count records the difference between what is on the shelf and what was recorded (COUNT); spoilage and
 * expired goods take stock away with their reason. Neither changes a product detail, so updatedAt stays.
 */
export async function adjustStock(db: Db, user: AuthUser, input: AdjustInput, now: Date): Promise<ProductView> {
  const product = await ownProduct(db, user, input.productId);
  await db.$transaction(async (tx) => {
    let change: number;
    let stockAfter: number;
    if ("counted" in input) {
      // Lock the row, so a sale at the same moment is counted before or after, never in between.
      const [locked] = await tx.$queryRaw<{ stock: number }[]>`SELECT "stock" FROM "Product" WHERE "id" = ${product.id}::uuid FOR UPDATE`;
      change = input.counted - locked!.stock;
      stockAfter = input.counted;
      await tx.$executeRaw`UPDATE "Product" SET "stock" = ${input.counted} WHERE "id" = ${product.id}::uuid`;
    } else {
      const [row] = await tx.$queryRaw<{ stock: number }[]>`
        UPDATE "Product" SET "stock" = "stock" - ${input.quantity} WHERE "id" = ${product.id}::uuid RETURNING "stock"`;
      change = -input.quantity;
      stockAfter = row!.stock;
    }
    await tx.stockMovement.create({
      data: {
        storeId: user.storeId,
        productId: product.id,
        change,
        reason: "counted" in input ? "COUNT" : input.reason,
        userId: user.userId,
        note: input.note ?? null,
        stockAfter,
        createdAt: now,
      },
    });
  });
  return toProductView(await db.product.findUniqueOrThrow({ where: { id: product.id } }), user.role);
}

/** Stock history, newest first: what changed, why, who, and the stock after it. */
export async function listMovements(db: Db, user: AuthUser, productId: string): Promise<StockMovementView[]> {
  const product = await ownProduct(db, user, productId);
  const rows = await db.stockMovement.findMany({
    where: { productId: product.id },
    include: { sale: { select: { id: true, receiptNo: true } }, user: { select: { id: true, displayName: true } } },
    orderBy: [{ createdAt: "desc" }, { seq: "desc" }],
    take: HISTORY_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    change: row.change,
    reason: row.reason,
    stockAfter: row.stockAfter,
    note: row.note,
    sale: row.sale,
    user: row.user,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Active products at or below their reorder level, biggest shortage first, plus a list to copy for a supplier. */
export async function restockList(db: Db, user: AuthUser): Promise<{ items: ProductView[]; text: string }> {
  const rows = await db.product.findMany({
    where: { storeId: user.storeId, archived: false, stock: { lte: db.product.fields.reorderLevel } },
    orderBy: { name: "asc" },
  });
  rows.sort((a, b) => b.reorderLevel - b.stock - (a.reorderLevel - a.stock));
  const text = rows.map((p) => `- ${p.name}${p.brand ? ` (${p.brand})` : ""}: ${p.stock} left, reorder at ${p.reorderLevel}`).join("\n");
  return { items: rows.map((row) => toProductView(row, user.role)), text };
}
