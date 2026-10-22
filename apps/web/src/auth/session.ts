import type { DemoLogins, StoreView, UserView } from "@sari/shared";
import { useSyncExternalStore } from "react";

/** `accessToken` is null while the device works offline from what it remembers (spec 7.3). */
export type Session = { accessToken: string | null; user: UserView; store: StoreView; demoLogins?: DemoLogins };

/** What this device remembers between visits: no token, only who signed in last (spec 7.3). */
export type DeviceRecord = { user: UserView; store: StoreView; demoLogins?: DemoLogins };

/**
 * Who is signed in. The access token lives in memory only; the user, store and demo logins are also kept
 * on the device so the app can reopen (and later sell offline) and so "Switch to bantay" works.
 */
export const DEVICE_KEY = "sari-device";

let current: Session | null = null;
let notice: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession(): Session | null {
  return current;
}

export function setSession(session: Session): void {
  current = session;
  notice = null;
  try {
    const record: DeviceRecord = { user: session.user, store: session.store, demoLogins: session.demoLogins };
    localStorage.setItem(DEVICE_KEY, JSON.stringify(record));
  } catch {
    // Private windows can refuse storage; the session still works until the tab closes.
  }
  emit();
}

/** Logging out: the session and this device's record both go (spec 7.2). */
export function clearSession(): void {
  current = null;
  notice = null;
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    // Nothing was stored.
  }
  emit();
}

/**
 * The server ended the session (it expired or was revoked). The device record stays, so the demo logins
 * are still there for signing in again; `message` is shown on the login page.
 */
export function endSession(message: string): void {
  current = null;
  notice = message;
  emit();
}

/** Why the last session ended, for the login page; cleared by the next sign-in. */
export function getNotice(): string | null {
  return notice;
}

export function deviceRecord(): DeviceRecord | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    const record = raw ? (JSON.parse(raw) as Partial<DeviceRecord>) : null;
    return record?.user?.id && record.store?.id ? (record as DeviceRecord) : null;
  } catch {
    return null;
  }
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, getSession);
}

/** The server said the demo store has ended: remember it, so this device stops trying to send (spec 9). */
export function markStoreEnded(now = new Date()): void {
  const record = deviceRecord();
  if (!record) return;
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ ...record, store: { ...record.store, expiresAt: now.toISOString() } }));
  } catch {
    // Nothing more to remember.
  }
  emit();
}

/** Demo stores end 24 h after they start; after that nothing queued on this device can be sent. */
export function storeHasEnded(now = new Date()): boolean {
  const record = deviceRecord();
  return record !== null && new Date(record.store.expiresAt).getTime() <= now.getTime();
}

/**
 * With no connection, the last person signed in on this device keeps working from what the device remembers
 * (spec 7.3): no access token, so only selling into the queue works until the refresh cookie gets one.
 */
export function restoreDeviceSession(): Session | null {
  const record = deviceRecord();
  if (!record || storeHasEnded()) return null;
  const session: Session = { accessToken: null, ...record };
  setSession(session);
  return session;
}
