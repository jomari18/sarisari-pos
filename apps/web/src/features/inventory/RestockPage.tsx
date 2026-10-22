import { parsePesos, type ProductView } from "@sari/shared";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "../../api/client";
import { Field, inputClass } from "../../components/Field";
import { LoadProblem, Loading } from "../../components/LoadProblem";
import { Notice } from "../../components/Notice";
import { NeedsInternet } from "../../offline/NeedsInternet";
import { useOnline } from "../../offline/status";
import { pesoField, wholeNumber } from "../../lib/format";
import { BackToProducts, ProductSelect, StockNow, useChosenProduct } from "./parts";
import { useProductChanged } from "./queries";

type Errors = { boxes?: string; pieces?: string; cost?: string };

/** Spec 6.9: boxes × pack size plus loose pieces; the cost per piece becomes the product's cost. */
function RestockForm({ product }: { product: ProductView }) {
  const productChanged = useProductChanged();
  const online = useOnline();
  const [boxes, setBoxes] = useState("");
  const [pieces, setPieces] = useState("");
  const [cost, setCost] = useState(() => pesoField(product.costCentavos ?? 0));
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const boxCount = wholeNumber(boxes);
  const pieceCount = wholeNumber(pieces);
  const received = boxCount * product.packSize + pieceCount;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found: Errors = {};
    if (Number.isNaN(boxCount) || boxCount > 999) found.boxes = "Use a whole number of boxes, up to 999.";
    if (Number.isNaN(pieceCount) || pieceCount > 99_999) found.pieces = "Use a whole number of pieces, up to 99,999.";
    if (!found.boxes && !found.pieces && received === 0) found.pieces = "Enter the boxes or the pieces received.";
    const unitCost = parsePesos(cost);
    if (unitCost === null || unitCost > 10_000_000) found.cost = "Type the cost of one piece, like 8.50.";
    setErrors(found);
    if (Object.keys(found).length > 0 || unitCost === null) return;

    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const saved = await api<ProductView>("/stock/restock", {
        method: "POST",
        json: { productId: product.id, ...(boxCount > 0 ? { boxes: boxCount } : {}), ...(pieceCount > 0 ? { pieces: pieceCount } : {}), unitCostCentavos: unitCost },
      });
      void productChanged(saved);
      setBoxes("");
      setPieces("");
      setCost(pesoField(saved.costCentavos ?? unitCost));
      setNotice(`Restocked: ${saved.name} now has ${saved.stock}.`);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Could not save the restock. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-5">
      <StockNow product={product} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Boxes" error={errors.boxes} hint={`1 box = ${product.packSize} ${product.unit}`}>
          {(control) => <input {...control} value={boxes} onChange={(e) => setBoxes(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="0" className={inputClass} />}
        </Field>
        <Field label="Loose pieces" error={errors.pieces} hint="Pieces not in a full box.">
          {(control) => <input {...control} value={pieces} onChange={(e) => setPieces(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="0" className={inputClass} />}
        </Field>
        <Field label="Cost per piece" error={errors.cost} hint="Becomes the product's cost.">
          {(control) => <input {...control} value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" autoComplete="off" className={inputClass} />}
        </Field>
      </div>
      {received > 0 && (
        <p aria-live="polite" className="rounded-control bg-raised px-4 py-3 text-lg font-medium">
          {`${product.stock} + ${received} = ${product.stock + received} in stock`}
        </p>
      )}
      <Notice text={notice} />
      {problem && (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      )}
      {!online && <NeedsInternet />}
      <button type="submit" disabled={busy || !online} className="min-h-12 self-end rounded-control bg-accent px-6 font-medium text-accent-ink transition-opacity disabled:opacity-60">
        Save restock
      </button>
    </form>
  );
}

/** `/app/stock/restock?productId=…`: when a delivery arrives. */
export function RestockPage() {
  const { products, product, choose } = useChosenProduct();
  if (products.isPending) return <Loading what="the products" />;
  if (products.isError) return <LoadProblem error={products.error} retry={products.refetch} />;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <BackToProducts />
      <section aria-label="Restock" className="flex flex-col gap-5 rounded-card bg-surface p-5 sm:p-6">
        <ProductSelect products={products.data} product={product} onChoose={choose} />
        {product ? <RestockForm key={product.id} product={product} /> : <p className="text-muted">Choose the product that arrived.</p>}
      </section>
    </div>
  );
}
