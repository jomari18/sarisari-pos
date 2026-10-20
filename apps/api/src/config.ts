import { z } from "zod";

const secret = z.string().min(32, "must be at least 32 characters");

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: secret,
  PROXY_SIGNING_SECRET: secret,
  CLEANUP_SECRET: secret,
  IP_HASH_SALT: secret,
  SITE_ORIGIN: z.url(),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Reads and checks the environment once at start; a bad setting stops the server instead of failing later. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return ConfigSchema.parse(env);
}
