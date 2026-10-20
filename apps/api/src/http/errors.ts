import { ERROR_STATUS, type ApiErrorBody, type ErrorCode } from "@sari/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../logger.js";

/** An error the API answers with on purpose, in the spec 8.7 format. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly field?: string;
  readonly retryAfter?: string;

  constructor(code: ErrorCode, message: string, opts: { field?: string; retryAfter?: string } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.field = opts.field;
    this.retryAfter = opts.retryAfter;
  }
}

function body(code: ErrorCode, message: string, field?: string, retryAfter?: string): ApiErrorBody {
  return { error: { code, message, ...(field ? { field } : {}), ...(retryAfter ? { retryAfter } : {}) } };
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError("not_found", "This page or item does not exist."));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(ERROR_STATUS[err.code]).json(body(err.code, err.message, err.field, err.retryAfter));
    return;
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue && issue.path.length > 0 ? issue.path.join(".") : undefined;
    res.status(400).json(body("invalid_input", issue?.message ?? "Some details are not valid.", field));
    return;
  }
  // body-parser marks its own errors with a `type`.
  const type = (err as { type?: string }).type;
  if (type === "entity.too.large") {
    res.status(400).json(body("invalid_input", "The request is too large."));
    return;
  }
  if (type === "entity.parse.failed") {
    res.status(400).json(body("invalid_input", "The request could not be read."));
    return;
  }
  logger.error({ err }, "unhandled error");
  res.status(503).json(body("service_unavailable", "Something went wrong. Please try again in a moment."));
};
