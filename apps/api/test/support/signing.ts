import { SignJWT } from "jose";
import type { Config } from "../../src/config.js";

/** A valid `x-nf-sign` header, as Netlify's signed proxy sends it (HS256 JWS, issuer "netlify"). */
export async function signNetlify(secret: string, now = new Date()): Promise<string> {
  return new SignJWT({ deploy_context: "production", site_url: "https://sari.test", netlify_id: "test-site" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("netlify")
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + 60)
    .sign(new TextEncoder().encode(secret));
}

/** Test-only values; never used outside local tests. */
export const testEnv = {
  NODE_ENV: "test",
  PORT: "8080",
  DATABASE_URL: "postgres://sari:sari@127.0.0.1:55433/sari_test",
  JWT_SECRET: "test-jwt-secret-0123456789abcdefghij",
  PROXY_SIGNING_SECRET: "test-proxy-secret-0123456789abcdefgh",
  CLEANUP_SECRET: "test-cleanup-secret-0123456789abcdef",
  IP_HASH_SALT: "test-ip-salt-0123456789abcdefghijklm",
  SITE_ORIGIN: "https://sari.test",
} as const;

export type TestConfig = Config;
