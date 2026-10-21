import { formatPeso, parsePesos, type CatalogCustomer, type PaymentInput, type SaleView } from "@sari/shared";
import { useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { Dialog } from "../../components/Dialog";
import { cartTotal, type CartLine } from "./cart";
import { buildSaleInput, type SaleSubmitter } from "./submitSale";

type Method = PaymentInput["method"];

const METHODS: { value: Method; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "GCASH", label: "GCash" },
  { value: "UTANG", label: "Utang" },
];
/** Spec 10: the bills people hand over. */
const QUICK_CASH = [2000, 5000, 10000, 50000, 100000];
const LIMIT_MESSAGE = "This suki has reached their utang limit. Ask for cash or ask the owner to raise the limit.";

const pesoLabel = (centavos: number) => formatPeso(centavos).replace(/\.00$/, "");
const field = "h-12 w-full rounded-control bg-raised px-4 text-text placeholder:text-muted";

type Props = {
  /** Made when payment first opens and kept until the sale succeeds or the cart changes (spec 6.2). */
  saleId: string;
  lines: CartLine[];
  customers: CatalogCustomer[];
  submit: SaleSubmitter;
  onDone: (result: { sale: SaleView; queued: boolean }) => void;
  onClose: () => void;
  now?: () => Date;
};

/** Cash with sukli, GCash with an optional reference, or utang within the suki's limit (spec 6.4, 10). */
export function PaymentDialog({ saleId, lines, customers, submit, onDone, onClose, now = () => new Date() }: Props) {
  const total = cartTotal(lines);
  const ids = { cash: useId(), gcash: useId(), suki: useId() };
  const [method, setMethod] = useState<Method>("CASH");
  const [cash, setCash] = useState("");
  const [gcashRef, setGcashRef] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A second click while the first request is still out must not send the sale again.
  const sending = useRef(false);

  const tendered = parsePesos(cash);
  const customer = customers.find((c) => c.id === customerId) ?? null;
  const overLimit = customer !== null && customer.balanceCentavos + total > customer.creditLimitCentavos;
  const ready = method === "CASH" ? tendered !== null && tendered >= total : method === "GCASH" || (customer !== null && !overLimit);

  function payment(): PaymentInput {
    if (method === "CASH") return { method, tenderedCentavos: tendered ?? 0 };
    if (method === "GCASH") return gcashRef.trim() ? { method, gcashRef: gcashRef.trim() } : { method };
    return { method, customerId };
  }

  async function completeSale(event?: FormEvent) {
    event?.preventDefault();
    if (!ready || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      onDone(await submit(buildSaleInput(saleId, lines, payment(), now())));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the sale. Please try again.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog title="Payment" onClose={onClose} wide>
      <form onSubmit={completeSale} className="mt-4 flex flex-col gap-5">
        <div className="flex items-baseline justify-between rounded-card bg-raised px-5 py-4">
          <span className="text-muted">Total</span>
          <span className="text-3xl font-semibold">{formatPeso(total)}</span>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Payment method</legend>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ value, label }) => (
              <label
                key={value}
                className={`flex min-h-12 cursor-pointer items-center justify-center rounded-control text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                  method === value ? "bg-accent text-accent-ink" : "bg-raised text-text"
                }`}
              >
                <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {method === "CASH" && (
          <div className="flex flex-col gap-3">
            <label htmlFor={ids.cash} className="text-sm font-medium">
              Cash received
            </label>
            <input id={ids.cash} inputMode="decimal" autoComplete="off" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="₱0.00" className={field} />
            <div className="flex flex-wrap gap-2">
              {QUICK_CASH.map((amount) => (
                <button key={amount} type="button" onClick={() => setCash((amount / 100).toFixed(2))} className="min-h-11 rounded-control bg-raised px-4 text-sm">
                  {pesoLabel(amount)}
                </button>
              ))}
              <button type="button" onClick={() => setCash((total / 100).toFixed(2))} className="min-h-11 rounded-control bg-raised px-4 text-sm">
                Exact
              </button>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted">Sukli (change)</span>
              <span data-testid="sukli" aria-live="polite" className="text-3xl font-semibold text-success">
                {tendered !== null && tendered >= total ? formatPeso(tendered - total) : "—"}
              </span>
            </div>
            {tendered !== null && tendered < total && <p className="text-sm text-warning">{formatPeso(total - tendered)} short</p>}
          </div>
        )}

        {method === "GCASH" && (
          <div className="flex flex-col gap-3">
            <label htmlFor={ids.gcash} className="text-sm font-medium">
              GCash reference (optional)
            </label>
            <input id={ids.gcash} maxLength={40} autoComplete="off" value={gcashRef} onChange={(e) => setGcashRef(e.target.value)} placeholder="13-digit reference" className={field} />
          </div>
        )}

        {method === "UTANG" && (
          <div className="flex flex-col gap-3">
            <label htmlFor={ids.suki} className="text-sm font-medium">
              Suki
            </label>
            <select id={ids.suki} value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={field}>
              <option value="">Choose a suki</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {customer && (
              <p className="text-sm text-muted">
                Balance {formatPeso(customer.balanceCentavos)} · Limit {formatPeso(customer.creditLimitCentavos)}
              </p>
            )}
            {overLimit && <p className="rounded-control bg-raised px-4 py-3 text-sm text-warning">{LIMIT_MESSAGE}</p>}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-control bg-raised px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-12 rounded-control px-5 text-muted hover:text-text">
            Cancel
          </button>
          <button type="submit" disabled={!ready || busy} className="min-h-12 rounded-control bg-accent px-6 font-medium text-accent-ink transition-opacity disabled:opacity-50">
            {busy ? "Recording…" : "Complete sale"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
