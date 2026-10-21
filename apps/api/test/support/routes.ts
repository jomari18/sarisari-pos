import { randomUUID } from "node:crypto";

/** Ids to fill a path template with: one store's own rows. */
export type RouteIds = { product: string; barcode: string; category: string; sale: string; customer: string; staff: string };

export type Access = "public" | "any" | "owner";

export type RouteRow = {
  method: "get" | "post" | "patch";
  path: string;
  access: Access;
  /** A valid body (given the ids), so a request gets past validation to the permission or lookup it tests. */
  body?: (ids: RouteIds) => object;
  /** The body names the row it acts on (a productId), so another store's id must answer 404 too. */
  bodyTarget?: true;
};

const ISO = "2026-10-21T00:00:00.000Z";

/** Every route of the API. permissions.test.ts checks this table against the routes Express has registered. */
export const ROUTES: RouteRow[] = [
  { method: "get", path: "/api/health", access: "public" },
  { method: "post", path: "/api/auth/login", access: "public", body: () => ({ username: "nobody.xxxx", secret: "not-a-secret" }) },
  { method: "post", path: "/api/auth/refresh", access: "public" },
  { method: "post", path: "/api/auth/logout", access: "public" },
  { method: "post", path: "/api/demo", access: "public" },
  { method: "post", path: "/api/admin/cleanup", access: "public" },

  { method: "get", path: "/api/me", access: "any" },
  { method: "get", path: "/api/catalog", access: "any" },
  { method: "get", path: "/api/products", access: "any" },
  { method: "get", path: "/api/products/barcode/:barcode", access: "any" },
  { method: "get", path: "/api/products/:product", access: "any" },
  { method: "get", path: "/api/categories", access: "any" },
  {
    method: "post",
    path: "/api/sales",
    access: "any",
    body: (ids) => ({
      id: randomUUID(),
      soldAt: ISO,
      items: [{ productId: ids.product, quantity: 1, unitPriceCentavos: 1500 }],
      totalCentavos: 1500,
      payment: { method: "CASH", tenderedCentavos: 2000 },
    }),
  },
  { method: "post", path: "/api/sales/sync", access: "any", body: () => ({ sales: [] }) },
  { method: "get", path: "/api/sales", access: "any" },
  { method: "get", path: "/api/sales/:sale", access: "any" },
  { method: "get", path: "/api/customers", access: "any" },
  { method: "post", path: "/api/customers", access: "any", body: () => ({ name: "Bagong Suki" }) },
  { method: "patch", path: "/api/customers/:customer", access: "any", body: () => ({ name: "Renamed" }) },
  { method: "get", path: "/api/customers/:customer/ledger", access: "any" },
  { method: "post", path: "/api/customers/:customer/payments", access: "any", body: () => ({ id: randomUUID(), amountCentavos: 100, method: "CASH" }) },
  { method: "get", path: "/api/customers/:customer/reminder", access: "any" },
  { method: "get", path: "/api/reports/my-shift", access: "any" },

  {
    method: "post",
    path: "/api/products",
    access: "owner",
    body: (ids) => ({ name: "New", categoryId: ids.category, unit: "pc", priceCentavos: 100, costCentavos: 50, reorderLevel: 1 }),
  },
  { method: "patch", path: "/api/products/:product", access: "owner", body: () => ({ priceCentavos: 100, expectedUpdatedAt: ISO }) },
  { method: "post", path: "/api/products/:product/archive", access: "owner" },
  { method: "post", path: "/api/products/:product/unarchive", access: "owner" },
  { method: "get", path: "/api/products/:product/movements", access: "owner" },
  { method: "post", path: "/api/categories", access: "owner", body: () => ({ name: "Frozen" }) },
  { method: "patch", path: "/api/categories/:category", access: "owner", body: () => ({ name: "Renamed" }) },
  { method: "post", path: "/api/stock/restock", access: "owner", bodyTarget: true, body: (ids) => ({ productId: ids.product, pieces: 1, unitCostCentavos: 100 }) },
  { method: "post", path: "/api/stock/adjust", access: "owner", bodyTarget: true, body: (ids) => ({ productId: ids.product, counted: 1 }) },
  { method: "get", path: "/api/stock/restock-list", access: "owner" },
  { method: "post", path: "/api/sales/:sale/void", access: "owner", body: () => ({ reason: "Testing access" }) },
  { method: "get", path: "/api/review", access: "owner" },
  { method: "post", path: "/api/review/:sale/done", access: "owner" },
  { method: "post", path: "/api/customers/:customer/adjustments", access: "owner", body: () => ({ amountCentavos: 100, note: "Testing access" }) },
  { method: "get", path: "/api/staff", access: "owner" },
  { method: "post", path: "/api/staff", access: "owner", body: () => ({ displayName: "Liza", pin: "731905" }) },
  { method: "patch", path: "/api/staff/:staff", access: "owner", body: () => ({ active: false }) },
  { method: "get", path: "/api/reports/summary", access: "owner" },
  { method: "get", path: "/api/reports/products", access: "owner" },
  { method: "get", path: "/api/reports/hourly", access: "owner" },
  { method: "get", path: "/api/reports/utang", access: "owner" },
];

/** Fills `:product`, `:sale` and the rest with the given store's ids. */
export function fillPath(path: string, ids: RouteIds): string {
  return path.replace(/:(\w+)/g, (_, key: string) => ids[key as keyof RouteIds]);
}

/** Rows that point at one particular row of a store, by path or by body: another store's id must answer 404. */
export const targetsARow = (row: RouteRow) => /:\w+/.test(row.path) || row.bodyTarget === true;

/** The table's routes as Express names them: ":id" style parameters become ":param". */
export const routeKey = (method: string, path: string) => `${method.toUpperCase()} ${path.replace(/:\w+/g, ":param")}`;
