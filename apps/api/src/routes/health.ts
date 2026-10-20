import { Router } from "express";

/** Public and unsigned: the landing page calls it directly to wake the free Render instance (spec 3.1). */
export function healthRouter(siteOrigin: string): Router {
  const router = Router();
  router.get("/api/health", (_req, res) => {
    res.set({ "Access-Control-Allow-Origin": siteOrigin, Vary: "Origin", "Cache-Control": "no-store" });
    res.json({ ok: true });
  });
  return router;
}
