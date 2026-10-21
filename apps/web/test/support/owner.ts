import type { SaleView, StaffView, SummaryReport } from "@sari/shared";
import { bantay } from "./fetch";

/** "2026-09-22" plus `offset` days. */
const dayFrom = (offset: number) => new Date(Date.UTC(2026, 8, 22 + offset)).toISOString().slice(0, 10);

const SOLD: Record<string, [count: number, salesCentavos: number]> = {
  "2026-10-12": [1, 7_500],
  "2026-10-20": [3, 13_200],
  "2026-10-21": [3, 12_400],
};

/** The report fixture's numbers (API Task 20), ending Wednesday 21 October 2026. */
export const month: SummaryReport = {
  salesCentavos: 33_100,
  count: 7,
  byMethod: { CASH: 15_400, GCASH: 7_500, UTANG: 10_200 },
  expectedCashCentavos: 16_900,
  profitCentavos: 6_400,
  profitExcludesCustom: true,
  days: Array.from({ length: 30 }, (_, i) => {
    const date = dayFrom(i);
    const [count, salesCentavos] = SOLD[date] ?? [0, 0];
    return { date, count, salesCentavos };
  }),
};

export const week: SummaryReport = {
  salesCentavos: 25_600,
  count: 6,
  byMethod: { CASH: 7_900, GCASH: 7_500, UTANG: 10_200 },
  expectedCashCentavos: 9_400,
  profitCentavos: 5_100,
  profitExcludesCustom: true,
  days: month.days.slice(-7),
};

export const today: SummaryReport = {
  salesCentavos: 12_400,
  count: 3,
  byMethod: { CASH: 4_900, GCASH: 0, UTANG: 7_500 },
  expectedCashCentavos: 6_400,
  profitCentavos: 2_300,
  profitExcludesCustom: true,
  days: month.days.slice(-1),
};

/** A cash sale by the bantay; override what a test needs. */
export const sale = (fields: Partial<SaleView> & Pick<SaleView, "id">): SaleView => ({
  receiptNo: 1042,
  soldAt: "2026-10-21T02:30:00.000Z",
  method: "CASH",
  totalCentavos: 3_400,
  tenderedCentavos: 5_000,
  changeCentavos: 1_600,
  gcashRef: null,
  customer: null,
  cashier: { id: bantay.id, displayName: bantay.displayName },
  lines: [
    { productId: "p-kape", name: "Kape 3-in-1", quantity: 2, unitPriceCentavos: 1_200, lineTotalCentavos: 2_400 },
    { productId: "p-nino", name: "Niño Biscuit", quantity: 1, unitPriceCentavos: 1_000, lineTotalCentavos: 1_000 },
  ],
  flags: [],
  voidedAt: null,
  voidReason: null,
  ...fields,
});

export const nena: StaffView = { id: bantay.id, role: "BANTAY", username: bantay.username, displayName: bantay.displayName, active: true };
export const joy: StaffView = { id: "u3", role: "BANTAY", username: "joy.7k2f", displayName: "Joy", active: false };
