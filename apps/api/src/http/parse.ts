import type { z } from "zod";

/** Validates a request part with a shared schema; a ZodError becomes a 400 in the error handler. */
export function parseBody<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  return schema.parse(value);
}
