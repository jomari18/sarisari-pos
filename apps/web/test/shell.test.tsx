import type { Role } from "@sari/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/app/router";
import { clearSession, setSession } from "../src/auth/session";

const store = { id: "s1", code: "7k2f", name: "Tindahan ni Mang Ben", expiresAt: "2026-10-22T07:00:00.000Z" };
const users = {
  OWNER: { id: "u1", role: "OWNER", username: "mayari.7k2f", displayName: "Mang Ben" },
  BANTAY: { id: "u2", role: "BANTAY", username: "nena.7k2f", displayName: "Nena" },
} as const;
const signInAs = (role: Role) => setSession({ accessToken: "token", user: users[role], store });

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}
const railItems = () =>
  within(screen.getByRole("navigation", { name: "Main" }))
    .getAllByRole("link")
    .map((link) => link.textContent);

afterEach(() => {
  clearSession();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("side rail (spec 7.4)", () => {
  it("shows a bantay exactly POS, Suki and My shift", async () => {
    signInAs("BANTAY");
    renderAt("/app/pos");
    await screen.findByRole("heading", { level: 1, name: "POS" });
    expect(railItems()).toEqual(["POS", "Suki", "My shift"]);
  });

  it("shows the owner all eight sections and marks the current one", async () => {
    signInAs("OWNER");
    renderAt("/app/products");
    await screen.findByRole("heading", { level: 1, name: "Products" });
    expect(railItems()).toEqual(["Dashboard", "POS", "Sales", "Products", "Suki", "Reports", "Review", "Staff"]);
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });
});

describe("/app", () => {
  it("opens the dashboard for the owner", async () => {
    signInAs("OWNER");
    const router = renderAt("/app");
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app");
  });

  it("opens the POS for a bantay", async () => {
    signInAs("BANTAY");
    const router = renderAt("/app");
    expect(await screen.findByRole("heading", { level: 1, name: "POS" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app/pos");
  });

  it("sends someone who is not signed in to the login page", async () => {
    const router = renderAt("/app/products");
    await screen.findByRole("heading", { level: 1, name: "Sign in" });
    expect(router.state.location.pathname).toBe("/login");
  });
});

describe("theme toggle", () => {
  it("switches data-theme on <html> and remembers the choice in sari-theme", async () => {
    signInAs("OWNER");
    renderAt("/app");
    const toggle = await screen.findByRole("button", { name: "Dark theme" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("sari-theme")).toBe("light");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("sari-theme")).toBe("dark");
  });
});

describe("phone layout", () => {
  it("opens the same sections in a menu drawer from the top bar", async () => {
    signInAs("BANTAY");
    renderAt("/app/pos");
    await userEvent.click(await screen.findByRole("button", { name: "Open menu" }));
    const drawer = screen.getByRole("dialog", { name: "Menu" });
    const sections = within(drawer).getByRole("navigation", { name: "Main" });
    expect(within(sections).getAllByRole("link").map((link) => link.textContent)).toEqual(["POS", "Suki", "My shift"]);
    expect(within(drawer).getByRole("button", { name: "Close menu" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
  });
});

describe("brand", () => {
  it("names the app ZariZari in the rail and the tab title", async () => {
    signInAs("OWNER");
    renderAt("/app");
    expect(await screen.findByRole("link", { name: "ZariZari home" })).toHaveTextContent("ZariZari");
    await vi.waitFor(() => expect(document.title).toBe("Dashboard · ZariZari"));
  });

  it("names the app ZariZari on the login card", async () => {
    renderAt("/login");
    expect(await screen.findByText("ZariZari")).toBeInTheDocument();
  });
});
