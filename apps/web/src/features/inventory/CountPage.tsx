import type { ProductView } from "@sari/shared";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "../../api/client";
import { Field, inputClass } from "../../components/Field";
import { LoadProblem, Loading } from "../../components/LoadProblem";
import { BackToProducts, Notice, ProductSelect, StockNow, useChosenProduct } from "./parts";
import { useProductChanged, wholeNumber } from "./queries";

type Mode = "count" | "remove";
type Reason = "SPOILAGE" | "EXPIRED";

const MODES: { value: Mode; label: string }[] = [
  { value: "count", label: "Shelf count" },
  { value: "remove", label: "Spoiled or expired" },
];
const REASON_WORD: Record<Reason, string> = { SPOILAGE: "spoiled", EXPIRED: "expired" };

/** A blank field is not a number here: zero counted is a real answer, so it has to be typed. */
const typedNumber = (text: string) => (text.trim() === "" ? Number.NaN : wholeNumber(text));

const difference = (diff: number) => (diff === 0 ? "no difference" : diff < 0 ? `${-diff} fewer` : `${diff} more`);

/** Spec 6.9: a count records the difference from the records; spoiled and expired pieces come off with a reason. */
function CountForm({ product }: { product: ProductView }) {
  const productChanged = useProductChanged();
  const [mode, setMode] = useState<Mode>("count");
  const [counted, setCounted] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<Reason>("SPOILAGE");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const countedNumber = typedNumber(counted);
  const removed = typedNumber(quantity);
  const preview =
    mode === "count"
      ? Number.isFinite(countedNumber) && `Recorded ${product.stock}, counted ${countedNumber}: ${difference(countedNumber - product.stock)}`
      : removed >= 1 && `${product.stock} − ${removed} = ${product.stock - removed} in stock`;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (mode === "count" && !(countedNumber >= 0 && countedNumber <= 99_999)) return setError("Type how many are on the shelf, from 0 to 99,999.");
    if (mode === "remove" && !(removed >= 1 && removed <= 99_999)) return setError("Type how many to remove, from 1 to 99,999.");
    setError(null);
    setBusy(true);
    setProblem(null);
    setNotice(null);
    const withNote = note.trim() ? { note: note.trim() } : {};
    try {
      const saved = await api<ProductView>("/stock/adjust", {
        method: "POST",
        json: mode === "count" ? { productId: product.id, counted: countedNumber, ...withNote } : { productId: product.id, quantity: removed, reason, ...withNote },
      });
      void productChanged(saved);
      setNotice(mode === "count" ? `Count saved: ${saved.name} now has ${saved.stock}.` : `Removed ${removed} ${REASON_WORD[reason]}: ${saved.name} now has ${saved.stock}.`);
      setCounted("");
      setQuantity("");
      setNote("");
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-5">
      <StockNow product={product} />
      <fieldset>
        <legend className="text-sm font-medium">What are you recording?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {MODES.map(({ value, label }) => (
            <label key={value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-transparent bg-raised px-4 has-checked:border-text">
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  setError(null);
                }}
                className="size-4 accent-accent"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "count" ? (
        <Field label="Counted on the shelf" error={error}>
          {(control) => <input {...control} value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="numeric" autoComplete="off" className={inputClass} />}
        </Field>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Pieces to remove" error={error}>
            {(control) => <input {...control} value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" autoComplete="off" className={inputClass} />}
          </Field>
          <Field label="Reason">
            {(control) => (
              <select {...control} value={reason} onChange={(e) => setReason(e.target.value as Reason)} className={inputClass}>
                <option value="SPOILAGE">Spoiled</option>
                <option value="EXPIRED">Expired</option>
              </select>
            )}
          </Field>
        </div>
      )}
      <Field label="Note (optional)">
        {(control) => <input {...control} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} autoComplete="off" className={inputClass} />}
      </Field>

      {preview && (
        <p aria-live="polite" className="rounded-control bg-raised px-4 py-3 text-lg font-medium">
          {preview}
        </p>
      )}
      <Notice text={notice} />
      {problem && (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      )}
      <button type="submit" disabled={busy} className="min-h-12 self-end rounded-control bg-accent px-6 font-medium text-accent-ink transition-opacity disabled:opacity-60">
        {mode === "count" ? "Save count" : "Remove from stock"}
      </button>
    </form>
  );
}

/** `/app/stock/count?productId=…`: a shelf count, or spoiled and expired pieces. */
export function CountPage() {
  const { products, product, choose } = useChosenProduct();
  if (products.isPending) return <Loading what="the products" />;
  if (products.isError) return <LoadProblem error={products.error} retry={products.refetch} />;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <BackToProducts />
      <section aria-label="Stock count" className="flex flex-col gap-5 rounded-card bg-surface p-5 sm:p-6">
        <ProductSelect products={products.data} product={product} onChoose={choose} />
        {product ? <CountForm key={product.id} product={product} /> : <p className="text-muted">Choose the product you counted.</p>}
      </section>
    </div>
  );
}
