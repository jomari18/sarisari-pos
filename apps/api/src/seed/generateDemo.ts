import { CATALOG, inStoreBarcode, manilaDate, manilaDayStart, type MovementReason, type PaymentMethod, type Role, type UtangKind } from "@sari/shared";
import { SUKI } from "./catalogData.js";
import { createRng, type Rng } from "./random.js";

// Builds a month of believable history for a demo store (spec 7.5) from a seed alone, so tests can check
// its invariants. Rows point at each other by array index; the caller assigns ids when it inserts them.

export type SeedCategory = { name: string };

export type SeedProduct = {
  category: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  unit: string;
  priceCentavos: number;
  costCentavos: number;
  reorderLevel: number;
  packSize: number;
  /** Stock after every movement below. */
  stock: number;
};

export type SeedCustomer = { name: string; phone: string | null; creditLimitCentavos: number; balanceCentavos: number; createdAt: Date };

export type SeedSaleLine = {
  product: number;
  name: string;
  quantity: number;
  unitPriceCentavos: number;
  unitCostCentavos: number;
  lineTotalCentavos: number;
};

export type SeedSale = {
  receiptNo: number;
  soldAt: Date;
  cashier: Role;
  method: PaymentMethod;
  totalCentavos: number;
  tenderedCentavos: number | null;
  changeCentavos: number | null;
  gcashRef: string | null;
  customer: number | null;
  lines: SeedSaleLine[];
};

export type SeedMovement = {
  product: number;
  change: number;
  reason: Extract<MovementReason, "RESTOCK" | "SALE">;
  sale: number | null;
  user: Role;
  stockAfter: number;
  note: string | null;
  createdAt: Date;
};

export type SeedUtang = {
  customer: number;
  kind: Extract<UtangKind, "CHARGE" | "PAYMENT">;
  /** Charges are positive, payments negative. */
  amountCentavos: number;
  method: Exclude<PaymentMethod, "UTANG"> | null;
  sale: number | null;
  user: Role;
  balanceAfter: number;
  note: string | null;
  createdAt: Date;
};

export type DemoData = {
  categories: SeedCategory[];
  products: SeedProduct[];
  customers: SeedCustomer[];
  sales: SeedSale[];
  movements: SeedMovement[];
  utangEntries: SeedUtang[];
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SALE_DAYS = 30;

/** Opening hours in Manila time, weighted: a morning bump, lunch, and the evening rush. */
const HOUR_WEIGHTS = [
  [6, 4], [7, 6], [8, 5], [9, 4], [10, 4], [11, 6], [12, 6], [13, 4],
  [14, 4], [15, 5], [16, 8], [17, 11], [18, 12], [19, 11], [20, 8], [21, 4],
] as const;
const LINES_PER_SALE = [[1, 45], [2, 30], [3, 15], [4, 10]] as const;
/** Cash handed over: exact (0), or rounded up to ₱5, ₱20, ₱50, ₱100, ₱500 or ₱1,000. */
const TENDER_STEPS = [[0, 30], [500, 15], [2000, 10], [5000, 10], [10000, 20], [50000, 10], [100000, 5]] as const;
const UTANG_SHARE = 0.12;
const GCASH_SHARE = 0.15;
const DAILY_PAYMENT_CHANCE = 0.15;

type DayEvent = { at: number; kind: "sale" } | { at: number; kind: "payment"; customer: number };

export function generateDemoData({ seed, now }: { seed: number; now: Date }): DemoData {
  const rng = createRng(seed);
  const openedAt = new Date(now.getTime() - (SALE_DAYS + 1) * DAY);
  const templates = CATALOG.flatMap(({ products }, category) => products.map((template) => ({ ...template, category })));
  const productIndexes = templates.map((_, i) => i);
  const creditSuki = SUKI.flatMap((suki, i) => (suki.creditLimitCentavos > 0 ? [i] : []));

  const sold = templates.map(() => 0);
  const balances = SUKI.map(() => 0);
  const sales: SeedSale[] = [];
  const utangEntries: SeedUtang[] = [];

  function sell(at: number): void {
    const lineCount = rng.weighted(LINES_PER_SALE, ([, weight]) => weight)[0];
    const chosen = new Set<number>();
    while (chosen.size < lineCount) chosen.add(rng.weighted(productIndexes, (i) => templates[i]!.popularity));
    const lines = [...chosen].map((product): SeedSaleLine => {
      const t = templates[product]!;
      const roll = rng.next();
      const quantity = Math.min(t.maxQuantity, 1 + Math.floor(roll * roll * t.maxQuantity));
      sold[product]! += quantity;
      return { product, name: t.name, quantity, unitPriceCentavos: t.priceCentavos, unitCostCentavos: t.costCentavos, lineTotalCentavos: quantity * t.priceCentavos };
    });
    const total = lines.reduce((sum, line) => sum + line.lineTotalCentavos, 0);
    const cashier: Role = rng.chance(0.35) ? "OWNER" : "BANTAY";

    let method: PaymentMethod = "CASH";
    let customer: number | null = null;
    const roll = rng.next();
    if (roll < UTANG_SHARE) {
      const suki = rng.weighted(creditSuki, () => 1);
      // Online rule (spec 6.4): utang only while balance + total stays within the limit.
      if (balances[suki]! + total <= SUKI[suki]!.creditLimitCentavos) {
        method = "UTANG";
        customer = suki;
      }
    } else if (roll < UTANG_SHARE + GCASH_SHARE) {
      method = "GCASH";
    }

    let tendered: number | null = null;
    if (method === "CASH") {
      const step = rng.weighted(TENDER_STEPS, ([, weight]) => weight)[0];
      tendered = step === 0 ? total : Math.ceil(total / step) * step;
    }
    const gcashRef = method === "GCASH" ? String(rng.int(1_000_000_000_000, 9_999_999_999_999)) : null;

    const soldAt = new Date(at);
    sales.push({
      receiptNo: sales.length + 1,
      soldAt,
      cashier,
      method,
      totalCentavos: total,
      tenderedCentavos: tendered,
      changeCentavos: tendered === null ? null : tendered - total,
      gcashRef,
      customer,
      lines,
    });
    if (customer !== null) {
      balances[customer]! += total;
      utangEntries.push({
        customer,
        kind: "CHARGE",
        amountCentavos: total,
        method: null,
        sale: sales.length - 1,
        user: cashier,
        balanceAfter: balances[customer]!,
        note: null,
        createdAt: soldAt,
      });
    }
  }

  function pay(customer: number, at: number): void {
    const balance = balances[customer]!;
    if (balance <= 0) return;
    // Pays everything, or part of it in round ₱10 amounts.
    const part = Math.max(1000, Math.round((balance * (0.3 + 0.5 * rng.next())) / 1000) * 1000);
    const amount = rng.chance(0.4) ? balance : Math.min(balance, part);
    balances[customer] = balance - amount;
    utangEntries.push({
      customer,
      kind: "PAYMENT",
      amountCentavos: -amount,
      method: rng.chance(0.7) ? "CASH" : "GCASH",
      sale: null,
      user: rng.chance(0.5) ? "OWNER" : "BANTAY",
      balanceAfter: balances[customer]!,
      note: null,
      createdAt: new Date(at),
    });
  }

  // The 30 whole Manila days before today, so nothing lands after `now`.
  const todayStart = manilaDayStart(manilaDate(now)).getTime();
  for (let daysAgo = SALE_DAYS; daysAgo >= 1; daysAgo--) {
    for (const event of dayEvents(rng, todayStart - daysAgo * DAY, creditSuki)) {
      if (event.kind === "sale") sell(event.at);
      else pay(event.customer, event.at);
    }
  }

  // Opening stock covers the month's sales plus what is left now; about a third end at or below
  // their reorder level, so the dashboard has low-stock items to show.
  const left = templates.map((t) => (rng.chance(0.3) ? rng.int(0, t.reorderLevel) : rng.int(t.reorderLevel + 1, t.reorderLevel * 3 + 2)));
  let nextBarcode = 1;
  const products = templates.map((t, i): SeedProduct => ({
    category: t.category,
    name: t.name,
    brand: t.brand,
    barcode: t.barcode ? inStoreBarcode(nextBarcode++) : null,
    unit: t.unit,
    priceCentavos: t.priceCentavos,
    costCentavos: t.costCentavos,
    reorderLevel: t.reorderLevel,
    packSize: t.packSize,
    stock: left[i]!,
  }));

  const stock = templates.map((_, i) => sold[i]! + left[i]!);
  const movements: SeedMovement[] = stock.map((opening, product) => ({
    product,
    change: opening,
    reason: "RESTOCK",
    sale: null,
    user: "OWNER",
    stockAfter: opening,
    note: "Opening stock",
    createdAt: openedAt,
  }));
  sales.forEach((sale, saleIndex) => {
    for (const line of sale.lines) {
      stock[line.product]! -= line.quantity;
      movements.push({
        product: line.product,
        change: -line.quantity,
        reason: "SALE",
        sale: saleIndex,
        user: sale.cashier,
        stockAfter: stock[line.product]!,
        note: null,
        createdAt: sale.soldAt,
      });
    }
  });

  return {
    categories: CATALOG.map(({ name }) => ({ name })),
    products,
    customers: SUKI.map((suki, i) => ({ ...suki, balanceCentavos: balances[i]!, createdAt: openedAt })),
    sales,
    movements,
    utangEntries,
  };
}

/** One Manila day: 25–60 sales (weekends busier) and the odd utang payment, in time order. */
function dayEvents(rng: Rng, dayStart: number, creditSuki: number[]): DayEvent[] {
  const weekday = new Date(dayStart + 8 * HOUR).getUTCDay();
  const count = rng.int(25, 52) + (weekday === 0 || weekday === 6 ? rng.int(0, 8) : 0);
  const at = () => {
    const hour = rng.weighted(HOUR_WEIGHTS, ([, weight]) => weight)[0];
    return dayStart + hour * HOUR + rng.int(0, 59) * MINUTE + rng.int(0, 59) * 1000;
  };
  const events: DayEvent[] = Array.from({ length: count }, () => ({ kind: "sale", at: at() }));
  for (const customer of creditSuki) {
    if (rng.chance(DAILY_PAYMENT_CHANCE)) events.push({ kind: "payment", customer, at: at() });
  }
  return events.sort((a, b) => a.at - b.at);
}
