import { createHmac } from "node:crypto";

/**
 * Local development only: signs a proxied request the way Netlify's signed proxy does (an HS256 JWS in
 * `x-nf-sign`, issuer "netlify", valid for a minute), so the API accepts requests from the Vite dev server.
 */
export function netlifySignature(secret: string, now = Date.now()): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(now / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: "netlify", iat: issuedAt, exp: issuedAt + 60 })}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}
