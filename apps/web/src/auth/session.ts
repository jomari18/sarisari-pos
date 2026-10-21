import type { DemoLogins, StoreView, UserView } from "@sari/shared";
import { useSyncExternalStore } from "react";

export type Session = { accessToken: string; user: UserView; store: StoreView; demoLogins?: DemoLogins };

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
