import type { SaleInput } from "@sari/shared";

/** Turns the browser's connection off or on, as the `offline` and `online` events would. */
export function setOnline(online: boolean, announce = true): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
  if (announce) window.dispatchEvent(new Event(online ? "online" : "offline"));
}

/** A ₱12.00 cash sale of one Kape 3-in-1, numbered so a test can tell them apart. */
export function cashSale(n: number, soldAt = "2026-10-21T02:42:00.000Z"): SaleInput {
  return {
    id: `0d1f7b2a-0000-4000-8000-${String(n).padStart(12, "0")}`,
    soldAt,
    items: [{ productId: "p-kape", quantity: 1, unitPriceCentavos: 1_200 }],
    totalCentavos: 1_200,
    payment: { method: "CASH", tenderedCentavos: 2_000 },
  };
}
