// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

type Redirect = { from: string; to: string; status: number; force?: boolean; signed?: string };
type Netlify = {
  build: { command: string; publish: string; environment?: Record<string, string> };
  redirects: Redirect[];
  headers: { for: string; values: Record<string, string> }[];
};
const netlify = parse(read("netlify.toml")) as unknown as Netlify;
const headersFor = (path: string) => netlify.headers.find((rule) => rule.for === path)?.values ?? {};
const csp = () =>
  Object.fromEntries(
    (headersFor("/*")["Content-Security-Policy"] ?? "")
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name!, sources]),
  );

describe("netlify.toml (spec 4 and 14)", () => {
  it("builds the web app from the workspace root and publishes its dist", () => {
    expect(netlify.build.command).toBe("npm run build -w @sari/web");
    expect(netlify.build.publish).toBe("apps/web/dist");
  });

  it("proxies /api to the API with a signature, before the app's own fallback", () => {
    const api = netlify.redirects.findIndex((rule) => rule.from === "/api/*");
    const app = netlify.redirects.findIndex((rule) => rule.from === "/*");
    expect(netlify.redirects[api]).toMatchObject({ status: 200, force: true, signed: "PROXY_SIGNING_SECRET" });
    expect(netlify.redirects[api]!.to).toMatch(/^https:\/\/[^/]+\/api\/:splat$/);
    expect(netlify.redirects[app]).toMatchObject({ to: "/index.html", status: 200 });
    expect(api).toBeGreaterThanOrEqual(0);
    expect(app).toBeGreaterThan(api);
  });

  it("wakes, proxies to and allows the same API host", () => {
    // Read as text, so the check also works while the host is a placeholder that URL() would refuse.
    const host = /^(https:\/\/[^/]+)\/api\/:splat$/.exec(netlify.redirects.find((rule) => rule.from === "/api/*")!.to)?.[1];
    expect(host).toBeDefined();
    expect(netlify.build.environment?.VITE_API_WAKE_URL).toBe(`${host}/api/health`);
    expect(csp()["connect-src"]).toEqual(["'self'", host]);
  });

  it("sends a strict Content Security Policy: scripts only from the site, no eval, no framing", () => {
    const policy = csp();
    expect(policy["default-src"]).toEqual(["'self'"]);
    expect(policy["script-src"]).toEqual(["'self'"]);
    expect(policy["worker-src"]).toEqual(["'self'"]);
    expect(policy["frame-ancestors"]).toEqual(["'none'"]);
    expect(headersFor("/*")["Content-Security-Policy"]).not.toContain("unsafe-eval");
  });

  // The "Powered by Netlify" badge is turned off in the site settings, so nothing inline runs and forms post
  // only to the site.
  it("allows no inline script and no outside form target", () => {
    const policy = csp();
    expect(policy["script-src"]!.some((source) => source.startsWith("'sha256-"))).toBe(false);
    expect(policy["form-action"]).toEqual(["'self'"]);
  });

  it("lets the scanner use the camera and nothing else, over HTTPS only", () => {
    const headers = headersFor("/*");
    expect(headers["Permissions-Policy"]).toBe("camera=(self), microphone=(), geolocation=()");
    expect(headers["Strict-Transport-Security"]).toMatch(/^max-age=\d{8,}/);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});

describe("render.yaml and the cleanup job (spec 14)", () => {
  it("runs the API's Docker image on Render's free plan, deploying only after CI passes, with no secret in the file", () => {
    const render = read("render.yaml");
    expect(render).toContain("runtime: docker");
    expect(render).toContain("plan: free");
    expect(render).toContain("dockerfilePath: ./apps/api/Dockerfile");
    expect(render).toContain("healthCheckPath: /api/health");
    expect(render).toContain("autoDeployTrigger: checksPass");
    const keys = [...render.matchAll(/- key: (\w+)/g)].map((match) => match[1]);
    expect(keys).toEqual(["DATABASE_URL", "DIRECT_URL", "JWT_SECRET", "PROXY_SIGNING_SECRET", "CLEANUP_SECRET", "IP_HASH_SALT", "SITE_ORIGIN"]);
    expect(render).not.toMatch(/^\s+value:/m);
  });

  it("cleans up daily at 03:00 in Manila, through the signed proxy, with the secret from GitHub", () => {
    const cleanup = read(".github/workflows/cleanup.yml");
    expect(cleanup).toContain('cron: "0 19 * * *"');
    expect(cleanup).toContain("x-cleanup-secret: $CLEANUP_SECRET");
    expect(cleanup).toContain("CLEANUP_SECRET: ${{ secrets.CLEANUP_SECRET }}");
    expect(cleanup).toContain('"$SITE_URL/api/admin/cleanup"');
  });
});
