import type { Request } from "express";
import type { z } from "zod";

/** A route parameter the path declares, such as `:id`; anything unexpected becomes "" (a lookup then answers 404). */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === "string" ? value : "";
}

/** Validates a request part with a shared schema; a ZodError becomes a 400 in the error handler. */
export function parseBody<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  return schema.parse(value);
}
