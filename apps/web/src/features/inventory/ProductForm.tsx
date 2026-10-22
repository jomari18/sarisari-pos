import { ProductInput, ProductPatch, parsePesos, type CategoryView, type ProductView } from "@sari/shared";
import { useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { ApiError, api } from "../../api/client";
import { Field, inputClass } from "../../components/Field";
import { LoadProblem, Loading } from "../../components/LoadProblem";
import { Notice } from "../../components/Notice";
import { NeedsInternet } from "../../offline/NeedsInternet";
import { useOnline } from "../../offline/status";
import { pesoField, wholeNumber } from "../../lib/format";
import { NewCategory } from "./CategoriesPage";
import { MovementsPanel } from "./MovementsPanel";
import { BackToProducts } from "./parts";
import { byName, useCategories, useProduct, useProductChanged } from "./queries";

type Values = { name: string; brand: string; barcode: string; categoryId: string; unit: string; price: string; cost: string; reorderLevel: string; packSize: string };
type FieldName = keyof Values;
type Errors = Partial<Record<FieldName, string>>;

const BLANK: Values = { name: "", brand: "", barcode: "", categoryId: "", unit: "", price: "", cost: "", reorderLevel: "0", packSize: "1" };

const valuesOf = (p: ProductView): Values => ({
  name: p.name,
  brand: p.brand ?? "",
  barcode: p.barcode ?? "",
  categoryId: p.categoryId,
  unit: p.unit,
  price: pesoField(p.priceCentavos),
  cost: pesoField(p.costCentavos ?? 0),
  reorderLevel: String(p.reorderLevel),
  packSize: String(p.packSize),
});

/** The form field an API or schema field belongs to. */
const FIELD_OF: Record<string, FieldName> = {
  name: "name",
  brand: "brand",
  barcode: "barcode",
  categoryId: "categoryId",
  unit: "unit",
  priceCentavos: "price",
  costCentavos: "cost",
  reorderLevel: "reorderLevel",
  packSize: "packSize",
};

/** Plain words for the schema's checks; the API's own messages are shown as they come. */
const RULES: Record<FieldName, string> = {
  name: "Type the product name (up to 80 characters).",
  brand: "The brand is up to 40 characters.",
  barcode: "A barcode is 8 to 14 digits.",
  categoryId: "Choose a category.",
  unit: "Type the unit, like pc, sachet or bottle.",
  price: "Type the price, like 15 or 7.50.",
  cost: "Type the cost of one piece, like 12 or 6.25.",
  reorderLevel: "Use a whole number from 0 to 9,999.",
  packSize: "Use a whole number from 1 to 1,000.",
};

const ORDER = Object.keys(BLANK) as FieldName[];
const UNITS = ["pc", "pack", "sachet", "bottle", "can", "box", "kg", "g", "L", "ml"];
const STALE = "This product was changed on another device. Reload to see the latest.";

/** What the schema checks: blanks become null, amounts become centavos, anything unreadable becomes NaN and fails. */
const candidate = (v: Values) => ({
  name: v.name,
  brand: v.brand.trim() || null,
  barcode: v.barcode.trim() || null,
  categoryId: v.categoryId,
  unit: v.unit,
  priceCentavos: parsePesos(v.price) ?? Number.NaN,
  costCentavos: parsePesos(v.cost) ?? Number.NaN,
  reorderLevel: v.reorderLevel.trim() === "" ? Number.NaN : wholeNumber(v.reorderLevel),
  packSize: v.packSize.trim() === "" ? Number.NaN : wholeNumber(v.packSize),
});

type Props = {
  /** Present when editing; its `updatedAt` goes with the save so a stale edit is refused (spec 8.3). */
  product?: ProductView;
  categories: CategoryView[];
  onSaved: (product: ProductView) => void;
  onReload?: () => void;
  /** What the last action did ("Saved …"); gone once the next save starts. */
  notice?: string | null;
  /** Fields filled in for a new product, e.g. from a custom item in "Needs review". */
  prefill?: Partial<Values>;
};

/** Add or edit a product (reference "Add Inventory"): checked with the shared schemas before it is sent. */
export function ProductForm({ product, categories, onSaved, onReload, notice: lastNotice = null, prefill = {} }: Props) {
  const [values, setValues] = useState<Values>(() => (product ? valuesOf(product) : { ...BLANK, ...prefill }));
  const [notice, setNotice] = useState(lastNotice);
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [busy, setBusy] = useState(false);
  const online = useOnline();
  const form = useRef<HTMLFormElement>(null);

  const set = (name: FieldName, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  };
  const text = (name: FieldName) => ({ value: values[name], onChange: (e: { target: { value: string } }) => set(name, e.target.value) });

  /** Shows the errors and moves focus to the first field that has one. */
  function show(found: Errors) {
    setErrors(found);
    const first = ORDER.find((name) => found[name]);
    if (first) requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setNotice(null);
    const parsed = product ? ProductPatch.safeParse({ ...candidate(values), expectedUpdatedAt: product.updatedAt }) : ProductInput.safeParse(candidate(values));
    if (!parsed.success) {
      const found: Errors = {};
      for (const issue of parsed.error.issues) {
        const name = FIELD_OF[String(issue.path[0])];
        if (name) found[name] ??= RULES[name];
      }
      return show(found);
    }
    setBusy(true);
    setProblem(null);
    try {
      const saved = product
        ? await api<ProductView>(`/products/${product.id}`, { method: "PATCH", json: parsed.data })
        : await api<ProductView>("/products", { method: "POST", json: parsed.data });
      onSaved(saved);
    } catch (err) {
      const name = err instanceof ApiError && err.field ? FIELD_OF[err.field] : undefined;
      if (err instanceof ApiError && err.code === "stale_edit") setStale(true);
      else if (err instanceof ApiError && name) show({ [name]: err.message });
      else setProblem(err instanceof ApiError ? err.message : "Could not save the product. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={save} noValidate className="flex flex-col gap-5 rounded-card bg-surface p-5 sm:p-6">
      <Notice text={notice} />
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Name" error={errors.name}>
          {(control) => <input {...control} name="name" {...text("name")} maxLength={80} autoComplete="off" placeholder="e.g. Kape 3-in-1" className={inputClass} />}
        </Field>
        <Field label="Brand" error={errors.brand} hint="Optional">
          {(control) => <input {...control} name="brand" {...text("brand")} maxLength={40} autoComplete="off" className={inputClass} />}
        </Field>
        <Field label="Barcode" error={errors.barcode} hint="Optional. The digits under the bars.">
          {(control) => <input {...control} name="barcode" {...text("barcode")} inputMode="numeric" maxLength={14} autoComplete="off" className={inputClass} />}
        </Field>
        <div className="flex flex-col gap-2">
          <Field label="Category" error={errors.categoryId}>
            {(control) => (
              <select {...control} name="categoryId" {...text("categoryId")} className={inputClass}>
                <option value="">Choose a category</option>
                {byName(categories).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.archived ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {addingCategory ? (
            <div className="rounded-control border border-raised p-3">
              <NewCategory
                onAdded={(category) => {
                  set("categoryId", category.id);
                  setAddingCategory(false);
                }}
                onCancel={() => setAddingCategory(false)}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setAddingCategory(true)} className="self-start text-sm text-accent underline underline-offset-2">
              New category
            </button>
          )}
        </div>
        <Field label="Unit" error={errors.unit} hint="How it is sold: pc, sachet, bottle…">
          {(control) => (
            <>
              <input {...control} name="unit" {...text("unit")} list="product-units" maxLength={12} autoComplete="off" placeholder="pc" className={inputClass} />
              <datalist id="product-units">
                {UNITS.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Pack size" error={errors.packSize} hint="Pieces in one box, for restocking by the box.">
          {(control) => <input {...control} name="packSize" {...text("packSize")} inputMode="numeric" className={inputClass} />}
        </Field>
        <Field label="Price" error={errors.price}>
          {(control) => <input {...control} name="price" {...text("price")} inputMode="decimal" autoComplete="off" placeholder="₱0.00" className={inputClass} />}
        </Field>
        <Field label="Cost" error={errors.cost} hint="What one piece costs you.">
          {(control) => <input {...control} name="cost" {...text("cost")} inputMode="decimal" autoComplete="off" placeholder="₱0.00" className={inputClass} />}
        </Field>
        <Field label="Reorder level" error={errors.reorderLevel} hint="Counts as low stock at or below this number.">
          {(control) => <input {...control} name="reorderLevel" {...text("reorderLevel")} inputMode="numeric" className={inputClass} />}
        </Field>
      </div>

      {stale && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-raised px-4 py-3">
          <p className="text-warning">{STALE}</p>
          <button type="button" onClick={onReload} className="min-h-11 rounded-control bg-surface px-4 font-medium">
            Reload
          </button>
        </div>
      )}
      {problem && (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      )}

      <div className="mt-1 flex items-center justify-end gap-4">
        <Link to="/app/products" className="min-h-11 content-center px-2 text-muted underline underline-offset-2 hover:text-text">
          Cancel
        </Link>
        {!online && <NeedsInternet />}
        <button type="submit" disabled={busy || !online} className="min-h-12 rounded-control bg-accent px-6 font-medium text-accent-ink transition-opacity disabled:opacity-60">
          Save product
        </button>
      </div>
    </form>
  );
}

/** `/app/products/new`. A new product starts with no stock; restocking puts it on the shelf. */
/**
 * `?name=…&price=…` fill in a new product, so a custom item from "Needs review" becomes a product in one step
 * (spec 6.6); `?barcode=…` comes from a scanned code that matched no product (spec 10).
 */
const PREFILLED = ["name", "price", "barcode"] as const;

export function NewProductPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const categories = useCategories();
  const prefill = Object.fromEntries(PREFILLED.flatMap((field) => (params.get(field) ? [[field, params.get(field)!]] : [])));
  const productChanged = useProductChanged();
  if (categories.isPending) return <Loading what="the categories" />;
  if (categories.isError) return <LoadProblem error={categories.error} retry={categories.refetch} />;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackToProducts />
      <ProductForm
        prefill={prefill}
        categories={categories.data.filter((c) => !c.archived)}
        onSaved={(saved) => {
          void productChanged(saved);
          navigate(`/app/products/${saved.id}`, { state: { notice: `Added ${saved.name}. Restock it to put it in stock.` } });
        }}
      />
    </div>
  );
}

function EditProduct({ id }: { id: string }) {
  const location = useLocation();
  const product = useProduct(id);
  const categories = useCategories();
  const productChanged = useProductChanged();
  const [notice, setNotice] = useState<string | null>(() => (location.state as { notice?: string } | null)?.notice ?? null);
  // A reload that brings back the same copy still has to reset the form.
  const [version, setVersion] = useState(0);

  async function reload() {
    await product.refetch();
    setNotice(null);
    setVersion((v) => v + 1);
  }

  if (product.isPending || categories.isPending) return <Loading what="the product" />;
  if (product.isError) return <LoadProblem error={product.error} retry={product.refetch} />;
  if (categories.isError) return <LoadProblem error={categories.error} retry={categories.refetch} />;
  const current = product.data;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackToProducts />
      {/* A new copy of the product (saved here, or reloaded) starts the form again from it, with the latest notice. */}
      <ProductForm
        key={`${current.updatedAt}:${version}`}
        product={current}
        notice={notice}
        categories={categories.data.filter((c) => !c.archived || c.id === current.categoryId)}
        onSaved={(saved) => {
          setNotice(`Saved ${saved.name}.`);
          void productChanged(saved);
        }}
        onReload={() => void reload()}
      />
      <MovementsPanel product={current} />
    </div>
  );
}

/** `/app/products/:id`; keyed by the id so moving to another product starts fresh. */
export function EditProductPage() {
  const { id = "" } = useParams();
  return <EditProduct key={id} id={id} />;
}
