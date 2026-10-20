import { describe, expect, it } from "vitest";
import { receiptLines } from "../src/receipt.js";
import type { SaleView } from "../src/views.js";

const store = { name: "Tindahan ni Mang Ben" };
const cashSale: SaleView = {
  id: "a1b2c3d4-0000-4000-8000-000000000000",
  receiptNo: 42,
  soldAt: "2026-10-21T10:15:00.000Z",
  method: "CASH",
  totalCentavos: 4550,
  tenderedCentavos: 10000,
  changeCentavos: 5450,
  gcashRef: null,
  customer: null,
  cashier: { id: "u1", displayName: "Nena" },
  lines: [
    { productId: "p1", name: "Kape 3-in-1", quantity: 2, unitPriceCentavos: 1500, lineTotalCentavos: 3000 },
    { productId: "p2", name: "Pandesal", quantity: 1, unitPriceCentavos: 1550, lineTotalCentavos: 1550 },
  ],
  flags: [],
  voidedAt: null,
  voidReason: null,
};
const utangSale: SaleView = {
  ...cashSale,
  method: "UTANG",
  tenderedCentavos: null,
  changeCentavos: null,
  customer: { id: "c1", name: "Aling Rosa", balanceAfterCentavos: 32000 },
};
const pair = (label: string, amount: string) => label.padEnd(22) + amount.padStart(10);

describe("receiptLines", () => {
  it("fits a 58 mm printer (32 characters)", () => {
    expect(receiptLines(cashSale, store).every((l) => l.length <= 32)).toBe(true);
  });

  it("prints the header, the lines and the cash totals", () => {
    const lines = receiptLines(cashSale, store);
    expect(lines).toContain("      Tindahan ni Mang Ben");
    expect(lines).toContain("2026-10-21 18:15");
    expect(lines).toContain("No. 0042");
    expect(lines).toContain("Cashier: Nena");
    expect(lines).toContain("Kape 3-in-1");
    expect(lines).toContain(pair("  2 x ₱15.00", "₱30.00"));
    expect(lines).toContain(pair("TOTAL", "₱45.50"));
    expect(lines).toContain(pair("Cash", "₱100.00"));
    expect(lines).toContain(pair("Change", "₱54.50"));
    expect(lines.at(-1)?.trim()).toBe("Salamat po!");
  });

  it("marks a queued sale as pending with its short code", () => {
    const text = receiptLines({ ...cashSale, receiptNo: null, pending: true }, store).join("\n");
    expect(text).toMatch(/PENDING SYNC A1B2C3/);
    expect(text).not.toMatch(/No\. /);
  });

  it("shows the suki and the utang balance after the sale", () => {
    const lines = receiptLines(utangSale, store);
    expect(lines).toContain("Utang: Aling Rosa");
    expect(lines).toContain(pair("Utang balance", "₱320.00"));
  });

  it("shows the GCash reference when there is one", () => {
    const lines = receiptLines({ ...cashSale, method: "GCASH", tenderedCentavos: null, changeCentavos: null, gcashRef: "1029384756" }, store);
    expect(lines).toContain("GCash ref: 1029384756");
  });

  it("wraps long product names instead of cutting them off", () => {
    const longName = "Biskwit na may palaman na tsokolate at gatas";
    const lines = receiptLines({ ...cashSale, lines: [{ ...cashSale.lines[0]!, name: longName }] }, store);
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    expect(lines).toContain("Biskwit na may palaman na");
    expect(lines).toContain("tsokolate at gatas");
  });

  it("says when a sale was voided and why", () => {
    const text = receiptLines({ ...cashSale, voidedAt: "2026-10-21T11:00:00.000Z", voidReason: "Wrong item" }, store).join("\n");
    expect(text).toMatch(/VOIDED/);
    expect(text).toMatch(/Wrong item/);
  });
});
