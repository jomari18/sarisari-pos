import type { Request, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit, type RateLimitInfo } from "express-rate-limit";
import { AppError } from "../http/errors.js";
import { clientIp } from "./clientIp.js";

/**
 * 20 sign-in requests per visitor IP per 15 minutes, whatever the username (spec 7.1). The count lives in
 * memory because the API runs as a single instance; each app gets its own counter.
 */
export function loginLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // The visitor's IP comes from Netlify's signed proxy (clientIp), not Express's req.ip, so the
    // proxy-header checks do not apply. IPv6 addresses are grouped by their /56 network.
    keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
    validate: { trustProxy: false, xForwardedForHeader: false, forwardedHeader: false },
    handler: (req, _res, next) => {
      const resetTime = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit?.resetTime;
      next(
        new AppError("rate_limited", "Too many sign-in attempts from this network. Please wait a few minutes and try again.", {
          retryAfter: resetTime?.toISOString(),
        }),
      );
    },
  });
}
