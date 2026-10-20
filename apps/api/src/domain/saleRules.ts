import type { SaleFlag } from "@sari/shared";

// Pure sale rules (spec 6), shared by online sales and offline sync.

const MINUTE = 60_000;
/** How far ahead of the server a device clock may run before its time is replaced. */
const MAX_AHEAD_MS = 10 * MINUTE;
const BEFORE_STORE_MS = MINUTE;

export function lineTotal(quantity: number, unitPriceCentavos: number): number {
  return quantity * unitPriceCentavos;
}

export function saleTotal(lines: { quantity: number; unitPriceCentavos: number }[]): number {
  return lines.reduce((total, line) => total + lineTotal(line.quantity, line.unitPriceCentavos), 0);
}

/**
 * The sale keeps the device's time unless that clock is clearly wrong: more than 10 minutes ahead of the
 * server, or before the store existed. Then the server's time is used and the sale gets CLOCK_ADJUSTED.
 */
export function resolveSoldAt(soldAt: Date, receivedAt: Date, storeCreatedAt: Date): { soldAt: Date; adjusted: boolean } {
  const tooLate = soldAt.getTime() > receivedAt.getTime() + MAX_AHEAD_MS;
  const tooEarly = soldAt.getTime() < storeCreatedAt.getTime() - BEFORE_STORE_MS;
  return tooLate || tooEarly ? { soldAt: receivedAt, adjusted: true } : { soldAt, adjusted: false };
}

type FlagLine = { productId: string | null; unitPriceCentavos: number; currentPriceCentavos: number | null; stockAfter: number | null };

/** Flags put a sale on the owner's "Needs review" list (spec 6). Each appears once, sorted. */
export function saleFlags(input: { lines: FlagLine[]; overCreditLimit: boolean; clockAdjusted: boolean }): SaleFlag[] {
  const flags = new Set<SaleFlag>();
  for (const line of input.lines) {
    if (line.productId === null) flags.add("CUSTOM_ITEM");
    if (line.currentPriceCentavos !== null && line.unitPriceCentavos !== line.currentPriceCentavos) flags.add("PRICE_CHANGED");
    if (line.stockAfter !== null && line.stockAfter < 0) flags.add("NEGATIVE_STOCK");
  }
  if (input.overCreditLimit) flags.add("OVER_CREDIT_LIMIT");
  if (input.clockAdjusted) flags.add("CLOCK_ADJUSTED");
  return [...flags].sort();
}
