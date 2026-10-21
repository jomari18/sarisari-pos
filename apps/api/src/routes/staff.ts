import { StaffInput, StaffPatch } from "@sari/shared";
import { Router } from "express";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { parseBody, routeParam } from "../http/parse.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { addBantay, listStaff, updateStaff } from "../services/staff.js";

/** Spec 8.6: bantay accounts, managed by the owner. */
export function staffRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();
  const owner = [requireAuth(config.JWT_SECRET, now), requireRole("OWNER")];

  router.get("/api/staff", ...owner, async (req, res) => {
    res.json(await listStaff(db, req.user!));
  });
  router.post("/api/staff", ...owner, async (req, res) => {
    res.status(201).json(await addBantay(db, req.user!, parseBody(StaffInput, req.body)));
  });
  router.patch("/api/staff/:id", ...owner, async (req, res) => {
    res.json(await updateStaff(db, req.user!, routeParam(req, "id"), parseBody(StaffPatch, req.body), now()));
  });

  return router;
}
