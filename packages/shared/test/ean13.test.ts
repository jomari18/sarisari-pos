import { describe, expect, it } from "vitest";
import { ean13CheckDigit, ean13Modules, isValidEan13 } from "../src/ean13.js";

describe("EAN-13", () => {
  it("computes the check digit", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(ean13CheckDigit("200000000001")).toBe(5);
    expect(() => ean13CheckDigit("12345")).toThrow(RangeError);
  });

  it("validates complete codes", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("2000000000015")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
    expect(isValidEan13("400638133393")).toBe(false);
    expect(isValidEan13("40063813339a1")).toBe(false);
  });

  it("encodes the 95 bar modules (hand-derived from the L/G/R tables, first digit 4 = LGLLGG)", () => {
    const expected =
      "101" +
      ["0001101", "0100111", "0101111", "0111101", "0001001", "0110011"].join("") +
      "01010" +
      ["1000010", "1000010", "1000010", "1110100", "1000010", "1100110"].join("") +
      "101";
    expect(ean13Modules("4006381333931")).toBe(expected);
    expect(() => ean13Modules("4006381333932")).toThrow(RangeError);
  });
});
