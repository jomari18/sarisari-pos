import type { CatalogSnapshot, ProductView } from "@sari/shared";

/** Category ids are real UUIDs, because the product form checks them with the shared ProductInput schema. */
export const SNACKS = "0d1f7b2a-0000-4000-8000-00000000c001";
export const DRINKS = "0d1f7b2a-0000-4000-8000-00000000c002";
export const FROZEN = "0d1f7b2a-0000-4000-8000-00000000c003";

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
  product("p-kape", SNACKS, "Kape 3-in-1", "Sikat", "2000000000015", 1200, 40),
  product("p-nino", SNACKS, "Niño Biscuit", "Tamis", "2000000000022", 1000, 12),
  product("p-soft", DRINKS, "Softdrink 1.5L", "Lamig", "2000000000039", 8500, 2),
  product("p-water", DRINKS, "Bottled water 500 ml", "Agos", null, 1500, 20),
];

export const catalog: CatalogSnapshot = {
  generatedAt: "2026-10-21T07:00:00.000Z",
  products,
  categories: [
    { id: SNACKS, name: "Snacks", archived: false },
    { id: DRINKS, name: "Drinks", archived: false },
  ],
  customers: [{ id: "k-rosa", name: "Aling Rosa", phone: null, creditLimitCentavos: 50000, balanceCentavos: 12000 }],
};
