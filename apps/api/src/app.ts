import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Config } from "./config.js";
import { AppError, errorHandler, notFound } from "./http/errors.js";
import { requireProxySignature } from "./middleware/proxySignature.js";
import { healthRouter } from "./routes/health.js";

export type AppDeps = { config: Config; now?: () => Date };

export function createApp({ config }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());

  app.use(healthRouter(config.SITE_ORIGIN));

  // Everything below must come through Netlify's signed proxy; check that before reading any body.
  app.use(requireProxySignature(config.PROXY_SIGNING_SECRET));
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  // Replaced by the auth routes in Task 8.
  app.get("/api/me", () => {
    throw new AppError("unauthenticated", "Please sign in.");
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
