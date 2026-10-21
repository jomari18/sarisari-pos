import {
  manilaDate,
  manilaDayStart,
  type CustomerView,
  type HourlyBucket,
  type PaymentMethod,
  type ProductReport,
  type ProductReportRow,
  type ReportRange,
  type ShiftReport,
  type SummaryReport,
  type UtangReport,
} from "@sari/shared";
import type { Db } from "../db.js";
import type { AuthUser } from "./tokens.js";
import { agingByCustomer } from "./utang.js";

// Reports (spec 8.6). Voided sales never count. Days are Manila days.

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<ReportRange, number> = { today: 1, "7d": 7, "30d": 30 };
const TOP_PRODUCTS = 10;
const TOP_SUKI = 5;

/** Whole Manila days ending with today: "7d" is today and the 6 days before it. */
export function rangeBounds(range: ReportRange, now: Date): { start: Date; end: Date } {
  const end = manilaDayStart(manilaDate(now)).getTime() + DAY_MS;
  return { start: new Date(end - RANGE_DAYS[range] * DAY_MS), end: new Date(end) };
}

const noMethods = (): Record<PaymentMethod, number> => ({ CASH: 0, GCASH: 0, UTANG: 0 });

/** Sales by method between two instants; `cashierId` narrows it to one cashier. */
async function salesByMethod(db: Db, storeId: string, start: Date, end: Date, cashierId?: string) {
  const rows = await db.sale.groupBy({
    by: ["method"],
    where: { storeId, voidedAt: null, soldAt: { gte: start, lt: end }, ...(cashierId ? { cashierId } : {}) },
    _sum: { totalCentavos: true },
    _count: { _all: true },
  });
  const byMethod = noMethods();
  let count = 0;
  for (const row of rows) {
    byMethod[row.method] = row._sum.totalCentavos ?? 0;
    count += row._count._all;
  }
  return { byMethod, count };
}

/**
 * Sales, count and amounts by method; the cash that should be in the drawer (cash sales plus cash utang
 * payments); and profit from product lines only, since custom items have no cost.
 */
export async function summary(db: Db, user: AuthUser, range: ReportRange, now: Date): Promise<SummaryReport> {
  const { start, end } = rangeBounds(range, now);
  const [{ byMethod, count }, payments, [profit]] = await Promise.all([
    salesByMethod(db, user.storeId, start, end),
    db.utangEntry.aggregate({
      where: { storeId: user.storeId, kind: "PAYMENT", method: "CASH", createdAt: { gte: start, lt: end } },
      _sum: { amountCentavos: true },
    }),
    db.$queryRaw<{ profit: bigint }[]>`
      SELECT COALESCE(SUM((i."unitPriceCentavos" - i."unitCostCentavos") * i."quantity"), 0)::bigint AS profit
      FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
      WHERE s."storeId" = ${user.storeId}::uuid AND s."voidedAt" IS NULL
        AND s."soldAt" >= ${start} AND s."soldAt" < ${end} AND i."unitCostCentavos" IS NOT NULL`,
  ]);
  return {
    salesCentavos: byMethod.CASH + byMethod.GCASH + byMethod.UTANG,
    count,
    byMethod,
    // Payments are stored as negative amounts.
    expectedCashCentavos: byMethod.CASH - (payments._sum.amountCentavos ?? 0),
    profitCentavos: Number(profit!.profit),
    profitExcludesCustom: true,
  };
}

/** Best sellers by quantity and by profit (top 10 each), and active products that did not sell at all. */
export async function productReport(db: Db, user: AuthUser, range: ReportRange, now: Date): Promise<ProductReport> {
  const { start, end } = rangeBounds(range, now);
  const [sold, products] = await Promise.all([
    db.$queryRaw<{ productId: string; quantity: number; sales: bigint; profit: bigint }[]>`
      SELECT i."productId" AS "productId", SUM(i."quantity")::int AS quantity, SUM(i."lineTotalCentavos")::bigint AS sales,
             SUM((i."unitPriceCentavos" - i."unitCostCentavos") * i."quantity")::bigint AS profit
      FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
      WHERE s."storeId" = ${user.storeId}::uuid AND s."voidedAt" IS NULL
        AND s."soldAt" >= ${start} AND s."soldAt" < ${end} AND i."productId" IS NOT NULL
      GROUP BY i."productId"`,
    db.product.findMany({ where: { storeId: user.storeId }, select: { id: true, name: true, stock: true, archived: true }, orderBy: { name: "asc" } }),
  ]);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const rows: ProductReportRow[] = sold.map((row) => ({
    productId: row.productId,
    name: names.get(row.productId) ?? "",
    quantity: row.quantity,
    salesCentavos: Number(row.sales),
    profitCentavos: Number(row.profit),
  }));
  const byName = (a: ProductReportRow, b: ProductReportRow) => a.name.localeCompare(b.name);
  const soldIds = new Set(rows.map((row) => row.productId));
  return {
    bestByQuantity: [...rows].sort((a, b) => b.quantity - a.quantity || b.salesCentavos - a.salesCentavos || byName(a, b)).slice(0, TOP_PRODUCTS),
    bestByProfit: [...rows].sort((a, b) => b.profitCentavos - a.profitCentavos || b.quantity - a.quantity || byName(a, b)).slice(0, TOP_PRODUCTS),
    slowMovers: products.filter((p) => !p.archived && !soldIds.has(p.id)).map((p) => ({ productId: p.id, name: p.name, stock: p.stock })),
  };
}

/** Sales per Manila hour of one day, all 24 hours. */
export async function hourly(db: Db, user: AuthUser, date: string): Promise<HourlyBucket[]> {
  const start = manilaDayStart(date);
  const end = new Date(start.getTime() + DAY_MS);
  const rows = await db.$queryRaw<{ hour: number; count: number; sales: bigint }[]>`
    SELECT EXTRACT(HOUR FROM s."soldAt" AT TIME ZONE 'Asia/Manila')::int AS hour, COUNT(*)::int AS count,
           COALESCE(SUM(s."totalCentavos"), 0)::bigint AS sales
    FROM "Sale" s
    WHERE s."storeId" = ${user.storeId}::uuid AND s."voidedAt" IS NULL AND s."soldAt" >= ${start} AND s."soldAt" < ${end}
    GROUP BY 1`;
  const byHour = new Map(rows.map((row) => [row.hour, row]));
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: byHour.get(hour)?.count ?? 0,
    salesCentavos: Number(byHour.get(hour)?.sales ?? 0),
  }));
}

/** What suki owe in total, the 5 who owe most, and the aging of all of it (oldest charges paid first). */
export async function utangReport(db: Db, user: AuthUser, now: Date): Promise<UtangReport> {
  const owing = await db.customer.findMany({
    where: { storeId: user.storeId, balanceCentavos: { gt: 0 } },
    orderBy: [{ balanceCentavos: "desc" }, { name: "asc" }],
  });
  const agings = await agingByCustomer(db, owing.map((c) => c.id), now);
  const aging = { d0to7: 0, d8to30: 0, d31plus: 0 };
  for (const each of agings.values()) {
    aging.d0to7 += each.d0to7;
    aging.d8to30 += each.d8to30;
    aging.d31plus += each.d31plus;
  }
  const top: CustomerView[] = owing.slice(0, TOP_SUKI).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    creditLimitCentavos: c.creditLimitCentavos,
    balanceCentavos: c.balanceCentavos,
    oldestUnpaidDays: agings.get(c.id)?.oldestUnpaidDays ?? null,
  }));
  return { totalCentavos: owing.reduce((sum, c) => sum + c.balanceCentavos, 0), top, aging };
}

/** The signed-in cashier's own sales of today, for the bantay's "My shift" (spec 7.4). */
export async function myShift(db: Db, user: AuthUser, now: Date): Promise<ShiftReport> {
  const { start, end } = rangeBounds("today", now);
  return salesByMethod(db, user.storeId, start, end, user.userId);
}
