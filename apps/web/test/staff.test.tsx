import type { StaffView } from "@sari/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/app/router";
import { clearSession, setSession } from "../src/auth/session";
import { apiError, bantay, json, owner, store } from "./support/fetch";
import { joy, nena } from "./support/owner";
import { serveRoutes, type Handler } from "./support/serve";

let api: ReturnType<typeof serveRoutes>;
function serve(overrides: Record<string, Handler> = {}) {
  api = serveRoutes({ "GET /api/staff": () => json(200, [nena, joy]), ...overrides });
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
  document.documentElement.dataset.theme = "dark";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("staff (reference: Staff Management)", () => {
  it("lists each bantay with their username and whether they can sign in", async () => {
    signIn(owner);
    serve();
    openAt("/app/staff");
    const list = await screen.findByRole("list", { name: "Bantay" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Nena");
    expect(first).toHaveTextContent("nena.7k2f");
    expect(first).toHaveTextContent("Active");
    expect(second).toHaveTextContent("Inactive");
    expect(screen.getByText("Bantay (2 of 5)")).toBeInTheDocument();
  });

  it("adds a bantay after checking the PIN rules", async () => {
    signIn(owner);
    const liza: StaffView = { id: "u4", role: "BANTAY", username: "liza.7k2f", displayName: "Liza", active: true };
    serve({ "POST /api/staff": () => json(201, liza) });
    openAt("/app/staff");
    await userEvent.click(await screen.findByRole("button", { name: "Add bantay" }));
    const pin = screen.getByLabelText("PIN");
    expect(pin).toHaveAccessibleDescription("6 digits, not one digit repeated or a run like 123456.");
    await userEvent.type(screen.getByLabelText("Display name"), "Liza");
    await userEvent.type(pin, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Save bantay" }));
    expect(pin).toHaveAccessibleDescription("Choose a PIN that is harder to guess, not a repeated digit or a run like 123456.");
    expect(api.urlsOf("POST", "/api/staff")).toHaveLength(0);

    await userEvent.clear(pin);
    await userEvent.type(pin, "482915");
    await userEvent.click(screen.getByRole("button", { name: "Save bantay" }));
    expect(await screen.findByText("Added Liza. Their username is liza.7k2f; give them the PIN you chose.")).toBeInTheDocument();
    expect(api.bodiesOf("POST", "/api/staff")).toEqual([{ displayName: "Liza", pin: "482915" }]);
  });

  it("explains the five-bantay limit", async () => {
    signIn(owner);
    serve({ "POST /api/staff": () => apiError(409, "limit_reached", "A store can have at most 5 bantay.") });
    openAt("/app/staff");
    await userEvent.click(await screen.findByRole("button", { name: "Add bantay" }));
    await userEvent.type(screen.getByLabelText("Display name"), "Liza");
    await userEvent.type(screen.getByLabelText("PIN"), "482915");
    await userEvent.click(screen.getByRole("button", { name: "Save bantay" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A store can have at most 5 bantay.");
  });

  it("resets a PIN and deactivates a bantay", async () => {
    signIn(owner);
    serve({ "PATCH /api/staff/u2": (call) => json(200, { ...nena, ...(JSON.parse(call.body!) as { active?: boolean }), pin: undefined }) });
    openAt("/app/staff");
    await userEvent.click(await screen.findByRole("button", { name: "Reset PIN for Nena" }));
    await userEvent.type(screen.getByLabelText("New PIN for Nena"), "739104");
    await userEvent.click(screen.getByRole("button", { name: "Save PIN" }));
    expect(await screen.findByText("Nena's PIN changed. Nena is signed out on every device.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Deactivate Nena" }));
    expect(await screen.findByRole("button", { name: "Reactivate Nena" })).toBeInTheDocument();
    expect(api.bodiesOf("PATCH", "/api/staff/u2")).toEqual([{ pin: "739104" }, { active: false }]);
  });
});

describe("my shift", () => {
  it("shows the bantay only their own totals for today", async () => {
    signIn(bantay);
    serve({ "GET /api/reports/my-shift": () => json(200, { count: 4, byMethod: { CASH: 4_900, GCASH: 1_500, UTANG: 2_700 } }) });
    openAt("/app/shift");
    const cash = await screen.findByRole("region", { name: "Cash sales" });
    await vi.waitFor(() => expect(cash).toHaveTextContent("₱49.00"));
    expect(screen.getByText("4 sales today")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "GCash" })).toHaveTextContent("₱15.00");
    expect(screen.getByRole("region", { name: "Utang" })).toHaveTextContent("₱27.00");
  });
});

describe("settings (reference: Profile)", () => {
  it("shows the account, switches the theme and logs out", async () => {
    signIn(owner);
    serve({ "POST /api/auth/logout": () => new Response(null, { status: 204 }) });
    const router = openAt("/app/settings");
    const main = await screen.findByRole("main");
    expect(await within(main).findByText("mayari.7k2f")).toBeInTheDocument();
    expect(within(main).getByText("Owner")).toBeInTheDocument();

    await userEvent.click(within(main).getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(within(main).getByRole("radio", { name: "Light" })).toBeChecked();

    await userEvent.click(within(main).getByRole("button", { name: "Log out" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });
});
