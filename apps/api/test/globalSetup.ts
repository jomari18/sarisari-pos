import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TEST_DATABASE_URL, assertLocalDatabase } from "./support/db.js";

/** Applies the migrations to the local test database once before the API tests run. */
export default function setup(): void {
  assertLocalDatabase(TEST_DATABASE_URL);
  execSync("npx prisma migrate deploy", {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    // prisma.config.ts prefers DIRECT_URL, so both point at the local test database.
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
