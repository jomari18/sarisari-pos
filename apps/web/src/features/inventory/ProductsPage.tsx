import { formatPeso, type CategoryView, type ProductView } from "@sari/shared";
import { Archive, ArchiveRestore, PackagePlus, Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { ApiError, api } from "../../api/client";
import { Field, inputClass } from "../../components/Field";
import { LoadProblem, Loading } from "../../components/LoadProblem";
import { RestockListButton, type RestockListResult } from "./RestockListButton";
import { ALL_ACTIVE, byName, useCategories, useProductChanged, useProducts, type ProductFilters } from "./queries";

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
] as const;

const iconButton = "grid size-11 place-items-center rounded-full text-muted hover:bg-raised hover:text-text";
const secondary = "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-control bg-surface px-4 font-medium";

function StockLine({ product }: { product: ProductView }) {
  const low = product.stock <= product.reorderLevel;
  return (
    <span className={low ? "text-warning" : "text-accent"}>
      {product.stock <= 0 ? "None left" : `${product.stock} ${product.unit} in stock`}
      {low && product.stock > 0 ? " · low" : ""}
    </span>
  );
}

function Cell({ label, value, note, className = "" }: { label: string; value: string; note?: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="truncate text-sm">{value}</p>
      {note && <p className="truncate text-xs text-muted">{note}</p>}
    </div>
  );
}

type RowsProps = { products: ProductView[]; categories: CategoryView[]; onArchive: (product: ProductView, archived: boolean) => void };

/**
 * The reference's inventory rows: name and stock, category, price, then the row actions. On phones a row is two lines:
 * name and price, then category and actions (the reference's iPhone list cards).
 */
function ProductRows({ products, categories, onArchive }: RowsProps) {
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "No category";
  return (
    <ul aria-label="Products" className="overflow-hidden rounded-card bg-surface">
      {products.map((product) => (
        <li
          key={product.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4 even:bg-raised/60 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-y-3"
        >
          <div className="min-w-0">
            <p className="font-medium sm:truncate">{product.name}</p>
            <p className="text-sm text-muted sm:truncate">
              {product.brand ?? "No brand"} · <StockLine product={product} />
            </p>
          </div>
          <Cell label="Category" value={categoryName(product.categoryId)} className="max-sm:order-3" />
          <Cell label="Price" value={formatPeso(product.priceCentavos)} note={`Cost ${formatPeso(product.costCentavos ?? 0)}`} className="max-sm:order-2 max-sm:text-right" />
          <div className="flex items-center justify-end gap-1 max-sm:order-4">
            <Link to={`/app/products/${product.id}`} aria-label={`Edit ${product.name}`} className={iconButton}>
              <Pencil aria-hidden size={18} />
            </Link>
            {!product.archived && (
              <Link to={`/app/stock/restock?productId=${product.id}`} aria-label={`Restock ${product.name}`} className={iconButton}>
                <PackagePlus aria-hidden size={18} />
              </Link>
            )}
            <button
              type="button"
              aria-label={`${product.archived ? "Unarchive" : "Archive"} ${product.name}`}
              onClick={() => onArchive(product, !product.archived)}
              className={iconButton}
            >
              {product.archived ? <ArchiveRestore aria-hidden size={18} /> : <Archive aria-hidden size={18} />}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Products (spec 8.3; reference "Inventory"): the filter panel on the left, the rows on the right. */
export function ProductsPage() {
  const panelId = useId();
  const [filters, setFilters] = useState<ProductFilters>(ALL_ACTIVE);
  const [search, setSearch] = useState("");
  // On phones the filters fold away so the list starts on the first screen.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notice, setNotice] = useState<RestockListResult | null>(null);
  const products = useProducts(filters);
  const categories = useCategories();
  const productChanged = useProductChanged();

  // Search waits until typing stops, so "kape" is one request instead of four.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.search === search.trim() ? current : { ...current, search: search.trim() })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const update = (change: Partial<ProductFilters>) => setFilters((current) => ({ ...current, ...change }));
  const reset = () => {
    setSearch("");
    setFilters(ALL_ACTIVE);
  };
  const activeFilters = [filters.status !== "active", filters.categoryId !== null, filters.lowStock, filters.search !== ""].filter(Boolean).length;

  async function setArchived(product: ProductView, archived: boolean) {
    try {
      const saved = await api<ProductView>(`/products/${product.id}/${archived ? "archive" : "unarchive"}`, { method: "POST" });
      void productChanged(saved);
      setNotice({ message: archived ? `Archived ${saved.name}. It no longer shows in the POS.` : `${saved.name} is back in the POS.` });
    } catch (err) {
      setNotice({ message: err instanceof ApiError ? err.message : "Could not change the product. Please try again." });
    }
  }

  const count = products.data?.length;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <p className="mr-auto text-xl font-medium">{count !== undefined && `${count} ${count === 1 ? "product" : "products"}`}</p>
        {/* Phones: one sideways-scrolling row under the count; wider screens: beside it. */}
        <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 [scrollbar-width:none] max-sm:order-last sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
          <RestockListButton onResult={setNotice} className={secondary} />
          <Link to="/app/stock/restock" className={secondary}>
            Restock
          </Link>
          <Link to="/app/stock/count" className={secondary}>
            Stock count
          </Link>
          <Link to="/app/categories" className={secondary}>
            Categories
          </Link>
        </div>
        <Link to="/app/products/new" className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-control bg-accent px-5 font-medium text-accent-ink">
          <Plus aria-hidden size={18} />
          Add product
        </Link>
      </div>

      {notice && (
        <div role="status" className="flex flex-col gap-3 rounded-control bg-surface px-4 py-3">
          <p>{notice.message}</p>
          {notice.manualText && (
            <textarea
              readOnly
              aria-label="Restock list"
              value={notice.manualText}
              rows={Math.min(8, notice.manualText.split("\n").length)}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full rounded-control bg-raised p-3 font-mono text-sm"
            />
          )}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-6">
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls={panelId}
          onClick={() => setFiltersOpen((open) => !open)}
          className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-control bg-surface px-4 font-medium lg:hidden"
        >
          <SlidersHorizontal aria-hidden size={18} />
          {activeFilters > 0 ? `Filters (${activeFilters})` : "Filters"}
        </button>
        <section id={panelId} aria-label="Filters" className={`${filtersOpen ? "flex" : "hidden"} flex-col gap-5 rounded-card bg-surface p-5 lg:flex`}>
          <fieldset>
            <legend className="text-sm font-medium">Product status</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {STATUSES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filters.status === value}
                  onClick={() => update({ status: value })}
                  className="min-h-12 rounded-control border border-transparent bg-raised px-4 text-left aria-pressed:border-text"
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="Search">
            {(control) => (
              <input {...control} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or brand" className={inputClass} />
            )}
          </Field>
          <Field label="Category">
            {(control) => (
              <select {...control} value={filters.categoryId ?? ""} onChange={(e) => update({ categoryId: e.target.value || null })} className={inputClass}>
                <option value="">All categories</option>
                {byName(categories.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.archived ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Stock">
            {(control) => (
              <select {...control} value={filters.lowStock ? "low" : "all"} onChange={(e) => update({ lowStock: e.target.value === "low" })} className={inputClass}>
                <option value="all">All stock levels</option>
                <option value="low">Low stock</option>
              </select>
            )}
          </Field>
          <button type="button" onClick={reset} className="min-h-12 rounded-control bg-accent font-medium text-accent-ink">
            Reset filters
          </button>
        </section>

        {products.isPending ? (
          <Loading what="the products" />
        ) : products.isError ? (
          <LoadProblem error={products.error} retry={products.refetch} />
        ) : products.data.length === 0 ? (
          <p className="rounded-card bg-surface p-6 text-muted">No products match these filters.</p>
        ) : (
          <ProductRows products={products.data} categories={categories.data ?? []} onArchive={(product, archived) => void setArchived(product, archived)} />
        )}
      </div>
    </div>
  );
}
