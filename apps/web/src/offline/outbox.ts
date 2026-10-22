import type { SaleInput, SyncResult } from "@sari/shared";
import { getSession } from "../auth/session";
import { offlineDb, type QueuedSale } from "./db";
import { updateSyncStatus } from "./status";

// The sales outbox (spec 9). Each queued sale belongs to the cashier who made it: only that cashier's
// session sends it, so the server records the right person.

const listeners = new Set<() => void>();

/** Runs `listener` after every change to the outbox; returns the way to stop. */
export function onOutboxChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function changed(): Promise<void> {
  await refreshCounts();
  for (const listener of listeners) listener();
}

function cashier(): { storeId: string; userId: string } | null {
  const session = getSession();
  return session ? { storeId: session.store.id, userId: session.user.id } : null;
}

const mine = (who: { storeId: string; userId: string }) => (row: QueuedSale) => row.storeId === who.storeId && row.userId === who.userId;

/** Queues a sale to send later. The id comes from the device, so queuing the same sale twice keeps one. */
export async function enqueueSale(sale: SaleInput): Promise<void> {
  const who = cashier();
  if (!who) throw new Error("Sign in to sell.");
  await offlineDb.transaction("rw", offlineDb.outbox, async () => {
    if ((await offlineDb.outbox.where("id").equals(sale.id).count()) > 0) return;
    await offlineDb.outbox.add({ id: sale.id, ...who, sale, status: "pending", error: null });
  });
  await changed();
}

/** This cashier's sales waiting to be sent. */
export async function pendingCount(): Promise<number> {
  const who = cashier();
  if (!who) return 0;
  return offlineDb.outbox.where("status").equals("pending").filter(mine(who)).count();
}

/** This cashier's sales the server refused, oldest first, with its reason (spec 9: "Couldn't sync"). */
export async function failedSales(): Promise<QueuedSale[]> {
  const who = cashier();
  if (!who) return [];
  return offlineDb.outbox.orderBy("seq").filter((row) => row.status === "failed" && mine(who)(row)).toArray();
}

/** The next sales to send, oldest first. */
export async function nextBatch(size: number): Promise<QueuedSale[]> {
  const who = cashier();
  if (!who) return [];
  return offlineDb.outbox.orderBy("seq").filter((row) => row.status === "pending" && mine(who)(row)).limit(size).toArray();
}

/** Applies the server's answers: recorded and already-recorded sales leave the outbox; refused ones stay, marked failed. */
export async function settle(results: SyncResult[]): Promise<{ sent: number; flagged: number; failed: number }> {
  const tally = { sent: 0, flagged: 0, failed: 0 };
  await offlineDb.transaction("rw", offlineDb.outbox, async () => {
    for (const result of results) {
      const row = offlineDb.outbox.where("id").equals(result.id);
      if (result.status === "invalid") {
        tally.failed += 1;
        await row.modify({ status: "failed", error: result.error ?? { code: "invalid_input", message: "The server refused this sale." } });
      } else {
        tally.sent += 1;
        if (result.flags.length > 0) tally.flagged += 1;
        await row.delete();
      }
    }
  });
  await changed();
  return tally;
}

export async function retrySale(id: string): Promise<void> {
  await offlineDb.outbox.where("id").equals(id).modify({ status: "pending", error: null });
  await changed();
}

export async function removeSale(id: string): Promise<void> {
  await offlineDb.outbox.where("id").equals(id).delete();
  await changed();
}

/** Every sale still on this device, any cashier's: what logging out would lose. */
export function deviceQueueCount(): Promise<number> {
  return offlineDb.outbox.count();
}

/** Logging out, or giving up on an ended store: the device forgets its queue and catalog (spec 7.2). */
export async function clearDevice(): Promise<void> {
  await Promise.all([offlineDb.outbox.clear(), offlineDb.catalogs.clear()]);
  await changed();
}

/** Brings the badge's counts up to date. */
export async function refreshCounts(): Promise<void> {
  const [pending, failed] = await Promise.all([pendingCount(), failedSales().then((rows) => rows.length)]);
  updateSyncStatus({ pending, failed });
}
