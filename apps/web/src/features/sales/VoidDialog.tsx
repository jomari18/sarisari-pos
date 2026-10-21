import { VoidInput, type SaleView } from "@sari/shared";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "../../api/client";
import { Field, inputClass } from "../../components/Field";

/**
 * The confirmation step of a void (spec 6, rule 7): owner only, once, with a reason of 3 to 120 characters.
 * It takes the sale dialog's place, so there is only ever one dialog open.
 */
export function VoidDialog({ sale, onCancel, onVoided }: { sale: SaleView; onCancel: () => void; onVoided: (sale: SaleView) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = VoidInput.safeParse({ reason });
    if (!parsed.success) return setError("Write a reason of 3 to 120 characters.");
    setError(null);
    setProblem(null);
    setBusy(true);
    try {
      onVoided(await api<SaleView>(`/sales/${sale.id}/void`, { method: "POST", json: parsed.data }));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Could not void the sale. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={confirm} noValidate className="mt-4 flex flex-col gap-4">
      <p className="text-muted">
        Voiding puts the stock back and takes any utang off the suki's balance. The sale stays in the records, marked as voided. This cannot be undone.
      </p>
      <Field label="Reason" error={error}>
        {(control) => <input {...control} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} autoComplete="off" placeholder="e.g. Wrong item rung up" className={inputClass} />}
      </Field>
      {problem && (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-12 rounded-control px-5 text-muted hover:text-text">
          Keep the sale
        </button>
        <button type="submit" disabled={busy} className="min-h-12 rounded-control bg-danger px-6 font-medium text-accent-ink transition-opacity disabled:opacity-60">
          Void sale
        </button>
      </div>
    </form>
  );
}
