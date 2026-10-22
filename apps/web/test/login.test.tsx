import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_ENDED } from "../src/api/client";
import { routes } from "../src/app/router";
import { DEVICE_KEY, clearSession, endSession, getSession, setSession } from "../src/auth/session";
import { DemoBanner } from "../src/features/demo/DemoBanner";
import { DemoLoginsCard } from "../src/features/demo/DemoLoginsCard";
import { catalog } from "./support/catalog";
import { apiError, bantay, demoLogins, json, mockFetch, owner, store } from "./support/fetch";
import { serveRoutes } from "./support/serve";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  clearSession();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("login page", () => {
  it("signs in and opens the app", async () => {
    const calls = mockFetch(() => json(200, { accessToken: "t1", user: owner, store }));
    const router = renderAt("/login");
    await userEvent.type(screen.getByLabelText("Username"), "mayari.7k2f");
    await userEvent.type(screen.getByLabelText("Password or PIN"), "Xy7kPq2mRt8vNw4z");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app");
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/auth/login", body: JSON.stringify({ username: "mayari.7k2f", secret: "Xy7kPq2mRt8vNw4z" }) });
  });

  it("shows the server's message for a wrong login", async () => {
    mockFetch(() => apiError(401, "invalid_credentials", "Wrong username, password or PIN."));
    renderAt("/login");
    await userEvent.type(screen.getByLabelText("Username"), "mayari.7k2f");
    await userEvent.type(screen.getByLabelText("Password or PIN"), "not-it-123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong username, password or PIN.");
  });

  it("lets the PIN or password be shown while typing", async () => {
    renderAt("/login");
    const secret = screen.getByLabelText("Password or PIN");
    expect(secret).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password or PIN" }));
    expect(secret).toHaveAttribute("type", "text");
  });

  it("tells someone whose session ended to sign in again", async () => {
    setSession({ accessToken: "t1", user: owner, store });
    endSession(SESSION_ENDED);
    const router = renderAt("/app");
    expect(await screen.findByRole("status")).toHaveTextContent("Your session ended. Please sign in again.");
    expect(router.state.location.pathname).toBe("/login");
  });

  it("reopens the app after a reload, using the refresh cookie", async () => {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ user: owner, store }));
    mockFetch(({ url }) => (url === "/api/auth/refresh" ? json(200, { accessToken: "fresh" }) : json(200, { user: owner, store })));
    renderAt("/app");
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
  });
});

describe("demo cards (spec 7.5)", () => {
  it("shows both demo logins, and Switch to bantay signs in with the stored bantay login", async () => {
    setSession({ accessToken: "t1", user: owner, store, demoLogins });
    const calls = mockFetch(() => json(200, { accessToken: "t2", user: bantay, store }));
    render(
      <MemoryRouter>
        <DemoLoginsCard />
      </MemoryRouter>,
    );
    for (const text of ["mayari.7k2f", "Xy7kPq2mRt8vNw4z", "nena.7k2f", "482915"]) expect(screen.getByText(text)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Switch to bantay" }));
    await screen.findByRole("button", { name: "Switch to owner" });
    expect(calls[0]!.body).toBe(JSON.stringify({ username: "nena.7k2f", secret: "482915" }));
    expect(getSession()).toMatchObject({ accessToken: "t2", user: { role: "BANTAY" }, demoLogins });
  });

  it("takes the new bantay from the owner's dashboard straight to the POS", async () => {
    setSession({ accessToken: "t1", user: owner, store, demoLogins });
    serveRoutes({ "POST /api/auth/login": () => json(200, { accessToken: "t2", user: bantay, store }), "GET /api/catalog": () => json(200, catalog) });
    const router = createMemoryRouter(routes, { initialEntries: [{ pathname: "/app", state: { welcome: true } }] });
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByRole("button", { name: "Switch to bantay" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/app/pos"));
    expect(await screen.findByRole("heading", { level: 1, name: "POS" })).toBeInTheDocument();
  });

  it("says how long the demo store has left", () => {
    setSession({ accessToken: "t1", user: owner, store });
    render(<DemoBanner />);
    expect(screen.getByText("Demo store, deleted in 23 h")).toBeInTheDocument();
  });
});
