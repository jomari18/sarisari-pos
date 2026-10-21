import type { MovementReason, ProductView, StockMovementView } from "@sari/shared";
import { useId } from "react";
import { Link } from "react-router";
import { LoadProblem } from "../../components/LoadProblem";
import { manilaStamp } from "../../lib/format";
import { useMovements } from "./queries";

const REASONS: Record<MovementReason, string> = {
  SALE: "Sale",
  RESTOCK: "Restock",
  COUNT: "Count",
  SPOILAGE: "Spoiled",
  EXPIRED: "Expired",
  VOID: "Voided sale",
};

const signed = (change: number) => (change > 0 ? `+${change}` : change < 0 ? `−${-change}` : "0");

function MovementRow({ movement }: { movement: StockMovementView }) {
  return (
    <li className="flex items-start justify-between gap-4 border-t border-raised py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="font-medium">{REASONS[movement.reason]}</p>
        <p className="text-sm text-muted">
          {manilaStamp(movement.createdAt)} · {movement.user.displayName}
        </p>
        {movement.sale && (
          <Link to={`/app/sales?sale=${movement.sale.id}`} className="text-sm text-accent underline underline-offset-2">
            Receipt No. {movement.sale.receiptNo}
          </Link>
        )}
        {movement.note && <p className="text-sm">{movement.note}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-semibold ${movement.change > 0 ? "text-success" : ""}`}>{signed(movement.change)}</p>
        <p className="text-sm text-muted">now {movement.stockAfter}</p>
      </div>
    </li>
  );
}

/** Stock history (spec 5: every stock change has a movement), newest first, with the way to restock or count. */
export function MovementsPanel({ product }: { product: ProductView }) {
  const titleId = useId();
  const movements = useMovements(product.id);
  return (
    <section aria-labelledby={titleId} className="rounded-card bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-lg font-medium">
            Stock history
          </h2>
          <p className="text-sm text-muted">
            {product.stock} {product.unit} in stock now · low at {product.reorderLevel}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/app/stock/restock?productId=${product.id}`} className="inline-flex min-h-11 items-center rounded-control bg-raised px-4 font-medium">
            Restock
          </Link>
          <Link to={`/app/stock/count?productId=${product.id}`} className="inline-flex min-h-11 items-center rounded-control bg-raised px-4 font-medium">
            Count
          </Link>
        </div>
      </div>
      {movements.isPending ? (
        <p className="mt-4 text-muted">Loading the history…</p>
      ) : movements.isError ? (
        <div className="mt-4">
          <LoadProblem error={movements.error} retry={movements.refetch} />
        </div>
      ) : movements.data.length === 0 ? (
        <p className="mt-4 text-muted">No stock changes yet.</p>
      ) : (
        <ul aria-labelledby={titleId} className="mt-4">
          {movements.data.map((movement) => (
            <MovementRow key={movement.id} movement={movement} />
          ))}
        </ul>
      )}
    </section>
  );
}
