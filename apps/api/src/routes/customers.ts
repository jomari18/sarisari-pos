import { AdjustmentInput, CustomerInput, CustomerPatch, PaymentRecordInput } from "@sari/shared";
import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { parseBody, routeParam } from "../http/parse.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { adjustBalance, createCustomer, getLedger, getReminder, listCustomers, recordPayment, updateCustomer } from "../services/utang.js";

const CustomerQuery = z.object({ search: z.string().trim().max(60).optional() });

/** Spec 8.5: suki and utang. */
export function customersRouter(config: Config, db: Db, now: () => Date): Router {
  const router = Router();
  const auth = requireAuth(config.JWT_SECRET, now);

  router.get("/api/customers", auth, async (req, res) => {
    res.json(await listCustomers(db, req.user!, parseBody(CustomerQuery, req.query), now()));
  });
  router.post("/api/customers", auth, async (req, res) => {
    res.status(201).json(await createCustomer(db, req.user!, parseBody(CustomerInput, req.body), now()));
  });
  router.patch("/api/customers/:id", auth, async (req, res) => {
    res.json(await updateCustomer(db, req.user!, routeParam(req, "id"), parseBody(CustomerPatch, req.body), now()));
  });
  router.get("/api/customers/:id/ledger", auth, async (req, res) => {
    res.json(await getLedger(db, req.user!, routeParam(req, "id"), now()));
  });
  router.post("/api/customers/:id/payments", auth, async (req, res) => {
    const result = await recordPayment(db, req.user!, routeParam(req, "id"), parseBody(PaymentRecordInput, req.body), now());
    res.status(result.duplicate ? 200 : 201).json(result);
  });
  router.post("/api/customers/:id/adjustments", auth, requireRole("OWNER"), async (req, res) => {
    res.status(201).json(await adjustBalance(db, req.user!, routeParam(req, "id"), parseBody(AdjustmentInput, req.body), now()));
  });
  router.get("/api/customers/:id/reminder", auth, async (req, res) => {
    res.json({ text: await getReminder(db, req.user!, routeParam(req, "id")) });
  });

  return router;
}
