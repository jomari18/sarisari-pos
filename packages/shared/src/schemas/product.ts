import { z } from "zod";
import { isoTimeSchema, moneySchema, nameSchema } from "./common.js";

const ProductFields = z.strictObject({
  name: nameSchema(80),
  brand: nameSchema(40).nullish(),
  // EAN-8, UPC-A, EAN-13 and ITF-14 are all 8 to 14 digits.
  barcode: z.string().regex(/^\d{8,14}$/, "A barcode is 8 to 14 digits.").nullish(),
  categoryId: z.uuid(),
  unit: z.string().trim().min(1).max(12),
  priceCentavos: moneySchema,
  costCentavos: moneySchema,
  reorderLevel: z.int().min(0).max(9999),
  packSize: z.int().min(1).max(1000),
});

export const ProductInput = ProductFields.extend({ packSize: ProductFields.shape.packSize.default(1) });
export type ProductInput = z.infer<typeof ProductInput>;

/** Edits carry the `updatedAt` the editor saw, so a stale edit is refused (spec 8.3). */
export const ProductPatch = ProductFields.partial().extend({ expectedUpdatedAt: isoTimeSchema });
export type ProductPatch = z.infer<typeof ProductPatch>;

export const CategoryInput = z.strictObject({ name: nameSchema(30) });
export type CategoryInput = z.infer<typeof CategoryInput>;
