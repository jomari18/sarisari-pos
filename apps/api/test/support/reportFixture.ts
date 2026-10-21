import { randomUUID } from "node:crypto";
import type { SaleInput } from "@sari/shared";
import type { Db } from "../../src/db.js";
import { createSale, voidSale } from "../../src/services/sales.js";
import type { AuthUser } from "../../src/services/tokens.js";
import { adjustBalance, recordPayment } from "../../src/services/utang.js";
import { seedStore, type TestStore } from "./factories.js";

const DAY = 24 * 60 * 60 * 1000;
/** A Manila wall-clock time, e.g. at("2026-10-20", "23:59"). */
export const at = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`);

/** "Now" for the reports: Wednesday 21 October 2026, 15:00 Manila. */
export const REPORT_NOW = at("2026-10-21", "15:00");

export type ReportFixture = TestStore & {
  ownerUser: AuthUser;
  bantayUser: AuthUser;
  lizaId: string;
  bondPaperId: string;
  voidedSaleId: string;
};

/**
 * Known sales, recorded through the real services so every row is what the app writes (prices: chips ₱15.00
 * cost ₱11.00, softdrink ₱75.00 cost ₱62.00, kape ₱12.00 cost ₱9.00):
 *
 *   S0  2026-09-15 10:00  cash    chips ×1                      outside every range
 *   S0b 2026-10-12 10:00  cash    softdrink ×1                  30d only
 *   S1  2026-10-20 08:15  cash    chips ×2           (bantay)
 *   S2  2026-10-20 12:30  GCash   softdrink ×1       (owner)
 *   S3  2026-10-20 23:59  utang   chips ×1 + kape ×1 (bantay)    Aling Rosa
 *   S4  2026-10-21 00:01  cash    kape ×2            (bantay)
 *   S5  2026-10-21 09:00  cash    chips ×1 + custom Yelo ×2 @ ₱5 (bantay)
 *   S6  2026-10-21 10:00  cash    softdrink ×2       (owner)     voided at 10:30
 *   S7  2026-10-21 14:00  utang   softdrink ×1       (owner)     Aling Rosa
 *   Rosa pays ₱10.00 GCash at 11:00 and ₱15.00 cash at 13:00 today.
 *   Ate Liza (limit ₱1,000) owes ₱50.00 from an adjustment 15 days ago.
 *   "Bond paper" never sells.
 */
export async function buildReportFixture(db: Db): Promise<ReportFixture> {
  const t = await seedStore(db, { code: "rep1", now: new Date(REPORT_NOW.getTime() - 40 * DAY), expiresAt: new Date(REPORT_NOW.getTime() + DAY) });
  const ownerUser: AuthUser = { userId: t.owner.id, storeId: t.store.id, role: "OWNER" };
  const bantayUser: AuthUser = { userId: t.bantay.id, storeId: t.store.id, role: "BANTAY" };
  const [chips, softdrink, kape] = t.products.map((p) => p.id) as [string, string, string];
  const rosa = t.customers[0]!.id;

  type Line = SaleInput["items"][number];
  const line = (productId: string, quantity: number, unitPriceCentavos: number): Line => ({ productId, quantity, unitPriceCentavos });
  const sell = async (who: AuthUser, soldAt: Date, items: Line[], payment: SaleInput["payment"]) => {
    const totalCentavos = items.reduce((sum, item) => sum + item.quantity * ("custom" in item ? item.custom.unitPriceCentavos : item.unitPriceCentavos), 0);
    const id = randomUUID();
    await createSale(db, who, { id, soldAt: soldAt.toISOString(), items, totalCentavos, payment }, "online", soldAt);
    return id;
  };
  const cash = { method: "CASH", tenderedCentavos: 100_000 } as const;

  await sell(bantayUser, at("2026-09-15", "10:00"), [line(chips, 1, 1500)], cash);
  await sell(bantayUser, at("2026-10-12", "10:00"), [line(softdrink, 1, 7500)], cash);
  await sell(bantayUser, at("2026-10-20", "08:15"), [line(chips, 2, 1500)], cash);
  await sell(ownerUser, at("2026-10-20", "12:30"), [line(softdrink, 1, 7500)], { method: "GCASH", gcashRef: "1000000000001" });
  await sell(bantayUser, at("2026-10-20", "23:59"), [line(chips, 1, 1500), line(kape, 1, 1200)], { method: "UTANG", customerId: rosa });
  await sell(bantayUser, at("2026-10-21", "00:01"), [line(kape, 2, 1200)], cash);
  await sell(bantayUser, at("2026-10-21", "09:00"), [line(chips, 1, 1500), { custom: { name: "Yelo", unitPriceCentavos: 500 }, quantity: 2 }], cash);
  const voidedSaleId = await sell(ownerUser, at("2026-10-21", "10:00"), [line(softdrink, 2, 7500)], cash);
  await voidSale(db, ownerUser, voidedSaleId, "Rang up twice", at("2026-10-21", "10:30"));
  await recordPayment(db, bantayUser, rosa, { id: randomUUID(), amountCentavos: 1000, method: "GCASH" }, at("2026-10-21", "11:00"));
  await recordPayment(db, bantayUser, rosa, { id: randomUUID(), amountCentavos: 1500, method: "CASH" }, at("2026-10-21", "13:00"));
  await sell(ownerUser, at("2026-10-21", "14:00"), [line(softdrink, 1, 7500)], { method: "UTANG", customerId: rosa });

  const liza = await db.customer.create({ data: { storeId: t.store.id, name: "Ate Liza", creditLimitCentavos: 100_000 } });
  await adjustBalance(db, ownerUser, liza.id, { amountCentavos: 5000, note: "Lumang utang" }, new Date(REPORT_NOW.getTime() - 15 * DAY));
  const bondPaper = await db.product.create({
    data: { storeId: t.store.id, categoryId: t.categories[0]!.id, name: "Bond paper", unit: "sheet", priceCentavos: 100, costCentavos: 50, stock: 400 },
  });

  return { ...t, ownerUser, bantayUser, lizaId: liza.id, bondPaperId: bondPaper.id, voidedSaleId };
}
