import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { parseBody, routeParam } from "../http/parse.js";
import { requireAuth } from "../middleware/auth.js";
import { findByBarcode, getCatalog, getProduct, listCategories, listProducts } from "../services/catalog.js";

const ProductQuery = z.object({
  search: z.string().trim().max(80).optional(),
  categoryId: z.uuid().optional(),
  status: z.enum(["active", "archived"]).optional(),
  lowStock: z.stringbool().optional(),
});

/** Spec 8.3, the reads: any signed-in user, shaped by role. */
export function catalogRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();
  const auth = requireAuth(config.JWT_SECRET, now);

  router.get("/api/catalog", auth, async (req, res) => {
    res.json(await getCatalog(db, req.user!, now()));
  });
  router.get("/api/products", auth, async (req, res) => {
    res.json(await listProducts(db, req.user!, parseBody(ProductQuery, req.query)));
  });
  router.get("/api/products/barcode/:code", auth, async (req, res) => {
    res.json(await findByBarcode(db, req.user!, routeParam(req, "code")));
  });
  router.get("/api/products/:id", auth, async (req, res) => {
    res.json(await getProduct(db, req.user!, routeParam(req, "id")));
  });
  router.get("/api/categories", auth, async (req, res) => {
    res.json(await listCategories(db, req.user!));
  });

  return router;
}
