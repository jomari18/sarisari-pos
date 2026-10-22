import type { Locator } from "@playwright/test";
import { addToSale, expect, goTo, openDemoStore, test } from "./helpers";

test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

/** Spec 11.6: a finger needs at least 44 x 44 px. */
async function expectTouchSize(target: Locator) {
  const box = await target.boundingBox();
  expect(box, "the target is on screen").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test("on a 360 px phone the POS sells from its bottom sheet, every target big enough for a finger", async ({ page }) => {
  await openDemoStore(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await goTo(page, "POS");

  await addToSale(page, "Chicharon");
  await expectTouchSize(page.getByRole("button", { name: /^Add Chicharon\s/ }));
  await expectTouchSize(page.getByRole("button", { name: "One more Chicharon" }).first());
  await expectTouchSize(page.getByRole("button", { name: "One less Chicharon" }).first());

  const sheet = page.getByRole("region", { name: "Current sale" });
  const charge = sheet.getByRole("button", { name: "Charge ₱15.00" });
  await expect(charge).toBeInViewport();
  await expectTouchSize(charge);
  await sheet.getByRole("button", { name: "View cart" }).click();
  await expectTouchSize(sheet.getByRole("button", { name: "One more Chicharon" }));
  await expectTouchSize(sheet.getByRole("button", { name: "One less Chicharon" }));

  await charge.click();
  const payment = page.getByRole("dialog", { name: "Payment" });
  await payment.getByRole("button", { name: "Exact" }).click();
  await expectTouchSize(payment.getByRole("button", { name: "Complete sale" }));
  await payment.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByRole("dialog", { name: "Receipt" })).toContainText(/No\. \d{4}/);
});
