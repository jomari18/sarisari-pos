import type { CatalogSnapshot } from "@sari/shared";
import { offlineDb, type SavedCatalog } from "./db";

// The snapshot is a convenience: if the browser refuses IndexedDB (private windows), selling online still works.

export async function saveCatalog(storeId: string, snapshot: CatalogSnapshot): Promise<void> {
  try {
    await offlineDb.catalogs.put({ storeId, snapshot, savedAt: new Date().toISOString() });
  } catch {
    // Nothing saved; the next online load tries again.
  }
}

export async function loadCatalog(storeId: string): Promise<SavedCatalog | undefined> {
  try {
    return await offlineDb.catalogs.get(storeId);
  } catch {
    return undefined;
  }
}
