import type { HourlyBucket, ProductReport, ReportRange, SaleView, ShiftReport, StaffView, SummaryReport, UtangReport } from "@sari/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiError } from "../../api/client";
import { CATALOG_KEY } from "../catalog/useCatalog";

// Owner reads for the dashboard, reports, review, sales and staff screens (spec 8.6). All of them start with
// "reports", "sales", "review" or "staff", so a change can mark them stale in one call.

export const useSummary = (range: ReportRange) =>
  useQuery<SummaryReport, ApiError>({ queryKey: ["reports", "summary", range], queryFn: () => api(`/reports/summary?range=${range}`), placeholderData: keepPreviousData });

export const useProductReport = (range: ReportRange) =>
  useQuery<ProductReport, ApiError>({ queryKey: ["reports", "products", range], queryFn: () => api(`/reports/products?range=${range}`), placeholderData: keepPreviousData });

export const useHourly = (date: string) =>
  useQuery<HourlyBucket[], ApiError>({ queryKey: ["reports", "hourly", date], queryFn: () => api(`/reports/hourly?date=${date}`), placeholderData: keepPreviousData });

export const useUtangReport = () => useQuery<UtangReport, ApiError>({ queryKey: ["reports", "utang"], queryFn: () => api("/reports/utang") });

export const useMyShift = () => useQuery<ShiftReport, ApiError>({ queryKey: ["reports", "my-shift"], queryFn: () => api("/reports/my-shift") });

export const useReview = () => useQuery<SaleView[], ApiError>({ queryKey: ["review"], queryFn: () => api("/review") });

export const useStaff = () => useQuery<StaffView[], ApiError>({ queryKey: ["staff"], queryFn: () => api("/staff") });

/** A day's sales, all cashiers or one. */
export const useSales = (date: string, cashierId: string) =>
  useQuery<SaleView[], ApiError>({
    queryKey: ["sales", date, cashierId],
    queryFn: () => api(`/sales?${new URLSearchParams({ date, ...(cashierId ? { cashierId } : {}) })}`),
    placeholderData: keepPreviousData,
  });

export const useSale = (id: string | null, enabled: boolean) =>
  useQuery<SaleView, ApiError>({ queryKey: ["sale", id], queryFn: () => api(`/sales/${id}`), enabled: Boolean(id) && enabled });

/**
 * After a void the API's copy of the sale replaces the cached one wherever it is listed; it leaves "Needs
 * review"; and everything a void changes (stock, utang, totals) loads again (spec 6, rule 7).
 */
export function useSaleVoided() {
  const client = useQueryClient();
  return (voided: SaleView) => {
    client.setQueriesData<SaleView[]>({ queryKey: ["sales"] }, (list) => list?.map((sale) => (sale.id === voided.id ? voided : sale)));
    client.setQueryData(["sale", voided.id], voided);
    client.setQueryData<SaleView[]>(["review"], (list) => list?.filter((sale) => sale.id !== voided.id));
    return Promise.all(
      ["reports", "products", "product", "movements", "ledger", "customers", CATALOG_KEY[0]].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
  };
}
