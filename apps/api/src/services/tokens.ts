import { createHash, randomBytes } from "node:crypto";
import { ROLES, type Role } from "@sari/shared";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { AppError } from "../http/errors.js";

/** Who is calling, from the access token. `storeId` scopes every query (spec 4.3). */
export type AuthUser = { userId: string; storeId: string; role: Role };

const ACCESS_TOKEN_SECONDS = 15 * 60;

const Claims = z.object({ sub: z.uuid(), store: z.uuid(), role: z.enum(ROLES) });

const key = (secret: string) => new TextEncoder().encode(secret);

/** Access token (spec 7): HS256, 15 minutes, claims `sub`, `store` and `role`. */
export function signAccessToken(user: AuthUser, secret: string, now: Date): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ store: user.storeId, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_SECONDS)
    .sign(key(secret));
}

/** Any bad, expired or foreign token answers 401 unauthenticated, so the web app refreshes or signs in again. */
export async function verifyAccessToken(token: string, secret: string, now = new Date()): Promise<AuthUser> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"], currentDate: now });
    const claims = Claims.parse(payload);
    return { userId: claims.sub, storeId: claims.store, role: claims.role };
  } catch {
    throw new AppError("unauthenticated", "Please sign in.");
  }
}

/** Refresh token (spec 7): 32 random bytes for the cookie; only the SHA-256 hash is stored. */
export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
