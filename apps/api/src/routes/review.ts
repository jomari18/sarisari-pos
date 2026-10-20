import { Router } from "express";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { routeParam } from "../http/parse.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listReview, markReviewed } from "../services/review.js";

/** Spec 8.4: "Needs review", owner only. */
export function reviewRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();
  const ownerOnly = [requireAuth(config.JWT_SECRET, now), requireRole("OWNER")];

  router.get("/api/review", ...ownerOnly, async (req, res) => {
    res.json(await listReview(db, req.user!));
  });
  router.post("/api/review/:saleId/done", ...ownerOnly, async (req, res) => {
    await markReviewed(db, req.user!, routeParam(req, "saleId"), now());
    res.status(204).end();
  });

  return router;
}
