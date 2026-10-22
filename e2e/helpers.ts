import { randomInt } from "node:crypto";
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

export { expect };

/**
 * Every test is a different visitor, as every visitor is on Netlify, which names the visitor's IP in this header
 * (vite preview passes it on to the API). So the five-demo-stores-a-day limit counts each test on its own.
 */
export const test = base.extend({
  // Playwright reads a fixture's dependencies from this pattern; this one has none.
  // eslint-disable-next-line no-empty-pattern
  extraHTTPHeaders: async ({}, use) => {
    await use({ "x-nf-client-connection-ip": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` });
  },
});

export type DemoLogins = { owner: { username: string; password: string }; bantay: { username: string; pin: string } };

/** Opens a new demo store the way a visitor does, and reads the two logins off the dashboard's welcome card. */
export async function openDemoStore(page: Page): Promise<DemoLogins> {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 45_000 });
  const card = page.getByRole("region", { name: "Demo logins" });
  await expect(card).toBeVisible();
  const [ownerName, password, bantayName, pin] = await card.locator("dd").allTextContents();
  return { owner: { username: ownerName!, password: password! }, bantay: { username: bantayName!, pin: pin! } };
}

/** A screen from the main navigation (the side rail on a wide screen). */
export async function goTo(page: Page, screen: string) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: screen, exact: true }).click();
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Finds a product on the POS by name and adds one to the sale. */
export async function addToSale(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "Search products" }).fill(name);
  await page.getByRole("button", { name: new RegExp(`^Add ${escapeRegExp(name)}\\s`) }).click();
}

/** Today in Manila, as the API names days. */
export const manilaToday = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Signs in straight to the API, through the signed proxy, for checks the screens do not show. */
export async function apiAuth(request: APIRequestContext, username: string, secret: string) {
  const response = await request.post("/api/auth/login", { data: { username, secret } });
  expect(response.ok(), await response.text()).toBe(true);
  const { accessToken } = (await response.json()) as { accessToken: string };
  return { Authorization: `Bearer ${accessToken}` };
}
