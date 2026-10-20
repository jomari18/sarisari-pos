import { describe, expect, it } from "vitest";
import { normalizeName, searchKey } from "../src/normalize.js";

describe("normalizeName", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeName("  Kape   3-in-1 ")).toBe("Kape 3-in-1");
    expect(normalizeName("Sardinas\t\nPula")).toBe("Sardinas Pula");
  });

  it("keeps ñ and accents, in composed form", () => {
    expect(normalizeName("Niño")).toBe("Niño");
  });
});

describe("searchKey", () => {
  it("lowercases and strips accents so searches ignore them", () => {
    expect(searchKey("Niño")).toBe("nino");
    expect(searchKey("ÁTSARA")).toBe("atsara");
    expect(searchKey("  KAPE  ")).toBe("kape");
  });
});
