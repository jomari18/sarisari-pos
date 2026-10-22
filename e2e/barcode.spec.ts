import { expect, goTo, openDemoStore, test } from "./helpers";

// Chromium's stand-in camera, allowed without a prompt.
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["camera"],
});

test("a scanned barcode adds its product to the sale", async ({ page, context }) => {
  // The code of the first sample barcode, which every demo store's product list has.
  await page.goto("/barcodes");
  const first = page.getByRole("list", { name: "Demo products" }).getByRole("listitem").first();
  const name = (await first.locator("p").first().textContent()) ?? "";
  const code = ((await first.getByRole("img").getAttribute("aria-label")) ?? "").replace(/^Barcode /, "");
  expect(code).toMatch(/^\d{13}$/);

  // The browser's own barcode reader, faked to see that code in the camera's picture.
  await context.addInitScript((seen) => {
    class FakeBarcodeDetector {
      static async getSupportedFormats() {
        return ["ean_13", "ean_8", "upc_a"];
      }
      async detect() {
        return [{ rawValue: seen, format: "ean_13" }];
      }
    }
    Object.defineProperty(window, "BarcodeDetector", { value: FakeBarcodeDetector, configurable: true });
  }, code);

  await openDemoStore(page);
  await goTo(page, "POS");
  await page.getByRole("button", { name: "Scan a barcode" }).click();
  await expect(page.getByRole("region", { name: "Current sale" })).toContainText(name);
  await expect(page.getByRole("dialog", { name: "Scan a barcode" })).toHaveCount(0);
});
