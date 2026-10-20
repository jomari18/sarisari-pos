import { randomUUID } from "node:crypto";

export type Item =
  | { productId: string; quantity: number; unitPriceCentavos: number }
  | { custom: { name: string; unitPriceCentavos: number }; quantity: number };

export type Payment = { method: "CASH"; tenderedCentavos: number } | { method: "GCASH"; gcashRef?: string } | { method: "UTANG"; customerId: string };

const priceOf = (item: Item) => ("custom" in item ? item.custom.unitPriceCentavos : item.unitPriceCentavos);

/** A builder of valid sale request bodies (new client id, matching total) whose soldAt defaults to the test clock. */
export function saleBodies(defaultSoldAt: Date) {
  return (items: Item[], payment: Payment = { method: "CASH", tenderedCentavos: 100_000 }, soldAt = defaultSoldAt) => ({
    id: randomUUID(),
    soldAt: soldAt.toISOString(),
    items,
    totalCentavos: items.reduce((sum, item) => sum + item.quantity * priceOf(item), 0),
    payment,
  });
}
