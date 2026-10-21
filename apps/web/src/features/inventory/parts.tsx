import type { ProductView } from "@sari/shared";
import { useSearchParams } from "react-router";
import { BackLink } from "../../components/BackLink";
import { Field, inputClass } from "../../components/Field";
import { ALL_ACTIVE, byName, useProducts } from "./queries";

export const BackToProducts = () => <BackLink to="/app/products" label="Products" />;

/** Restock and count work on one active product, named by `?productId=` so the page can be linked and reloaded. */
export function useChosenProduct() {
  const [params, setParams] = useSearchParams();
  const products = useProducts(ALL_ACTIVE);
  const productId = params.get("productId") ?? "";
  const product = products.data?.find((p) => p.id === productId) ?? null;
  const choose = (id: string) => setParams(id ? { productId: id } : {}, { replace: true });
  return { products, product, choose };
}

export function ProductSelect({ products, product, onChoose }: { products: ProductView[]; product: ProductView | null; onChoose: (id: string) => void }) {
  return (
    <Field label="Product">
      {(control) => (
        <select {...control} value={product?.id ?? ""} onChange={(e) => onChoose(e.target.value)} className={inputClass}>
          <option value="">Choose a product</option>
          {byName(products).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.brand ? ` (${p.brand})` : ""}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** The selected product's numbers, above the restock and count fields. */
export function StockNow({ product }: { product: ProductView }) {
  return (
    <p className="text-sm text-muted">
      In the records: {product.stock} {product.unit} · low at {product.reorderLevel}
    </p>
  );
}
