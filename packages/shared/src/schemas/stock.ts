import { z } from "../zod.js";
import { moneySchema, noteSchema } from "./common.js";

export const RestockInput = z
  .strictObject({
    productId: z.uuid(),
    boxes: z.int().min(1).max(999).optional(),
    pieces: z.int().min(1).max(99_999).optional(),
    unitCostCentavos: moneySchema,
  })
  .refine((input) => input.boxes !== undefined || input.pieces !== undefined, {
    message: "Enter the boxes or the pieces received.",
    path: ["pieces"],
  });
export type RestockInput = z.infer<typeof RestockInput>;

export const AdjustInput = z.union([
  z.strictObject({ productId: z.uuid(), counted: z.int().min(0).max(99_999), note: noteSchema.optional() }),
  z.strictObject({
    productId: z.uuid(),
    quantity: z.int().min(1).max(99_999),
    reason: z.enum(["SPOILAGE", "EXPIRED"]),
    note: noteSchema.optional(),
  }),
]);
export type AdjustInput = z.infer<typeof AdjustInput>;
