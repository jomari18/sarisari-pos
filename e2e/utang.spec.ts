import { formatPeso, parsePesos } from "../packages/shared/src/money";
import { addToSale, expect, goTo, openDemoStore, test } from "./helpers";

// Suki whose limit leaves room for a small sale even after a month of seeded utang, the roomiest first.
const ROOMY_SUKI = ["Kuya Dodong", "Ate Liza", "Kuya Ramil", "Aling Rosa", "Ate Joy", "Lola Ising"];

test("a sale on utang within the suki's limit, then the suki pays it on their page", async ({ page }) => {
  await openDemoStore(page);
  await goTo(page, "POS");
  await addToSale(page, "Chicharon");
  await page.getByRole("button", { name: "Charge ₱15.00" }).click();

  const payment = page.getByRole("dialog", { name: "Payment" });
  // The radio itself is visually hidden inside its card; a person taps the card.
  await payment.getByText("Utang", { exact: true }).click();
  await expect(payment.getByRole("radio", { name: "Utang" })).toBeChecked();
  const complete = payment.getByRole("button", { name: "Complete sale" });
  let suki = "";
  for (const name of ROOMY_SUKI) {
    await payment.getByLabel("Suki").selectOption({ label: name });
    if (await complete.isEnabled()) {
      suki = name;
      break;
    }
  }
  expect(suki, "a suki with room under their limit").not.toBe("");
  await complete.click();

  const receipt = page.getByRole("dialog", { name: "Receipt" });
  await expect(receipt).toContainText(`Utang: ${suki}`);
  await receipt.getByRole("button", { name: "New sale" }).click();

  await goTo(page, "Suki");
  await page.getByRole("link", { name: new RegExp(`^${suki}`) }).click();
  const balance = page.getByText("Utang balance", { exact: true }).locator("xpath=following-sibling::p[1]");
  const before = parsePesos((await balance.textContent()) ?? "");
  expect(before).not.toBeNull();
  await page.getByLabel("Amount paid").fill("15");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(balance).toHaveText(formatPeso(before! - 1500));
});
