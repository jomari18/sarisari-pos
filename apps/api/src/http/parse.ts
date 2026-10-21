import { manilaDate, manilaDayStart } from "@sari/shared";
import type { Request } from "express";
import { z } from "zod";

/** A route parameter the path declares, such as `:id`; anything unexpected becomes "" (a lookup then answers 404). */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === "string" ? value : "";
}

/** Validates a request part with a shared schema; a ZodError becomes a 400 in the error handler. */
export function parseBody<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  return schema.parse(value);
}

/** A real calendar date such as 2026-10-21, read as a Manila day (2026-02-30 is refused). */
export const manilaDateParam = z
  .string()
  .refine((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && manilaDate(manilaDayStart(date)) === date, "Use a date like 2026-10-21.");
