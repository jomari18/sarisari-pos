import {
  formatPeso,
  type AdjustmentInput,
  type CustomerInput,
  type CustomerLedger,
  type CustomerPatch,
  type CustomerView,
  type LedgerEntryView,
  type PaymentRecordInput,
} from "@sari/shared";
import { z } from "zod";
import type { Db } from "../db.js";
import { Prisma, type Customer } from "../generated/prisma/client.js";
import { agingBuckets, type Aging } from "../domain/aging.js";
import { AppError } from "../http/errors.js";
import { containsPattern } from "./search.js";
import type { AuthUser } from "./tokens.js";

const ENTRY_INCLUDE = {
  sale: { select: { id: true, receiptNo: true } },
  user: { select: { id: true, displayName: true } },
} satisfies Prisma.UtangEntryInclude;
type EntryRow = Prisma.UtangEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

/** Ledger order: by time, then by insertion for entries recorded at the same instant. */
const LEDGER_ORDER = [{ createdAt: "asc" }, { seq: "asc" }] satisfies Prisma.UtangEntryOrderByWithRelationInput[];

const sukiNotFound = () => new AppError("not_found", "This suki does not exist.");

function toEntryView(row: EntryRow): LedgerEntryView {
  return {
    id: row.id,
    kind: row.kind,
    amountCentavos: row.amountCentavos,
    method: row.method,
    sale: row.sale,
    note: row.note,
    balanceAfter: row.balanceAfter,
    createdAt: row.createdAt.toISOString(),
    user: row.user,
  };
}

/** Each suki's aging from their ledger (spec 6.8), read in one query. */
export async function agingByCustomer(db: Db, customerIds: string[], now: Date): Promise<Map<string, Aging>> {
  const entries = customerIds.length
    ? await db.utangEntry.findMany({
        where: { customerId: { in: customerIds } },
        select: { customerId: true, kind: true, amountCentavos: true, createdAt: true, saleId: true },
        orderBy: LEDGER_ORDER,
      })
    : [];
  return new Map(customerIds.map((id) => [id, agingBuckets(entries.filter((entry) => entry.customerId === id), now)]));
}

/** Adds each suki's oldest unpaid days. Only the ledgers of suki who owe are read. */
async function toCustomerViews(db: Db, rows: Customer[], now: Date): Promise<CustomerView[]> {
  const aging = await agingByCustomer(db, rows.filter((row) => row.balanceCentavos > 0).map((row) => row.id), now);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    creditLimitCentavos: row.creditLimitCentavos,
    balanceCentavos: row.balanceCentavos,
    oldestUnpaidDays: aging.get(row.id)?.oldestUnpaidDays ?? null,
  }));
}

async function customerView(db: Db, id: string, now: Date): Promise<CustomerView> {
  return (await toCustomerViews(db, [await db.customer.findUniqueOrThrow({ where: { id } })], now))[0]!;
}

/** Another store's suki answers exactly like one that does not exist (spec 6.10). */
async function findSuki(db: Db, user: AuthUser, id: string): Promise<Customer> {
  if (!z.uuid().safeParse(id).success) throw sukiNotFound();
  const row = await db.customer.findFirst({ where: { id, storeId: user.storeId } });
  if (!row) throw sukiNotFound();
  return row;
}

export async function listCustomers(db: Db, user: AuthUser, query: { search?: string }, now: Date): Promise<CustomerView[]> {
  const ids = query.search
    ? (
        await db.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Customer"
          WHERE "storeId" = ${user.storeId}::uuid AND unaccent("name") ILIKE unaccent(${containsPattern(query.search)})`
      ).map((row) => row.id)
    : undefined;
  const rows = await db.customer.findMany({
    where: { storeId: user.storeId, archived: false, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { name: "asc" },
  });
  return toCustomerViews(db, rows, now);
}

/** Anyone can add a suki; every new suki starts with a credit limit of 0, meaning no utang (spec 8.5). */
export async function createCustomer(db: Db, user: AuthUser, input: CustomerInput, now: Date): Promise<CustomerView> {
  const row = await db.customer.create({ data: { storeId: user.storeId, name: input.name, phone: input.phone ?? null, createdAt: now } });
  return (await toCustomerViews(db, [row], now))[0]!;
}

/** Name and phone: anyone. The credit limit: the owner only (spec 7.4). */
export async function updateCustomer(db: Db, user: AuthUser, id: string, patch: CustomerPatch, now: Date): Promise<CustomerView> {
  const row = await findSuki(db, user, id);
  if (patch.creditLimitCentavos !== undefined && user.role !== "OWNER") {
    throw new AppError("forbidden", "Only the owner can change a credit limit.");
  }
  await db.customer.update({
    where: { id: row.id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.creditLimitCentavos !== undefined ? { creditLimitCentavos: patch.creditLimitCentavos } : {}),
    },
  });
  return customerView(db, row.id, now);
}

export async function getLedger(db: Db, user: AuthUser, id: string, now: Date): Promise<CustomerLedger> {
  const row = await findSuki(db, user, id);
  const entries = await db.utangEntry.findMany({ where: { customerId: row.id }, include: ENTRY_INCLUDE, orderBy: LEDGER_ORDER });
  return { customer: (await toCustomerViews(db, [row], now))[0]!, entries: entries.map(toEntryView) };
}

type LedgerChange = { customer: CustomerView; entry: LedgerEntryView };

/**
 * Spec 6.8: cash or GCash, at most the current balance. The payment id comes from the device, so a retried
 * payment is applied once (spec 6.2).
 */
export async function recordPayment(
  db: Db,
  user: AuthUser,
  customerId: string,
  input: PaymentRecordInput,
  now: Date,
): Promise<LedgerChange & { duplicate: boolean }> {
  const customer = await findSuki(db, user, customerId);
  const stored = await storedPayment(db, customer, input.id, now);
  if (stored) return { ...stored, duplicate: true };

  try {
    const entry = await db.$transaction(async (tx) => {
      // Money comes off the balance only while the balance covers it, so two payments at once cannot overpay.
      const [row] = await tx.$queryRaw<{ balanceCentavos: number }[]>`
        UPDATE "Customer" SET "balanceCentavos" = "balanceCentavos" - ${input.amountCentavos}
        WHERE "id" = ${customer.id}::uuid AND "balanceCentavos" >= ${input.amountCentavos}
        RETURNING "balanceCentavos"`;
      if (!row) {
        const { balanceCentavos } = await tx.customer.findUniqueOrThrow({ where: { id: customer.id } });
        throw new AppError("overpayment", `This is more than the utang balance of ${formatPeso(balanceCentavos)}.`, { field: "amountCentavos" });
      }
      return tx.utangEntry.create({
        data: {
          id: input.id,
          storeId: user.storeId,
          customerId: customer.id,
          kind: "PAYMENT",
          amountCentavos: -input.amountCentavos,
          method: input.method,
          userId: user.userId,
          balanceAfter: row.balanceCentavos,
          createdAt: now,
        },
        include: ENTRY_INCLUDE,
      });
    });
    return { customer: await customerView(db, customer.id, now), entry: toEntryView(entry), duplicate: false };
  } catch (err) {
    const sameId = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
    const winner = sameId ? await storedPayment(db, customer, input.id, now) : null;
    if (!winner) throw err;
    return { ...winner, duplicate: true };
  }
}

/** The payment already recorded with this id. An id used for another suki or store is refused. */
async function storedPayment(db: Db, customer: Customer, id: string, now: Date): Promise<LedgerChange | null> {
  const entry = await db.utangEntry.findUnique({ where: { id }, include: ENTRY_INCLUDE });
  if (!entry) return null;
  if (entry.customerId !== customer.id || entry.kind !== "PAYMENT") {
    throw new AppError("invalid_input", "This payment id is already in use.", { field: "id" });
  }
  return { customer: await customerView(db, customer.id, now), entry: toEntryView(entry) };
}

/** Owner only (spec 7.4): corrects a balance with a note. It never takes the balance below zero. */
export async function adjustBalance(db: Db, user: AuthUser, customerId: string, input: AdjustmentInput, now: Date): Promise<LedgerChange> {
  const customer = await findSuki(db, user, customerId);
  const entry = await db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ balanceCentavos: number }[]>`
      UPDATE "Customer" SET "balanceCentavos" = "balanceCentavos" + ${input.amountCentavos}
      WHERE "id" = ${customer.id}::uuid AND "balanceCentavos" + ${input.amountCentavos} >= 0
      RETURNING "balanceCentavos"`;
    if (!row) throw new AppError("invalid_input", "This adjustment would take the balance below zero.", { field: "amountCentavos" });
    return tx.utangEntry.create({
      data: {
        storeId: user.storeId,
        customerId: customer.id,
        kind: "ADJUSTMENT",
        amountCentavos: input.amountCentavos,
        userId: user.userId,
        note: input.note,
        balanceAfter: row.balanceCentavos,
        createdAt: now,
      },
      include: ENTRY_INCLUDE,
    });
  });
  return { customer: await customerView(db, customer.id, now), entry: toEntryView(entry) };
}

/** A polite reminder to copy into a text message (spec 8.5). */
export function reminderText(customer: { name: string; balanceCentavos: number }, store: { name: string }): string {
  return `Hi ${customer.name}, paalala lang po sa utang ninyo na ${formatPeso(customer.balanceCentavos)} sa ${store.name}. Salamat po!`;
}

export async function getReminder(db: Db, user: AuthUser, customerId: string): Promise<string> {
  const customer = await findSuki(db, user, customerId);
  const store = await db.store.findUniqueOrThrow({ where: { id: user.storeId } });
  return reminderText(customer, store);
}
