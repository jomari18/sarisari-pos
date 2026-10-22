import type { ProductView } from "@sari/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/app/router";
import { clearSession, setSession } from "../src/auth/session";
import { DRINKS, FROZEN, SNACKS, catalog, products } from "./support/catalog";
import { apiError, json, owner, store, type Call } from "./support/fetch";
import { serveRoutes, type Handler } from "./support/serve";

const withCost = (p: ProductView, costCentavos: number): ProductView => ({ ...p, costCentavos });
const kape = withCost({ ...products[0]!, packSize: 20 }, 900);
const soft = withCost(products[2]!, 7000);
const archived = withCost({ ...products[3]!, archived: true }, 1100);

let calls: Call[];
let urlsOf: (method: string, path: string) => string[];

/** The fake API with these screens' defaults; a test overrides or adds routes. */
function serve(overrides: Record<string, Handler> = {}) {
  ({ calls, urlsOf } = serveRoutes({
    "GET /api/products": (_, url) => {
      if (url.searchParams.get("status") === "archived") return json(200, [archived]);
      if (url.searchParams.get("lowStock") === "true") return json(200, [soft]);
      if (url.searchParams.get("categoryId") === DRINKS) return json(200, [soft]);
      return json(200, [kape, soft]);
    },
    "GET /api/products/p-kape": () => json(200, kape),
    "GET /api/categories": () => json(200, catalog.categories),
    "GET /api/products/p-kape/movements": () => json(200, []),
    ...overrides,
  }));
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

describe("products list (reference: Inventory)", () => {
  it("lists products with stock and price, and filters by status, category and low stock", async () => {
    serve();
    openAt("/app/products");
    const list = await screen.findByRole("list", { name: "Products" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Kape 3-in-1")).toBeInTheDocument();
    expect(screen.getByText("2 products")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Archived/ }));
    expect(await within(list).findByText("Bottled water 500 ml")).toBeInTheDocument();
    expect(urlsOf("GET", "/api/products").at(-1)).toContain("status=archived");

    await userEvent.click(screen.getByRole("button", { name: /^Active/ }));
    await userEvent.selectOptions(screen.getByLabelText("Category"), DRINKS);
    await vi.waitFor(() => expect(urlsOf("GET", "/api/products").at(-1)).toContain(`categoryId=${DRINKS}`));

    await userEvent.selectOptions(screen.getByLabelText("Stock"), "low");
    await vi.waitFor(() => expect(urlsOf("GET", "/api/products").at(-1)).toContain("lowStock=true"));
  });

  it("explains a failed load and tries again", async () => {
    let failing = true;
    serve({
      "GET /api/products": () => (failing ? apiError(503, "service_unavailable", "The store server is waking up. Try again in a minute.") : json(200, [kape])),
    });
    openAt("/app/products");
    expect(await screen.findByRole("alert")).toHaveTextContent("The store server is waking up. Try again in a minute.");
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Kape 3-in-1")).toBeInTheDocument();
  });

  it("searches by name or brand with one request once typing stops", async () => {
    serve();
    openAt("/app/products");
    await userEvent.type(await screen.findByLabelText("Search"), "kape");
    await vi.waitFor(() => expect(urlsOf("GET", "/api/products").at(-1)).toContain("search=kape"));
    expect(urlsOf("GET", "/api/products").filter((url) => url.includes("search="))).toHaveLength(1);
  });

  it("archives a product from its row and brings an archived one back", async () => {
    serve({
      "POST /api/products/p-kape/archive": () => json(200, { ...kape, archived: true }),
      "POST /api/products/p-water/unarchive": () => json(200, { ...archived, archived: false }),
    });
    openAt("/app/products");
    await userEvent.click(await screen.findByRole("button", { name: "Archive Kape 3-in-1" }));
    expect(await screen.findByText("Archived Kape 3-in-1. It no longer shows in the POS.")).toBeInTheDocument();
    expect(urlsOf("POST", "/api/products/p-kape/archive")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /^Archived/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Unarchive Bottled water 500 ml" }));
    expect(await screen.findByText("Bottled water 500 ml is back in the POS.")).toBeInTheDocument();
  });

  it("copies the restock list text from the API", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    serve({ "GET /api/stock/restock-list": () => json(200, { items: [soft], text: "- Softdrink 1.5L (Lamig): 2 left, reorder at 3" }) });
    openAt("/app/products");
    await userEvent.click(await screen.findByRole("button", { name: "Copy restock list" }));
    expect(await screen.findByText("Restock list copied.")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith("- Softdrink 1.5L (Lamig): 2 left, reorder at 3");
  });
});

describe("product form", () => {
  it("checks the fields before sending, then shows the API's field error under the barcode", async () => {
    serve({ "POST /api/products": () => apiError(400, "invalid_input", "Another product already has this barcode.", { field: "barcode" }) });
    openAt("/app/products/new");
    await userEvent.click(await screen.findByRole("button", { name: "Save product" }));
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(/./);
    expect(urlsOf("POST", "/api/products")).toHaveLength(0);

    await userEvent.type(screen.getByLabelText("Name"), "Kape barako");
    await userEvent.type(screen.getByLabelText("Barcode"), "2000000000015");
    await userEvent.selectOptions(screen.getByLabelText("Category"), SNACKS);
    await userEvent.type(screen.getByLabelText("Unit"), "pack");
    await userEvent.type(screen.getByLabelText("Price"), "25");
    await userEvent.type(screen.getByLabelText("Cost"), "18.50");
    await userEvent.click(screen.getByRole("button", { name: "Save product" }));

    await vi.waitFor(() => expect(screen.getByLabelText("Barcode")).toHaveAccessibleDescription("Another product already has this barcode."));
    expect(JSON.parse(calls.find((c) => c.method === "POST")!.body!)).toMatchObject({
      name: "Kape barako",
      barcode: "2000000000015",
      categoryId: SNACKS,
      unit: "pack",
      priceCentavos: 2500,
      costCentavos: 1850,
    });
  });

  it("opens the new product after saving it", async () => {
    const created = { ...kape, id: "p-new", name: "Kape barako", barcode: null, stock: 0 };
    serve({
      "POST /api/products": () => json(201, created),
      "GET /api/products/p-new": () => json(200, created),
      "GET /api/products/p-new/movements": () => json(200, []),
    });
    const router = openAt("/app/products/new");
    await userEvent.type(await screen.findByLabelText("Name"), "Kape barako");
    await userEvent.selectOptions(screen.getByLabelText("Category"), SNACKS);
    await userEvent.type(screen.getByLabelText("Unit"), "pack");
    await userEvent.type(screen.getByLabelText("Price"), "25");
    await userEvent.type(screen.getByLabelText("Cost"), "18.50");
    await userEvent.click(screen.getByRole("button", { name: "Save product" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/app/products/p-new"));
    expect(await screen.findByText("Added Kape barako. Restock it to put it in stock.")).toBeInTheDocument();
    expect(JSON.parse(calls.find((c) => c.method === "POST")!.body!)).toMatchObject({ brand: null, barcode: null, reorderLevel: 0, packSize: 1 });
  });

  it("sends the updatedAt it loaded with an edit, so the API can refuse a stale one", async () => {
    serve({ "PATCH /api/products/p-kape": () => json(200, { ...kape, priceCentavos: 1300, updatedAt: "2026-10-21T09:00:00.000Z" }) });
    openAt("/app/products/p-kape");
    const price = await screen.findByLabelText("Price");
    await userEvent.clear(price);
    await userEvent.type(price, "13");
    await userEvent.click(screen.getByRole("button", { name: "Save product" }));
    expect(await screen.findByText("Saved Kape 3-in-1.")).toBeInTheDocument();
    expect(screen.getByLabelText("Price")).toHaveValue("13.00");
    expect(JSON.parse(calls.find((c) => c.method === "PATCH")!.body!)).toMatchObject({ priceCentavos: 1300, expectedUpdatedAt: kape.updatedAt });
  });

  it("drops an earlier 'Saved' once the next save is refused as stale", async () => {
    let saves = 0;
    serve({
      "PATCH /api/products/p-kape": () =>
        ++saves === 1
          ? json(200, { ...kape, priceCentavos: 1300, updatedAt: "2026-10-21T09:00:00.000Z" })
          : apiError(409, "stale_edit", "Someone saved this product while you were editing it."),
    });
    openAt("/app/products/p-kape");
    const price = await screen.findByLabelText("Price");
    await userEvent.clear(price);
    await userEvent.type(price, "13");
    await userEvent.click(screen.getByRole("button", { name: "Save product" }));
    expect(await screen.findByText("Saved Kape 3-in-1.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save product" }));
    expect(await screen.findByText("This product was changed on another device. Reload to see the latest.")).toBeInTheDocument();
    expect(screen.queryByText("Saved Kape 3-in-1.")).not.toBeInTheDocument();
  });

  it("shows the stock history, with sales linked to their receipts", async () => {
    const by = { id: owner.id, displayName: owner.displayName };
    serve({
      "GET /api/products/p-kape/movements": () =>
        json(200, [
          { id: "m-2", change: -2, reason: "SALE", stockAfter: 40, note: null, sale: { id: "s-1042", receiptNo: 1042 }, user: by, createdAt: "2026-10-21T02:30:00.000Z" },
          { id: "m-1", change: 45, reason: "RESTOCK", stockAfter: 42, note: "2 boxes of 20 + 5 pieces", sale: null, user: by, createdAt: "2026-10-20T01:00:00.000Z" },
        ]),
    });
    openAt("/app/products/p-kape");
    const history = await screen.findByRole("list", { name: "Stock history" });
    const [sale, restock] = within(history).getAllByRole("listitem");
    expect(sale).toHaveTextContent("Sale");
    expect(sale).toHaveTextContent("−2");
    expect(sale).toHaveTextContent("now 40");
    expect(within(sale!).getByRole("link", { name: "Receipt No. 1042" })).toHaveAttribute("href", "/app/sales?sale=s-1042");
    expect(restock).toHaveTextContent("Restock");
    expect(restock).toHaveTextContent("+45");
    expect(restock).toHaveTextContent("2 boxes of 20 + 5 pieces");
  });

  it("adds a new category from the form and selects it", async () => {
    serve({ "POST /api/categories": () => json(201, { id: FROZEN, name: "Frozen", archived: false }) });
    openAt("/app/products/new");
    await userEvent.click(await screen.findByRole("button", { name: "New category" }));
    await userEvent.type(screen.getByLabelText("New category name"), "Frozen");
    await userEvent.click(screen.getByRole("button", { name: "Add category" }));
    await vi.waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue(FROZEN));
  });

  it("explains a stale edit and reloads the latest copy", async () => {
    let copy = kape;
    serve({
      "GET /api/products/p-kape": () => json(200, copy),
      "PATCH /api/products/p-kape": () => apiError(409, "stale_edit", "Someone saved this product while you were editing it."),
    });
    openAt("/app/products/p-kape");
    const price = await screen.findByLabelText("Price");
    await vi.waitFor(() => expect(price).toHaveValue("12.00"));
    await userEvent.clear(price);
    await userEvent.type(price, "13");
    await userEvent.click(screen.getByRole("button", { name: "Save product" }));
    expect(await screen.findByText("This product was changed on another device. Reload to see the latest.")).toBeInTheDocument();

    copy = { ...kape, priceCentavos: 1400, updatedAt: "2026-10-21T08:00:00.000Z" };
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    await vi.waitFor(() => expect(screen.getByLabelText("Price")).toHaveValue("14.00"));
  });
});

describe("categories", () => {
  it("adds, renames and archives categories", async () => {
    const patch = (id: string, name: string) => (call: Call) => json(200, { id, name, archived: false, ...JSON.parse(call.body!) });
    serve({
      "POST /api/categories": () => json(201, { id: FROZEN, name: "Frozen", archived: false }),
      [`PATCH /api/categories/${SNACKS}`]: patch(SNACKS, "Snacks"),
      [`PATCH /api/categories/${DRINKS}`]: patch(DRINKS, "Drinks"),
    });
    openAt("/app/categories");
    const list = await screen.findByRole("list", { name: "Categories" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByText("1 product")).toHaveLength(2);

    await userEvent.type(screen.getByLabelText("New category name"), "Frozen");
    await userEvent.click(screen.getByRole("button", { name: "Add category" }));
    expect(await within(list).findByText("Frozen")).toBeInTheDocument();

    await userEvent.click(within(list).getByRole("button", { name: "Rename Snacks" }));
    const name = within(list).getByLabelText("New name for Snacks");
    await userEvent.clear(name);
    await userEvent.type(name, "Chichirya");
    await userEvent.click(within(list).getByRole("button", { name: "Save name" }));
    expect(await within(list).findByText("Chichirya")).toBeInTheDocument();

    await userEvent.click(within(list).getByRole("button", { name: "Archive Drinks" }));
    expect(await within(list).findByRole("button", { name: "Unarchive Drinks" })).toBeInTheDocument();
    expect(calls.filter((c) => c.method !== "GET").map((c) => JSON.parse(c.body!))).toEqual([{ name: "Frozen" }, { name: "Chichirya" }, { archived: true }]);
  });
});

describe("restock and count", () => {
  it("restocks boxes and pieces and previews the new stock (spec 6.9)", async () => {
    serve({ "POST /api/stock/restock": () => json(200, { ...kape, stock: 85 }) });
    openAt("/app/stock/restock?productId=p-kape");
    await userEvent.type(await screen.findByLabelText("Boxes"), "2");
    await userEvent.type(screen.getByLabelText("Loose pieces"), "5");
    expect(screen.getByText("40 + 45 = 85 in stock")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save restock" }));
    expect(await screen.findByText("Restocked: Kape 3-in-1 now has 85.")).toBeInTheDocument();
    expect(JSON.parse(calls.find((c) => c.method === "POST")!.body!)).toEqual({ productId: "p-kape", boxes: 2, pieces: 5, unitCostCentavos: 900 });
  });

  it("keeps its place on the page when a product is chosen", async () => {
    serve();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const router = openAt("/app/stock/restock");
    const product = await screen.findByLabelText("Product");
    await screen.findByRole("option", { name: /^Kape 3-in-1/ });
    scrollTo.mockClear();
    await userEvent.selectOptions(product, "p-kape");
    expect(await screen.findByLabelText("Boxes")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?productId=p-kape");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("shows the difference from the records before saving a count", async () => {
    serve({ "POST /api/stock/adjust": () => json(200, { ...soft, stock: 1 }) });
    openAt("/app/stock/count?productId=p-soft");
    await userEvent.type(await screen.findByLabelText("Counted on the shelf"), "1");
    expect(screen.getByText("Recorded 2, counted 1: 1 fewer")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save count" }));
    expect(await screen.findByText("Count saved: Softdrink 1.5L now has 1.")).toBeInTheDocument();
    expect(JSON.parse(calls.find((c) => c.method === "POST")!.body!)).toEqual({ productId: "p-soft", counted: 1 });
  });

  it("removes spoiled or expired pieces with the reason and a note", async () => {
    serve({ "POST /api/stock/adjust": () => json(200, { ...soft, stock: 1 }) });
    openAt("/app/stock/count?productId=p-soft");
    await userEvent.click(await screen.findByRole("radio", { name: "Spoiled or expired" }));
    await userEvent.type(screen.getByLabelText("Pieces to remove"), "1");
    await userEvent.selectOptions(screen.getByLabelText("Reason"), "EXPIRED");
    await userEvent.type(screen.getByLabelText("Note (optional)"), "Lumampas sa petsa");
    expect(screen.getByText("2 − 1 = 1 in stock")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove from stock" }));
    expect(await screen.findByText("Removed 1 expired: Softdrink 1.5L now has 1.")).toBeInTheDocument();
    expect(JSON.parse(calls.find((c) => c.method === "POST")!.body!)).toEqual({ productId: "p-soft", quantity: 1, reason: "EXPIRED", note: "Lumampas sa petsa" });
  });
});
