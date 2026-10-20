import { afterEach, describe, expect, it, vi } from "vitest";

const POOLED = "postgres://sari:pw@pooled.example.test/sari";
const DIRECT = "postgres://sari:pw@direct.example.test/sari";

async function migrationUrl(): Promise<string | undefined> {
  vi.resetModules();
  return (await import("../prisma.config.js")).default.datasource?.url;
}

describe("prisma config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs migrations over the direct connection when DIRECT_URL is set (spec 14: Neon)", async () => {
    vi.stubEnv("DATABASE_URL", POOLED);
    vi.stubEnv("DIRECT_URL", DIRECT);
    expect(await migrationUrl()).toBe(DIRECT);
  });

  it("falls back to DATABASE_URL when DIRECT_URL is empty", async () => {
    vi.stubEnv("DATABASE_URL", POOLED);
    vi.stubEnv("DIRECT_URL", "");
    expect(await migrationUrl()).toBe(POOLED);
  });
});
