import { describe, expect, it } from "vitest";
import { cartActions, cartReducer, cartTotal, stockWarning, type CartLine } from "../src/features/pos/cart";
import { searchProducts } from "../src/features/pos/search";
import { products } from "./support/catalog";

const kape = products[0]!;
const soft = products[2]!;
const apply = (...actions: Parameters<typeof cartReducer>[1][]) => actions.reduce<CartLine[]>(cartReducer, []);

describe("cartReducer", () => {
  it("adds the same product twice as one line of quantity 2", () => {
    const lines = apply(cartActions.add(kape), cartActions.add(kape));
    expect(lines).toEqual([{ key: "p-kape", productId: "p-kape", name: "Kape 3-in-1", unitPriceCentavos: 1200, quantity: 2, stock: 40 }]);
    expect(cartTotal(lines)).toBe(2400);
  });

  it("removes a line when its quantity is set to 0 or it is removed", () => {
    expect(apply(cartActions.add(kape), cartActions.setQuantity("p-kape", 0))).toEqual([]);
    expect(apply(cartActions.add(kape), cartActions.add(soft), cartActions.remove("p-kape")).map((l) => l.productId)).toEqual(["p-soft"]);
  });

  it("caps a line at 999, the most one sale line allows", () => {
    expect(apply(cartActions.add(kape), cartActions.setQuantity("p-kape", 5000))[0]!.quantity).toBe(999);
  });

  it("never merges custom items, even with the same name", () => {
    const lines = apply(cartActions.addCustom("Yelo", 500, "k1"), cartActions.addCustom("Yelo", 500, "k2"));
    expect(lines).toEqual([
      { key: "k1", productId: null, name: "Yelo", unitPriceCentavos: 500, quantity: 1, stock: null },
      { key: "k2", productId: null, name: "Yelo", unitPriceCentavos: 500, quantity: 1, stock: null },
    ]);
  });

  it("clears the cart", () => {
    expect(apply(cartActions.add(kape), cartActions.clear())).toEqual([]);
  });
});

describe("stockWarning (spec 6.3)", () => {
  it("warns once the quantity goes above the recorded stock", () => {
    const line = (quantity: number, stock: number | null): CartLine => ({ key: "x", productId: "x", name: "X", unitPriceCentavos: 1, quantity, stock });
    expect(stockWarning(line(2, 2))).toBeNull();
    expect(stockWarning(line(3, 2))).toBe("Only 2 left in records");
    expect(stockWarning(line(1, 0))).toBe("None left in records");
    expect(stockWarning(line(5, null))).toBeNull();
  });
});

describe("searchProducts (Review Focus 2)", () => {
  const names = (query: string) => searchProducts(products, query).map((p) => p.name);

  it("ignores accents, case and stray spaces", () => {
    expect(names("nino")).toEqual(["Niño Biscuit"]);
    expect(names("  KAPE ")).toEqual(["Kape 3-in-1"]);
  });

  it("matches the brand and every word in any order", () => {
    expect(names("lamig")).toEqual(["Softdrink 1.5L"]);
    expect(names("sikat kape")).toEqual(["Kape 3-in-1"]);
  });

  it("then matches a barcode prefix", () => {
    expect(names("200000000003")).toEqual(["Softdrink 1.5L"]);
  });

  it("returns everything for an empty query", () => {
    expect(names("   ")).toHaveLength(products.length);
  });
});
