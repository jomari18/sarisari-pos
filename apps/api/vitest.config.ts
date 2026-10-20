import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Tests run against the shared source; the built API uses the compiled package.
    alias: { "@sari/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) },
  },
  test: {
    name: "api",
    include: ["test/**/*.test.ts"],
    // Database tests share one local database, so files run one at a time.
    fileParallelism: false,
  },
});
