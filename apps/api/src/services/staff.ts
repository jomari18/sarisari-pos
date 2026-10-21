import type { StaffInput, StaffPatch, StaffView } from "@sari/shared";
import { z } from "zod";
import type { Db } from "../db.js";
import { Prisma, type User } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { revokeUserSessions } from "./auth.js";
import { hashSecret } from "./hashing.js";
import type { AuthUser } from "./tokens.js";

/** Spec 6.11. Deactivated accounts count too: reactivate one or reset its PIN instead of adding another. */
const MAX_BANTAY = 5;
const USERNAME_ATTEMPTS = 3;

function toStaffView(row: User): StaffView {
  return { id: row.id, role: row.role, username: row.username, displayName: row.displayName, active: row.active };
}

/** The name part of a username: lowercase ASCII letters only, at most 12 ("Ate Niña Joy" → "ateninajoy"). */
export function usernameSlug(displayName: string): string {
  const letters = displayName.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 12);
  return letters || "bantay";
}

export async function listStaff(db: Db, user: AuthUser): Promise<StaffView[]> {
  const rows = await db.user.findMany({ where: { storeId: user.storeId, role: "BANTAY" }, orderBy: [{ createdAt: "asc" }, { username: "asc" }] });
  return rows.map(toStaffView);
}

/** Usernames look like nena.7k2f; a second Nena in the same store becomes nena2.7k2f. */
export async function addBantay(db: Db, user: AuthUser, input: StaffInput): Promise<StaffView> {
  const store = await db.store.findUniqueOrThrow({ where: { id: user.storeId } });
  if ((await db.user.count({ where: { storeId: store.id, role: "BANTAY" } })) >= MAX_BANTAY) {
    throw new AppError("limit_reached", "A store can have up to 5 bantay accounts. Reactivate one or reset its PIN instead.");
  }
  const secretHash = await hashSecret(input.pin);
  const base = usernameSlug(input.displayName);
  const suffix = `.${store.code}`;

  for (let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt++) {
    const rows = await db.user.findMany({ where: { username: { startsWith: base, endsWith: suffix } }, select: { username: true } });
    const taken = new Set(rows.map((row) => row.username));
    let username = `${base}${suffix}`;
    for (let n = 2; taken.has(username); n++) username = `${base}${n}${suffix}`;
    try {
      const row = await db.user.create({
        data: { storeId: store.id, role: "BANTAY", username, displayName: input.displayName, secretHash, secretKind: "PIN" },
      });
      return toStaffView(row);
    } catch (err) {
      // Someone took that username a moment ago: look again.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  throw new AppError("service_unavailable", "Could not pick a username right now. Please try again.");
}

/** Reset a PIN or (de)activate a bantay. A new PIN or a deactivation ends their sessions on every device (spec 7.2). */
export async function updateStaff(db: Db, user: AuthUser, id: string, patch: StaffPatch, now: Date): Promise<StaffView> {
  const target = z.uuid().safeParse(id).success ? await db.user.findFirst({ where: { id, storeId: user.storeId, role: "BANTAY" } }) : null;
  if (!target) throw new AppError("not_found", "This bantay does not exist.");

  const updated = await db.user.update({
    where: { id: target.id },
    data: {
      ...(patch.pin !== undefined ? { secretHash: await hashSecret(patch.pin), failedAttempts: 0, lockedUntil: null } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    },
  });
  if (patch.pin !== undefined || patch.active === false) await revokeUserSessions(db, target.id, now);
  return toStaffView(updated);
}
