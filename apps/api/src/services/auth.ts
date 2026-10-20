import { randomUUID } from "node:crypto";
import type { LoginInput, StoreView, UserView } from "@sari/shared";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import type { Store, User } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { toStoreView, toUserView } from "../http/views.js";
import { hashSecret, verifySecret } from "./hashing.js";
import { hashRefreshToken, newRefreshToken, signAccessToken } from "./tokens.js";

export type LoginResult = { accessToken: string; refreshToken: string; refreshExpiresAt: Date; user: UserView; store: StoreView };

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

const invalidCredentials = () => new AppError("invalid_credentials", "Wrong username, password or PIN.");
const signInAgain = () => new AppError("unauthenticated", "Please sign in again.");
const storeExpired = () => new AppError("session_expired", "This demo store has expired. Start a new demo from the home page.");

function accountLocked(lockedUntil: Date, now: Date): AppError {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
  return new AppError("account_locked", `Too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, {
    retryAfter: lockedUntil.toISOString(),
  });
}

// Unknown usernames are checked against a real hash too, so the answer takes as long as a wrong secret.
let timingHash: Promise<string> | undefined;
const timingDummy = () => (timingHash ??= hashSecret("sari-pos-timing-dummy"));

/** Opens a session family. The refresh token lives until the store expires (spec 7.2); only its hash is stored. */
export async function startSession(db: Db, config: Config, user: User, store: Store, now: Date): Promise<LoginResult> {
  const { token, hash } = newRefreshToken();
  await db.session.create({
    data: { userId: user.id, familyId: randomUUID(), tokenHash: hash, expiresAt: store.expiresAt, createdAt: now },
  });
  const accessToken = await signAccessToken({ userId: user.id, storeId: store.id, role: user.role }, config.JWT_SECRET, now);
  return { accessToken, refreshToken: token, refreshExpiresAt: store.expiresAt, user: toUserView(user), store: toStoreView(store) };
}

/**
 * Spec 7.1: a wrong secret, an unknown user and a deactivated user get the same answer. The 5th wrong
 * secret in a row locks the account for 15 minutes; while locked, even the right secret is refused.
 */
export async function login(db: Db, config: Config, input: LoginInput, now: Date): Promise<LoginResult> {
  const user = await db.user.findUnique({ where: { username: input.username }, include: { store: true } });
  if (!user || !user.active) {
    await verifySecret(await timingDummy(), input.secret);
    throw invalidCredentials();
  }
  if (user.lockedUntil && user.lockedUntil > now) throw accountLocked(user.lockedUntil, now);

  if (!(await verifySecret(user.secretHash, input.secret))) {
    const { failedAttempts } = await db.user.update({
      where: { id: user.id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    if (failedAttempts < MAX_FAILED_ATTEMPTS) throw invalidCredentials();
    const lockedUntil = new Date(now.getTime() + LOCK_MS);
    await db.user.update({ where: { id: user.id }, data: { lockedUntil, failedAttempts: 0 } });
    throw accountLocked(lockedUntil, now);
  }

  // Checked after the secret, so only someone who knows it learns that the store has expired.
  if (user.store.expiresAt <= now) throw storeExpired();
  if (user.failedAttempts > 0 || user.lockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
  }
  return startSession(db, config, user, user.store, now);
}

/**
 * Rotation (spec 7.2): every refresh replaces the token. A replaced token that comes back may have been
 * copied, so it ends every session in its family.
 */
export async function refresh(db: Db, config: Config, token: string, now: Date): Promise<Omit<LoginResult, "user" | "store">> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    include: { user: { include: { store: true } } },
  });
  if (!session || session.revokedAt) throw signInAgain();
  if (session.replacedById) {
    await revokeFamily(db, session.familyId, now);
    throw signInAgain();
  }
  const { user } = session;
  if (session.expiresAt <= now || user.store.expiresAt <= now) throw storeExpired();
  if (!user.active) throw signInAgain();

  const next = newRefreshToken();
  const nextId = randomUUID();
  const rotated = await db.$transaction(async (tx) => {
    // Only one of two simultaneous refreshes with the same token can claim it.
    const { count } = await tx.session.updateMany({
      where: { id: session.id, replacedById: null, revokedAt: null },
      data: { replacedById: nextId },
    });
    if (count === 0) return false;
    await tx.session.create({
      data: { id: nextId, userId: user.id, familyId: session.familyId, tokenHash: next.hash, expiresAt: session.expiresAt, createdAt: now },
    });
    return true;
  });
  if (!rotated) {
    await revokeFamily(db, session.familyId, now);
    throw signInAgain();
  }
  const accessToken = await signAccessToken({ userId: user.id, storeId: user.storeId, role: user.role }, config.JWT_SECRET, now);
  return { accessToken, refreshToken: next.token, refreshExpiresAt: session.expiresAt };
}

export async function logout(db: Db, token: string, now: Date): Promise<void> {
  const session = await db.session.findUnique({ where: { tokenHash: hashRefreshToken(token) }, select: { familyId: true } });
  if (session) await revokeFamily(db, session.familyId, now);
}

/** Used when the owner deactivates a bantay (spec 7.2): every device of that user must sign in again. */
export async function revokeUserSessions(db: Db, userId: string, now: Date): Promise<void> {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
}

async function revokeFamily(db: Db, familyId: string, now: Date): Promise<void> {
  await db.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } });
}
