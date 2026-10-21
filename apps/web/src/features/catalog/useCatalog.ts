import type { CatalogSnapshot } from "@sari/shared";
import { useQuery } from "@tanstack/react-query";
import { api, type ApiError } from "../../api/client";

export const CATALOG_KEY = ["catalog"] as const;

/** The POS's products, categories and suki (spec 8.3). Task 29 adds the offline snapshot. */
export function useCatalog(): { data?: CatalogSnapshot; isOffline: boolean; isLoading: boolean; error: ApiError | null; refetch: () => void } {
  const query = useQuery<CatalogSnapshot, ApiError>({ queryKey: CATALOG_KEY, queryFn: () => api<CatalogSnapshot>("/catalog"), staleTime: 60_000 });
  return { data: query.data, isOffline: false, isLoading: query.isLoading, error: query.error, refetch: () => void query.refetch() };
}
