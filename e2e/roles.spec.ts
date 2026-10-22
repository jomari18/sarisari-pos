import { apiAuth, expect, openDemoStore, test } from "./helpers";

test("the bantay sees no owner screens, and the API refuses them the owner's data", async ({ page, request }) => {
  const logins = await openDemoStore(page);
  await page.getByRole("button", { name: "Switch to bantay" }).click();
  await expect(page).toHaveURL(/\/app\/pos$/);

  const nav = page.getByRole("navigation", { name: "Main" });
  for (const screen of ["POS", "Suki", "My shift"]) await expect(nav.getByRole("link", { name: screen, exact: true })).toBeVisible();
  for (const screen of ["Dashboard", "Sales", "Products", "Reports", "Review", "Staff"]) {
    await expect(nav.getByRole("link", { name: screen, exact: true })).toHaveCount(0);
  }

  // Typed into the address bar, an owner screen sends the bantay to the POS (Task 22).
  await page.goto("/app/reports");
  await expect(page).toHaveURL(/\/app\/pos$/);
  await expect(page.getByRole("heading", { level: 1, name: "POS" })).toBeVisible();

  const bantay = await apiAuth(request, logins.bantay.username, logins.bantay.pin);
  expect((await request.get("/api/reports/summary?range=today", { headers: bantay })).status()).toBe(403);
  expect((await request.get("/api/staff", { headers: bantay })).status()).toBe(403);
  const owner = await apiAuth(request, logins.owner.username, logins.owner.password);
  expect((await request.get("/api/staff", { headers: owner })).status()).toBe(200);
});
