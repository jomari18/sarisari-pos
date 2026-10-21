import { normalizeName, parsePesos } from "@sari/shared";
import { useId, useState, type FormEvent } from "react";
import { Dialog } from "../../components/Dialog";

const field = "h-12 w-full rounded-control bg-raised px-4 text-text placeholder:text-muted";

/**
 * Spec 6.6: an item that is not in the product list yet. The sale gets the CUSTOM_ITEM flag, and the
 * owner can add it to the inventory from "Needs review".
 */
export function CustomItemDialog({ onAdd, onClose }: { onAdd: (name: string, unitPriceCentavos: number, quantity: number) => void; onClose: () => void }) {
  const ids = { name: useId(), price: useId(), quantity: useId() };
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = normalizeName(String(form.get("name") ?? ""));
    const price = parsePesos(String(form.get("price") ?? ""));
    const quantity = Number(form.get("quantity") ?? 1);
    if (!name) return setError("Type what the item is.");
    if (price === null || price < 1) return setError("Type a price, like 15 or 7.50.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return setError("The quantity is 1 to 999.");
    onAdd(name.slice(0, 80), price, quantity);
  }

  return (
    <Dialog title="Custom item" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">Sell something that is not in the products yet. The owner sees it in Needs review.</p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.name} className="text-sm font-medium">
            Item name
          </label>
          <input id={ids.name} name="name" maxLength={80} autoComplete="off" placeholder="e.g. Yelo" className={field} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor={ids.price} className="text-sm font-medium">
              Price
            </label>
            <input id={ids.price} name="price" inputMode="decimal" autoComplete="off" placeholder="₱0.00" className={field} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={ids.quantity} className="text-sm font-medium">
              Quantity
            </label>
            <input id={ids.quantity} name="quantity" type="number" min={1} max={999} defaultValue={1} className={field} />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-12 rounded-control px-5 text-muted hover:text-text">
            Cancel
          </button>
          <button type="submit" className="min-h-12 rounded-control bg-accent px-5 font-medium text-accent-ink">
            Add to sale
          </button>
        </div>
      </form>
    </Dialog>
  );
}
