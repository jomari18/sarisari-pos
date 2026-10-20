import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "../src/services/hashing.js";
import { hashRefreshToken, newRefreshToken, signAccessToken, verifyAccessToken, type AuthUser } from "../src/services/tokens.js";

const SECRET = "test-jwt-secret-0123456789abcdefghijklmnop";
const user: AuthUser = {
  userId: "8f14e45f-ceea-4672-9a0b-2b1f7f7c1a01",
  storeId: "c9f0f895-fb98-4b91-8c6e-4a1d2f3e5b02",
  role: "BANTAY",
};
const issuedAt = new Date("2026-10-21T08:00:00+08:00");
const after = (ms: number) => new Date(issuedAt.getTime() + ms);
const segment = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const unauthenticated = { code: "unauthenticated" };

describe("secret hashing", () => {
  it("uses argon2id at the OWASP baseline and accepts only the right secret", async () => {
    const hash = await hashSecret("482915");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifySecret(hash, "482915")).toBe(true);
    expect(await verifySecret(hash, "482916")).toBe(false);
  });
});

describe("access tokens", () => {
  it("round-trips the signed-in user", async () => {
    const token = await signAccessToken(user, SECRET, issuedAt);
    expect(await verifyAccessToken(token, SECRET, after(60_000))).toEqual(user);
  });

  it("is an HS256 JWT with claims sub, store and role that lasts 15 minutes", async () => {
    const [header, payload] = (await signAccessToken(user, SECRET, issuedAt)).split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toMatchObject({ alg: "HS256" });
    const iat = issuedAt.getTime() / 1000;
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toEqual({
      sub: user.userId,
      store: user.storeId,
      role: user.role,
      iat,
      exp: iat + 15 * 60,
    });
  });

  it("accepts a token 1 s before 15 minutes and rejects it 15 minutes and 1 s after issue", async () => {
    const token = await signAccessToken(user, SECRET, issuedAt);
    await expect(verifyAccessToken(token, SECRET, after(15 * 60_000 - 1000))).resolves.toEqual(user);
    await expect(verifyAccessToken(token, SECRET, after(15 * 60_000 + 1000))).rejects.toMatchObject(unauthenticated);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signAccessToken(user, "another-secret-0123456789abcdefghijklmnop", issuedAt);
    await expect(verifyAccessToken(token, SECRET, issuedAt)).rejects.toMatchObject(unauthenticated);
  });

  it("rejects garbage and unsigned (alg none) tokens", async () => {
    const exp = issuedAt.getTime() / 1000 + 900;
    const unsigned = `${segment({ alg: "none", typ: "JWT" })}.${segment({ sub: user.userId, store: user.storeId, role: "OWNER", exp })}.`;
    await expect(verifyAccessToken("not-a-token", SECRET, issuedAt)).rejects.toMatchObject(unauthenticated);
    await expect(verifyAccessToken(unsigned, SECRET, issuedAt)).rejects.toMatchObject(unauthenticated);
  });

  it("rejects a correctly signed token whose claims are not a SariSari user", async () => {
    const forged = await new SignJWT({ store: user.storeId, role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(after(15 * 60_000))
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifyAccessToken(forged, SECRET, issuedAt)).rejects.toMatchObject(unauthenticated);
  });
});

describe("refresh tokens", () => {
  it("are 32 random bytes in base64url, stored as their SHA-256 hex hash", () => {
    const first = newRefreshToken();
    const second = newRefreshToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(first.token)).toBe(first.hash);
    expect(second.token).not.toBe(first.token);
  });
});
