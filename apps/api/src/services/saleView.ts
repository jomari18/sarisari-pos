import type { SaleFlag, SaleView } from "@sari/shared";
import type { Prisma } from "../generated/prisma/client.js";

/** What a receipt needs: lines in rung-up order, the cashier, and the suki's balance after an utang sale. */
export const SALE_INCLUDE = {
  items: { orderBy: { line: "asc" } },
  cashier: { select: { id: true, displayName: true } },
  customer: { select: { id: true, name: true } },
  utangEntries: { where: { kind: "CHARGE" }, select: { balanceAfter: true }, take: 1 },
} satisfies Prisma.SaleInclude;

export type SaleRow = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

/** Sales carry no cost or profit, so the same view serves the owner and the bantay. */
export function toSaleView(row: SaleRow): SaleView {
  return {
    id: row.id,
    receiptNo: row.receiptNo,
    soldAt: row.soldAt.toISOString(),
    method: row.method,
    totalCentavos: row.totalCentavos,
    tenderedCentavos: row.tenderedCentavos,
    changeCentavos: row.changeCentavos,
    gcashRef: row.gcashRef,
    customer: row.customer
      ? { id: row.customer.id, name: row.customer.name, balanceAfterCentavos: row.utangEntries[0]?.balanceAfter ?? 0 }
      : null,
    cashier: row.cashier,
    lines: row.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPriceCentavos: item.unitPriceCentavos,
      lineTotalCentavos: item.lineTotalCentavos,
    })),
    flags: row.flags as SaleFlag[],
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
  };
}
