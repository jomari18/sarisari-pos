import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, goTo, openDemoStore, test } from "./helpers";

/**
 * Spec 11.6: axe's serious and critical findings on the page as it settles, short enough to read in a failure.
 * Colour transitions are switched off first: a link fading to its active colours is not the colours people read.
 */
async function seriousFindings(page: Page) {
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({ rule: violation.id, impact: violation.impact, where: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5) }));
}

/** What shows once each screen has its data: axe should see the screen filled in, not its loading state. */
const LOADED: Record<string, (page: Page) => Locator> = {
  POS: (page) => page.getByRole("button", { name: /^Add / }).first(),
  Products: (page) => page.getByRole("list", { name: "Products" }),
  Suki: (page) => page.getByRole("list", { name: "Suki" }),
  Reports: (page) => page.getByRole("img", { name: /^Sales by payment method/ }),
};

for (const theme of ["dark", "light"] as const) {
  test(`landing, POS, products, suki and reports have no serious or critical findings in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((saved) => localStorage.setItem("sari-theme", saved), theme);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await seriousFindings(page), "landing").toEqual([]);

    await openDemoStore(page);
    for (const [screen, loaded] of Object.entries(LOADED)) {
      await goTo(page, screen);
      await expect(page.getByRole("heading", { level: 1, name: screen })).toBeVisible();
      await expect(loaded(page)).toBeVisible();
      expect(await seriousFindings(page), screen).toEqual([]);
    }
  });
}

test("with reduced motion the landing shows the still picture, not the 3D scene", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const still = page.getByRole("img", { name: "Illustration of a sari-sari store at dusk" });
  await expect(still).toHaveJSProperty("tagName", "IMG");
  await expect(still).toHaveJSProperty("complete", true);
  await expect(page.locator("canvas")).toHaveCount(0);
});
