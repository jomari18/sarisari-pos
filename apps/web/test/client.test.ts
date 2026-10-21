import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, SESSION_ENDED, api, refreshSession } from "../src/api/client";
import { DEVICE_KEY, clearSession, getNotice, getSession, setSession } from "../src/auth/session";
import { apiError, demoLogins, json, mockFetch, owner, store } from "./support/fetch";

const signedIn = (accessToken = "t1") => setSession({ accessToken, user: owner, store });
const unauthenticated = () => apiError(401, "unauthenticated", "Please sign in.");

afterEach(() => {
  clearSession();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("api()", () => {
  it("sends the bearer token and a JSON body to /api", async () => {
    signedIn();
    const calls = mockFetch(() => json(201, { id: "c1" }));
    await expect(api("/customers", { method: "POST", json: { name: "Ate Liza" } })).resolves.toEqual({ id: "c1" });
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/customers", body: JSON.stringify({ name: "Ate Liza" }) });
    expect(calls[0]!.headers.get("Authorization")).toBe("Bearer t1");
    expect(calls[0]!.headers.get("Content-Type")).toBe("application/json");
  });

  it("answers a 204 with undefined", async () => {
    signedIn();
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(api("/review/abc/done", { method: "POST" })).resolves.toBeUndefined();
  });

  it("turns the API's error body into an ApiError with code, field and retryAfter (spec 8.7)", async () => {
    signedIn();
    mockFetch(() => apiError(429, "rate_limited", "Too many sign-in attempts.", { retryAfter: "2026-10-21T08:15:00.000Z", field: "username" }));
    const error = await api("/catalog").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: "rate_limited", message: "Too many sign-in attempts.", field: "username", retryAfter: "2026-10-21T08:15:00.000Z" });
  });

  it("reports a network failure as service_unavailable", async () => {
    signedIn();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(api("/catalog")).rejects.toMatchObject({ status: 0, code: "service_unavailable" });
  });
});

describe("refresh on 401 (spec 7.2)", () => {
  it("refreshes once with X-Requested-With: sari-pos, then retries with the new token", async () => {
    signedIn("old");
    const calls = mockFetch(({ url, headers }) => {
      if (url === "/api/auth/refresh") return json(200, { accessToken: "new" });
      return headers.get("Authorization") === "Bearer new" ? json(200, { products: [] }) : unauthenticated();
    });
    await expect(api("/catalog")).resolves.toEqual({ products: [] });

    const refreshes = calls.filter((c) => c.url === "/api/auth/refresh");
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]!.method).toBe("POST");
    expect(refreshes[0]!.headers.get("X-Requested-With")).toBe("sari-pos");
    expect(calls.at(-1)!.headers.get("Authorization")).toBe("Bearer new");
    expect(getSession()?.accessToken).toBe("new");
  });

  it("shares one refresh between requests that fail at the same time, so the cookie is rotated once", async () => {
    signedIn("old");
    const calls = mockFetch(({ url, headers }) => {
      if (url === "/api/auth/refresh") return json(200, { accessToken: "new" });
      return headers.get("Authorization") === "Bearer new" ? json(200, {}) : unauthenticated();
    });
    await Promise.all([api("/catalog"), api("/customers"), api("/reports/my-shift")]);
    expect(calls.filter((c) => c.url === "/api/auth/refresh")).toHaveLength(1);
  });

  it("ends the session when the refresh is refused, with a message for the login page", async () => {
    signedIn("old");
    mockFetch(({ url }) => (url === "/api/auth/refresh" ? apiError(401, "session_expired", "This demo store has expired.") : unauthenticated()));
    await expect(api("/catalog")).rejects.toMatchObject({ status: 401 });
    expect(getSession()).toBeNull();
    expect(getNotice()).toBe(SESSION_ENDED);
    expect(SESSION_ENDED).toBe("Your session ended. Please sign in again.");
  });

  it("does not refresh for a wrong login: that 401 is the answer", async () => {
    signedIn();
    const calls = mockFetch(() => apiError(401, "invalid_credentials", "Wrong username, password or PIN."));
    await expect(api("/auth/login", { method: "POST", json: { username: "x", secret: "y" } })).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/login"]);
    expect(getSession()).not.toBeNull();
  });
});

describe("refreshSession() after a reload", () => {
  it("rebuilds the session from the refresh cookie and /me, keeping the device's demo logins", async () => {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ user: owner, store, demoLogins }));
    const calls = mockFetch(({ url }) => (url === "/api/auth/refresh" ? json(200, { accessToken: "fresh" }) : json(200, { user: owner, store })));
    await expect(refreshSession()).resolves.toBe(true);
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/refresh", "/api/me"]);
    expect(calls[1]!.headers.get("Authorization")).toBe("Bearer fresh");
    expect(getSession()).toEqual({ accessToken: "fresh", user: owner, store, demoLogins });
  });

  it("answers false when there is no valid cookie", async () => {
    mockFetch(() => unauthenticated());
    await expect(refreshSession()).resolves.toBe(false);
    expect(getSession()).toBeNull();
  });
});
