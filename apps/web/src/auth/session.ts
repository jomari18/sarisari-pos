import type { DemoLogins, StoreView, UserView } from "@sari/shared";
import { useSyncExternalStore } from "react";

export type Session = { accessToken: string; user: UserView; store: StoreView; demoLogins?: DemoLogins };

/**
 * Who is signed in. The access token lives in memory only; the user, store and demo logins are also kept
 * on the device (spec 7.3) so the app can reopen offline and so "Switch to bantay" works.
 */
export const DEVICE_KEY = "sari-device";

let current: Session | null = null;
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
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ user: session.user, store: session.store, demoLogins: session.demoLogins }));
  } catch {
    // Private windows can refuse storage; the session still works until the tab closes.
  }
  emit();
}

export function clearSession(): void {
  current = null;
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    // Nothing was stored.
  }
  emit();
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, getSession);
}
