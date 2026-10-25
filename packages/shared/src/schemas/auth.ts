import { z } from "../zod.js";

const isRun = (digits: number[], step: number) => digits.every((d, i) => i === 0 || d === digits[i - 1]! + step);

/** A 6-digit bantay PIN that is not an obvious pattern (spec 7.1). */
export const PinSchema = z
  .string()
  .regex(/^\d{6}$/, "The PIN must be 6 digits.")
  .refine((pin) => {
    const digits = [...pin].map(Number);
    return !isRun(digits, 0) && !isRun(digits, 1) && !isRun(digits, -1);
  }, "Choose a PIN that is harder to guess, not a repeated digit or a run like 123456.");

export const LoginInput = z.strictObject({
  username: z.string().trim().toLowerCase().min(3).max(40),
  secret: z.string().min(6).max(128),
});
export type LoginInput = z.infer<typeof LoginInput>;
