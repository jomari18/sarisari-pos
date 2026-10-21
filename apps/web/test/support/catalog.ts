import type { CatalogSnapshot, ProductView } from "@sari/shared";

const product = (id: string, categoryId: string, name: string, brand: string | null, barcode: string | null, priceCentavos: number, stock: number, reorderLevel = 3): ProductView => ({
  id,
  categoryId,
  name,
  brand,
  barcode,
  unit: "pc",
  priceCentavos,
  stock,
  reorderLevel,
  packSize: 1,
  archived: false,
  updatedAt: "2026-10-21T00:00:00.000Z",
});

export const products: ProductView[] = [
  product("p-kape", "c-snacks", "Kape 3-in-1", "Sikat", "2000000000015", 1200, 40),
  product("p-nino", "c-snacks", "Niño Biscuit", "Tamis", "2000000000022", 1000, 12),
  product("p-soft", "c-drinks", "Softdrink 1.5L", "Lamig", "2000000000039", 8500, 2),
  product("p-water", "c-drinks", "Bottled water 500 ml", "Agos", null, 1500, 20),
];

export const catalog: CatalogSnapshot = {
  generatedAt: "2026-10-21T07:00:00.000Z",
  products,
  categories: [
    { id: "c-snacks", name: "Snacks", archived: false },
    { id: "c-drinks", name: "Drinks", archived: false },
  ],
  customers: [{ id: "k-rosa", name: "Aling Rosa", phone: null, creditLimitCentavos: 50000, balanceCentavos: 12000 }],
};
