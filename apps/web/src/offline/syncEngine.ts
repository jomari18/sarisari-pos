import type { SyncResult } from "@sari/shared";
import { ApiError, api, endSessionFor, refreshSession } from "../api/client";
import { getSession } from "../auth/session";
import { nextBatch, pendingCount, refreshCounts, settle } from "./outbox";
import { getSyncStatus, updateSyncStatus } from "./status";

/**
 * Sales per request. The API takes 100, but a cold Render instance with a remote database can need many
 * seconds per sale; 25 keeps each request well inside Netlify's 26-second proxy limit, in the same order.
 */
export const SYNC_BATCH = 25;
const BASE_DELAY = 30_000;
const MAX_DELAY = 5 * 60_000;

export type FlushResult = { sent: number; flagged: number; failed: number };

const syncedListeners = new Set<() => void>();
let running: Promise<FlushResult> | null = null;

/**
 * Sends this cashier's queued sales in order through POST /sales/sync (spec 9). One flush runs at a time;
 * a second call joins it. A lost connection rejects with the API error and leaves the rest queued.
 */
export function flush(): Promise<FlushResult> {
  running ??= send().finally(() => {
    running = null;
  });
  return running;
}

async function send(): Promise<FlushResult> {
  const tally: FlushResult = { sent: 0, flagged: 0, failed: 0 };
  const session = getSession();
  if (!session || (await pendingCount()) === 0) return tally;
  // A device that opened offline has no token yet: get one with the refresh cookie first (spec 7.3).
  if (!session.accessToken) {
    const outcome = await refreshSession();
    if (outcome !== "refreshed") {
      endSessionFor(outcome);
      return tally;
    }
  }

  updateSyncStatus({ syncing: true });
  try {
    for (let batch = await nextBatch(SYNC_BATCH); batch.length > 0; batch = await nextBatch(SYNC_BATCH)) {
      let results: SyncResult[];
      try {
        results = await api<SyncResult[]>("/sales/sync", { method: "POST", json: { sales: batch.map((row) => row.sale) } });
        updateSyncStatus({ reachable: true });
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) updateSyncStatus({ reachable: false });
        throw err;
      }
      const counts = await settle(results);
      tally.sent += counts.sent;
      tally.flagged += counts.flagged;
      tally.failed += counts.failed;
      // The server answers every sale; if it ever does not, stop rather than resend the same batch forever.
      if (results.length < batch.length) break;
    }
  } finally {
    updateSyncStatus({ syncing: false });
    await refreshCounts();
  }
  if (tally.sent > 0) for (const listener of syncedListeners) listener();
  return tally;
}

/**
 * Keeps the outbox moving (spec 9): on the `online` event, when the app is focused or shown again, and every
 * 30 seconds while sales wait, doubling the wait after errors up to 5 minutes. `onSynced` runs after sales
 * were recorded, to reload what they changed. Returns the way to stop.
 */
export function startSyncLoop(options: { onSynced?: () => void } = {}): () => void {
  let stopped = false;
  let delay = BASE_DELAY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (options.onSynced) syncedListeners.add(options.onSynced);

  async function tick(): Promise<void> {
    clearTimeout(timer);
    if (stopped) return;
    try {
      await refreshCounts();
      if (navigator.onLine && getSyncStatus().pending > 0) await flush();
      delay = BASE_DELAY;
    } catch {
      delay = Math.min(delay * 2, MAX_DELAY);
    }
    if (!stopped && getSession()) timer = setTimeout(() => void tick(), delay);
  }
  const wake = () => {
    delay = BASE_DELAY;
    void tick();
  };
  const shown = () => {
    if (document.visibilityState === "visible") wake();
  };

  // The badge starts from the connection as it is now, not as it was when this module loaded.
  updateSyncStatus({ online: navigator.onLine });
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", shown);
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener("online", wake);
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", shown);
    if (options.onSynced) syncedListeners.delete(options.onSynced);
  };
}
