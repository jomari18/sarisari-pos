import { Router } from "express";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { setRefreshCookie } from "../http/cookies.js";
import { clientIp } from "../middleware/clientIp.js";
import { createDemoStore } from "../services/demo.js";
import { ipHash } from "../services/ipHash.js";

/** Spec 8.1: public, but like every route it must come through the signed proxy. */
export function demoRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();
  router.post("/api/demo", async (req, res) => {
    const demo = await createDemoStore(db, config, ipHash(clientIp(req), config.IP_HASH_SALT), now());
    setRefreshCookie(res, demo.refreshToken, demo.refreshExpiresAt);
    res.status(201).json({
      accessToken: demo.accessToken,
      user: demo.user,
      store: demo.store,
      demoLogins: demo.demoLogins,
      expiresAt: demo.expiresAt.toISOString(),
    });
  });
  return router;
}
