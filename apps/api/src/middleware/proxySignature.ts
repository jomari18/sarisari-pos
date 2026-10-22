import type { RequestHandler } from "express";
import { jwtVerify } from "jose";
import { AppError } from "../http/errors.js";

/**
 * Netlify signs every proxied request with an HS256 JWS in `x-nf-sign` (spec 4). Requiring it means
 * nobody can call the Render service directly, so headers such as the client IP can be trusted.
 */
export function requireProxySignature(secret: string): RequestHandler {
  const key = new TextEncoder().encode(secret);
  return async (req, _res, next) => {
    const token = req.header("x-nf-sign");
    try {
      if (!token) throw new Error("missing signature");
      await jwtVerify(token, key, { algorithms: ["HS256"], issuer: "netlify" });
      next();
    } catch {
      next(new AppError("bad_proxy_signature", "This request must come through the ZariZari website."));
    }
  };
}
