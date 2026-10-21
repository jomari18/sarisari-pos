import { AdjustInput, RestockInput } from "@sari/shared";
import { Router } from "express";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { parseBody, routeParam } from "../http/parse.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { adjustStock, listMovements, restock, restockList } from "../services/stock.js";

/** Spec 8.3, stock: owner only. */
export function stockRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();
  const owner = [requireAuth(config.JWT_SECRET, now), requireRole("OWNER")];

  router.post("/api/stock/restock", ...owner, async (req, res) => {
    res.json(await restock(db, req.user!, parseBody(RestockInput, req.body), now()));
  });
  router.post("/api/stock/adjust", ...owner, async (req, res) => {
    res.json(await adjustStock(db, req.user!, parseBody(AdjustInput, req.body), now()));
  });
  router.get("/api/stock/restock-list", ...owner, async (req, res) => {
    res.json(await restockList(db, req.user!));
  });
  router.get("/api/products/:id/movements", ...owner, async (req, res) => {
    res.json(await listMovements(db, req.user!, routeParam(req, "id")));
  });

  return router;
}
