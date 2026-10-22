import { defineConfig, devices } from "@playwright/test";

/**
 * Spec 12: the production build of the web app (vite preview, whose /api proxy signs every request the way Netlify
 * will) against the API's Docker image. Locally the API is docker compose's; in CI the e2e job runs the image.
 * Build the web app first: npm run build -w @sari/web.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One store server: the specs run one at a time, each in a demo store of its own.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      // Reused when it is already up (docker compose here, the image in CI); otherwise the built API, with
      // DATABASE_URL and its secrets from the environment.
      command: "npm run start -w @sari/api",
      url: "http://127.0.0.1:8080/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm run preview -w @sari/web",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
