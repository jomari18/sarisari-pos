import type { SaleView } from "@sari/shared";
import { z } from "zod";
import type { Db } from "../db.js";
import { AppError } from "../http/errors.js";
import { SALE_INCLUDE, toSaleView } from "./saleView.js";
import type { AuthUser } from "./tokens.js";

/** The owner's "Needs review" list (spec 2.1): flagged sales, custom items included, not yet reviewed or voided. */
export async function listReview(db: Db, user: AuthUser): Promise<SaleView[]> {
  const rows = await db.sale.findMany({
    where: { storeId: user.storeId, reviewedAt: null, voidedAt: null, NOT: { flags: { isEmpty: true } } },
    include: SALE_INCLUDE,
    orderBy: [{ soldAt: "desc" }, { receiptNo: "desc" }],
  });
  return rows.map(toSaleView);
}

/** Takes a sale off the list. Marking it again keeps the first review time. */
export async function markReviewed(db: Db, user: AuthUser, saleId: string, now: Date): Promise<void> {
  const notFound = new AppError("not_found", "This sale does not exist.");
  if (!z.uuid().safeParse(saleId).success) throw notFound;
  const where = { id: saleId, storeId: user.storeId };
  const { count } = await db.sale.updateMany({ where: { ...where, reviewedAt: null }, data: { reviewedAt: now } });
  if (count === 0 && (await db.sale.count({ where })) === 0) throw notFound;
}
