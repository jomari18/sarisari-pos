import { LoginInput } from "@sari/shared";
import { Router } from "express";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../http/cookies.js";
import { AppError } from "../http/errors.js";
import { parseBody } from "../http/parse.js";
import { toStoreView, toUserView } from "../http/views.js";
import { requireAuth } from "../middleware/auth.js";
import { loginLimiter } from "../middleware/rateLimit.js";
import { login, logout, refresh } from "../services/auth.js";

/** Spec 8.2. */
export function authRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();

  router.post("/api/auth/login", loginLimiter(), async (req, res) => {
    const result = await login(db, config, parseBody(LoginInput, req.body), now());
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    res.json({ accessToken: result.accessToken, user: result.user, store: result.store });
  });

  router.post("/api/auth/refresh", async (req, res) => {
    // Another site cannot add this header to a request, so it cannot rotate the cookie (spec 7.2).
    if (req.get("x-requested-with") !== "sari-pos") throw new AppError("forbidden", "This request is not allowed.");
    const token = readRefreshCookie(req);
    if (!token) throw new AppError("unauthenticated", "Please sign in.");
    try {
      const result = await refresh(db, config, token, now());
      setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
      res.json({ accessToken: result.accessToken });
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  });

  router.post("/api/auth/logout", async (req, res) => {
    const token = readRefreshCookie(req);
    if (token) await logout(db, token, now());
    clearRefreshCookie(res);
    res.status(204).end();
  });

  router.get("/api/me", requireAuth(config.JWT_SECRET, now), async (req, res) => {
    const { userId, storeId } = req.user!;
    const user = await db.user.findFirst({ where: { id: userId, storeId, active: true }, include: { store: true } });
    if (!user) throw new AppError("unauthenticated", "Please sign in.");
    res.json({ user: toUserView(user), store: toStoreView(user.store) });
  });

  return router;
}
