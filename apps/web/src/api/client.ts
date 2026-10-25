import type { ApiErrorBody, ErrorCode, StoreView, UserView } from "@sari/shared";
import { deviceRecord, endSession, getSession, markStoreEnded, setSession, storeHasEnded } from "../auth/session";

export const SESSION_ENDED = "Your session ended. Please sign in again.";
export const STORE_ENDED = "This demo store has ended. Start a new demo to keep trying the app.";

/**
 * What a refresh found: a new access token, no connection (keep working offline), a session that needs a
 * new sign-in, or a demo store that has ended (spec 7.3, 9).
 */
export type RefreshResult = "refreshed" | "offline" | "signed-out" | "store-ended";

/** A session the server will not renew ends here, with the reason for the login page. */
export function endSessionFor(outcome: RefreshResult): void {
  if (outcome === "signed-out") endSession(SESSION_ENDED);
  if (outcome === "store-ended") endSession(STORE_ENDED);
}

/** An error answer from the API (spec 8.7), or status 0 when the server could not be reached. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly field?: string;
  readonly retryAfter?: string;

  constructor(status: number, code: ErrorCode, message: string, opts: { field?: string; retryAfter?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = opts.field;
    this.retryAfter = opts.retryAfter;
  }
}

type ApiInit = RequestInit & { json?: unknown };
type SignedIn = { accessToken: string; user: UserView; store: StoreView };

/** Same-origin `/api` requests: Netlify's signed proxy forwards them to the API (spec 4). */
async function send(path: string, init: ApiInit, token: string | undefined): Promise<Response> {
  const { json, headers: given, ...rest } = init;
  const headers = new Headers(given);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  try {
    return await fetch(`/api${path}`, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "service_unavailable", "Can't reach the store server. Check the internet connection and try again.");
  }
}

/**
 * No answer from the API itself: no connection (status 0), or Netlify's proxy giving up while the sleeping API
 * wakes (502–504 with its own page, not the API's JSON). Wherever the app has an offline answer, it uses it.
 */
export function isUnreachable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || (err.status >= 502 && err.status <= 504 && err.code === "service_unavailable"));
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const error = body?.error;
  if (!error) return new ApiError(res.status, "service_unavailable", "Something went wrong. Please try again in a moment.");
  return new ApiError(res.status, error.code, error.message, { field: error.field, retryAfter: error.retryAfter });
}

async function read<T>(res: Response): Promise<T> {
  if (!res.ok) throw await toApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/**
 * Calls the API as the signed-in user. When the 15-minute access token has run out (401), the refresh
 * cookie is rotated once and the request retried; if that fails too, the session ends (spec 7.2).
 */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const first = await send(path, init, getSession()?.accessToken ?? undefined);
  // A 401 from the sign-in routes is the answer itself (a wrong password), not an expired token.
  if (first.status !== 401 || !getSession() || path.startsWith("/auth/")) return read<T>(first);
  const outcome = await refreshSession();
  if (outcome === "refreshed") {
    const retry = await send(path, init, getSession()?.accessToken ?? undefined);
    if (retry.status !== 401) return read<T>(retry);
    endSession(SESSION_ENDED);
  } else {
    endSessionFor(outcome);
  }
  throw await toApiError(first);
}

let refreshing: Promise<RefreshResult> | null = null;

/**
 * Gets a new access token with the refresh cookie. Calls at the same moment share one request, and tabs
 * take turns through a Web Lock: sending a cookie that was already rotated would end every session (spec 7.2).
 */
export function refreshSession(): Promise<RefreshResult> {
  refreshing ??= withRefreshLock(rotate).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function withRefreshLock(task: () => Promise<RefreshResult>): Promise<RefreshResult> {
  if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request("sari-refresh", task);
  return task();
}

async function rotate(): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/refresh", { method: "POST", headers: { "X-Requested-With": "sari-pos" }, credentials: "same-origin" });
  } catch {
    return "offline";
  }
  if (res.status === 401) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    // A deleted store's sessions are gone too, so its device only hears "unauthenticated"; its own clock knows better.
    if (body?.error?.code === "session_expired" || storeHasEnded()) {
      markStoreEnded();
      return "store-ended";
    }
    return "signed-out";
  }
  // A sleeping or failing server is like no connection: keep the session and try again later.
  if (!res.ok) return res.status >= 500 ? "offline" : "signed-out";
  const { accessToken } = (await res.json()) as { accessToken: string };

  const known = getSession();
  if (known) {
    setSession({ ...known, accessToken });
    return "refreshed";
  }
  // After a reload only the device record is left, so ask the API whose token this is.
  let me: Response;
  try {
    me = await send("/me", {}, accessToken);
  } catch {
    return "offline";
  }
  if (!me.ok) return "signed-out";
  const { user, store } = (await me.json()) as Omit<SignedIn, "accessToken">;
  setSession({ accessToken, user, store, demoLogins: demoLoginsFor(store) });
  return "refreshed";
}

/** Demo logins stay with the store they belong to. */
function demoLoginsFor(store: StoreView) {
  const device = deviceRecord();
  return device?.store.id === store.id ? device.demoLogins : undefined;
}

export async function loginWith(username: string, secret: string): Promise<void> {
  const result = await api<SignedIn>("/auth/login", { method: "POST", json: { username, secret } });
  setSession({ ...result, demoLogins: demoLoginsFor(result.store) });
}

/** Ends the session on the server too; the device forgets it whatever the network does. */
export async function logout(): Promise<void> {
  await api("/auth/logout", { method: "POST" }).catch(() => undefined);
}
