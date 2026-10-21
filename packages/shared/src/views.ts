// Shapes the API returns. Times are ISO strings; money is integer centavos.
import type { MovementReason, PaymentMethod, Role, SaleFlag, UtangKind } from "./enums.js";
import type { ErrorCode } from "./errors.js";

export type StoreView = { id: string; code: string; name: string; expiresAt: string };

export type UserView = { id: string; role: Role; username: string; displayName: string };

/** A bantay account as the owner's Staff screen shows it. */
export type StaffView = UserView & { active: boolean };

export type CategoryView = { id: string; name: string; archived: boolean };

/** `costCentavos` is present for the owner only (spec 7.4). */
export type ProductView = {
  id: string;
  categoryId: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  unit: string;
  priceCentavos: number;
  costCentavos?: number;
  stock: number;
  reorderLevel: number;
  packSize: number;
  archived: boolean;
  updatedAt: string;
};

/** One line of a product's stock history (owner only). A sale's movement links to its receipt. */
export type StockMovementView = {
  id: string;
  change: number;
  reason: MovementReason;
  stockAfter: number;
  note: string | null;
  sale: { id: string; receiptNo: number } | null;
  user: { id: string; displayName: string };
  createdAt: string;
};

/** What the POS needs about a suki: enough to check the utang limit. */
export type CatalogCustomer = {
  id: string;
  name: string;
  phone: string | null;
  creditLimitCentavos: number;
  balanceCentavos: number;
};

export type CustomerView = CatalogCustomer & { oldestUnpaidDays: number | null };

/** One line of a suki's utang ledger. Charges are positive, payments negative; a charge links to its sale. */
export type LedgerEntryView = {
  id: string;
  kind: UtangKind;
  amountCentavos: number;
  method: PaymentMethod | null;
  sale: { id: string; receiptNo: number } | null;
  note: string | null;
  balanceAfter: number;
  createdAt: string;
  user: { id: string; displayName: string };
};

export type CustomerLedger = { customer: CustomerView; entries: LedgerEntryView[] };

export type SaleLineView = {
  productId: string | null;
  name: string;
  quantity: number;
  unitPriceCentavos: number;
  lineTotalCentavos: number;
};

export type SaleView = {
  id: string;
  /** Null until the server has recorded a queued sale. */
  receiptNo: number | null;
  soldAt: string;
  method: PaymentMethod;
  totalCentavos: number;
  tenderedCentavos: number | null;
  changeCentavos: number | null;
  gcashRef: string | null;
  customer: { id: string; name: string; balanceAfterCentavos: number } | null;
  cashier: { id: string; displayName: string };
  lines: SaleLineView[];
  flags: SaleFlag[];
  voidedAt: string | null;
  voidReason: string | null;
  /** Set by the web app for a sale still waiting in the offline queue. */
  pending?: boolean;
};

export type CatalogSnapshot = {
  generatedAt: string;
  products: ProductView[];
  categories: CategoryView[];
  customers: CatalogCustomer[];
};

export type SyncResult = {
  id: string;
  status: "accepted" | "duplicate" | "invalid";
  receiptNo?: number;
  flags: SaleFlag[];
  error?: { code: ErrorCode; message: string };
};

export type DemoLogins = {
  owner: { username: string; password: string };
  bantay: { username: string; pin: string };
};

// Reports (spec 8.6). Voided sales never count; amounts are centavos.

export type ReportRange = "today" | "7d" | "30d";

/** `byMethod` holds amounts per payment method. Profit leaves out custom items, which have no cost. */
export type SummaryReport = {
  salesCentavos: number;
  count: number;
  byMethod: Record<PaymentMethod, number>;
  expectedCashCentavos: number;
  profitCentavos: number;
  profitExcludesCustom: true;
};

export type ProductReportRow = { productId: string; name: string; quantity: number; salesCentavos: number; profitCentavos: number };

export type ProductReport = {
  bestByQuantity: ProductReportRow[];
  bestByProfit: ProductReportRow[];
  /** Active products with no sales in the range. */
  slowMovers: { productId: string; name: string; stock: number }[];
};

export type HourlyBucket = { hour: number; count: number; salesCentavos: number };

export type UtangReport = {
  totalCentavos: number;
  top: CustomerView[];
  aging: { d0to7: number; d8to30: number; d31plus: number };
};

/** A cashier's own sales of the Manila day. */
export type ShiftReport = { count: number; byMethod: Record<PaymentMethod, number> };
