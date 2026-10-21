import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/app/router";
import { clearSession, setSession } from "../src/auth/session";
import { catalog } from "./support/catalog";
import { bantay, json, mockFetch, store } from "./support/fetch";

beforeEach(() => {
  setSession({ accessToken: "t1", user: bantay, store });
  mockFetch(({ url }) => (url === "/api/catalog" ? json(200, catalog) : json(404, {})));
});
afterEach(() => {
  clearSession();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function openPos() {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/app/pos"] })} />);
  await screen.findByRole("button", { name: /Add Kape 3-in-1/ });
}
const cart = () => screen.getByRole("region", { name: "Current sale" });
const cartLines = () => within(cart()).queryAllByRole("listitem");
const total = () => within(cart()).getByTestId("cart-total").textContent;

describe("POS screen (spec 10)", () => {
  it("adds products from the grid and keeps the total", async () => {
    await openPos();
    await userEvent.click(screen.getByRole("button", { name: /Add Kape 3-in-1/ }));
    await userEvent.click(screen.getByRole("button", { name: /Add Kape 3-in-1/ }));
    expect(cartLines()).toHaveLength(1);
    expect(within(cartLines()[0]!).getByText("Kape 3-in-1")).toBeInTheDocument();
    expect(within(cartLines()[0]!).getByLabelText("Quantity")).toHaveTextContent("2");
    expect(total()).toBe("₱24.00");
  });

  it("filters the grid by category", async () => {
    await openPos();
    await userEvent.click(screen.getByRole("button", { name: /^Drinks/ }));
    expect(screen.queryByRole("button", { name: /Add Kape 3-in-1/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Softdrink 1.5L/ })).toBeInTheDocument();
  });

  it("focuses search with /, and Enter adds the first result", async () => {
    await openPos();
    await userEvent.keyboard("/");
    const search = screen.getByRole("searchbox", { name: "Search products" });
    expect(search).toHaveFocus();
    await userEvent.type(search, "nino{Enter}");
    expect(within(cartLines()[0]!).getByText("Niño Biscuit")).toBeInTheDocument();
    expect(search).toHaveValue("");
  });

  it("changes the selected line with + and −", async () => {
    await openPos();
    await userEvent.click(screen.getByRole("button", { name: /Add Kape 3-in-1/ }));
    await userEvent.keyboard("+");
    expect(within(cartLines()[0]!).getByLabelText("Quantity")).toHaveTextContent("2");
    await userEvent.keyboard("-");
    await userEvent.keyboard("−");
    expect(cartLines()).toHaveLength(0);
  });

  it("warns when a line goes above the recorded stock (spec 6.3)", async () => {
    await openPos();
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: /Add Softdrink 1.5L/ }));
    expect(within(cart()).getByText("Only 2 left in records")).toBeInTheDocument();
  });

  it("opens payment with F9", async () => {
    await openPos();
    await userEvent.click(screen.getByRole("button", { name: /Add Kape 3-in-1/ }));
    await userEvent.keyboard("{F9}");
    expect(screen.getByRole("dialog", { name: "Payment" })).toBeInTheDocument();
  });

  it("adds a custom item, marked Custom, from its dialog (spec 6.6)", async () => {
    await openPos();
    await userEvent.click(screen.getByRole("button", { name: "Custom item" }));
    const dialog = screen.getByRole("dialog", { name: "Custom item" });
    await userEvent.type(within(dialog).getByLabelText("Item name"), "Yelo");
    await userEvent.type(within(dialog).getByLabelText("Price"), "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add to sale" }));
    expect(screen.queryByRole("dialog", { name: "Custom item" })).not.toBeInTheDocument();
    const line = cartLines()[0]!;
    expect(within(line).getByText("Yelo")).toBeInTheDocument();
    expect(within(line).getByText("Custom")).toBeInTheDocument();
    expect(total()).toBe("₱5.00");
  });
});
