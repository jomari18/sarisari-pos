import { z } from "zod";
import { PinSchema } from "./auth.js";
import { nameSchema } from "./common.js";

export const StaffInput = z.strictObject({ displayName: nameSchema(30), pin: PinSchema });
export type StaffInput = z.infer<typeof StaffInput>;

export const StaffPatch = z
  .strictObject({ pin: PinSchema.optional(), active: z.boolean().optional() })
  .refine((patch) => patch.pin !== undefined || patch.active !== undefined, "Change the PIN or the active status.");
export type StaffPatch = z.infer<typeof StaffPatch>;
