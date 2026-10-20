// Shapes the API returns. Times are ISO strings; money is integer centavos.
import type { PaymentMethod, Role, SaleFlag, UtangKind } from "./enums.js";
import type { ErrorCode } from "./errors.js";

export type StoreView = { id: string; code: string; name: string; expiresAt: string };

export type UserView = { id: string; role: Role; username: string; displayName: string };

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
