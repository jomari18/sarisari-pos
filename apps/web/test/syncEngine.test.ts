import type { SaleInput, SyncResult } from "@sari/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSession, setSession } from "../src/auth/session";
import { enqueueSale, failedSales, pendingCount, removeSale, retrySale } from "../src/offline/outbox";
import { SYNC_BATCH, flush } from "../src/offline/syncEngine";
import { bantay, json, store } from "./support/fetch";
import { cashSale } from "./support/offline";
import { serveRoutes } from "./support/serve";

type Body = { sales: SaleInput[] };
const accepted = (sales: SaleInput[]): SyncResult[] => sales.map((sale, i) => ({ id: sale.id, status: "accepted", receiptNo: 2000 + i, flags: [] }));

beforeEach(() => setSession({ accessToken: "t1", user: bantay, store }));
afterEach(() => {
  clearSession();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("outbox", () => {
  it("keeps one copy of a sale queued twice", async () => {
    await enqueueSale(cashSale(1));
    await enqueueSale(cashSale(1));
    expect(await pendingCount()).toBe(1);
  });
});

describe("flush", () => {
  it(`sends the queue in order, ${SYNC_BATCH} sales per request, and empties it`, async () => {
    const sales = Array.from({ length: 150 }, (_, i) => cashSale(i + 1));
    for (const sale of sales) await enqueueSale(sale);
    const api = serveRoutes({ "POST /api/sales/sync": (call) => json(200, accepted((JSON.parse(call.body!) as Body).sales)) });

    expect(await pendingCount()).toBe(150);
    expect(await flush()).toEqual({ sent: 150, flagged: 0, failed: 0 });
    const batches = api.bodiesOf("POST", "/api/sales/sync").map((body) => (body as Body).sales.map((sale) => sale.id));
    expect(batches.map((batch) => batch.length)).toEqual([25, 25, 25, 25, 25, 25]);
    expect(batches.flat()).toEqual(sales.map((sale) => sale.id));
    expect(await pendingCount()).toBe(0);
  });

  it("counts flagged sales and keeps an invalid one as couldn't sync, with the reason", async () => {
    for (const n of [1, 2, 3]) await enqueueSale(cashSale(n));
    serveRoutes({
      "POST /api/sales/sync": () =>
        json(200, [
          { id: cashSale(1).id, status: "accepted", receiptNo: 2001, flags: ["NEGATIVE_STOCK"] },
          { id: cashSale(2).id, status: "invalid", flags: [], error: { code: "invalid_input", message: "Choose a product from the list." } },
          { id: cashSale(3).id, status: "duplicate", receiptNo: 1999, flags: [] },
        ] satisfies SyncResult[]),
    });

    expect(await flush()).toEqual({ sent: 2, flagged: 1, failed: 1 });
    expect(await pendingCount()).toBe(0);
    const [failed] = await failedSales();
    expect(failed).toMatchObject({ id: cashSale(2).id, error: { message: "Choose a product from the list." } });

    await retrySale(cashSale(2).id);
    expect(await pendingCount()).toBe(1);
    await removeSale(cashSale(2).id);
    expect(await pendingCount()).toBe(0);
    expect(await failedSales()).toEqual([]);
  });

  it("stops at a lost connection and sends the rest, in order, next time", async () => {
    const sales = Array.from({ length: 30 }, (_, i) => cashSale(i + 1));
    for (const sale of sales) await enqueueSale(sale);
    let requests = 0;
    const api = serveRoutes({
      "POST /api/sales/sync": (call) => {
        requests += 1;
        if (requests === 2) throw new TypeError("Failed to fetch");
        return json(200, accepted((JSON.parse(call.body!) as Body).sales));
      },
    });

    await expect(flush()).rejects.toMatchObject({ status: 0 });
    expect(await pendingCount()).toBe(5);
    expect(await flush()).toEqual({ sent: 5, flagged: 0, failed: 0 });
    const sent = api.bodiesOf("POST", "/api/sales/sync").map((body) => (body as Body).sales.map((sale) => sale.id));
    expect([...sent[0]!, ...sent[2]!]).toEqual(sales.map((sale) => sale.id));
  });

  it("runs once at a time: a second call while sending joins the first", async () => {
    await enqueueSale(cashSale(1));
    const api = serveRoutes({ "POST /api/sales/sync": (call) => json(200, accepted((JSON.parse(call.body!) as Body).sales)) });
    const [first, second] = await Promise.all([flush(), flush()]);
    expect(first).toEqual({ sent: 1, flagged: 0, failed: 0 });
    expect(second).toBe(first);
    expect(api.urlsOf("POST", "/api/sales/sync")).toHaveLength(1);
  });

  it("sends only this cashier's sales; another cashier's wait for them", async () => {
    await enqueueSale(cashSale(1));
    setSession({ accessToken: "t2", user: { ...bantay, id: "u9", displayName: "Joy" }, store });
    await enqueueSale(cashSale(2));
    const api = serveRoutes({ "POST /api/sales/sync": (call) => json(200, accepted((JSON.parse(call.body!) as Body).sales)) });
    expect(await flush()).toEqual({ sent: 1, flagged: 0, failed: 0 });
    expect(api.bodiesOf("POST", "/api/sales/sync")[0]).toEqual({ sales: [cashSale(2)] });
  });
});
