import { SaleInput, manilaDate, manilaDayStart } from "@sari/shared";
import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { parseBody, routeParam } from "../http/parse.js";
import { requireAuth } from "../middleware/auth.js";
import { createSale, getSale, listSales, syncSales } from "../services/sales.js";

const isManilaDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && manilaDate(manilaDayStart(date)) === date;

const SalesQuery = z.object({
  date: z.string().refine(isManilaDate, "Use a date like 2026-10-21.").optional(),
  cashierId: z.uuid().optional(),
});

/** Only the batch's shape is checked here; each sale is checked on its own so one bad sale cannot block the queue. */
const SyncBody = z.strictObject({
  sales: z.array(z.unknown()).min(1, "Send at least one sale.").max(100, "Send at most 100 sales at a time."),
});

/** Spec 8.4. */
export function salesRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();
  const auth = requireAuth(config.JWT_SECRET, now);

  router.post("/api/sales", auth, async (req, res) => {
    const result = await createSale(db, req.user!, parseBody(SaleInput, req.body), "online", now());
    res.status(result.duplicate ? 200 : 201).json(result);
  });
  router.post("/api/sales/sync", auth, async (req, res) => {
    const { sales } = parseBody(SyncBody, req.body);
    res.json(await syncSales(db, req.user!, sales, now()));
  });
  router.get("/api/sales", auth, async (req, res) => {
    res.json(await listSales(db, req.user!, parseBody(SalesQuery, req.query), now()));
  });
  router.get("/api/sales/:id", auth, async (req, res) => {
    res.json(await getSale(db, req.user!, routeParam(req, "id")));
  });

  return router;
}
