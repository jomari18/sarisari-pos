import { formatPeso, parsePesos, type CustomerView } from "@sari/shared";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "../../api/client";
import { Field, inputClass } from "../../components/Field";
import { Notice } from "../../components/Notice";
import { pesoField } from "../../lib/format";
import { useSukiChanged } from "./queries";

/** The highest limit the API takes: ₱50,000. */
const MAX_LIMIT = 5_000_000;

/** Owner only (spec 7.4): how much utang this suki may carry. 0 means no utang. */
export function LimitForm({ customer }: { customer: CustomerView }) {
  const sukiChanged = useSukiChanged();
  const [limit, setLimit] = useState(() => pesoField(customer.creditLimitCentavos));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const centavos = parsePesos(limit);
    if (centavos === null || centavos > MAX_LIMIT) return setError(`Type a limit up to ${formatPeso(MAX_LIMIT)}, or 0 for no utang.`);
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const saved = await api<CustomerView>(`/customers/${customer.id}`, { method: "PATCH", json: { creditLimitCentavos: centavos } });
      void sukiChanged(saved);
      setLimit(pesoField(saved.creditLimitCentavos));
      setNotice(`Credit limit saved: ${formatPeso(saved.creditLimitCentavos)}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the limit. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4 rounded-card bg-surface p-5">
      <Field label="Credit limit" error={error} hint="0 means no utang. Utang sales stop at this amount.">
        {(control) => (
          <input
            {...control}
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              setError(null);
            }}
            inputMode="decimal"
            autoComplete="off"
            className={inputClass}
          />
        )}
      </Field>
      <button type="submit" disabled={busy} className="min-h-12 rounded-control bg-raised px-6 font-medium transition-opacity disabled:opacity-60">
        Save limit
      </button>
      <Notice text={notice} />
    </form>
  );
}
