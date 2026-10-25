import { z } from "../zod.js";
import { nameSchema, noteSchema } from "./common.js";

const phoneSchema = z.string().regex(/^(09|\+639)\d{9}$/, "Use a mobile number like 09171234567.");
const limitSchema = z.int().min(0).max(5_000_000);

export const CustomerInput = z.strictObject({
  name: nameSchema(60),
  phone: phoneSchema.optional(),
});
export type CustomerInput = z.infer<typeof CustomerInput>;

export const CustomerPatch = z.strictObject({
  name: nameSchema(60).optional(),
  phone: phoneSchema.nullable().optional(),
  creditLimitCentavos: limitSchema.optional(),
});
export type CustomerPatch = z.infer<typeof CustomerPatch>;

/** The id comes from the device so a retried payment is applied once (spec 6, rule 2). */
export const PaymentRecordInput = z.strictObject({
  id: z.uuid(),
  amountCentavos: z.int().min(1).max(5_000_000),
  method: z.enum(["CASH", "GCASH"]),
});
export type PaymentRecordInput = z.infer<typeof PaymentRecordInput>;

export const AdjustmentInput = z.strictObject({
  amountCentavos: z
    .int()
    .min(-5_000_000)
    .max(5_000_000)
    .refine((amount) => amount !== 0, "An adjustment cannot be zero."),
  note: noteSchema,
});
export type AdjustmentInput = z.infer<typeof AdjustmentInput>;
