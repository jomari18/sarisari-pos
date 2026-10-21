import { manilaDate } from "@sari/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/app/router";
import { clearSession, setSession } from "../src/auth/session";
import { bantay, json, owner, store } from "./support/fetch";
import { nena, sale } from "./support/owner";
import { serveRoutes, type Handler } from "./support/serve";

const kapeSale = sale({ id: "s-1042" });
const voided = sale({ id: "s-1043", receiptNo: 1043, voidedAt: "2026-10-21T03:00:00.000Z", voidReason: "Doble ang na-punch" });

let api: ReturnType<typeof serveRoutes>;
function serve(overrides: Record<string, Handler> = {}) {
  api = serveRoutes({
    "GET /api/sales": () => json(200, [kapeSale, voided]),
    "GET /api/staff": () => json(200, [nena]),
    ...overrides,
  });
}

function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => setSession({ accessToken: "t1", user: owner, store }));
afterEach(() => {
  clearSession();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sales", () => {
  it("lists the day's sales and filters them by date and cashier", async () => {
    serve();
    openAt("/app/sales");
    const list = await screen.findByRole("list", { name: "Sales" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Voided")).toBeInTheDocument();
    // Voided sales stay listed but do not count.
    expect(screen.getByText("1 sale · ₱34.00")).toBeInTheDocument();
    expect(api.urlsOf("GET", "/api/sales").at(-1)).toContain(`date=${manilaDate(new Date())}`);

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-20" } });
    await vi.waitFor(() => expect(api.urlsOf("GET", "/api/sales").at(-1)).toContain("date=2026-10-20"));
    await userEvent.selectOptions(await screen.findByLabelText("Cashier"), bantay.id);
    await vi.waitFor(() => expect(api.urlsOf("GET", "/api/sales").at(-1)).toContain(`cashierId=${bantay.id}`));
  });

  it("opens a sale with its receipt and voids it after a reason and a confirmation", async () => {
    serve({ "POST /api/sales/s-1042/void": (call) => json(200, { ...kapeSale, voidedAt: "2026-10-21T04:00:00.000Z", voidReason: (JSON.parse(call.body!) as { reason: string }).reason }) });
    openAt("/app/sales");
    await userEvent.click(await screen.findByRole("button", { name: /^Receipt No\. 1042/ }));
    const detail = await screen.findByRole("dialog", { name: "Sale No. 1042" });
    expect(detail).toHaveTextContent("Kape 3-in-1");

    await userEvent.click(within(detail).getByRole("button", { name: "Void sale" }));
    const confirm = await screen.findByRole("dialog", { name: "Void sale No. 1042?" });
    const reason = within(confirm).getByLabelText("Reason");
    await userEvent.type(reason, "ab");
    await userEvent.click(within(confirm).getByRole("button", { name: "Void sale" }));
    expect(reason).toHaveAccessibleDescription("Write a reason of 3 to 120 characters.");
    expect(api.urlsOf("POST", "/api/sales/s-1042/void")).toHaveLength(0);

    await userEvent.type(reason, "c: maling item");
    await userEvent.click(within(confirm).getByRole("button", { name: "Void sale" }));
    const after = await screen.findByRole("dialog", { name: "Sale No. 1042" });
    expect(within(after).getByText("Voided: abc: maling item")).toBeInTheDocument();
    expect(within(after).queryByRole("button", { name: "Void sale" })).not.toBeInTheDocument();
    expect(api.bodiesOf("POST", "/api/sales/s-1042/void")).toEqual([{ reason: "abc: maling item" }]);
    await vi.waitFor(() => expect(within(screen.getByRole("list", { name: "Sales" })).getAllByText("Voided")).toHaveLength(2));
  });

  it("opens the sale named in a link from a ledger or the stock history", async () => {
    serve({ "GET /api/sales": () => json(200, []), "GET /api/sales/s-9": () => json(200, sale({ id: "s-9", receiptNo: 9 })) });
    openAt("/app/sales?sale=s-9");
    expect(await screen.findByRole("dialog", { name: "Sale No. 9" })).toBeInTheDocument();
  });

  it("is for the owner: a bantay goes to the POS", async () => {
    setSession({ accessToken: "t1", user: bantay, store });
    serve({ "GET /api/catalog": () => json(200, { generatedAt: "2026-10-21T07:00:00.000Z", products: [], categories: [], customers: [] }) });
    const router = openAt("/app/sales");
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/app/pos"));
  });
});
