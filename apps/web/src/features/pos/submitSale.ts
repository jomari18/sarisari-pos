import type { PaymentInput, SaleInput, SaleView } from "@sari/shared";
import { api } from "../../api/client";
import { cartTotal, type CartLine } from "./cart";

/** Records a sale. Online it goes straight to the API; Task 29 adds a submitter that queues offline sales. */
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
