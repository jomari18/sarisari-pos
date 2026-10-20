import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { AppError } from "../http/errors.js";
import { deleteExpiredStores } from "../services/demo.js";

/** Compares digests, so neither the length nor the content of the secret leaks through timing. */
function sameSecret(given: string | undefined, expected: string): boolean {
  if (given === undefined) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/** Spec 8.1: the daily GitHub Actions job deletes expired demo stores. */
export function adminRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();
  router.post("/api/admin/cleanup", async (req, res) => {
    if (!sameSecret(req.get("x-cleanup-secret"), config.CLEANUP_SECRET)) throw new AppError("forbidden", "This request is not allowed.");
    res.json({ deleted: await deleteExpiredStores(db, now()) });
  });
  return router;
}
