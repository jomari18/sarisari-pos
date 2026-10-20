import { randomInt, randomUUID } from "node:crypto";
import { PinSchema, manilaDate, manilaDayStart, type DemoLogins, type Role } from "@sari/shared";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { Prisma, type Store, type User } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { generateDemoData, type DemoData } from "../seed/generateDemo.js";
import { startSession, type LoginResult } from "./auth.js";
import { hashSecret } from "./hashing.js";

const STORE_NAME = "Tindahan ni Mang Ben";
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEMOS_PER_IP_PER_DAY = 5;
const MAX_ACTIVE_STORES = 200;
const CODE_ATTEMPTS = 5;
const BATCH_SIZE = 1000;
/** Expired stores removed while a visitor waits; the daily cleanup job removes the rest. */
const CLEANUP_ON_CREATE = 5;

type Tx = Prisma.TransactionClient;

const randomString = (alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet.charAt(randomInt(alphabet.length))).join("");

/** 4 characters without look-alikes (no i, l, o, 0 or 1), for usernames such as mayari.7k2f. */
export const randomStoreCode = (): string => randomString(CODE_ALPHABET, 4);

function randomPin(): string {
  for (;;) {
    const pin = String(randomInt(1_000_000)).padStart(6, "0");
    if (PinSchema.safeParse(pin).success) return pin;
  }
}

function demoLimit(now: Date): AppError {
  const tomorrow = new Date(manilaDayStart(manilaDate(now)).getTime() + DAY_MS);
  return new AppError(
    "demo_limit",
    "You have opened 5 demo stores today. Come back tomorrow, or sign in with the demo logins you already have.",
    { retryAfter: tomorrow.toISOString() },
  );
}

/**
 * Spec 7.5: a new "Tindahan ni Mang Ben" with a month of seeded history, the owner Mang Ben and the
 * bantay Nena. Signs the visitor in as the owner and returns both logins once.
 */
export async function createDemoStore(
  db: Db,
  config: Config,
  ipHash: string,
  now: Date,
  makeCode: () => string = randomStoreCode,
): Promise<LoginResult & { demoLogins: DemoLogins; expiresAt: Date }> {
  const day = manilaDate(now);
  const quota = await db.demoQuota.findUnique({ where: { ipHash_day: { ipHash, day } } });
  if (quota && quota.count >= DEMOS_PER_IP_PER_DAY) throw demoLimit(now);

  await deleteExpiredStores(db, now, CLEANUP_ON_CREATE);
  if ((await db.store.count({ where: { expiresAt: { gt: now } } })) >= MAX_ACTIVE_STORES) {
    throw new AppError("demo_full", "All demo stores are in use right now. Please try again in a little while.");
  }

  const password = randomString(PASSWORD_ALPHABET, 16);
  const pin = randomPin();
  const [passwordHash, pinHash] = await Promise.all([hashSecret(password), hashSecret(pin)]);
  const data = generateDemoData({ seed: randomInt(2 ** 32), now });
  const seeded = { data, passwordHash, pinHash, ipHash, day, now, expiresAt: new Date(now.getTime() + DAY_MS) };

  let created: { store: Store; owner: User; bantay: User } | undefined;
  for (let attempt = 1; !created; attempt++) {
    try {
      created = await insertDemoStore(db, makeCode(), seeded);
    } catch (err) {
      // Another store took the code (or its usernames) first: try a fresh one.
      const taken = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!taken || attempt >= CODE_ATTEMPTS) throw err;
    }
  }

  const { store, owner, bantay } = created;
  const session = await startSession(db, config, owner, store, now);
  return {
    ...session,
    demoLogins: { owner: { username: owner.username, password }, bantay: { username: bantay.username, pin } },
    expiresAt: store.expiresAt,
  };
}

type Seeded = { data: DemoData; passwordHash: string; pinHash: string; ipHash: string; day: string; now: Date; expiresAt: Date };

/** One transaction: either the whole store with its history exists, or none of it does. */
function insertDemoStore(db: Db, code: string, s: Seeded): Promise<{ store: Store; owner: User; bantay: User }> {
  return db.$transaction(
    async (tx) => {
      const store = await tx.store.create({
        data: { code, name: STORE_NAME, nextReceiptNo: s.data.sales.length + 1, createdAt: s.now, expiresAt: s.expiresAt },
      });
      const owner = await tx.user.create({
        data: { storeId: store.id, role: "OWNER", username: `mayari.${code}`, displayName: "Mang Ben", secretHash: s.passwordHash, secretKind: "PASSWORD", createdAt: s.now },
      });
      const bantay = await tx.user.create({
        data: { storeId: store.id, role: "BANTAY", username: `nena.${code}`, displayName: "Nena", secretHash: s.pinHash, secretKind: "PIN", createdAt: s.now },
      });
      await insertHistory(tx, store.id, { OWNER: owner.id, BANTAY: bantay.id }, s.data);

      // Counted inside the transaction, so two requests at once cannot both slip past the limit.
      const quota = await tx.demoQuota.upsert({
        where: { ipHash_day: { ipHash: s.ipHash, day: s.day } },
        create: { ipHash: s.ipHash, day: s.day, count: 1 },
        update: { count: { increment: 1 } },
      });
      if (quota.count > DEMOS_PER_IP_PER_DAY) throw demoLimit(s.now);
      return { store, owner, bantay };
    },
    { maxWait: 5_000, timeout: 20_000 },
  );
}

/** Turns the generator's array indexes into ids and inserts the rows in batches. */
async function insertHistory(tx: Tx, storeId: string, users: Record<Role, string>, data: DemoData): Promise<void> {
  const categoryIds = data.categories.map(() => randomUUID());
  const productIds = data.products.map(() => randomUUID());
  const customerIds = data.customers.map(() => randomUUID());
  const saleIds = data.sales.map(() => randomUUID());
  const saleId = (sale: number | null) => (sale === null ? null : saleIds[sale]!);

  await tx.category.createMany({ data: data.categories.map((c, i) => ({ id: categoryIds[i]!, storeId, name: c.name })) });
  await tx.product.createMany({
    data: data.products.map((p, i) => ({
      id: productIds[i]!,
      storeId,
      categoryId: categoryIds[p.category]!,
      name: p.name,
      brand: p.brand,
      barcode: p.barcode,
      unit: p.unit,
      priceCentavos: p.priceCentavos,
      costCentavos: p.costCentavos,
      stock: p.stock,
      reorderLevel: p.reorderLevel,
      packSize: p.packSize,
    })),
  });
  await tx.customer.createMany({
    data: data.customers.map((c, i) => ({
      id: customerIds[i]!,
      storeId,
      name: c.name,
      phone: c.phone,
      creditLimitCentavos: c.creditLimitCentavos,
      balanceCentavos: c.balanceCentavos,
      createdAt: c.createdAt,
    })),
  });
  await inBatches(
    data.sales.map((s, i) => ({
      id: saleIds[i]!,
      storeId,
      cashierId: users[s.cashier],
      receiptNo: s.receiptNo,
      soldAt: s.soldAt,
      receivedAt: s.soldAt,
      source: "ONLINE" as const,
      method: s.method,
      totalCentavos: s.totalCentavos,
      tenderedCentavos: s.tenderedCentavos,
      changeCentavos: s.changeCentavos,
      gcashRef: s.gcashRef,
      customerId: s.customer === null ? null : customerIds[s.customer]!,
    })),
    (batch) => tx.sale.createMany({ data: batch }),
  );
  await inBatches(
    data.sales.flatMap((s, i) =>
      s.lines.map((line) => ({
        saleId: saleIds[i]!,
        productId: productIds[line.product]!,
        name: line.name,
        quantity: line.quantity,
        unitPriceCentavos: line.unitPriceCentavos,
        unitCostCentavos: line.unitCostCentavos,
        lineTotalCentavos: line.lineTotalCentavos,
      })),
    ),
    (batch) => tx.saleItem.createMany({ data: batch }),
  );
  await inBatches(
    data.movements.map((m) => ({
      storeId,
      productId: productIds[m.product]!,
      change: m.change,
      reason: m.reason,
      saleId: saleId(m.sale),
      userId: users[m.user],
      note: m.note,
      stockAfter: m.stockAfter,
      createdAt: m.createdAt,
    })),
    (batch) => tx.stockMovement.createMany({ data: batch }),
  );
  await inBatches(
    data.utangEntries.map((e) => ({
      storeId,
      customerId: customerIds[e.customer]!,
      kind: e.kind,
      amountCentavos: e.amountCentavos,
      method: e.method,
      saleId: saleId(e.sale),
      userId: users[e.user],
      note: e.note,
      balanceAfter: e.balanceAfter,
      createdAt: e.createdAt,
    })),
    (batch) => tx.utangEntry.createMany({ data: batch }),
  );
}

async function inBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) await insert(rows.slice(i, i + BATCH_SIZE));
}

/**
 * Deletes up to `limit` expired stores; everything they own goes with them. Quotas from earlier Manila
 * days no longer limit anyone, so their hashes are dropped too (spec 12).
 */
export async function deleteExpiredStores(db: Db, now: Date, limit = 20): Promise<number> {
  const expired = await db.store.findMany({ where: { expiresAt: { lte: now } }, orderBy: { expiresAt: "asc" }, take: limit, select: { id: true } });
  const { count } = expired.length > 0 ? await db.store.deleteMany({ where: { id: { in: expired.map((s) => s.id) } } }) : { count: 0 };
  await db.demoQuota.deleteMany({ where: { day: { lt: manilaDate(now) } } });
  return count;
}
