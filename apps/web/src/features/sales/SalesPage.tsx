import { formatPeso, manilaDate, type PaymentMethod, type SaleView } from "@sari/shared";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { useSession } from "../../auth/session";
import { Field, inputClass } from "../../components/Field";
import { LoadProblem, Loading } from "../../components/LoadProblem";
import { manilaStamp } from "../../lib/format";
import { useSale, useSaleVoided, useSales, useStaff } from "../reports/queries";
import { FLAG_LABELS, SaleDetail } from "./SaleDetail";

const METHODS: Record<PaymentMethod, string> = { CASH: "Cash", GCASH: "GCash", UTANG: "Utang" };
const timeOf = (iso: string) => manilaStamp(iso).split(", ").at(-1);

function SaleRow({ sale, onOpen }: { sale: SaleView; onOpen: () => void }) {
  return (
    <li className="even:bg-raised/60">
      <button type="button" onClick={onOpen} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-4 text-left hover:bg-raised">
        <span className="min-w-0">
          <span className="block font-medium">{`Receipt No. ${sale.receiptNo}`}</span>
          <span className="block text-sm text-muted">{`${timeOf(sale.soldAt)} · ${sale.cashier.displayName}${sale.customer ? ` · ${sale.customer.name}` : ""}`}</span>
        </span>
        <span className="text-right">
          <span className={`block font-semibold ${sale.voidedAt ? "text-muted line-through" : ""}`}>{formatPeso(sale.totalCentavos)}</span>
          <span className="block text-xs text-muted">{METHODS[sale.method]}</span>
        </span>
        {(sale.voidedAt || sale.flags.length > 0) && (
          <span className="col-span-2 flex flex-wrap gap-2">
            {sale.voidedAt && <span className="rounded-full bg-raised px-2 py-0.5 text-xs text-danger">Voided</span>}
            {sale.flags.map((flag) => (
              <span key={flag} className="rounded-full bg-raised px-2 py-0.5 text-xs text-warning">
                {FLAG_LABELS[flag]}
              </span>
            ))}
          </span>
        )}
      </button>
    </li>
  );
}

/** Sales (owner): one Manila day at a time, for every cashier or one; a sale opens with its receipt (spec 8.4). */
export function SalesPage() {
  const session = useSession();
  const today = manilaDate(new Date());
  const [date, setDate] = useState(today);
  const [cashierId, setCashierId] = useState("");
  const [params, setParams] = useSearchParams();
  const sales = useSales(date, cashierId);
  const staff = useStaff();
  const saleVoided = useSaleVoided();

  // `?sale=` opens a sale, from this list or from a link in a ledger or the stock history.
  const openId = params.get("sale");
  const listed = sales.data?.find((sale) => sale.id === openId);
  const fetched = useSale(openId, !listed);
  const open = listed ?? fetched.data ?? null;
  const show = (id: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set("sale", id);
        else next.delete("sale");
        return next;
      },
      // The sale opens over the list, so the list stays where it was.
      { replace: true, preventScrollReset: true },
    );

  const counted = sales.data?.filter((sale) => !sale.voidedAt) ?? [];
  const total = counted.reduce((sum, sale) => sum + sale.totalCentavos, 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 rounded-card bg-surface p-5 sm:grid-cols-2 lg:grid-cols-[14rem_16rem_1fr] lg:items-end">
        <Field label="Date">
          {(control) => <input {...control} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} className={inputClass} />}
        </Field>
        <Field label="Cashier">
          {(control) => (
            <select {...control} value={cashierId} onChange={(e) => setCashierId(e.target.value)} className={inputClass}>
              <option value="">All cashiers</option>
              {session && <option value={session.user.id}>{`${session.user.displayName} (you)`}</option>}
              {(staff.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </select>
          )}
        </Field>
        <p className="text-lg font-medium lg:justify-self-end">{sales.data && `${counted.length} ${counted.length === 1 ? "sale" : "sales"} · ${formatPeso(total)}`}</p>
      </div>

      {sales.isPending ? (
        <Loading what="the sales" />
      ) : sales.isError ? (
        <LoadProblem error={sales.error} retry={sales.refetch} />
      ) : sales.data.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-muted">No sales on this day.</p>
      ) : (
        <ul aria-label="Sales" className="overflow-hidden rounded-card bg-surface">
          {sales.data.map((sale) => (
            <SaleRow key={sale.id} sale={sale} onOpen={() => show(sale.id)} />
          ))}
        </ul>
      )}

      {open && <SaleDetail sale={open} onClose={() => show(null)} onVoided={(voided) => void saleVoided(voided)} />}
    </div>
  );
}
