import { manilaDate, manilaDayStart, type UtangKind } from "@sari/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AgingEntry = { kind: UtangKind; amountCentavos: number; createdAt: Date; saleId?: string | null };
export type Aging = { d0to7: number; d8to30: number; d31plus: number; oldestUnpaidDays: number | null };

/** Whole Manila calendar days between two instants: a charge from 23:30 last night is 1 day old at 00:30. */
function manilaDaysBetween(from: Date, to: Date): number {
  return Math.round((manilaDayStart(manilaDate(to)).getTime() - manilaDayStart(manilaDate(from)).getTime()) / DAY_MS);
}

/**
 * Spec 6.8: payments and negative adjustments pay the oldest charges first; positive adjustments add a
 * debt of their own. A VOID takes back its own sale's charge first. What stays unpaid is grouped by age.
 */
export function agingBuckets(entries: AgingEntry[], now: Date): Aging {
  // Stable sort: entries recorded at the same instant keep the order they were given in.
  const ordered = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const debts: { amount: number; at: Date; saleId: string | null }[] = [];
  let credit = 0;

  for (const entry of ordered) {
    if (entry.amountCentavos > 0) {
      const covered = Math.min(credit, entry.amountCentavos);
      credit -= covered;
      if (entry.amountCentavos > covered) debts.push({ amount: entry.amountCentavos - covered, at: entry.createdAt, saleId: entry.saleId ?? null });
      continue;
    }
    let paying = -entry.amountCentavos;
    const own = entry.kind === "VOID" && entry.saleId ? debts.find((debt) => debt.saleId === entry.saleId) : undefined;
    for (const debt of own ? [own, ...debts] : debts) {
      if (paying === 0) break;
      const take = Math.min(debt.amount, paying);
      debt.amount -= take;
      paying -= take;
    }
    credit += paying;
  }

  const aging: Aging = { d0to7: 0, d8to30: 0, d31plus: 0, oldestUnpaidDays: null };
  for (const debt of debts) {
    if (debt.amount === 0) continue;
    const days = manilaDaysBetween(debt.at, now);
    if (days <= 7) aging.d0to7 += debt.amount;
    else if (days <= 30) aging.d8to30 += debt.amount;
    else aging.d31plus += debt.amount;
    aging.oldestUnpaidDays ??= days; // debts are oldest first
  }
  return aging;
}
