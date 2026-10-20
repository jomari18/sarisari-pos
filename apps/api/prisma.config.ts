import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma's env() helper throws when the variable is missing, which would break `prisma generate`
// in the Docker build and CI. The datasource is only needed by migrate, so add it when it is set.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});
