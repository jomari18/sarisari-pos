import { describe, expect, it } from "vitest";
import { agingBuckets } from "../src/domain/aging.js";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-21T15:00:00+08:00");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
const charge = (amountCentavos: number, days: number, saleId: string | null = null) => ({ kind: "CHARGE" as const, amountCentavos, createdAt: daysAgo(days), saleId });
const payment = (amountCentavos: number, days: number) => ({ kind: "PAYMENT" as const, amountCentavos: -amountCentavos, createdAt: daysAgo(days) });

describe("agingBuckets (spec 6.8: payments pay the oldest charges first)", () => {
  it("leaves what is unpaid on the newer charges", () => {
    const entries = [charge(10_000, 40), charge(5_000, 10), charge(3_000, 2), payment(12_000, 1)];
    expect(agingBuckets(entries, now)).toEqual({ d0to7: 3_000, d8to30: 3_000, d31plus: 0, oldestUnpaidDays: 10 });
  });

  it("is all zero with no oldest day once everything is paid", () => {
    expect(agingBuckets([charge(10_000, 40), payment(4_000, 20), payment(6_000, 3)], now)).toEqual({ d0to7: 0, d8to30: 0, d31plus: 0, oldestUnpaidDays: null });
    expect(agingBuckets([], now)).toEqual({ d0to7: 0, d8to30: 0, d31plus: 0, oldestUnpaidDays: null });
  });

  it("puts 7 days in 0–7, 8 and 30 days in 8–30, and 31 days in 31+", () => {
    expect(agingBuckets([charge(100, 7), charge(200, 8), charge(300, 30), charge(400, 31)], now)).toEqual({
      d0to7: 100,
      d8to30: 500,
      d31plus: 400,
      oldestUnpaidDays: 31,
    });
  });

  it("counts Manila calendar days: a charge at 23:30 last night is 1 day old at 00:30", () => {
    const lateNight = new Date("2026-10-20T23:30:00+08:00");
    const earlyMorning = new Date("2026-10-21T00:30:00+08:00");
    expect(agingBuckets([{ kind: "CHARGE", amountCentavos: 500, createdAt: lateNight }], earlyMorning).oldestUnpaidDays).toBe(1);
  });

  it("treats a negative adjustment like a payment and a positive one like a new charge", () => {
    const entries = [
      charge(5_000, 20),
      { kind: "ADJUSTMENT" as const, amountCentavos: -2_000, createdAt: daysAgo(15) },
      { kind: "ADJUSTMENT" as const, amountCentavos: 1_000, createdAt: daysAgo(5) },
    ];
    expect(agingBuckets(entries, now)).toEqual({ d0to7: 1_000, d8to30: 3_000, d31plus: 0, oldestUnpaidDays: 20 });
  });

  it("lets a VOID take back its own sale's charge, not the oldest one", () => {
    const entries = [charge(5_000, 40, "old-sale"), charge(2_000, 3, "voided-sale"), { kind: "VOID" as const, amountCentavos: -2_000, createdAt: daysAgo(2), saleId: "voided-sale" }];
    expect(agingBuckets(entries, now)).toEqual({ d0to7: 0, d8to30: 0, d31plus: 5_000, oldestUnpaidDays: 40 });
  });

  it("reads entries in time order whatever order they arrive in", () => {
    const entries = [payment(12_000, 1), charge(3_000, 2), charge(10_000, 40), charge(5_000, 10)];
    expect(agingBuckets(entries, now)).toEqual({ d0to7: 3_000, d8to30: 3_000, d31plus: 0, oldestUnpaidDays: 10 });
  });
});
