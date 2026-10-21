import { manilaDate } from "@sari/shared";
import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { manilaDateParam, parseBody } from "../http/parse.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { hourly, myShift, productReport, summary, utangReport } from "../services/reports.js";

const RangeQuery = z.object({ range: z.enum(["today", "7d", "30d"]).default("today") });
const DateQuery = z.object({ date: manilaDateParam.optional() });

/** Spec 8.6. Every report is the owner's, except "My shift". */
export function reportsRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();
  const auth = requireAuth(config.JWT_SECRET, now);
  const owner = [auth, requireRole("OWNER")];

  router.get("/api/reports/summary", ...owner, async (req, res) => {
    res.json(await summary(db, req.user!, parseBody(RangeQuery, req.query).range, now()));
  });
  router.get("/api/reports/products", ...owner, async (req, res) => {
    res.json(await productReport(db, req.user!, parseBody(RangeQuery, req.query).range, now()));
  });
  router.get("/api/reports/hourly", ...owner, async (req, res) => {
    res.json(await hourly(db, req.user!, parseBody(DateQuery, req.query).date ?? manilaDate(now())));
  });
  router.get("/api/reports/utang", ...owner, async (req, res) => {
    res.json(await utangReport(db, req.user!, now()));
  });
  router.get("/api/reports/my-shift", auth, async (req, res) => {
    res.json(await myShift(db, req.user!, now()));
  });

  return router;
}
