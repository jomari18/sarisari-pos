import type { CustomerLedger, CustomerView, LedgerEntryView } from "@sari/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/app/router";
import { clearSession, setSession } from "../src/auth/session";
import { bantay, json, owner, store } from "./support/fetch";
import { serveRoutes, type Handler } from "./support/serve";

const rosa: CustomerView = { id: "k-rosa", name: "Aling Rosa", phone: "09171234567", creditLimitCentavos: 50000, balanceCentavos: 12000, oldestUnpaidDays: 10 };
const jun: CustomerView = { id: "k-jun", name: "Kuya Jun", phone: null, creditLimitCentavos: 0, balanceCentavos: 0, oldestUnpaidDays: null };
const by = (user: { id: string; displayName: string }) => ({ id: user.id, displayName: user.displayName });
const entry = (fields: Partial<LedgerEntryView> & Pick<LedgerEntryView, "id" | "kind" | "amountCentavos" | "balanceAfter">): LedgerEntryView => ({
  method: null,
  sale: null,
  note: null,
  createdAt: "2026-10-21T07:00:00.000Z",
  user: by(owner),
  ...fields,
});
// Oldest first, as the API sends them.
const ledger: CustomerLedger = {
  customer: rosa,
  entries: [
    entry({ id: "e-1", kind: "CHARGE", amountCentavos: 15000, balanceAfter: 15000, sale: { id: "s-1001", receiptNo: 1001 }, user: by(bantay), createdAt: "2026-10-11T03:00:00.000Z" }),
    entry({ id: "e-2", kind: "PAYMENT", amountCentavos: -5000, balanceAfter: 10000, method: "CASH", createdAt: "2026-10-15T03:00:00.000Z" }),
    entry({ id: "e-3", kind: "ADJUSTMENT", amountCentavos: 2000, balanceAfter: 12000, note: "Nakalimutang ilista", createdAt: "2026-10-18T03:00:00.000Z" }),
  ],
};

let api: ReturnType<typeof serveRoutes>;
function serve(overrides: Record<string, Handler> = {}) {
  api = serveRoutes({
    "GET /api/customers": () => json(200, [rosa, jun]),
    "GET /api/customers/k-rosa/ledger": () => json(200, ledger),
    ...overrides,
  });
}

const signIn = (user: typeof owner | typeof bantay) => setSession({ accessToken: "t1", user, store });

function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  clearSession();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("suki list", () => {
  it("shows each suki's balance, limit and oldest unpaid utang", async () => {
    signIn(owner);
    serve();
    openAt("/app/suki");
    const list = await screen.findByRole("list", { name: "Suki" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Aling Rosa");
    expect(first).toHaveTextContent("₱120.00");
    expect(first).toHaveTextContent("Limit ₱500.00");
    expect(first).toHaveTextContent("Oldest unpaid: 10 days");
    expect(within(first!).getByRole("link", { name: /Aling Rosa/ })).toHaveAttribute("href", "/app/suki/k-rosa");
    expect(second).toHaveTextContent("No utang");
    expect(second).not.toHaveTextContent("Oldest unpaid");
    expect(screen.getByText("2 suki")).toBeInTheDocument();
  });

  it("searches by name with one request once typing stops", async () => {
    signIn(bantay);
    serve();
    openAt("/app/suki");
    await userEvent.type(await screen.findByLabelText("Search"), "rosa");
    await vi.waitFor(() => expect(api.urlsOf("GET", "/api/customers").at(-1)).toContain("search=rosa"));
    expect(api.urlsOf("GET", "/api/customers").filter((url) => url.includes("search="))).toHaveLength(1);
  });

  it("lets the bantay add a suki, whose credit limit stays at zero until the owner sets it", async () => {
    signIn(bantay);
    const created: CustomerView = { ...jun, id: "k-nena", name: "Aling Nena" };
    serve({
      "POST /api/customers": () => json(201, created),
      "GET /api/customers/k-nena/ledger": () => json(200, { customer: created, entries: [] }),
    });
    const router = openAt("/app/suki");
    await userEvent.click(await screen.findByRole("button", { name: "Add suki" }));
    expect(screen.getByText("Credit limit: ₱0.00 (the owner sets it)")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Name"), "Aling Nena");
    await userEvent.type(screen.getByLabelText("Phone (optional)"), "12345");
    await userEvent.click(screen.getByRole("button", { name: "Save suki" }));
    expect(screen.getByLabelText("Phone (optional)")).toHaveAccessibleDescription("Use a mobile number like 09171234567.");
    expect(api.urlsOf("POST", "/api/customers")).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText("Phone (optional)"));
    await userEvent.click(screen.getByRole("button", { name: "Save suki" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/app/suki/k-nena"));
    expect(await screen.findByText("Added Aling Nena.")).toBeInTheDocument();
    expect(api.bodiesOf("POST", "/api/customers")).toEqual([{ name: "Aling Nena" }]);
  });
});

describe("suki ledger", () => {
  it("lists charges with their receipts, payments and adjustments, newest first", async () => {
    signIn(owner);
    serve();
    openAt("/app/suki/k-rosa");
    const list = await screen.findByRole("list", { name: "Utang ledger" });
    const [adjustment, payment, charge] = within(list).getAllByRole("listitem");
    expect(charge).toHaveTextContent("Utang");
    expect(charge).toHaveTextContent("+₱150.00");
    expect(within(charge!).getByRole("link", { name: "Receipt No. 1001" })).toHaveAttribute("href", "/app/sales?sale=s-1001");
    expect(payment).toHaveTextContent("Payment · Cash");
    expect(payment).toHaveTextContent("−₱50.00");
    expect(payment).toHaveTextContent("Balance ₱100.00");
    expect(adjustment).toHaveTextContent("Adjustment");
    expect(adjustment).toHaveTextContent("Nakalimutang ilista");
    expect(screen.getByText("Oldest unpaid: 10 days")).toBeInTheDocument();
  });

  it("shows a bantay the limit and receipt numbers, but no limit or adjustment forms and no sale links", async () => {
    signIn(bantay);
    serve();
    openAt("/app/suki/k-rosa");
    const list = await screen.findByRole("list", { name: "Utang ledger" });
    expect(screen.getByText("Credit limit: ₱500.00 (the owner sets it)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Credit limit")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save adjustment" })).not.toBeInTheDocument();
    // The API shows a bantay only their own sales, so a receipt is text, not a link.
    expect(within(list).getByText("Receipt No. 1001")).toBeInTheDocument();
    expect(within(list).queryByRole("link")).not.toBeInTheDocument();
  });

  it("refuses a payment above the balance and retries a lost one with the same payment id", async () => {
    signIn(bantay);
    let attempts = 0;
    serve({
      "POST /api/customers/k-rosa/payments": (call) => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("Failed to fetch");
        const body = JSON.parse(call.body!) as { id: string };
        return json(201, {
          customer: { ...rosa, balanceCentavos: 7000 },
          entry: entry({ id: body.id, kind: "PAYMENT", amountCentavos: -5000, balanceAfter: 7000, method: "GCASH", user: by(bantay) }),
          duplicate: false,
        });
      },
    });
    openAt("/app/suki/k-rosa");
    const amount = await screen.findByLabelText("Amount paid");
    await userEvent.type(amount, "150");
    await userEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(amount).toHaveAccessibleDescription("This is more than the utang balance of ₱120.00.");
    expect(api.urlsOf("POST", "/api/customers/k-rosa/payments")).toHaveLength(0);

    await userEvent.clear(amount);
    await userEvent.type(amount, "50");
    await userEvent.click(screen.getByRole("radio", { name: "GCash" }));
    await userEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByText("Can't reach the store server. Check the internet connection and try again.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByText("Payment recorded. Balance ₱70.00.")).toBeInTheDocument();

    const [lost, retried] = api.bodiesOf("POST", "/api/customers/k-rosa/payments");
    expect(lost!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(retried).toEqual({ id: lost!.id, amountCentavos: 5000, method: "GCASH" });
    expect(within(screen.getByRole("list", { name: "Utang ledger" })).getAllByRole("listitem")[0]).toHaveTextContent("Payment · GCash");
  });

  it("lets the owner change the credit limit", async () => {
    signIn(owner);
    serve({ "PATCH /api/customers/k-rosa": (call) => json(200, { ...rosa, ...(JSON.parse(call.body!) as object) }) });
    openAt("/app/suki/k-rosa");
    const limit = await screen.findByLabelText("Credit limit");
    expect(limit).toHaveValue("500.00");
    await userEvent.clear(limit);
    await userEvent.type(limit, "1,000");
    await userEvent.click(screen.getByRole("button", { name: "Save limit" }));
    expect(await screen.findByText("Credit limit saved: ₱1,000.00.")).toBeInTheDocument();
    expect(api.bodiesOf("PATCH", "/api/customers/k-rosa")).toEqual([{ creditLimitCentavos: 100000 }]);
  });

  it("lets the owner adjust the balance, with a reason", async () => {
    signIn(owner);
    serve({
      "POST /api/customers/k-rosa/adjustments": (call) => {
        const body = JSON.parse(call.body!) as { amountCentavos: number; note: string };
        const balance = rosa.balanceCentavos + body.amountCentavos;
        return json(201, {
          customer: { ...rosa, balanceCentavos: balance },
          entry: entry({ id: "e-4", kind: "ADJUSTMENT", amountCentavos: body.amountCentavos, balanceAfter: balance, note: body.note }),
        });
      },
    });
    openAt("/app/suki/k-rosa");
    await userEvent.click(await screen.findByRole("radio", { name: "Lower the utang" }));
    await userEvent.type(screen.getByLabelText("Adjustment amount"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Save adjustment" }));
    expect(screen.getByLabelText("Reason")).toHaveAccessibleDescription(/reason/i);
    expect(api.urlsOf("POST", "/api/customers/k-rosa/adjustments")).toHaveLength(0);

    await userEvent.type(screen.getByLabelText("Reason"), "Sinauli ang bote");
    await userEvent.click(screen.getByRole("button", { name: "Save adjustment" }));
    expect(await screen.findByText("Adjustment saved. Balance ₱100.00.")).toBeInTheDocument();
    expect(api.bodiesOf("POST", "/api/customers/k-rosa/adjustments")).toEqual([{ amountCentavos: -2000, note: "Sinauli ang bote" }]);
  });

  it("copies the reminder text from the API", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const text = "Hi Aling Rosa, paalala lang po sa utang ninyo na ₱120.00 sa Tindahan ni Mang Ben. Salamat po!";
    signIn(bantay);
    serve({ "GET /api/customers/k-rosa/reminder": () => json(200, { text }) });
    openAt("/app/suki/k-rosa");
    await userEvent.click(await screen.findByRole("button", { name: "Copy reminder" }));
    expect(await screen.findByText("Reminder copied. Paste it in a text or chat.")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(text);
  });

  it("lets anyone fix a suki's name and phone", async () => {
    signIn(bantay);
    serve({ "PATCH /api/customers/k-rosa": (call) => json(200, { ...rosa, ...(JSON.parse(call.body!) as object) }) });
    openAt("/app/suki/k-rosa");
    await userEvent.click(await screen.findByRole("button", { name: "Edit details" }));
    const name = screen.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Aling Rosario");
    await userEvent.clear(screen.getByLabelText("Phone (optional)"));
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByRole("heading", { name: "Aling Rosario" })).toBeInTheDocument();
    expect(api.bodiesOf("PATCH", "/api/customers/k-rosa")).toEqual([{ name: "Aling Rosario", phone: null }]);
  });
});
