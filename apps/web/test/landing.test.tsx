import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/app/router";
import { DEVICE_KEY, clearSession, getSession } from "../src/auth/session";
import { apiError, demoLogins, json, owner, store } from "./support/fetch";
import { serveRoutes, type Handler } from "./support/serve";

const WAKE = "https://api.zarizari.test/api/health";
const OPENING = "Opening your store… (the free server takes up to a minute to wake up)";

// The server's wake-up is slow on purpose (Render's free plan), so the page test holds it in a promise.
const wake = vi.hoisted(() => ({ calls: [] as string[], settle: null as ((awake: boolean) => void) | null }));
vi.mock("../src/landing/wake", () => ({
  wakeApi: (url: string) => {
    wake.calls.push(url);
    return new Promise<boolean>((resolve) => (wake.settle = resolve));
  },
}));

let api: ReturnType<typeof serveRoutes>;
function serve(overrides: Record<string, Handler> = {}) {
  api = serveRoutes({ "POST /api/demo": () => json(201, { accessToken: "t1", user: owner, store, demoLogins, expiresAt: store.expiresAt }), ...overrides });
}

function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.stubEnv("VITE_API_WAKE_URL", WAKE);
  wake.calls = [];
  wake.settle = null;
});
afterEach(() => {
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("landing page (spec 3.1)", () => {
  it("starts waking the API as soon as it opens, at VITE_API_WAKE_URL", async () => {
    serve();
    openAt("/");
    await vi.waitFor(() => expect(wake.calls).toEqual([WAKE]));
  });

  it("waits for the server to wake, then opens one demo store, signed in as the owner, with the demo logins", async () => {
    serve();
    const router = openAt("/");
    await userEvent.click(await screen.findByRole("button", { name: "Try the demo" }));
    const opening = await screen.findByRole("button", { name: OPENING });
    expect(opening).toBeDisabled();
    await userEvent.click(opening);
    expect(api.urlsOf("POST", "/api/demo")).toHaveLength(0);

    wake.settle!(true);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/app"));
    expect(api.urlsOf("POST", "/api/demo")).toHaveLength(1);
    expect(getSession()).toMatchObject({ accessToken: "t1", user: owner, demoLogins });
    expect(await screen.findByRole("region", { name: "Demo logins" })).toBeInTheDocument();
  });

  it("opens the new store at the top of the dashboard, however far down the landing page the visitor was", async () => {
    serve();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const router = openAt("/");
    await userEvent.click(await screen.findByRole("button", { name: "Try the demo" }));
    scrollTo.mockClear();
    wake.settle!(true);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/app"));
    expect(await screen.findByRole("region", { name: "Demo logins" })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("opens at the top on a fresh visit, wherever another page in this tab was left", async () => {
    // The router keeps scroll positions per history entry for the tab, and every fresh page load is the entry "default".
    sessionStorage.setItem("react-router-scroll-positions", JSON.stringify({ default: 600 }));
    serve();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    openAt("/");
    await screen.findByRole("button", { name: "Try the demo" });
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(scrollTo).not.toHaveBeenCalledWith(0, 600);
  });

  it("explains the daily demo limit, with a way to sign in", async () => {
    serve({ "POST /api/demo": () => apiError(429, "demo_limit", "You have opened 5 demo stores today. Come back tomorrow, or sign in with the demo logins you already have.") });
    openAt("/");
    await userEvent.click(await screen.findByRole("button", { name: "Try the demo" }));
    wake.settle!(true);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You have opened 5 demo stores today.");
    expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("says so when the server does not wake up in time, and lets the visitor try again", async () => {
    serve();
    openAt("/");
    await userEvent.click(await screen.findByRole("button", { name: "Try the demo" }));
    wake.settle!(false);
    expect(await screen.findByRole("alert")).toHaveTextContent("The store server is taking long to wake up. Try again in a minute.");
    expect(screen.getByRole("button", { name: "Try the demo" })).toBeEnabled();
  });

  it("shows what the app does: the hero, three features and a link to the credits", async () => {
    serve();
    openAt("/");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("ZariZari");
    const features = screen.getByRole("list", { name: "Features" });
    const cards = within(features).getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => within(card).getByRole("heading").textContent)).toEqual(["Point of sale", "Utang ledger", "Works offline"]);
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "Credits" })).toHaveAttribute("href", "/credits");
  });

  it("offers a returning visitor their demo store again", async () => {
    serve();
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ user: owner, store, demoLogins }));
    openAt("/");
    expect(await screen.findByRole("link", { name: "Open your demo store" })).toHaveAttribute("href", "/app");
  });
});
