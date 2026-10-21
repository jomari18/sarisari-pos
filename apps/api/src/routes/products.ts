import { ProductInput, ProductPatch } from "@sari/shared";
import { Router } from "express";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { parseBody, routeParam } from "../http/parse.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createProduct, setArchived, updateProduct } from "../services/catalog.js";

/** Spec 8.3, product writes: owner only. The reads live in routes/catalog.ts. */
export function productsRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();
  const owner = [requireAuth(config.JWT_SECRET, now), requireRole("OWNER")];

  router.post("/api/products", ...owner, async (req, res) => {
    res.status(201).json(await createProduct(db, req.user!, parseBody(ProductInput, req.body)));
  });
  router.patch("/api/products/:id", ...owner, async (req, res) => {
    res.json(await updateProduct(db, req.user!, routeParam(req, "id"), parseBody(ProductPatch, req.body)));
  });
  router.post("/api/products/:id/archive", ...owner, async (req, res) => {
    res.json(await setArchived(db, req.user!, routeParam(req, "id"), true));
  });
  router.post("/api/products/:id/unarchive", ...owner, async (req, res) => {
    res.json(await setArchived(db, req.user!, routeParam(req, "id"), false));
  });

  return router;
}
