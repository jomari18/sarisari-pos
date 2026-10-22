import { formatPeso, parsePesos, type CustomerView, type LedgerEntryView } from "@sari/shared";
import { useRef, useState, type FormEvent } from "react";
import { ApiError, api } from "../../api/client";
import { Field, inputClass } from "../../components/Field";
import { Notice } from "../../components/Notice";
import { NeedsInternet } from "../../offline/NeedsInternet";
import { useOnline } from "../../offline/status";
import { useSukiChanged } from "./queries";

type Method = "CASH" | "GCASH";
const METHODS: { value: Method; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "GCASH", label: "GCash" },
];

/**
 * Spec 6.8: cash or GCash, at most the balance. The payment id is made on the first try and kept for retries,
 * so a payment whose answer was lost is applied once (spec 6.2); changing the amount or method starts a new one.
 */
export function PaymentForm({ customer }: { customer: CustomerView }) {
  const sukiChanged = useSukiChanged();
  const online = useOnline();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("CASH");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A second click while the first request is still out must not send the payment again.
  const sending = useRef(false);

  const changed = () => {
    setPaymentId(null);
    setError(null);
  };

  async function record(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const centavos = parsePesos(amount);
    if (centavos === null || centavos < 1) return setError("Type the amount paid, like 50 or 120.50.");
    if (centavos > customer.balanceCentavos) return setError(`This is more than the utang balance of ${formatPeso(customer.balanceCentavos)}.`);
    const id = paymentId ?? crypto.randomUUID();
    setPaymentId(id);
    sending.current = true;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const result = await api<{ customer: CustomerView; entry: LedgerEntryView }>(`/customers/${customer.id}/payments`, {
        method: "POST",
        json: { id, amountCentavos: centavos, method },
      });
      void sukiChanged(result.customer, result.entry);
      setAmount("");
      setPaymentId(null);
      setNotice(`Payment recorded. Balance ${formatPeso(result.customer.balanceCentavos)}.`);
    } catch (err) {
      if (err instanceof ApiError && err.field === "amountCentavos") setError(err.message);
      else setProblem(err instanceof ApiError ? err.message : "Could not record the payment. Please try again.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="payment-title" className="flex flex-col gap-4 rounded-card bg-surface p-5">
      <h2 id="payment-title" className="text-lg font-medium">
        Take a payment
      </h2>
      {customer.balanceCentavos === 0 ? (
        <p className="text-muted">Nothing to pay right now.</p>
      ) : (
        <form onSubmit={record} noValidate className="flex flex-col gap-4">
          <Field label="Amount paid" error={error}>
            {(control) => (
              <input
                {...control}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  changed();
                }}
                inputMode="decimal"
                autoComplete="off"
                placeholder="₱0.00"
                className={inputClass}
              />
            )}
          </Field>
          <fieldset>
            <legend className="text-sm font-medium">Paid with</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {METHODS.map(({ value, label }) => (
                <label key={value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-transparent bg-raised px-4 has-checked:border-text">
                  <input
                    type="radio"
                    name="payment-method"
                    value={value}
                    checked={method === value}
                    onChange={() => {
                      setMethod(value);
                      changed();
                    }}
                    className="size-4 accent-accent"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {problem && (
            <p role="alert" className="text-danger">
              {problem}
            </p>
          )}
          {!online && <NeedsInternet />}
          <button type="submit" disabled={busy || !online} className="min-h-12 rounded-control bg-accent px-6 font-medium text-accent-ink transition-opacity disabled:opacity-60">
            Record payment
          </button>
        </form>
      )}
      <Notice text={notice} />
    </section>
  );
}
