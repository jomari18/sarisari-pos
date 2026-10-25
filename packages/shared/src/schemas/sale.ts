import { z } from "zod";
import { isoTimeSchema, moneySchema, nameSchema } from "./common.js";

const quantitySchema = z.int().min(1).max(999);

const ProductLine = z.strictObject({
  productId: z.uuid(),
  quantity: quantitySchema,
  unitPriceCentavos: moneySchema,
});

/** An item that is not in the product list yet, typed in by the bantay (spec 6, rule 6). */
const CustomLine = z.strictObject({
  custom: z.strictObject({ name: nameSchema(80), unitPriceCentavos: moneySchema.min(1) }),
  quantity: quantitySchema,
});

export const SaleLineInput = z.union([ProductLine, CustomLine]);
export type SaleLineInput = z.infer<typeof SaleLineInput>;

export const PaymentInput = z.discriminatedUnion("method", [
  z.strictObject({ method: z.literal("CASH"), tenderedCentavos: z.int().min(0) }),
  z.strictObject({ method: z.literal("GCASH"), gcashRef: z.string().trim().max(40).optional() }),
  z.strictObject({ method: z.literal("UTANG"), customerId: z.uuid() }),
]);
export type PaymentInput = z.infer<typeof PaymentInput>;

/**
 * The most one sale may be worth, and how far cash given may exceed its total. Both keep every amount inside the
 * database's columns, so a mistyped amount is refused as invalid instead of stalling a device's sync queue.
 */
export const MAX_SALE_CENTAVOS = 100_000_000;
export const MAX_CASH_OVER_CENTAVOS = 10_000_000;

const lineCentavos = (line: SaleLineInput) => line.quantity * ("custom" in line ? line.custom.unitPriceCentavos : line.unitPriceCentavos);

type SaleAmounts = { items: SaleLineInput[]; totalCentavos: number; payment: PaymentInput };

/** What is wrong with a sale's amounts, if anything; the device checks this before it queues a sale. */
export function saleAmountIssue(sale: SaleAmounts): { path: (string | number)[]; message: string } | null {
  const worth = sale.items.reduce((sum, line) => sum + lineCentavos(line), 0);
  if (Math.max(worth, sale.totalCentavos) > MAX_SALE_CENTAVOS) return { path: ["totalCentavos"], message: "A sale can be worth at most ₱1,000,000." };
  if (sale.payment.method !== "CASH") return null;
  if (sale.payment.tenderedCentavos < sale.totalCentavos) return { path: ["payment", "tenderedCentavos"], message: "The cash given is less than the total." };
  if (sale.payment.tenderedCentavos > sale.totalCentavos + MAX_CASH_OVER_CENTAVOS) {
    return { path: ["payment", "tenderedCentavos"], message: "That is more than ₱100,000 over the total. Check the cash given." };
  }
  return null;
}

export const SaleInput = z
  .strictObject({
    id: z.uuid(),
    soldAt: isoTimeSchema,
    items: z.array(SaleLineInput).min(1).max(200),
    totalCentavos: z.int().min(0),
    payment: PaymentInput,
  })
  .superRefine((sale, ctx) => {
    const issue = saleAmountIssue(sale);
    if (issue) ctx.addIssue({ code: "custom", ...issue });
  });
export type SaleInput = z.infer<typeof SaleInput>;

export const SyncBatchInput = z.strictObject({ sales: z.array(SaleInput).min(1).max(100) });
export type SyncBatchInput = z.infer<typeof SyncBatchInput>;

export const VoidInput = z.strictObject({ reason: z.string().trim().min(3).max(120) });
export type VoidInput = z.infer<typeof VoidInput>;
