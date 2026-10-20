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

export const SaleInput = z
  .strictObject({
    id: z.uuid(),
    soldAt: isoTimeSchema,
    items: z.array(SaleLineInput).min(1).max(200),
    totalCentavos: z.int().min(0),
    payment: PaymentInput,
  })
  .superRefine((sale, ctx) => {
    if (sale.payment.method === "CASH" && sale.payment.tenderedCentavos < sale.totalCentavos) {
      ctx.addIssue({ code: "custom", path: ["payment", "tenderedCentavos"], message: "The cash given is less than the total." });
    }
  });
export type SaleInput = z.infer<typeof SaleInput>;

export const SyncBatchInput = z.strictObject({ sales: z.array(SaleInput).min(1).max(100) });
export type SyncBatchInput = z.infer<typeof SyncBatchInput>;

export const VoidInput = z.strictObject({ reason: z.string().trim().min(3).max(120) });
export type VoidInput = z.infer<typeof VoidInput>;
