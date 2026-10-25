// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Builds the app the way Netlify will, into a scratch folder, and reads what the PWA plugin made.
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let outDir: string;
let sw: string;
let manifest: Record<string, unknown>;
let html: string;
// Netlify sets URL to the site's address during the build; social cards need absolute links.
const SITE = "https://zarizari.example";

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "zarizari-pwa-"));
  process.env.URL = SITE;
  await build({ root: webRoot, configFile: join(webRoot, "vite.config.ts"), logLevel: "silent", build: { outDir, emptyOutDir: true } });
  sw = readFileSync(join(outDir, "sw.js"), "utf8");
  manifest = JSON.parse(readFileSync(join(outDir, "manifest.webmanifest"), "utf8")) as Record<string, unknown>;
  html = readFileSync(join(outDir, "index.html"), "utf8");
  delete process.env.URL;
}, 120_000);
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe("service worker (spec 9)", () => {
  it("precaches the app shell: index.html, the script, the styles and the fonts", () => {
    expect(sw).toContain('"index.html"');
    expect(sw).toMatch(/assets\/index-[\w-]+\.js/);
    expect(sw).toMatch(/assets\/index-[\w-]+\.css/);
    expect(sw).toMatch(/\.woff2/);
  });

  it("leaves out the landing's 3D scene, which is downloaded only where it plays (spec 11.4)", () => {
    const scene = readdirSync(join(outDir, "assets")).find((file) => file.startsWith("Tindahan3D-"));
    expect(scene).toBeDefined();
    expect(sw).not.toContain(scene);
  });

  it("opens pages offline from index.html, but never answers /api, and caches no API responses", () => {
    expect(sw).toContain("NavigationRoute");
    expect(sw).toMatch(/createHandlerBoundToURL\("\/?index\.html"\)/);
    // The navigation route is the only route: no runtime route caches API answers.
    expect(sw.match(/registerRoute\(/g)).toHaveLength(1);
    expect(sw).toContain(String.raw`denylist:[/^\/api\//]`);
  });
});

describe("updates", () => {
  it("takes over as soon as a new version is deployed, instead of waiting behind the old one forever", () => {
    // A worker that waits for a "SKIP_WAITING" message never updates: no page here sends one.
    expect(sw).not.toContain("SKIP_WAITING");
    expect(sw).toContain("self.skipWaiting()");
    expect(sw).toContain("clientsClaim()");
  });
});

describe("web app manifest", () => {
  it("installs as ZariZari, opening on the app, in the dark theme color", () => {
    expect(manifest).toMatchObject({ name: "ZariZari", short_name: "ZariZari", start_url: "/app", display: "standalone", theme_color: "#111315" });
    expect(manifest.icons).toEqual([
      { src: "/pwa-64x64.png", sizes: "64x64", type: "image/png" },
      { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
    for (const icon of manifest.icons as { src: string }[]) expect(existsSync(join(outDir, icon.src))).toBe(true);
  });
});

/** The width and height in a PNG's header. */
function pngSize(file: string) {
  const bytes = readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("the page's head (spec 11.5)", () => {
  it("has the favicons and the home-screen icon", () => {
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="48x48" />');
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />');
    for (const file of ["favicon.ico", "favicon.svg", "apple-touch-icon-180x180.png", "logo.svg"]) expect(existsSync(join(outDir, file))).toBe(true);
  });

  // Without its own file the SPA fallback answers /robots.txt with the page's HTML, which crawlers cannot read.
  it("has a robots.txt that lets crawlers read the public pages and skip the signed-in app", () => {
    const robots = readFileSync(join(outDir, "robots.txt"), "utf8");
    expect(robots.split("\n")).toEqual(expect.arrayContaining(["User-agent: *", "Allow: /", "Disallow: /app"]));
  });

  it("describes the app and shows a 1200 x 630 social card, linked absolutely from the site's address", () => {
    expect(html).toMatch(/<meta name="description" content="[^"]{80,}" \/>/);
    expect(html).toContain('<meta property="og:title" content="ZariZari" />');
    expect(html).toContain(`<meta property="og:url" content="${SITE}/" />`);
    expect(html).toContain(`<meta property="og:image" content="${SITE}/og.png" />`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(pngSize(join(outDir, "og.png"))).toEqual({ width: 1200, height: 630 });
  });
});
