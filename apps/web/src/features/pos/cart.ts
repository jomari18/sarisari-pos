import type { ProductView } from "@sari/shared";

/** One line of the sale being rung up. Custom items have no product and no recorded stock. */
export type CartLine = { key: string; productId: string | null; name: string; unitPriceCentavos: number; quantity: number; stock: number | null };

export type CartAction =
  | { type: "add"; product: ProductView }
  | { type: "addCustom"; key: string; name: string; unitPriceCentavos: number; quantity: number }
  | { type: "setQuantity"; key: string; quantity: number }
  | { type: "remove"; key: string }
  | { type: "clear" };

/** The API takes 1 to 999 of an item per line (SaleInput). */
const MAX_QUANTITY = 999;

export const cartActions = {
  add: (product: ProductView): CartAction => ({ type: "add", product }),
  /** Each custom item gets its own line: two hand-typed "Yelo" lines may have different prices. */
  addCustom: (name: string, unitPriceCentavos: number, key: string = crypto.randomUUID(), quantity = 1): CartAction => ({
    type: "addCustom",
    key,
    name,
    unitPriceCentavos,
    quantity,
  }),
  setQuantity: (key: string, quantity: number): CartAction => ({ type: "setQuantity", key, quantity }),
  remove: (key: string): CartAction => ({ type: "remove", key }),
  clear: (): CartAction => ({ type: "clear" }),
};

export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "add": {
      const { product } = action;
      if (lines.some((line) => line.productId === product.id)) {
        return lines.map((line) => (line.productId === product.id ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + 1) } : line));
      }
      return [...lines, { key: product.id, productId: product.id, name: product.name, unitPriceCentavos: product.priceCentavos, quantity: 1, stock: product.stock }];
    }
    case "addCustom":
      return [...lines, { key: action.key, productId: null, name: action.name, unitPriceCentavos: action.unitPriceCentavos, quantity: action.quantity, stock: null }];
    case "setQuantity":
      if (action.quantity <= 0) return lines.filter((line) => line.key !== action.key);
      return lines.map((line) => (line.key === action.key ? { ...line, quantity: Math.min(MAX_QUANTITY, action.quantity) } : line));
    case "remove":
      return lines.filter((line) => line.key !== action.key);
    case "clear":
      return [];
  }
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity * line.unitPriceCentavos, 0);
}

/** Spec 6.3: stock never blocks a sale, but the POS says when a line goes past what the records show. */
export function stockWarning(line: CartLine): string | null {
  if (line.stock === null || line.quantity <= line.stock) return null;
  return line.stock <= 0 ? "None left in records" : `Only ${line.stock} left in records`;
}
