import { addToSale, expect, goTo, openDemoStore, test } from "./helpers";

test("a visitor opens a demo store and rings up a cash sale with change", async ({ page }) => {
  await openDemoStore(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  await goTo(page, "POS");
  await addToSale(page, "Chicharon");
  await page.getByRole("button", { name: "Charge ₱15.00" }).click();
  const payment = page.getByRole("dialog", { name: "Payment" });
  await payment.getByLabel("Cash received").fill("20");
  await payment.getByRole("button", { name: "Complete sale" }).click();

  const receipt = page.getByRole("dialog", { name: "Receipt" });
  await expect(receipt).toContainText(/No\. \d{4}/);
  await expect(receipt).toContainText(/Change\s+₱5\.00/);
});
