import { ean13CheckDigit } from "./ean13.js";

// The demo store's catalog (spec 7.5), shared by the API seed and the web's Sample barcodes page. Product
// names are generic and every brand is made up, so no real company's products appear. Money is in centavos.

export type ProductTemplate = {
  name: string;
  brand: string | null;
  unit: string;
  priceCentavos: number;
  costCentavos: number;
  reorderLevel: number;
  /** Pieces per box when restocking. */
  packSize: number;
  /** How often the item is bought, relative to the others. */
  popularity: number;
  /** The most one customer buys at a time. */
  maxQuantity: number;
  /** Loose and repacked tingi items carry no barcode. */
  barcode: boolean;
};

export type CategoryTemplate = { name: string; products: ProductTemplate[] };

type Row = [name: string, brand: string | null, unit: string, price: number, cost: number, reorder: number, pack: number, popularity: number, maxQty: number, barcode?: boolean];

const rows = (list: Row[]): ProductTemplate[] =>
  list.map(([name, brand, unit, priceCentavos, costCentavos, reorderLevel, packSize, popularity, maxQuantity, barcode = true]) => ({
    name,
    brand,
    unit,
    priceCentavos,
    costCentavos,
    reorderLevel,
    packSize,
    popularity,
    maxQuantity,
    barcode,
  }));

export const CATALOG: CategoryTemplate[] = [
  {
    name: "Snacks",
    products: rows([
      ["Chicharon", "Kalutong", "pack", 1500, 1100, 10, 20, 8, 3],
      ["Potato chips", "Kalutong", "pack", 1800, 1350, 10, 20, 7, 3],
      ["Corn chips", "Kalutong", "pack", 1500, 1150, 10, 20, 6, 3],
      ["Cheese curls", "Sarap", "pack", 1000, 750, 10, 20, 7, 4],
      ["Salted peanuts", "Sarap", "pack", 1200, 900, 8, 20, 5, 3],
      ["Sandwich crackers", "Sarap", "pack", 900, 680, 10, 24, 8, 4],
      ["Chocolate wafer", "Tamis", "pc", 1000, 750, 12, 24, 7, 4],
      ["Butter cookies", "Tamis", "pack", 1200, 900, 8, 20, 5, 3],
      ["Banana chips", "Sarap", "pack", 2000, 1500, 5, 10, 3, 2],
      ["Hard candy", "Tamis", "pc", 100, 70, 50, 100, 9, 10],
    ]),
  },
  {
    name: "Drinks",
    products: rows([
      ["Cola 1.5 L", "Lamig", "bottle", 8500, 7200, 6, 12, 6, 2],
      ["Lemon-lime soda 1.5 L", "Lamig", "bottle", 8500, 7200, 4, 12, 4, 2],
      ["Iced tea 500 ml", "Lamig", "bottle", 3000, 2400, 6, 24, 6, 3],
      ["Bottled water 500 ml", "Agos", "bottle", 1500, 1100, 12, 24, 8, 4],
      ["Orange juice drink 250 ml", "Katas", "pack", 1500, 1200, 10, 24, 6, 3],
      ["Chocolate milk drink 180 ml", "Busog", "pack", 2500, 2000, 8, 24, 5, 3],
      ["Coffee 3-in-1", "Gising", "sachet", 1000, 800, 20, 30, 10, 5],
      ["Powdered juice", "Katas", "sachet", 1200, 900, 15, 20, 5, 4],
    ]),
  },
  {
    name: "Canned and instant food",
    products: rows([
      ["Sardines in tomato sauce 155 g", "Dagat", "can", 2600, 2200, 12, 50, 9, 3],
      ["Corned beef 150 g", "Busog", "can", 4200, 3500, 6, 48, 5, 2],
      ["Meat loaf 150 g", "Busog", "can", 3000, 2500, 6, 48, 5, 2],
      ["Tuna flakes 155 g", "Dagat", "can", 3800, 3200, 6, 48, 4, 2],
      ["Instant noodles, chicken", "Sabaw", "pack", 1400, 1150, 20, 72, 10, 4],
      ["Instant noodles, beef", "Sabaw", "pack", 1400, 1150, 15, 72, 8, 4],
      ["Instant pancit", "Sabaw", "pack", 1700, 1400, 15, 72, 8, 4],
      ["Evaporated milk 370 ml", "Krema", "can", 4000, 3400, 6, 48, 4, 2],
      ["Condensed milk 300 ml", "Krema", "can", 5500, 4700, 4, 48, 3, 2],
    ]),
  },
  {
    name: "Condiments",
    products: rows([
      ["Soy sauce 350 ml", "Timpla", "bottle", 2500, 2000, 6, 24, 6, 2],
      ["Vinegar 350 ml", "Timpla", "bottle", 2200, 1800, 6, 24, 5, 2],
      ["Fish sauce 350 ml", "Timpla", "bottle", 3500, 2900, 4, 24, 3, 1],
      ["Banana ketchup 320 g", "Timpla", "bottle", 3200, 2700, 4, 24, 3, 1],
      ["Iodized salt 250 g", null, "pack", 1500, 1100, 6, 24, 4, 2],
      ["Ground black pepper", "Timpla", "sachet", 500, 350, 20, 50, 5, 3],
      ["Seasoning mix", "Timpla", "sachet", 500, 350, 20, 50, 6, 3],
    ]),
  },
  {
    name: "Household",
    products: rows([
      ["Laundry powder 70 g", "Bango", "sachet", 1000, 800, 20, 48, 8, 3],
      ["Fabric conditioner", "Bango", "sachet", 800, 650, 20, 48, 6, 3],
      ["Dishwashing liquid", "Linis", "sachet", 700, 550, 20, 48, 6, 3],
      ["Laundry bar soap", "Linis", "bar", 2800, 2300, 6, 24, 4, 2],
      ["Candle", null, "pc", 800, 600, 10, 50, 3, 3],
      ["Matches", null, "box", 300, 200, 10, 10, 3, 2],
      ["Mosquito coil", "Payapa", "pc", 600, 450, 10, 10, 4, 3],
    ]),
  },
  {
    name: "Personal care",
    products: rows([
      ["Shampoo", "Kinis", "sachet", 800, 650, 24, 72, 9, 4],
      ["Conditioner", "Kinis", "sachet", 800, 650, 12, 72, 5, 3],
      ["Bath soap 90 g", "Kinis", "bar", 3500, 2900, 6, 24, 4, 2],
      ["Toothpaste 50 ml", "Ngiti", "tube", 4000, 3300, 4, 24, 3, 1],
      ["Toothbrush", "Ngiti", "pc", 2500, 1800, 4, 12, 2, 1],
      ["Sanitary napkins, 8 pcs", "Ginhawa", "pack", 3800, 3100, 4, 24, 3, 1],
    ]),
  },
  {
    name: "School supplies",
    products: rows([
      ["Notebook, 80 leaves", "Sulat", "pc", 3000, 2200, 5, 10, 2, 2],
      ["Ballpen, black", "Sulat", "pc", 1000, 700, 10, 12, 3, 2],
      ["Pencil No. 2", "Guhit", "pc", 800, 500, 10, 12, 2, 2],
      ["Pad paper", "Sulat", "pad", 3500, 2700, 4, 10, 2, 1],
      ["Eraser", "Guhit", "pc", 500, 300, 10, 24, 2, 2],
      ["Bond paper, short", null, "sheet", 100, 50, 50, 500, 3, 10, false],
    ]),
  },
  {
    name: "Tingi items",
    products: rows([
      ["Egg", null, "pc", 900, 750, 30, 30, 9, 6, false],
      ["Cooking oil, small pack", "Prito", "pack", 1500, 1200, 12, 24, 7, 2],
      ["White sugar, 1/4 kg", null, "pack", 2500, 2000, 8, 20, 5, 2, false],
      ["Rice, 1 kg", null, "kg", 5200, 4500, 10, 25, 7, 3, false],
      ["Garlic, per bulb", null, "pc", 1000, 700, 15, 50, 4, 3, false],
      ["Onion, per piece", null, "pc", 1000, 700, 15, 50, 4, 3, false],
      ["Ice, small bag", null, "bag", 500, 200, 10, 20, 6, 3, false],
    ]),
  },
];

/** EAN-13 with the in-store prefix 2, so a demo code never matches a real product (spec 7.5). */
export function inStoreBarcode(n: number): string {
  const first12 = `2${String(n).padStart(11, "0")}`;
  return `${first12}${ean13CheckDigit(first12)}`;
}

/**
 * Every demo product that carries a barcode, numbered from 1 in catalog order: exactly the codes the seed
 * gives every demo store, so the Sample barcodes page needs no server.
 */
export function demoBarcodes(): { name: string; brand: string | null; category: string; barcode: string }[] {
  let next = 1;
  return CATALOG.flatMap((category) =>
    category.products.flatMap((product) => (product.barcode ? [{ name: product.name, brand: product.brand, category: category.name, barcode: inStoreBarcode(next++) }] : [])),
  );
}
