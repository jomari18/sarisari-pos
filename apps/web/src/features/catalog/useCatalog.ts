import type { CatalogSnapshot } from "@sari/shared";
import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "../../api/client";
import { useSession } from "../../auth/session";
import { loadCatalog, saveCatalog } from "../../offline/catalog";

export const CATALOG_KEY = ["catalog"] as const;

type CatalogData = { snapshot: CatalogSnapshot; offline: boolean };

/**
 * The POS's products, categories and suki (spec 8.3). Every online load is saved on the device; when the
 * server cannot be reached, the saved snapshot is used and `isOffline` says so (spec 9).
 */
export function useCatalog(): { data?: CatalogSnapshot; isOffline: boolean; isLoading: boolean; error: ApiError | null; refetch: () => void } {
  const storeId = useSession()?.store.id;
  const query = useQuery<CatalogData, ApiError>({
    queryKey: CATALOG_KEY,
    queryFn: async () => {
      try {
        const snapshot = await api<CatalogSnapshot>("/catalog");
        if (storeId) void saveCatalog(storeId, snapshot);
        return { snapshot, offline: false };
      } catch (err) {
        const saved = err instanceof ApiError && err.status === 0 && storeId ? await loadCatalog(storeId) : undefined;
        if (saved) return { snapshot: saved.snapshot, offline: true };
        throw err;
      }
    },
    staleTime: 60_000,
    // Back online, the saved snapshot gives way to the server's at once.
    refetchOnReconnect: "always",
  });
  return {
    data: query.data?.snapshot,
    isOffline: query.data?.offline ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
