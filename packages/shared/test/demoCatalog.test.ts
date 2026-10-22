import { describe, expect, it } from "vitest";
import { demoBarcodes, inStoreBarcode, isValidEan13 } from "../src/index.js";

describe("demo barcodes (spec 7.5, 10)", () => {
  it("makes in-store EAN-13 codes: prefix 2, the number, a check digit", () => {
    expect(inStoreBarcode(1)).toBe("2000000000015");
    expect(isValidEan13(inStoreBarcode(42))).toBe(true);
  });

  it("lists every demo product that has a barcode, numbered from 1 in catalog order", () => {
    const list = demoBarcodes();
    expect(list.length).toBeGreaterThan(40);
    expect(list.map((item) => item.barcode)).toEqual(list.map((_, i) => inStoreBarcode(i + 1)));
    expect(list.every((item) => item.name.length > 0 && item.category.length > 0)).toBe(true);
  });
});
