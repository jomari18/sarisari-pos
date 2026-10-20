import { defineConfig } from "vitest/config";

// The API's database tests run separately with `npm run test:api` (they need the local Postgres).
export default defineConfig({
  test: { projects: ["packages/shared"] },
});
