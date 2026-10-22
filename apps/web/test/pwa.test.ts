// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "zarizari-pwa-"));
  await build({ root: webRoot, configFile: join(webRoot, "vite.config.ts"), logLevel: "silent", build: { outDir, emptyOutDir: true } });
  sw = readFileSync(join(outDir, "sw.js"), "utf8");
  manifest = JSON.parse(readFileSync(join(outDir, "manifest.webmanifest"), "utf8")) as Record<string, unknown>;
}, 120_000);
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe("service worker (spec 9)", () => {
  it("precaches the app shell: index.html, the script, the styles and the fonts", () => {
    expect(sw).toContain('"index.html"');
    expect(sw).toMatch(/assets\/index-[\w-]+\.js/);
    expect(sw).toMatch(/assets\/index-[\w-]+\.css/);
    expect(sw).toMatch(/\.woff2/);
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
    expect(manifest.icons).toEqual(
      expect.arrayContaining([expect.objectContaining({ purpose: "any" }), expect.objectContaining({ purpose: "maskable" })]),
    );
  });
});
