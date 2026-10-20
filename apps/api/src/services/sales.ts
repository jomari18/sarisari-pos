import { manilaDate, manilaDayStart, type SaleInput, type SaleView } from "@sari/shared";
import { z } from "zod";
import type { Db } from "../db.js";
import { Prisma, type Product } from "../generated/prisma/client.js";
import { lineTotal, resolveSoldAt, saleFlags, saleTotal } from "../domain/saleRules.js";
import { AppError } from "../http/errors.js";
import { SALE_INCLUDE, toSaleView } from "./saleView.js";
import type { AuthUser } from "./tokens.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CREDIT_LIMIT_MESSAGE = "This suki has reached their utang limit. Ask for cash or ask the owner to raise the limit.";

export type SaleMode = "online" | "sync";
type Tx = Prisma.TransactionClient;
type Line = { item: SaleInput["items"][number]; product: Product | null; stockAfter: number | null };

const saleNotFound = () => new AppError("not_found", "This sale does not exist.");
const unitPrice = (item: Line["item"]) => ("custom" in item ? item.custom.unitPriceCentavos : item.unitPriceCentavos);

/**
 * Records a sale all-or-nothing (spec 6.1) and idempotently by its client id (spec 6.2). Online, an
 * archived product or utang over the limit is refused; a synced offline sale is kept and flagged instead.
 */
export async function createSale(db: Db, user: AuthUser, input: SaleInput, mode: SaleMode, now: Date): Promise<{ sale: SaleView; duplicate: boolean }> {
  const stored = await storedSale(db, user, input.id);
  if (stored) return { sale: stored, duplicate: true };

  // The server recomputes the total from the lines and refuses a mismatch (spec 8.4).
  const total = saleTotal(input.items.map((item) => ({ quantity: item.quantity, unitPriceCentavos: unitPrice(item) })));
  if (total !== input.totalCentavos) throw new AppError("invalid_input", "The total does not match the items.", { field: "totalCentavos" });

  try {
    await db.$transaction((tx) => recordSale(tx, user, input, total, mode, now), { maxWait: 5_000, timeout: 15_000 });
  } catch (err) {
    // The same id was recorded by a request that ran at the same time: answer with that sale.
    const sameId = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
    const winner = sameId ? await storedSale(db, user, input.id) : null;
    if (!winner) throw err;
    return { sale: winner, duplicate: true };
  }
  return { sale: (await storedSale(db, user, input.id))!, duplicate: false };
}

/** The stored sale with this id. An id already used by another store is refused without revealing that sale. */
async function storedSale(db: Db, user: AuthUser, id: string): Promise<SaleView | null> {
  const row = await db.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
  if (!row) return null;
  if (row.storeId !== user.storeId) throw new AppError("invalid_input", "This sale id is already in use.", { field: "id" });
  return toSaleView(row);
}

async function recordSale(tx: Tx, user: AuthUser, input: SaleInput, total: number, mode: SaleMode, now: Date): Promise<void> {
  const { storeId } = user;
  // Taking the receipt number locks the store row, so a store's sales are recorded one at a time.
  const store = await tx.store.update({ where: { id: storeId }, data: { nextReceiptNo: { increment: 1 } } });
  const receiptNo = store.nextReceiptNo - 1;

  const productIds = [...new Set(input.items.flatMap((item) => ("productId" in item ? [item.productId] : [])))];
  const products = new Map((await tx.product.findMany({ where: { storeId, id: { in: productIds } } })).map((p) => [p.id, p]));
  input.items.forEach((item, i) => {
    if (!("productId" in item)) return;
    const product = products.get(item.productId);
    const field = `items.${i}.productId`;
    if (!product) throw new AppError("invalid_input", "This product is not in your store.", { field });
    if (product.archived && mode === "online") {
      throw new AppError("invalid_input", `${product.name} is archived. Ask the owner to bring it back before selling it.`, { field });
    }
  });

  // Stock never blocks a sale (spec 6.3). A plain UPDATE … RETURNING is safe under concurrent sales and,
  // unlike a Prisma update, leaves updatedAt alone: that timestamp guards edits of the product's details.
  const lines: Line[] = [];
  for (const item of input.items) {
    if ("custom" in item) {
      lines.push({ item, product: null, stockAfter: null });
      continue;
    }
    const [row] = await tx.$queryRaw<{ stock: number }[]>`
      UPDATE "Product" SET "stock" = "stock" - ${item.quantity} WHERE "id" = ${item.productId}::uuid RETURNING "stock"`;
    lines.push({ item, product: products.get(item.productId)!, stockAfter: row!.stock });
  }

  let overCreditLimit = false;
  let customerId: string | null = null;
  let balanceAfter = 0;
  if (input.payment.method === "UTANG") {
    const customer = await tx.customer.findFirst({ where: { id: input.payment.customerId, storeId } });
    if (!customer || (customer.archived && mode === "online")) {
      throw new AppError("invalid_input", "This suki is not in your store.", { field: "payment.customerId" });
    }
    const updated = await tx.customer.update({ where: { id: customer.id }, data: { balanceCentavos: { increment: total } } });
    overCreditLimit = updated.balanceCentavos > customer.creditLimitCentavos;
    if (overCreditLimit && mode === "online") throw new AppError("credit_limit_exceeded", CREDIT_LIMIT_MESSAGE);
    customerId = customer.id;
    balanceAfter = updated.balanceCentavos;
  }

  const { soldAt, adjusted } = resolveSoldAt(new Date(input.soldAt), now, store.createdAt);
  const flags = saleFlags({
    lines: lines.map(({ item, product, stockAfter }) => ({
      productId: product?.id ?? null,
      unitPriceCentavos: unitPrice(item),
      currentPriceCentavos: product?.priceCentavos ?? null,
      stockAfter,
    })),
    overCreditLimit,
    clockAdjusted: adjusted,
  });

  const { payment } = input;
  await tx.sale.create({
    data: {
      id: input.id,
      storeId,
      cashierId: user.userId,
      receiptNo,
      soldAt,
      receivedAt: now,
      source: mode === "online" ? "ONLINE" : "OFFLINE_SYNC",
      method: payment.method,
      totalCentavos: total,
      tenderedCentavos: payment.method === "CASH" ? payment.tenderedCentavos : null,
      changeCentavos: payment.method === "CASH" ? payment.tenderedCentavos - total : null,
      gcashRef: payment.method === "GCASH" && payment.gcashRef ? payment.gcashRef : null,
      customerId,
      flags,
      items: {
        createMany: {
          // Names, prices and costs are copied, so later product edits never change a past receipt.
          data: lines.map(({ item, product }, line) => ({
            line,
            productId: product?.id ?? null,
            name: product?.name ?? ("custom" in item ? item.custom.name : ""),
            quantity: item.quantity,
            unitPriceCentavos: unitPrice(item),
            unitCostCentavos: product?.costCentavos ?? null,
            lineTotalCentavos: lineTotal(item.quantity, unitPrice(item)),
          })),
        },
      },
    },
  });

  // Movements and ledger entries are dated when recorded, so their running totals read in order.
  await tx.stockMovement.createMany({
    data: lines.flatMap(({ item, product, stockAfter }) =>
      product ? [{ storeId, productId: product.id, change: -item.quantity, reason: "SALE" as const, saleId: input.id, userId: user.userId, stockAfter: stockAfter!, createdAt: now }] : [],
    ),
  });
  if (customerId) {
    await tx.utangEntry.create({
      data: { storeId, customerId, kind: "CHARGE", amountCentavos: total, saleId: input.id, userId: user.userId, balanceAfter, createdAt: now },
    });
  }
}

export type SalesQuery = { date?: string; cashierId?: string };

/** Spec 8.4: the owner sees any Manila day and cashier; a bantay sees only their own sales of today. */
export async function listSales(db: Db, user: AuthUser, query: SalesQuery, now: Date): Promise<SaleView[]> {
  const bantay = user.role === "BANTAY";
  const start = manilaDayStart(bantay ? manilaDate(now) : (query.date ?? manilaDate(now)));
  const cashierId = bantay ? user.userId : query.cashierId;
  const rows = await db.sale.findMany({
    where: { storeId: user.storeId, soldAt: { gte: start, lt: new Date(start.getTime() + DAY_MS) }, ...(cashierId ? { cashierId } : {}) },
    include: SALE_INCLUDE,
    orderBy: [{ soldAt: "desc" }, { receiptNo: "desc" }],
  });
  return rows.map(toSaleView);
}

/** Receipt data. A bantay can open only their own sales; anything else answers as if it did not exist. */
export async function getSale(db: Db, user: AuthUser, id: string): Promise<SaleView> {
  if (!z.uuid().safeParse(id).success) throw saleNotFound();
  const row = await db.sale.findFirst({
    where: { id, storeId: user.storeId, ...(user.role === "BANTAY" ? { cashierId: user.userId } : {}) },
    include: SALE_INCLUDE,
  });
  if (!row) throw saleNotFound();
  return toSaleView(row);
}
