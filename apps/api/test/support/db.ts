import { createDb, type Db } from "../../src/db.js";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://sari:sari@127.0.0.1:55433/sari_test";

/** Tests truncate tables, so they must never point at a hosted database. */
export function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to run database tests against ${host}: only a local disposable database is allowed.`);
  }
}

export function testDb(): Db {
  assertLocalDatabase(TEST_DATABASE_URL);
  return createDb(TEST_DATABASE_URL);
}

/** Empties every table; Store and DemoQuota are the roots, everything else cascades from Store. */
export async function resetDb(db: Db): Promise<void> {
  await db.$executeRawUnsafe('TRUNCATE "Store", "DemoQuota" RESTART IDENTITY CASCADE');
}
