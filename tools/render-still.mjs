/**
 * Renders the landing's 3D tindahan at rest into apps/web/public/tindahan-still.webp, the picture shown under
 * reduced motion, without WebGL, and while the scene loads (spec 11.4). Run it against a built preview:
 *
 *   npm run build -w @sari/web
 *   npm run preview -w @sari/web          (leave it running)
 *   node tools/render-still.mjs [http://localhost:4173/]
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:4173/";
const out = new URL("../apps/web/public/tindahan-still.webp", import.meta.url);

// Headless Chromium draws WebGL in software.
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  // Below the lg breakpoint the stage spans the page (864 px less 32 px padding a side = 800 px) and sits under
  // the hero, so the camera is at rest; the scene draws at its 1.5 pixel-ratio cap, making a 1200 x 900 picture.
  const page = await browser.newPage({ viewport: { width: 864, height: 1400 }, deviceScaleFactor: 1.5, reducedMotion: "no-preference" });
  await page.goto(url);
  const canvas = page.locator("[data-testid=tindahan-canvas] canvas");
  await canvas.waitFor();
  // The picture is square-cornered; the page rounds it wherever it shows it.
  await page.locator("[data-testid=tindahan-canvas]").evaluate((stage) => (stage.parentElement.style.borderRadius = "0"));
  // The slow orbit swings back through the middle about 12.6 s after the scene starts (sin(0.25 t) = 0).
  await page.waitForTimeout(12_600);
  const png = await canvas.screenshot();
  const webp = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return { data: canvas.toDataURL("image/webp", 0.82).split(",")[1], width: canvas.width, height: canvas.height };
  }, png.toString("base64"));
  await writeFile(out, Buffer.from(webp.data, "base64"));
  console.log(`Wrote ${out.pathname} (${webp.width} x ${webp.height}, ${Math.round((webp.data.length * 3) / 4 / 1024)} KB)`);
} finally {
  await browser.close();
}
