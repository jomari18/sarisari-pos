import { addToSale, apiAuth, expect, goTo, manilaToday, openDemoStore, test } from "./helpers";

test("a sale made offline waits on the device, then reaches the store exactly once", async ({ page, context, request }) => {
  const logins = await openDemoStore(page);
  await goTo(page, "POS");
  // The catalog has loaded, and with it the copy kept on the device for offline selling.
  await expect(page.getByRole("button", { name: /^Add Chicharon\s/ })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText("Offline: sales will sync")).toBeVisible();
  await addToSale(page, "Chicharon");
  await page.getByRole("button", { name: "Charge ₱15.00" }).click();
  const payment = page.getByRole("dialog", { name: "Payment" });
  await payment.getByRole("button", { name: "Exact" }).click();
  await payment.getByRole("button", { name: "Complete sale" }).click();

  const receipt = page.getByRole("dialog", { name: "Receipt" });
  await expect(receipt.getByText("Pending sync", { exact: true })).toBeVisible();
  const text = (await receipt.locator("pre").textContent()) ?? "";
  const code = /PENDING SYNC ([0-9A-F]{6})/.exec(text)?.[1]?.toLowerCase();
  expect(code, "the receipt's short code").toBeDefined();
  await receipt.getByRole("button", { name: "New sale" }).click();

  await context.setOffline(false);
  await expect(page.getByText("Online", { exact: true })).toBeVisible({ timeout: 30_000 });
  // Nudge the sync loop once more: a second try must not record the sale twice.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  const owner = await apiAuth(request, logins.owner.username, logins.owner.password);
  const response = await request.get(`/api/sales?date=${manilaToday()}`, { headers: owner });
  const sales = (await response.json()) as { id: string }[];
  expect(sales.filter((sale) => sale.id.startsWith(code!))).toHaveLength(1);
});
