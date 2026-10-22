import { render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/app/router";
import { DEVICE_KEY, clearSession, getSession, restoreDeviceSession } from "../src/auth/session";
import { offlineDb } from "../src/offline/db";
import { catalog } from "./support/catalog";
import { bantay, demoLogins, json, mockFetch, store } from "./support/fetch";
import { setOnline } from "./support/offline";

/** 10:42 AM in Manila. */
const SAVED_AT = "2026-10-21T02:42:00.000Z";
const remember = (record: object) => localStorage.setItem(DEVICE_KEY, JSON.stringify(record));
/** What fetch does with no connection. */
const noConnection = () =>
  mockFetch(() => {
    throw new TypeError("Failed to fetch");
  });

function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  setOnline(true);
  clearSession();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("restoreDeviceSession() (spec 7.3)", () => {
  it("signs in from what the device remembers, without an access token", () => {
    remember({ user: bantay, store, demoLogins });
    expect(restoreDeviceSession()).toEqual({ accessToken: null, user: bantay, store, demoLogins });
    expect(getSession()).toEqual({ accessToken: null, user: bantay, store, demoLogins });
  });

  it("does nothing with no record, or for a demo store that has ended", () => {
    expect(restoreDeviceSession()).toBeNull();
    remember({ user: bantay, store: { ...store, expiresAt: "2026-01-01T00:00:00.000Z" } });
    expect(restoreDeviceSession()).toBeNull();
    expect(getSession()).toBeNull();
  });
});

describe("opening the app with no connection", () => {
  it("lands on the POS from the saved device session, with the offline badge and the saved stock", async () => {
    remember({ user: bantay, store });
    await offlineDb.catalogs.put({ storeId: store.id, snapshot: { ...catalog, generatedAt: SAVED_AT }, savedAt: SAVED_AT });
    setOnline(false);
    const calls = noConnection();
    const router = openAt("/app");
    expect(await screen.findByText("Offline: sales will sync")).toBeInTheDocument();
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/app/pos"));
    expect(await screen.findByText("Offline. Stock as of 10:42 AM.")).toBeInTheDocument();
    // No connection: the device does not even try the refresh cookie.
    expect(calls.filter((call) => call.url === "/api/auth/refresh")).toHaveLength(0);
  });

  it("swaps the saved stock for the server's as soon as the connection returns", async () => {
    remember({ user: bantay, store });
    await offlineDb.catalogs.put({ storeId: store.id, snapshot: { ...catalog, generatedAt: SAVED_AT }, savedAt: SAVED_AT });
    setOnline(false);
    let connected = false;
    mockFetch(({ url }) => {
      if (!connected) throw new TypeError("Failed to fetch");
      if (url === "/api/auth/refresh") return json(200, { accessToken: "t2" });
      if (url === "/api/catalog") return json(200, catalog);
      return json(404, { error: { code: "not_found", message: "Not found" } });
    });
    openAt("/app/pos");
    expect(await screen.findByText("Offline. Stock as of 10:42 AM.")).toBeInTheDocument();

    connected = true;
    setOnline(true);
    await vi.waitFor(() => expect(screen.queryByText(/Stock as of/)).not.toBeInTheDocument());
  });

  it("shows the login page with what to do when nothing is saved", async () => {
    setOnline(false);
    noConnection();
    openAt("/app");
    expect(await screen.findByText("You're offline. Sign in when you're back online.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});
