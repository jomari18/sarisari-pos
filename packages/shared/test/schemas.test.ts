import { randomUUID as uuid } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AdjustInput,
  AdjustmentInput,
  CategoryPatch,
  CustomerInput,
  LoginInput,
  PaymentInput,
  PinSchema,
  ProductInput,
  RestockInput,
  SaleInput,
  SaleLineInput,
  StaffPatch,
  SyncBatchInput,
} from "../src/schemas/index.js";

const line = { productId: uuid(), quantity: 1, unitPriceCentavos: 1500 };
const sale = (overrides: Record<string, unknown> = {}) => ({
  id: uuid(),
  soldAt: "2026-10-21T10:15:00.000Z",
  items: [line],
  totalCentavos: 1500,
  payment: { method: "CASH", tenderedCentavos: 2000 },
  ...overrides,
});
const product = {
  name: "Kape 3-in-1",
  brand: "Sikat",
  barcode: "2000000000015",
  categoryId: uuid(),
  unit: "sachet",
  priceCentavos: 1200,
  costCentavos: 900,
  reorderLevel: 10,
};

describe("sale lines", () => {
  it("is either a product line or a custom item, never both", () => {
    expect(SaleLineInput.safeParse(line).success).toBe(true);
    expect(SaleLineInput.safeParse({ custom: { name: "Yelo", unitPriceCentavos: 500 }, quantity: 2 }).success).toBe(true);
    expect(SaleLineInput.safeParse({ ...line, custom: { name: "x", unitPriceCentavos: 100 } }).success).toBe(false);
  });

  it("needs a quantity from 1 to 999", () => {
    expect(SaleLineInput.safeParse({ ...line, quantity: 0 }).success).toBe(false);
    expect(SaleLineInput.safeParse({ ...line, quantity: 1000 }).success).toBe(false);
    expect(SaleLineInput.safeParse({ ...line, quantity: 1.5 }).success).toBe(false);
  });

  it("normalizes custom item names", () => {
    const parsed = SaleLineInput.parse({ custom: { name: "  Yelo   tubig ", unitPriceCentavos: 500 }, quantity: 1 });
    expect(parsed).toEqual({ custom: { name: "Yelo tubig", unitPriceCentavos: 500 }, quantity: 1 });
  });
});

describe("sales", () => {
  it("accepts a valid cash sale", () => {
    expect(SaleInput.safeParse(sale()).success).toBe(true);
  });

  it("allows 1 to 200 lines", () => {
    expect(SaleInput.safeParse(sale({ items: [] })).success).toBe(false);
    expect(SaleInput.safeParse(sale({ items: Array(201).fill(line) })).success).toBe(false);
  });

  it("refuses cash that does not cover the total, on the tendered field", () => {
    const result = SaleInput.safeParse(sale({ payment: { method: "CASH", tenderedCentavos: 1000 } }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["payment", "tenderedCentavos"]);
  });

  it("needs the fields of the chosen payment method", () => {
    expect(PaymentInput.safeParse({ method: "CASH" }).success).toBe(false);
    expect(PaymentInput.safeParse({ method: "GCASH" }).success).toBe(true);
    expect(PaymentInput.safeParse({ method: "UTANG" }).success).toBe(false);
    expect(PaymentInput.safeParse({ method: "UTANG", customerId: uuid() }).success).toBe(true);
    expect(PaymentInput.safeParse({ method: "CHEQUE", tenderedCentavos: 1 }).success).toBe(false);
  });

  it("allows 1 to 100 sales per sync batch", () => {
    expect(SyncBatchInput.safeParse({ sales: Array.from({ length: 100 }, () => sale()) }).success).toBe(true);
    expect(SyncBatchInput.safeParse({ sales: Array.from({ length: 101 }, () => sale()) }).success).toBe(false);
  });

  it("needs a UUID id and an ISO time", () => {
    expect(SaleInput.safeParse(sale({ id: "abc" })).success).toBe(false);
    expect(SaleInput.safeParse(sale({ soldAt: "yesterday" })).success).toBe(false);
  });
});

describe("PINs and logins", () => {
  it.each(["111111", "123456", "654321", "012345", "987654", "12345", "1234567", "abcdef"])("refuses %s", (pin) => {
    expect(PinSchema.safeParse(pin).success).toBe(false);
  });

  it("accepts a PIN that is not a pattern", () => {
    expect(PinSchema.safeParse("482915").success).toBe(true);
  });

  it("lowercases and trims usernames", () => {
    expect(LoginInput.parse({ username: "  MayAri.7K2F ", secret: "owner-pass-1234" }).username).toBe("mayari.7k2f");
  });
});

describe("products, suki, stock, staff", () => {
  it("normalizes product names and defaults the pack size", () => {
    expect(ProductInput.parse({ ...product, name: "  Kape   3-in-1 " }).name).toBe("Kape 3-in-1");
    expect(ProductInput.parse(product).packSize).toBe(1);
  });

  it("checks barcodes and money ranges", () => {
    expect(ProductInput.safeParse({ ...product, barcode: "12AB" }).success).toBe(false);
    expect(ProductInput.safeParse({ ...product, priceCentavos: -1 }).success).toBe(false);
    expect(ProductInput.safeParse({ ...product, priceCentavos: 10_000_001 }).success).toBe(false);
  });

  it("renames or archives a category, and nothing else", () => {
    expect(CategoryPatch.parse({ name: "  Canned   goods " })).toEqual({ name: "Canned goods" });
    expect(CategoryPatch.parse({ archived: true })).toEqual({ archived: true });
    expect(CategoryPatch.safeParse({ name: "" }).success).toBe(false);
    expect(CategoryPatch.safeParse({ storeId: uuid() }).success).toBe(false);
  });

  it("accepts Philippine mobile numbers only", () => {
    expect(CustomerInput.safeParse({ name: "Aling Rosa", phone: "09171234567" }).success).toBe(true);
    expect(CustomerInput.safeParse({ name: "Aling Rosa", phone: "+639171234567" }).success).toBe(true);
    expect(CustomerInput.safeParse({ name: "Aling Rosa", phone: "12345" }).success).toBe(false);
  });

  it("needs boxes or pieces to restock", () => {
    expect(RestockInput.safeParse({ productId: uuid(), unitCostCentavos: 900 }).success).toBe(false);
    expect(RestockInput.safeParse({ productId: uuid(), boxes: 2, unitCostCentavos: 900 }).success).toBe(true);
  });

  it("adjusts stock by a count or by spoilage, not both", () => {
    expect(AdjustInput.safeParse({ productId: uuid(), counted: 7 }).success).toBe(true);
    expect(AdjustInput.safeParse({ productId: uuid(), quantity: 2, reason: "SPOILAGE" }).success).toBe(true);
    expect(AdjustInput.safeParse({ productId: uuid(), quantity: 2, reason: "COUNT" }).success).toBe(false);
    expect(AdjustInput.safeParse({ productId: uuid(), counted: 7, quantity: 2, reason: "EXPIRED" }).success).toBe(false);
  });

  it("refuses a zero utang adjustment and an empty staff patch", () => {
    expect(AdjustmentInput.safeParse({ amountCentavos: 0, note: "x" }).success).toBe(false);
    expect(StaffPatch.safeParse({}).success).toBe(false);
  });
});
