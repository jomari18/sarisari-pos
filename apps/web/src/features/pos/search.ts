import { searchKey, type ProductView } from "@sari/shared";

/**
 * POS search: every typed word must appear in the name or brand, ignoring case, accents and spacing
 * ("nino" finds "Niño Biscuit"). Products whose barcode starts with the typed digits come after.
 */
export function searchProducts(products: ProductView[], query: string): ProductView[] {
  const words = searchKey(query).split(" ").filter(Boolean);
  if (words.length === 0) return products;
  const byText = products.filter((product) => {
    const haystack = searchKey(`${product.name} ${product.brand ?? ""}`);
    return words.every((word) => haystack.includes(word));
  });
  const digits = query.trim();
  const byBarcode = /^\d+$/.test(digits) ? products.filter((product) => product.barcode?.startsWith(digits) && !byText.includes(product)) : [];
  return [...byText, ...byBarcode];
}
