import { describe, expect, it } from "vitest";
import { changeFor, formatPeso, parsePesos } from "../src/money.js";

describe("parsePesos", () => {
  it.each([
    ["1,000", 100000],
    ["1000.5", 100050],
    ["₱50", 5000],
    [" 0.05 ", 5],
    ["₱ 1,234.56", 123456],
    ["0", 0],
  ])("parses %j as %i centavos", (input, centavos) => {
    expect(parsePesos(input)).toBe(centavos);
  });

  it.each(["12.345", "-5", "", "abc", "1,00", "1e3", "1.", ".5", "₱₱5", "1,0000"])("refuses %j", (input) => {
    expect(parsePesos(input)).toBeNull();
  });
});

describe("formatPeso", () => {
  it("formats centavos as pesos with thousands separators and two decimals", () => {
    expect(formatPeso(123450)).toBe("₱1,234.50");
    expect(formatPeso(0)).toBe("₱0.00");
    expect(formatPeso(5)).toBe("₱0.05");
    expect(formatPeso(100000000)).toBe("₱1,000,000.00");
  });

  it("shows negative amounts with a leading minus", () => {
    expect(formatPeso(-32000)).toBe("-₱320.00");
  });
});

describe("changeFor", () => {
  it("returns tendered minus total", () => {
    expect(changeFor(4550, 10000)).toBe(5450);
    expect(changeFor(4550, 4550)).toBe(0);
  });

  it("refuses a tendered amount below the total", () => {
    expect(() => changeFor(10000, 4550)).toThrow(RangeError);
  });
});
