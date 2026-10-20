import type { Role } from "@sari/shared";
import type { RequestHandler } from "express";
import { AppError } from "../http/errors.js";
import { verifyAccessToken } from "../services/tokens.js";

/** Business endpoints take the access token as `Authorization: Bearer`, never a cookie (spec 7.2: CSRF). */
export function requireAuth(secret: string, now: () => Date = () => new Date()): RequestHandler {
  return async (req, _res, next) => {
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) throw new AppError("unauthenticated", "Please sign in.");
    req.user = await verifyAccessToken(token, secret, now());
    next();
  };
}

/** Enforces the permissions table of spec 7.4. Use after `requireAuth`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new AppError("unauthenticated", "Please sign in.");
    if (!roles.includes(req.user.role)) throw new AppError("forbidden", "Only the owner can do this.");
    next();
  };
}
