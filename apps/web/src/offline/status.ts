import { useSyncExternalStore } from "react";

/**
 * What the sync badge shows (spec 9): whether the browser is online and the server answered the last time
 * it was asked, whether a sync is running, and how many sales wait or failed.
 */
export type SyncStatus = { online: boolean; reachable: boolean; syncing: boolean; pending: number; failed: number };

let status: SyncStatus = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  reachable: true,
  syncing: false,
  pending: 0,
  failed: 0,
};
const listeners = new Set<() => void>();

export function getSyncStatus(): SyncStatus {
  return status;
}

export function updateSyncStatus(change: Partial<SyncStatus>): void {
  const next = { ...status, ...change };
  if ((Object.keys(next) as (keyof SyncStatus)[]).every((key) => next[key] === status[key])) return;
  status = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => updateSyncStatus({ online: true }));
  window.addEventListener("offline", () => updateSyncStatus({ online: false }));
}

export type SyncState = "online" | "offline" | "syncing";

export function useSyncStatus(): { state: SyncState; pending: number; failed: number } {
  const current = useSyncExternalStore(subscribe, getSyncStatus, getSyncStatus);
  const state: SyncState = !current.online || !current.reachable ? "offline" : current.syncing ? "syncing" : "online";
  return { state, pending: current.pending, failed: current.failed };
}

/** Whether the browser has a connection: forms that need the server turn off without one (spec 9). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => status.online,
    () => true,
  );
}
