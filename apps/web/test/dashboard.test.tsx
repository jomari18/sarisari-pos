import type { ProductReport, UtangReport } from "@sari/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/app/router";
import { clearSession, setSession } from "../src/auth/session";
import { catalog, products } from "./support/catalog";
import { json, owner, store } from "./support/fetch";
import { month, sale, today, week } from "./support/owner";
import { serveRoutes, type Handler } from "./support/serve";

const customSale = sale({
  id: "s-1050",
  receiptNo: 1050,
  flags: ["CUSTOM_ITEM"],
  totalCentavos: 2_200,
  lines: [
    { productId: "p-kape", name: "Kape 3-in-1", quantity: 1, unitPriceCentavos: 1_200, lineTotalCentavos: 1_200 },
    { productId: null, name: "Yelo", quantity: 2, unitPriceCentavos: 500, lineTotalCentavos: 1_000 },
  ],
});
const overLimitSale = sale({
  id: "s-1051",
  receiptNo: 1051,
  method: "UTANG",
  tenderedCentavos: null,
  changeCentavos: null,
  customer: { id: "k-rosa", name: "Aling Rosa", balanceAfterCentavos: 61_000 },
  flags: ["NEGATIVE_STOCK", "OVER_CREDIT_LIMIT"],
});

const productReport: ProductReport = {
  bestByQuantity: [
    { productId: "p-kape", name: "Kape 3-in-1", quantity: 3, salesCentavos: 3_600, profitCentavos: 900 },
    { productId: "p-soft", name: "Softdrink 1.5L", quantity: 2, salesCentavos: 15_000, profitCentavos: 2_600 },
  ],
  bestByProfit: [
    { productId: "p-soft", name: "Softdrink 1.5L", quantity: 2, salesCentavos: 15_000, profitCentavos: 2_600 },
    { productId: "p-kape", name: "Kape 3-in-1", quantity: 3, salesCentavos: 3_600, profitCentavos: 900 },
  ],
  slowMovers: [{ productId: "p-bond", name: "Bond paper, short", stock: 77 }],
};
const utangReport: UtangReport = {
  totalCentavos: 50_000,
  top: [
    { id: "k-rosa", name: "Aling Rosa", phone: null, creditLimitCentavos: 50_000, balanceCentavos: 45_000, oldestUnpaidDays: 1 },
    { id: "k-liza", name: "Ate Liza", phone: null, creditLimitCentavos: 100_000, balanceCentavos: 5_000, oldestUnpaidDays: 15 },
  ],
  aging: { d0to7: 45_000, d8to30: 5_000, d31plus: 0 },
};
const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 14 ? 1 : 0, salesCentavos: hour === 14 ? 7_500 : 0 }));
const summaries: Record<string, unknown> = { today, "7d": week, "30d": month };

let api: ReturnType<typeof serveRoutes>;
function serve(overrides: Record<string, Handler> = {}) {
  api = serveRoutes({
    "GET /api/reports/summary": (_, url) => json(200, summaries[url.searchParams.get("range") ?? "today"]),
    "GET /api/products": () => json(200, [products[2], { ...products[3], stock: 1, reorderLevel: 5 }]),
    "GET /api/review": () => json(200, [customSale]),
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

describe("dashboard (reference: Dashboard)", () => {
  it("shows today's sales, expected cash, profit, low stock and sales to review as cards", async () => {
    serve();
    openAt("/app");
    const sales = await screen.findByRole("region", { name: "Today's sales" });
    await vi.waitFor(() => expect(sales).toHaveTextContent("₱124.00"));
    expect(sales).toHaveTextContent("3 sales");
    await vi.waitFor(() => expect(within(sales).getByRole("img", { name: "Sales for the last 7 days, highest ₱132.00 on Tuesday" })).toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Expected cash" })).toHaveTextContent("₱64.00");
    const profit = screen.getByRole("region", { name: "Profit today" });
    expect(profit).toHaveTextContent("₱23.00");
    expect(profit).toHaveTextContent("Custom items are not included");
    await vi.waitFor(() => expect(screen.getByRole("region", { name: "Low stock" })).toHaveTextContent("2 products"));
    await vi.waitFor(() => expect(screen.getByRole("region", { name: "Needs review" })).toHaveTextContent("1 sale"));
    expect(screen.getByRole("img", { name: /^Sales for the last 30 days: ₱331\.00 in total, highest ₱132\.00 on Oct 20\.$/ })).toBeInTheDocument();
  });

  it("says so when nothing is low and nothing waits for review", async () => {
    serve({ "GET /api/products": () => json(200, []), "GET /api/review": () => json(200, []) });
    openAt("/app");
    expect(await screen.findByText("Nothing is running low.")).toBeInTheDocument();
    expect(await screen.findByText("Nothing needs a look right now.")).toBeInTheDocument();
  });
});

describe("reports (reference: Reports)", () => {
  it("shows a range's sales, best sellers, slow movers and utang, and a day's sales by hour", async () => {
    serve({
      "GET /api/reports/products": () => json(200, productReport),
      "GET /api/reports/hourly": () => json(200, hourly),
      "GET /api/reports/utang": () => json(200, utangReport),
    });
    openAt("/app/reports");
    const summary = await screen.findByRole("region", { name: "Sales" });
    await vi.waitFor(() => expect(summary).toHaveTextContent("₱124.00"));
    expect(summary).toHaveTextContent("Cash ₱49.00");
    expect(summary).toHaveTextContent("Utang ₱75.00");
    expect(summary).toHaveTextContent("Expected cash ₱64.00");
    expect(summary).toHaveTextContent("Profit ₱23.00");
    expect(summary).toHaveTextContent("Custom items are not included");

    await userEvent.click(screen.getByRole("button", { name: "7 days" }));
    await vi.waitFor(() => expect(summary).toHaveTextContent("₱256.00"));
    expect(api.urlsOf("GET", "/api/reports/products").at(-1)).toContain("range=7d");
    expect(screen.getByRole("img", { name: /^Sales for the last 7 days: ₱256\.00 in total/ })).toBeInTheDocument();

    const best = await screen.findByRole("table", { name: "Best sellers" });
    await vi.waitFor(() => expect(within(best).getAllByRole("row")).toHaveLength(3));
    expect(within(best).getAllByRole("row")[1]).toHaveTextContent("Kape 3-in-1");
    await userEvent.click(screen.getByRole("button", { name: "Most profit" }));
    expect(within(best).getAllByRole("row")[1]).toHaveTextContent("Softdrink 1.5L");
    expect(screen.getByRole("region", { name: "Slow movers" })).toHaveTextContent("Bond paper, short");

    const utang = screen.getByRole("region", { name: "Utang" });
    await vi.waitFor(() => expect(utang).toHaveTextContent("₱500.00"));
    expect(utang).toHaveTextContent("8–30 days ₱50.00");
    expect(within(utang).getByRole("link", { name: /Aling Rosa/ })).toHaveAttribute("href", "/app/suki/k-rosa");

    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-10-20" } });
    await vi.waitFor(() => expect(api.urlsOf("GET", "/api/reports/hourly").at(-1)).toContain("date=2026-10-20"));
    expect(await screen.findByRole("img", { name: "Sales by hour. Busiest: 2 PM, ₱75.00 from 1 sale." })).toBeInTheDocument();
  });
});

describe("needs review (reference: Notification)", () => {
  it("lists flagged sales; a sale opens with its receipt, and a custom item can become a product", async () => {
    serve({ "GET /api/review": () => json(200, [customSale, overLimitSale]), "GET /api/categories": () => json(200, catalog.categories) });
    const router = openAt("/app/review");
    const list = await screen.findByRole("list", { name: "Sales to review" });
    const [custom, overLimit] = within(list).getAllByRole("listitem");
    expect(custom).toHaveTextContent("Custom item");
    expect(overLimit).toHaveTextContent("Over the credit limit");
    expect(overLimit).toHaveTextContent("Stock went below zero");

    await userEvent.click(within(custom!).getByRole("button", { name: "Open sale No. 1050" }));
    const dialog = await screen.findByRole("dialog", { name: "Sale No. 1050" });
    expect(dialog).toHaveTextContent("Yelo");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    await userEvent.click(within(custom!).getByRole("link", { name: "Add Yelo to products" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/app/products/new"));
    expect(await screen.findByLabelText("Name")).toHaveValue("Yelo");
    expect(screen.getByLabelText("Price")).toHaveValue("5.00");
  });

  it("marks a sale as reviewed and takes it off the list", async () => {
    let pending = [customSale, overLimitSale];
    serve({
      "GET /api/review": () => json(200, pending),
      "POST /api/review/s-1051/done": () => {
        pending = [customSale];
        return new Response(null, { status: 204 });
      },
    });
    openAt("/app/review");
    const list = await screen.findByRole("list", { name: "Sales to review" });
    await userEvent.click(within(list).getByRole("button", { name: "Mark sale No. 1051 as reviewed" }));
    await vi.waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
    expect(api.urlsOf("POST", "/api/review/s-1051/done")).toHaveLength(1);
  });
});
