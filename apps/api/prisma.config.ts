import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma's env() helper throws when the variable is missing, which would break `prisma generate`
// in the Docker build and CI. The datasource is only needed by migrate, so add it when it is set.
// Migrations take Neon's direct connection; the app itself uses the pooled DATABASE_URL (spec 14).
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});
