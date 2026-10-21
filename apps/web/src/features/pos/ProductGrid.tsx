import { formatPeso, type ProductView } from "@sari/shared";
import { Minus, Plus } from "lucide-react";

type Props = {
  products: ProductView[];
  inCart: (productId: string) => number;
  onAdd: (product: ProductView) => void;
  onLess: (product: ProductView) => void;
};

function StockBadge({ product }: { product: ProductView }) {
  if (product.stock > product.reorderLevel) return null;
  return (
    <span className="whitespace-nowrap rounded-full bg-raised px-2 py-0.5 text-xs text-warning">{product.stock <= 0 ? "None left" : `${product.stock} left`}</span>
  );
}

/** Product cards as in the reference: a small top line (the brand), name, price, and − / + once in the cart. */
export function ProductGrid({ products, inCart, onAdd, onLess }: Props) {
  if (products.length === 0) return <p className="rounded-card bg-surface p-6 text-muted">No products match.</p>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
      {products.map((product) => {
        const quantity = inCart(product.id);
        return (
          <li key={product.id} className="flex min-h-36 flex-col rounded-card bg-surface p-4">
            <button
              type="button"
              aria-label={`Add ${product.name}, ${formatPeso(product.priceCentavos)}`}
              onClick={() => onAdd(product)}
              className="-m-1 flex flex-1 flex-col items-start rounded-control p-1 text-left"
            >
              <span className="text-xs text-muted">{product.brand ?? " "}</span>
              <span className="mt-1 font-medium leading-snug">{product.name}</span>
              <span className="mt-1 text-sm text-muted">{formatPeso(product.priceCentavos)}</span>
            </button>
            {/* On a narrow card the badge and the − / + controls wrap onto two rows instead of colliding. */}
            <div className="mt-3 flex min-h-8 flex-wrap items-center justify-between gap-2">
              <StockBadge product={product} />
              {quantity > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" aria-label={`One less ${product.name}`} onClick={() => onLess(product)} className="grid size-8 place-items-center rounded-full bg-raised">
                    <Minus aria-hidden size={14} />
                  </button>
                  <span className="min-w-5 text-center text-sm">{quantity}</span>
                  <button type="button" aria-label={`One more ${product.name}`} onClick={() => onAdd(product)} className="grid size-8 place-items-center rounded-full bg-accent text-accent-ink">
                    <Plus aria-hidden size={14} />
                  </button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
