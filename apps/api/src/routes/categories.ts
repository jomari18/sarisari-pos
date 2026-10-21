import { CategoryInput, CategoryPatch } from "@sari/shared";
import { Router } from "express";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { parseBody, routeParam } from "../http/parse.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createCategory, updateCategory } from "../services/catalog.js";

/** Spec 8.3, category writes: owner only. Listing categories lives in routes/catalog.ts. */
export function categoriesRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();
  const owner = [requireAuth(config.JWT_SECRET, now), requireRole("OWNER")];

  router.post("/api/categories", ...owner, async (req, res) => {
    res.status(201).json(await createCategory(db, req.user!, parseBody(CategoryInput, req.body)));
  });
  router.patch("/api/categories/:id", ...owner, async (req, res) => {
    res.json(await updateCategory(db, req.user!, routeParam(req, "id"), parseBody(CategoryPatch, req.body)));
  });

  return router;
}
