import type { CategoryView, ProductView, StockMovementView } from "@sari/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiError } from "../../api/client";
import { CATALOG_KEY } from "../catalog/useCatalog";

export type ProductFilters = { status: "active" | "archived"; categoryId: string | null; lowStock: boolean; search: string };

/** Every active product: what the restock, count and categories screens choose from. */
export const ALL_ACTIVE: ProductFilters = { status: "active", categoryId: null, lowStock: false, search: "" };

const productsPath = (f: ProductFilters) => {
  const query = new URLSearchParams({ status: f.status });
  if (f.categoryId) query.set("categoryId", f.categoryId);
  if (f.lowStock) query.set("lowStock", "true");
  if (f.search) query.set("search", f.search);
  return `/products?${query}`;
};

/** Owner product reads (spec 8.3); the API does the filtering. The last list stays on screen while a new filter loads. */
export const useProducts = (filters: ProductFilters) =>
  useQuery<ProductView[], ApiError>({
    queryKey: ["products", filters],
    queryFn: () => api<ProductView[]>(productsPath(filters)),
    placeholderData: keepPreviousData,
  });

export const useProduct = (id: string) => useQuery<ProductView, ApiError>({ queryKey: ["product", id], queryFn: () => api<ProductView>(`/products/${id}`) });

export const useCategories = () => useQuery<CategoryView[], ApiError>({ queryKey: ["categories"], queryFn: () => api<CategoryView[]>("/categories") });

export const useMovements = (id: string) =>
  useQuery<StockMovementView[], ApiError>({ queryKey: ["movements", id], queryFn: () => api<StockMovementView[]>(`/products/${id}/movements`) });

/**
 * After a product or its stock changed: the API's answer is the product now, so it goes straight into the cache
 * (a refetch could race an older copy back in); the lists, its history and the POS catalog load again.
 */
export function useProductChanged() {
  const client = useQueryClient();
  return (product: ProductView) => {
    client.setQueryData(["product", product.id], product);
    return Promise.all([
      client.invalidateQueries({ queryKey: ["products"] }),
      client.invalidateQueries({ queryKey: ["movements", product.id] }),
      client.invalidateQueries({ queryKey: CATALOG_KEY }),
    ]);
  };
}

/** A created or changed category replaces its row in the cached list; the POS tiles load again. */
export function useCategoryChanged() {
  const client = useQueryClient();
  return (category: CategoryView) => {
    client.setQueryData<CategoryView[]>(["categories"], (list = []) =>
      list.some((c) => c.id === category.id) ? list.map((c) => (c.id === category.id ? category : c)) : [...list, category],
    );
    return client.invalidateQueries({ queryKey: CATALOG_KEY });
  };
}

/** "12.00": how a peso amount sits in a text field (no sign or grouping, so it parses back exactly). */
export const pesoField = (centavos: number) => (centavos / 100).toFixed(2);

/** A blank field is 0; anything but digits is NaN. */
export const wholeNumber = (text: string) => (text.trim() === "" ? 0 : /^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

export const byName = <T extends { name: string }>(rows: T[]) => [...rows].sort((a, b) => a.name.localeCompare(b.name));
