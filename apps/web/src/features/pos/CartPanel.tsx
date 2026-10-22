import { formatPeso } from "@sari/shared";
import { ChevronDown, ChevronUp, Minus, PackagePlus, Plus, Trash } from "lucide-react";
import { useState } from "react";
import { cartTotal, stockWarning, type CartLine } from "./cart";

type Props = {
  lines: CartLine[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onQuantity: (key: string, quantity: number) => void;
  onClear: () => void;
  onCustom: () => void;
  onCharge: () => void;
};

/**
 * The sale being rung up (the reference's order panel). Desktop: a column on the right. Phones: a sheet at
 * the bottom whose total and Charge button always show; the lines open with "View cart".
 */
export function CartPanel({ lines, selectedKey, onSelect, onQuantity, onClear, onCustom, onCharge }: Props) {
  const [open, setOpen] = useState(false);
  const total = cartTotal(lines);
  const items = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <section
      aria-label="Current sale"
      className="fixed inset-x-0 bottom-0 z-20 flex max-h-[80dvh] flex-col rounded-t-3xl bg-surface p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8rem)] lg:w-[380px] lg:shrink-0 lg:rounded-card lg:p-6 lg:shadow-none"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium">Current sale</h2>
          <p className="text-sm text-muted">{items === 0 ? "No items yet" : `${items} ${items === 1 ? "item" : "items"}`}</p>
        </div>
        <div className="flex items-center gap-2">
          {lines.length > 0 && (
            <button type="button" onClick={onClear} className="min-h-11 rounded-control px-3 text-sm text-muted hover:text-text">
              Clear
            </button>
          )}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="grid size-11 place-items-center rounded-full bg-raised lg:hidden"
            aria-label={open ? "Hide cart" : "View cart"}
          >
            {open ? <ChevronDown aria-hidden size={18} /> : <ChevronUp aria-hidden size={18} />}
          </button>
        </div>
      </div>

      <ol className={`mt-4 flex-1 flex-col gap-2 overflow-y-auto ${open ? "flex" : "hidden"} lg:flex`}>
        {lines.map((line, index) => {
          const warning = stockWarning(line);
          const selected = line.key === selectedKey;
          return (
            <li key={line.key} className={`rounded-control bg-raised px-3 py-2.5 ${selected ? "ring-2 ring-accent" : ""}`} onClick={() => onSelect(line.key)}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-medium text-accent-ink">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{line.name}</p>
                  <p className="text-xs text-muted">
                    {formatPeso(line.unitPriceCentavos)} each
                    {line.productId === null && <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-warning">Custom</span>}
                  </p>
                  {warning && <p className="mt-1 text-xs text-warning">{warning}</p>}
                </div>
                <p className="font-medium">{formatPeso(line.quantity * line.unitPriceCentavos)}</p>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button type="button" aria-label={`Remove ${line.name}`} onClick={() => onQuantity(line.key, 0)} className="mr-auto grid size-11 place-items-center rounded-full text-muted hover:text-danger">
                  <Trash aria-hidden size={16} />
                </button>
                <button type="button" aria-label={`One less ${line.name}`} onClick={() => onQuantity(line.key, line.quantity - 1)} className="grid size-11 place-items-center rounded-full bg-surface">
                  <Minus aria-hidden size={14} />
                </button>
                <output aria-label="Quantity" className="min-w-6 text-center">
                  {line.quantity}
                </output>
                <button type="button" aria-label={`One more ${line.name}`} onClick={() => onQuantity(line.key, line.quantity + 1)} className="grid size-11 place-items-center rounded-full bg-accent text-accent-ink">
                  <Plus aria-hidden size={14} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 border-t border-raised pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Total</span>
          <span data-testid="cart-total" className="text-2xl font-semibold">
            {formatPeso(total)}
          </span>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCustom} className="flex min-h-12 items-center gap-2 rounded-control bg-raised px-4 text-sm">
            <PackagePlus aria-hidden size={18} />
            Custom item
          </button>
          <button
            type="button"
            onClick={onCharge}
            disabled={lines.length === 0}
            aria-keyshortcuts="F9"
            className="min-h-12 flex-1 rounded-control bg-accent px-4 font-medium text-accent-ink transition-opacity disabled:opacity-50"
          >
            Charge {formatPeso(total)}
          </button>
        </div>
      </div>
    </section>
  );
}
