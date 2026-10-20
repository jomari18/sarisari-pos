import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { errorHandler, notFound } from "./http/errors.js";
import { requireProxySignature } from "./middleware/proxySignature.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";

export type AppDeps = { config: Config; db: Db; now?: () => Date };

export function createApp({ config, db, now = () => new Date() }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());

  app.use(healthRouter(config.SITE_ORIGIN));

  // Everything below must come through Netlify's signed proxy; check that before reading any body.
  app.use(requireProxySignature(config.PROXY_SIGNING_SECRET));
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  app.use(authRouter(config, db, now));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
