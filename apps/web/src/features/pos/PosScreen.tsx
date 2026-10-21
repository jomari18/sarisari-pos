import { formatPeso, type ProductView } from "@sari/shared";
import { Search } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { Dialog } from "../../components/Dialog";
import { useCatalog } from "../catalog/useCatalog";
import { CartPanel } from "./CartPanel";
import { CategoryTabs } from "./CategoryTabs";
import { CustomItemDialog } from "./CustomItemDialog";
import { ProductGrid } from "./ProductGrid";
import { cartActions, cartReducer, cartTotal } from "./cart";
import { searchProducts } from "./search";

const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** The POS (spec 10): search, category tiles and product cards on the left, the sale on the right. */
export function PosScreen() {
  const { data, isLoading, error, refetch } = useCatalog();
  const [lines, dispatch] = useReducer(cartReducer, []);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"custom" | "payment" | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);

  const products = useMemo(() => data?.products ?? [], [data]);
  const shown = useMemo(
    () => (query.trim() ? searchProducts(products, query) : products.filter((p) => categoryId === null || p.categoryId === categoryId)),
    [products, query, categoryId],
  );
  const selected = lines.find((line) => line.key === selectedKey) ?? lines.at(-1) ?? null;

  const add = (product: ProductView) => {
    dispatch(cartActions.add(product));
    setSelectedKey(product.id);
  };
  const setQuantity = (key: string, quantity: number) => {
    dispatch(cartActions.setQuantity(key, quantity));
    setSelectedKey(key);
  };

  // Keyboard (spec 10): "/" search, F9 payment, + and − the selected line.
  const onKey = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (dialog) return;
    const typing = isTextField(event.target);
    if (event.key === "/" && !typing) {
      event.preventDefault();
      searchBox.current?.focus();
    } else if (event.key === "F9") {
      event.preventDefault();
      if (lines.length > 0) setDialog("payment");
    } else if (!typing && selected && (event.key === "+" || event.key === "=")) {
      setQuantity(selected.key, selected.quantity + 1);
    } else if (!typing && selected && (event.key === "-" || event.key === "−")) {
      setQuantity(selected.key, selected.quantity - 1);
    }
  });
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => onKey(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const first = shown[0];
      if (first && query.trim()) {
        add(first);
        setQuery("");
      }
    } else if (event.key === "Escape") {
      setQuery("");
      event.currentTarget.blur();
    }
  }

  if (isLoading) return <p className="rounded-card bg-surface p-6 text-muted">Loading the products…</p>;
  if (error || !data) {
    return (
      <div role="alert" className="rounded-card bg-surface p-6">
        <p>{error?.message ?? "Could not load the products."}</p>
        <button type="button" onClick={refetch} className="mt-4 min-h-11 rounded-control bg-accent px-5 font-medium text-accent-ink">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-48 lg:flex-row lg:items-start lg:pb-0">
      <div className="min-w-0 flex-1">
        <label className="relative block">
          <span className="sr-only">Search products</span>
          <Search aria-hidden size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={searchBox}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKey}
            aria-keyshortcuts="/"
            placeholder="Search name or brand, or type a barcode   ( / )"
            className="h-12 w-full rounded-control bg-surface pl-11 pr-4 text-text placeholder:text-muted"
          />
        </label>

        {!query.trim() && (
          <div className="mt-5">
            <CategoryTabs categories={data.categories} products={products} selected={categoryId} onSelect={setCategoryId} />
          </div>
        )}
        <hr className="my-5 border-raised" />
        <ProductGrid
          products={shown}
          inCart={(id) => lines.find((line) => line.productId === id)?.quantity ?? 0}
          onAdd={add}
          onLess={(product) => setQuantity(product.id, (lines.find((line) => line.productId === product.id)?.quantity ?? 0) - 1)}
        />
      </div>

      <CartPanel
        lines={lines}
        selectedKey={selected?.key ?? null}
        onSelect={setSelectedKey}
        onQuantity={setQuantity}
        onClear={() => dispatch(cartActions.clear())}
        onCustom={() => setDialog("custom")}
        onCharge={() => setDialog("payment")}
      />

      {dialog === "custom" && (
        <CustomItemDialog
          onClose={() => setDialog(null)}
          onAdd={(name, price, quantity) => {
            const action = cartActions.addCustom(name, price, undefined, quantity);
            dispatch(action);
            if (action.type === "addCustom") setSelectedKey(action.key);
            setDialog(null);
          }}
        />
      )}
      {dialog === "payment" && (
        // Task 25 replaces this with the payment dialog (cash and sukli, GCash, utang).
        <Dialog title="Payment" onClose={() => setDialog(null)}>
          <p className="mt-2 text-muted">Total {formatPeso(cartTotal(lines))}</p>
        </Dialog>
      )}
    </div>
  );
}
