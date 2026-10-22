import type { CatalogSnapshot, SaleInput } from "@sari/shared";
import Dexie, { type EntityTable } from "dexie";

/** The POS catalog as it was last loaded for a store (spec 9: stock offline is "as of" this time). */
export type SavedCatalog = { storeId: string; snapshot: CatalogSnapshot; savedAt: string };

/**
 * A sale made while it could not be sent (spec 9). `seq` keeps the order sales were made in; the user who
 * made it sends it, so the server records the right cashier.
 */
export type QueuedSale = {
  seq?: number;
  id: string;
  storeId: string;
  userId: string;
  sale: SaleInput;
  status: "pending" | "failed";
  error: { code: string; message: string } | null;
};

/** IndexedDB on this device (spec 7.3): the catalog snapshot and the sales outbox. */
export const offlineDb = new Dexie("sari-pos") as Dexie & {
  catalogs: EntityTable<SavedCatalog, "storeId">;
  outbox: EntityTable<QueuedSale, "seq">;
};

offlineDb.version(1).stores({
  catalogs: "storeId",
  outbox: "++seq, &id, status",
});
