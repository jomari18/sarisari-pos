import { CategoryInput, CategoryPatch, type CategoryView } from "@sari/shared";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { ApiError, api } from "../../api/client";
import { Field, inputClass } from "../../components/Field";
import { LoadProblem, Loading } from "../../components/LoadProblem";
import { BackToProducts } from "./parts";
import { ALL_ACTIVE, byName, useCategories, useCategoryChanged, useProducts } from "./queries";

const NAME_RULE = "Type a category name of up to 30 characters.";
const quietButton = "min-h-11 rounded-control px-4 text-muted hover:text-text";
const accentButton = "min-h-11 rounded-control bg-accent px-5 font-medium text-accent-ink transition-opacity disabled:opacity-60";
const iconButton = "grid size-11 place-items-center rounded-full text-muted hover:bg-raised hover:text-text";

const onEnter = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key !== "Enter") return;
  // Inside the product form, Enter must add the category, not submit the product.
  event.preventDefault();
  action();
};

/** "New category name" + "Add category", on the Categories screen and inline in the product form (spec 8.3). */
export function NewCategory({ onAdded, onCancel }: { onAdded?: (category: CategoryView) => void; onCancel?: () => void }) {
  const categoryChanged = useCategoryChanged();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (busy) return;
    const parsed = CategoryInput.safeParse({ name });
    if (!parsed.success) return setError(NAME_RULE);
    setBusy(true);
    setError(null);
    try {
      const created = await api<CategoryView>("/categories", { method: "POST", json: parsed.data });
      void categoryChanged(created);
      setName("");
      onAdded?.(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the category. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Side by side only when there is room: the inline copy in the product form sits in a narrow column.
  return (
    <div className="@container">
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-start">
        <div className="flex-1">
          <Field label="New category name" error={error}>
            {(control) => (
              <input
                {...control}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onEnter(() => void add())}
                maxLength={30}
                autoComplete="off"
                placeholder="e.g. Frozen"
                className={inputClass}
              />
            )}
          </Field>
        </div>
        <div className="flex justify-end gap-2 @lg:mt-7">
          {onCancel && (
            <button type="button" onClick={onCancel} className={quietButton}>
              Cancel
            </button>
          )}
          <button type="button" onClick={() => void add()} disabled={busy} className={accentButton}>
            Add category
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ category, count }: { category: CategoryView; count: number }) {
  const categoryChanged = useCategoryChanged();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(patch: CategoryPatch) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      void categoryChanged(await api<CategoryView>(`/categories/${category.id}`, { method: "PATCH", json: patch }));
      setRenaming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the category. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function saveName() {
    const parsed = CategoryPatch.safeParse({ name });
    if (!parsed.success || !parsed.data.name) return setError(NAME_RULE);
    void save({ name: parsed.data.name });
  }

  if (renaming) {
    return (
      <li className="flex flex-col gap-3 rounded-card bg-surface p-4">
        <Field label={`New name for ${category.name}`} error={error}>
          {(control) => (
            <input {...control} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter(saveName)} maxLength={30} autoComplete="off" className={inputClass} />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setRenaming(false);
              setError(null);
            }}
            className={quietButton}
          >
            Cancel
          </button>
          <button type="button" onClick={saveName} disabled={busy} className={accentButton}>
            Save name
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className={`flex flex-col gap-3 rounded-card bg-surface p-4 ${category.archived ? "opacity-75" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{category.name}</p>
          <p className="text-sm text-muted">
            {count} {count === 1 ? "product" : "products"}
          </p>
        </div>
        {category.archived && <span className="rounded-full bg-raised px-2 py-0.5 text-xs text-muted">Archived</span>}
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label={`Rename ${category.name}`}
          onClick={() => {
            setName(category.name);
            setRenaming(true);
          }}
          className={iconButton}
        >
          <Pencil aria-hidden size={18} />
        </button>
        <button
          type="button"
          aria-label={`${category.archived ? "Unarchive" : "Archive"} ${category.name}`}
          onClick={() => void save({ archived: !category.archived })}
          disabled={busy}
          className={iconButton}
        >
          {category.archived ? <ArchiveRestore aria-hidden size={18} /> : <Archive aria-hidden size={18} />}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/** Categories (reference "Menu" category cards): add, rename, and archive a category to hide its POS tile. */
export function CategoriesPage() {
  const categories = useCategories();
  const products = useProducts(ALL_ACTIVE);
  const counts = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const product of products.data ?? []) byCategory.set(product.categoryId, (byCategory.get(product.categoryId) ?? 0) + 1);
    return byCategory;
  }, [products.data]);

  if (categories.isPending || products.isPending) return <Loading what="the categories" />;
  if (categories.isError) return <LoadProblem error={categories.error} retry={categories.refetch} />;
  if (products.isError) return <LoadProblem error={products.error} retry={products.refetch} />;
  // Archived categories go last.
  const shown = [...byName(categories.data.filter((c) => !c.archived)), ...byName(categories.data.filter((c) => c.archived))];
  return (
    <div className="flex flex-col gap-4">
      <BackToProducts />
      <section aria-label="Add a category" className="rounded-card bg-surface p-5">
        <NewCategory />
      </section>
      <ul aria-label="Categories" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((category) => (
          <CategoryCard key={category.id} category={category} count={counts.get(category.id) ?? 0} />
        ))}
      </ul>
    </div>
  );
}
