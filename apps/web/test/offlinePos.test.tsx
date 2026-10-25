import type { CustomerView, SaleInput, SyncResult } from "@sari/shared";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/app/router";
import { DEVICE_KEY, clearSession, setSession } from "../src/auth/session";
import { offlineDb } from "../src/offline/db";
import { offlineSubmitter } from "../src/features/pos/submitSale";
import { enqueueSale, pendingCount } from "../src/offline/outbox";
import { catalog, products } from "./support/catalog";
import { apiError, bantay, json, owner, store } from "./support/fetch";
import { cashSale, setOnline } from "./support/offline";
import { serveRoutes, type Handler } from "./support/serve";

type Body = { sales: SaleInput[] };
const accepted = (call: { body?: string }): Response =>
  json(
    200,
    (JSON.parse(call.body!) as Body).sales.map((sale, i): SyncResult => ({ id: sale.id, status: "accepted", receiptNo: 2000 + i, flags: [] })),
  );
const rosa: CustomerView = { id: "k-rosa", name: "Aling Rosa", phone: null, creditLimitCentavos: 50_000, balanceCentavos: 12_000, oldestUnpaidDays: 3 };
/** 10:42 AM in Manila. */
const SAVED_AT = "2026-10-21T02:42:00.000Z";
const failedFetch = (): Response => {
  throw new TypeError("Failed to fetch");
};

let api: ReturnType<typeof serveRoutes>;
function serve(overrides: Record<string, Handler> = {}) {
  api = serveRoutes({ "GET /api/catalog": () => json(200, catalog), ...overrides });
  return api;
}
const signIn = (user: typeof owner | typeof bantay) => setSession({ accessToken: "t1", user, store });

function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  // Unmount first, so turning the connection back on wakes no sync loop.
  cleanup();
  setOnline(true);
  clearSession();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("selling offline (spec 9)", () => {
  it("queues a sale while offline with a Pending sync receipt, then syncs: Offline → Syncing 3 sales… → Online", async () => {
    signIn(bantay);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    serve({
      "POST /api/sales/sync": async (call) => {
        await gate;
        return accepted(call);
      },
    });
    openAt("/app/pos");
    await screen.findByRole("button", { name: /Add Kape 3-in-1/ });
    expect(await screen.findByText("Online")).toBeInTheDocument();

    setOnline(false);
    expect(await screen.findByText("Offline: sales will sync")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Add Kape 3-in-1/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Charge/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Exact" }));
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    const receipt = await screen.findByRole("dialog", { name: "Receipt" });
    expect(receipt).toHaveTextContent("Pending sync");
    expect(receipt).toHaveTextContent("PENDING SYNC");
    expect(api.urlsOf("POST", "/api/sales")).toHaveLength(0);
    await userEvent.click(within(receipt).getByRole("button", { name: "New sale" }));

    await enqueueSale(cashSale(2));
    await enqueueSale(cashSale(3));
    setOnline(true);
    expect(await screen.findByText("Syncing 3 sales…")).toBeInTheDocument();
    release();
    expect(await screen.findByText("Online")).toBeInTheDocument();
    await vi.waitFor(async () => expect(await pendingCount()).toBe(0));
    const [batch] = api.bodiesOf("POST", "/api/sales/sync") as unknown as Body[];
    expect(batch!.sales.map((sale) => sale.id).slice(1)).toEqual([cashSale(2).id, cashSale(3).id]);
  });

  it("opens the POS from the saved catalog when the server can't be reached, with the time it was saved", async () => {
    signIn(bantay);
    await offlineDb.catalogs.put({ storeId: store.id, snapshot: { ...catalog, generatedAt: SAVED_AT }, savedAt: SAVED_AT });
    serve({ "GET /api/catalog": failedFetch });
    openAt("/app/pos");
    expect(await screen.findByText("Offline. Stock as of 10:42 AM.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Kape 3-in-1/ })).toBeInTheDocument();
  });

  it("reopens offline from what the device remembers and keeps selling", async () => {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ user: bantay, store }));
    await offlineDb.catalogs.put({ storeId: store.id, snapshot: { ...catalog, generatedAt: SAVED_AT }, savedAt: SAVED_AT });
    serve({ "POST /api/auth/refresh": failedFetch, "GET /api/catalog": failedFetch });
    openAt("/app/pos");
    expect(await screen.findByText("Offline. Stock as of 10:42 AM.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Kape 3-in-1/ })).toBeInTheDocument();
  });

  it("lists sales the server refused under Couldn't sync, to try again or to remove after asking", async () => {
    signIn(bantay);
    await enqueueSale(cashSale(1));
    await enqueueSale(cashSale(2));
    let refuse = true;
    serve({
      "POST /api/sales/sync": (call) =>
        refuse
          ? json(
              200,
              (JSON.parse(call.body!) as Body).sales.map(
                (sale): SyncResult => ({ id: sale.id, status: "invalid", flags: [], error: { code: "invalid_input", message: "Choose a product from the list." } }),
              ),
            )
          : accepted(call),
    });
    openAt("/app/pos");
    const list = await screen.findByRole("region", { name: "Couldn't sync" });
    await vi.waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(2));
    expect(list).toHaveTextContent("Choose a product from the list.");

    await userEvent.click(within(within(list).getAllByRole("listitem")[0]!).getByRole("button", { name: "Remove" }));
    const confirm = await screen.findByRole("dialog", { name: "Remove this sale?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Remove sale" }));
    await vi.waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));

    refuse = false;
    await userEvent.click(within(list).getByRole("button", { name: "Try again" }));
    // The row leaves the list as soon as it is queued again; the send that follows empties the outbox.
    await vi.waitFor(() => expect(screen.queryByRole("region", { name: "Couldn't sync" })).not.toBeInTheDocument());
    await vi.waitFor(async () => expect(await offlineDb.outbox.count()).toBe(0));
  });
});

describe("what needs the internet (spec 9)", () => {
  it("turns off utang payments while offline", async () => {
    signIn(bantay);
    serve({ "GET /api/customers/k-rosa/ledger": () => json(200, { customer: rosa, entries: [] }) });
    openAt("/app/suki/k-rosa");
    const record = await screen.findByRole("button", { name: "Record payment" });
    setOnline(false);
    await vi.waitFor(() => expect(record).toBeDisabled());
    expect(screen.getByText("Needs internet")).toBeInTheDocument();
  });

  it("turns off product edits while offline", async () => {
    signIn(owner);
    serve({
      "GET /api/products/p-kape": () => json(200, { ...products[0], costCentavos: 900 }),
      "GET /api/categories": () => json(200, catalog.categories),
      "GET /api/products/p-kape/movements": () => json(200, []),
    });
    openAt("/app/products/p-kape");
    const save = await screen.findByRole("button", { name: "Save product" });
    setOnline(false);
    await vi.waitFor(() => expect(save).toBeDisabled());
    expect(screen.getByText("Needs internet")).toBeInTheDocument();
  });
});

describe("signing out and sessions with sales still queued (spec 7.2, 7.3)", () => {
  it("warns before logging out, then clears the device", async () => {
    signIn(bantay);
    setOnline(false);
    for (const n of [1, 2, 3]) await enqueueSale(cashSale(n));
    serve({ "POST /api/auth/logout": () => new Response(null, { status: 204 }) });
    const router = openAt("/app/settings");
    const main = await screen.findByRole("main");
    await userEvent.click(within(main).getByRole("button", { name: "Log out" }));
    const warning = await screen.findByRole("dialog", { name: "3 sales not yet synced" });
    await userEvent.click(within(warning).getByRole("button", { name: "Stay signed in" }));
    expect(router.state.location.pathname).toBe("/app/settings");
    expect(await offlineDb.outbox.count()).toBe(3);

    await userEvent.click(within(main).getByRole("button", { name: "Log out" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "3 sales not yet synced" })).getByRole("button", { name: "Log out anyway" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(await offlineDb.outbox.count()).toBe(0);
  });

  it("pauses on a revoked session with 'Sign in to send 3 queued sales', and sends them after signing in", async () => {
    signIn(bantay);
    for (const n of [1, 2, 3]) await enqueueSale(cashSale(n));
    serve({
      "POST /api/sales/sync": (call) => (call.headers.get("Authorization") === "Bearer t2" ? accepted(call) : apiError(401, "unauthenticated", "Please sign in.")),
      "POST /api/auth/refresh": () => apiError(401, "unauthenticated", "Please sign in again."),
      "POST /api/auth/login": () => json(200, { accessToken: "t2", user: bantay, store }),
    });
    const router = openAt("/app/pos");
    expect(await screen.findByText("Sign in to send 3 queued sales.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");

    await userEvent.type(screen.getByLabelText("Username"), bantay.username);
    await userEvent.type(screen.getByLabelText("Password or PIN"), "482915");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(async () => expect(await offlineDb.outbox.count()).toBe(0));
  });

  it("stops when the demo store has ended and offers a new demo or clearing the device (Review Focus 5)", async () => {
    signIn(bantay);
    for (const n of [1, 2, 3]) await enqueueSale(cashSale(n));
    serve({
      "POST /api/sales/sync": () => apiError(401, "unauthenticated", "Please sign in."),
      "POST /api/auth/refresh": () => apiError(401, "session_expired", "This demo store has ended."),
    });
    const router = openAt("/app/pos");
    expect(await screen.findByRole("heading", { name: "This demo store has ended." })).toBeInTheDocument();
    expect(screen.getByText(/Unsynced sales can't be sent\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a new demo" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear this device" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(await offlineDb.outbox.count()).toBe(0);
    expect(localStorage.getItem(DEVICE_KEY)).toBeNull();
    expect(api.urlsOf("POST", "/api/sales/sync")).toHaveLength(1);
  });
});

describe("amounts the store cannot record (review I1)", () => {
  it("refuses, rather than queues, a sale with cash far over its total, so it can never stall the device's queue", async () => {
    setSession({ accessToken: "t1", user: bantay, store });
    setOnline(false);
    const sale = { ...cashSale(1), payment: { method: "CASH" as const, tenderedCentavos: 100_000_000_000 } };
    await expect(offlineSubmitter(sale)).rejects.toThrow("That is more than ₱100,000 over the total. Check the cash given.");
    expect(await pendingCount()).toBe(0);
  });
});
