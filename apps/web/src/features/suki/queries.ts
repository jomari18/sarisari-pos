import type { CustomerLedger, CustomerView, LedgerEntryView } from "@sari/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiError } from "../../api/client";
import { CATALOG_KEY } from "../catalog/useCatalog";

/** Suki by name (spec 8.5); the API searches, ignoring accents. The last list stays on screen while a search loads. */
export const useCustomers = (search: string) =>
  useQuery<CustomerView[], ApiError>({
    queryKey: ["customers", search],
    queryFn: () => api<CustomerView[]>(search ? `/customers?${new URLSearchParams({ search })}` : "/customers"),
    placeholderData: keepPreviousData,
  });

export const useLedger = (id: string) => useQuery<CustomerLedger, ApiError>({ queryKey: ["ledger", id], queryFn: () => api<CustomerLedger>(`/customers/${id}/ledger`) });

/**
 * After a change the API answered: the suki, and the ledger line it wrote, go straight into the cached ledger;
 * the lists and the POS catalog (balances and limits for utang sales) load again.
 */
export function useSukiChanged() {
  const client = useQueryClient();
  return (customer: CustomerView, entry?: LedgerEntryView) => {
    client.setQueryData<CustomerLedger>(["ledger", customer.id], (ledger) =>
      ledger && {
        customer,
        // A retried payment can come back as a duplicate of a line already shown.
        entries: entry && !ledger.entries.some((e) => e.id === entry.id) ? [...ledger.entries, entry] : ledger.entries,
      },
    );
    return Promise.all([client.invalidateQueries({ queryKey: ["customers"] }), client.invalidateQueries({ queryKey: CATALOG_KEY })]);
  };
}

/** "Oldest unpaid: 10 days" (spec 6.8 aging), or null when nothing is owed. */
export function agingText(days: number | null): string | null {
  if (days === null) return null;
  return `Oldest unpaid: ${days === 0 ? "today" : `${days} ${days === 1 ? "day" : "days"}`}`;
}

/** The aging buckets: 0–7 days quiet, 8–30 a warning, 31+ overdue. */
export const agingTone = (days: number | null) => (days === null || days <= 7 ? "text-muted" : days <= 30 ? "text-warning" : "text-danger");

/** Phones are checked without the spaces and dashes people type ("0917 123 4567"). */
export const phoneDigits = (text: string) => text.replace(/[\s-]/g, "");
