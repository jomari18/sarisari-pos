import { formatPeso, parsePesos, type CustomerView, type LedgerEntryView } from "@sari/shared";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "../../api/client";
import { Field, inputClass } from "../../components/Field";
import { Notice } from "../../components/Notice";
import { useSukiChanged } from "./queries";

type Direction = "add" | "lower";
const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "add", label: "Add to the utang" },
  { value: "lower", label: "Lower the utang" },
];
type Errors = { amount?: string; note?: string };

/** Owner only (spec 8.5): fix the balance by hand, always with a reason, never below zero. */
export function AdjustmentForm({ customer }: { customer: CustomerView }) {
  const sukiChanged = useSukiChanged();
  const [direction, setDirection] = useState<Direction>("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const centavos = parsePesos(amount);
    const found: Errors = {};
    if (centavos === null || centavos < 1 || centavos > 5_000_000) found.amount = "Type an amount, like 20 or 5.50.";
    else if (direction === "lower" && centavos > customer.balanceCentavos) found.amount = `The utang is only ${formatPeso(customer.balanceCentavos)}.`;
    if (!note.trim()) found.note = "Type the reason for the change.";
    setErrors(found);
    if (found.amount || found.note || centavos === null) return;

    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const result = await api<{ customer: CustomerView; entry: LedgerEntryView }>(`/customers/${customer.id}/adjustments`, {
        method: "POST",
        json: { amountCentavos: direction === "lower" ? -centavos : centavos, note: note.trim() },
      });
      void sukiChanged(result.customer, result.entry);
      setAmount("");
      setNote("");
      setNotice(`Adjustment saved. Balance ${formatPeso(result.customer.balanceCentavos)}.`);
    } catch (err) {
      if (err instanceof ApiError && err.field === "amountCentavos") setErrors({ amount: err.message });
      else setProblem(err instanceof ApiError ? err.message : "Could not save the adjustment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate aria-labelledby="adjust-title" className="flex flex-col gap-4 rounded-card bg-surface p-5">
      <h2 id="adjust-title" className="text-lg font-medium">
        Adjust the balance
      </h2>
      <fieldset>
        <legend className="sr-only">Direction</legend>
        <div className="grid grid-cols-2 gap-2">
          {DIRECTIONS.map(({ value, label }) => (
            <label key={value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-transparent bg-raised px-4 text-sm has-checked:border-text">
              <input type="radio" name="adjust-direction" value={value} checked={direction === value} onChange={() => setDirection(value)} className="size-4 shrink-0 accent-accent" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Adjustment amount" error={errors.amount}>
        {(control) => <input {...control} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="₱0.00" className={inputClass} />}
      </Field>
      <Field label="Reason" error={errors.note}>
        {(control) => <input {...control} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} autoComplete="off" placeholder="e.g. Returned bottles" className={inputClass} />}
      </Field>
      {problem && (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      )}
      <button type="submit" disabled={busy} className="min-h-12 rounded-control bg-raised px-6 font-medium transition-opacity disabled:opacity-60">
        Save adjustment
      </button>
      <Notice text={notice} />
    </form>
  );
}
