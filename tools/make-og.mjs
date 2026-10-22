/**
 * Makes apps/web/public/og.png, the 1200 x 630 card a shared link to the site shows (spec 11.5): the mark, the
 * name, the landing's headline and the tindahan still. Run it again after tools/render-still.mjs:
 *
 *   node tools/make-og.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const at = (path) => new URL(`../${path}`, import.meta.url);
const base64 = async (path) => (await readFile(at(path))).toString("base64");

const [still, semibold, regular, logo] = await Promise.all([
  base64("apps/web/public/tindahan-still.webp"),
  base64("node_modules/@fontsource/poppins/files/poppins-latin-600-normal.woff2"),
  base64("node_modules/@fontsource/poppins/files/poppins-latin-400-normal.woff2"),
  readFile(at("apps/web/public/logo.svg"), "utf8"),
]);
// The mark in the dark theme's blue, as on the app's dark surfaces.
const mark = logo.replace('fill="#2563eb"', 'fill="#93c5fd"');

const html = `<!doctype html>
<html>
  <head>
    <style>
      @font-face { font-family: Poppins; font-weight: 600; src: url(data:font/woff2;base64,${semibold}) format("woff2"); }
      @font-face { font-family: Poppins; font-weight: 400; src: url(data:font/woff2;base64,${regular}) format("woff2"); }
      html, body { margin: 0; }
      body {
        box-sizing: border-box; width: 1200px; height: 630px; overflow: hidden; display: flex; align-items: center; gap: 48px;
        padding-left: 72px; background: radial-gradient(circle at 78% 45%, #292c2d, #111315 62%); color: #f4f5f7;
        font-family: Poppins, sans-serif;
      }
      .copy { flex: 1; display: flex; flex-direction: column; gap: 24px; }
      .brand { display: flex; align-items: center; gap: 16px; color: #93c5fd; font-size: 26px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; }
      .brand svg { width: 64px; height: 64px; }
      h1 { margin: 0; font-size: 50px; font-weight: 600; line-height: 1.15; }
      .chips { display: flex; flex-wrap: wrap; gap: 10px; }
      .chips span { padding: 8px 18px; border-radius: 999px; background: #292c2d; color: #c9ced3; font-size: 20px; }
      .picture { flex: none; width: 560px; height: 420px; overflow: hidden; border-radius: 32px 0 0 32px; }
      .picture img { display: block; width: 100%; height: 100%; object-fit: cover; }
    </style>
  </head>
  <body>
    <div class="copy">
      <div class="brand">${mark}ZariZari</div>
      <h1>The point of sale for the neighborhood sari-sari store.</h1>
      <div class="chips"><span>Point of sale</span><span>Utang ledger</span><span>Works offline</span></div>
    </div>
    <div class="picture"><img alt="" src="data:image/webp;base64,${still}" /></div>
  </body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("img").evaluate((image) => image.decode());
  const out = at("apps/web/public/og.png");
  await writeFile(out, await page.screenshot({ type: "png" }));
  console.log(`Wrote ${out.pathname} (1200 x 630)`);
} finally {
  await browser.close();
}
