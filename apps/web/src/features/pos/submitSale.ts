import type { PaymentInput, SaleInput, SaleView } from "@sari/shared";
import { ApiError, api } from "../../api/client";
import { getSession } from "../../auth/session";
import { loadCatalog } from "../../offline/catalog";
import { enqueueSale } from "../../offline/outbox";
import { cartTotal, type CartLine } from "./cart";

/** Records a sale and says whether it went to the server or into the offline queue. */
export type SaleSubmitter = (sale: SaleInput) => Promise<{ sale: SaleView; queued: boolean }>;

/** The cart as the API's sale body. The id comes from the device, so a retried sale is recorded once (spec 6.2). */
export function buildSaleInput(id: string, lines: CartLine[], payment: PaymentInput, now: Date): SaleInput {
  return {
    id,
    soldAt: now.toISOString(),
    items: lines.map((line) =>
      line.productId
        ? { productId: line.productId, quantity: line.quantity, unitPriceCentavos: line.unitPriceCentavos }
        : { custom: { name: line.name, unitPriceCentavos: line.unitPriceCentavos }, quantity: line.quantity },
    ),
    totalCentavos: cartTotal(lines),
    payment,
  };
}

export const onlineSubmitter: SaleSubmitter = async (sale) => {
  const result = await api<{ sale: SaleView; duplicate: boolean }>("/sales", { method: "POST", json: sale });
  return { sale: result.sale, queued: false };
};

/**
 * The receipt for a sale still in the queue (spec 9): no receipt number yet, names and the suki's balance
 * from the saved catalog, the cashier who made it.
 */
async function pendingView(sale: SaleInput): Promise<SaleView> {
  const session = getSession();
  const saved = session ? await loadCatalog(session.store.id) : undefined;
  const product = (id: string) => saved?.snapshot.products.find((p) => p.id === id);
  const customer = sale.payment.method === "UTANG" ? saved?.snapshot.customers.find((c) => c.id === (sale.payment as { customerId: string }).customerId) : undefined;
  const cash = sale.payment.method === "CASH" ? sale.payment.tenderedCentavos : null;
  return {
    id: sale.id,
    receiptNo: null,
    soldAt: sale.soldAt,
    method: sale.payment.method,
    totalCentavos: sale.totalCentavos,
    tenderedCentavos: cash,
    changeCentavos: cash === null ? null : cash - sale.totalCentavos,
    gcashRef: sale.payment.method === "GCASH" ? (sale.payment.gcashRef ?? null) : null,
    customer: customer ? { id: customer.id, name: customer.name, balanceAfterCentavos: customer.balanceCentavos + sale.totalCentavos } : null,
    cashier: { id: session?.user.id ?? "", displayName: session?.user.displayName ?? "" },
    lines: sale.items.map((item) => {
      const unitPriceCentavos = "custom" in item ? item.custom.unitPriceCentavos : item.unitPriceCentavos;
      return {
        productId: "custom" in item ? null : item.productId,
        name: "custom" in item ? item.custom.name : (product(item.productId)?.name ?? "Item"),
        quantity: item.quantity,
        unitPriceCentavos,
        lineTotalCentavos: unitPriceCentavos * item.quantity,
      };
    }),
    flags: [],
    voidedAt: null,
    voidReason: null,
    pending: true,
  };
}

async function queue(sale: SaleInput): Promise<{ sale: SaleView; queued: boolean }> {
  await enqueueSale(sale);
  return { sale: await pendingView(sale), queued: true };
}

/**
 * Online first; with no connection the sale goes to the outbox and syncs later (spec 9). A sale whose answer
 * was lost may be queued after the server recorded it: the same id comes back as a duplicate and counts once.
 */
export const offlineSubmitter: SaleSubmitter = async (sale) => {
  if (!navigator.onLine) return queue(sale);
  try {
    return await onlineSubmitter(sale);
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) return queue(sale);
    throw err;
  }
};
