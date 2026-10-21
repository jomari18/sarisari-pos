import { formatPeso, type SaleView } from "@sari/shared";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ApiError, api } from "../../api/client";
import { LoadProblem, Loading } from "../../components/LoadProblem";
import { Notice } from "../../components/Notice";
import { manilaStamp, pesoField } from "../../lib/format";
import { useReview, useSaleVoided } from "../reports/queries";
import { FLAG_LABELS, SaleDetail } from "../sales/SaleDetail";

const outlined = "min-h-11 rounded-control border border-muted/60 px-4 text-sm font-medium hover:bg-raised";

/** A custom item can be added to the products with its name and price filled in (spec 6.6). */
const newProductLink = (name: string, unitPriceCentavos: number) => `/app/products/new?${new URLSearchParams({ name, price: pesoField(unitPriceCentavos) })}`;

function ReviewRow({ sale, onOpen, onDone }: { sale: SaleView; onOpen: () => void; onDone: () => void }) {
  const customItems = sale.lines.filter((line) => line.productId === null);
  return (
    <li className="flex flex-col gap-3 px-4 py-4 even:bg-surface sm:flex-row sm:items-center">
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-control bg-accent text-accent-ink">
        <TriangleAlert size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-warning">{sale.flags.map((flag) => FLAG_LABELS[flag]).join(" · ")}</p>
        <p>{`Receipt No. ${sale.receiptNo} · ${formatPeso(sale.totalCentavos)} · ${sale.cashier.displayName}${sale.customer ? ` · ${sale.customer.name}` : ""}`}</p>
        <p className="text-sm text-muted">{manilaStamp(sale.soldAt)}</p>
        {customItems.map((line) => (
          <Link key={line.name} to={newProductLink(line.name, line.unitPriceCentavos)} className="mr-4 text-sm text-accent underline underline-offset-2">
            {`Add ${line.name} to products`}
          </Link>
        ))}
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" aria-label={`Open sale No. ${sale.receiptNo}`} onClick={onOpen} className={outlined}>
          Open
        </button>
        <button type="button" aria-label={`Mark sale No. ${sale.receiptNo} as reviewed`} onClick={onDone} className={outlined}>
          Mark reviewed
        </button>
      </div>
    </li>
  );
}

/** Needs review (spec 6; reference "Notification"): flagged sales the owner should look at, newest first. */
export function ReviewPage() {
  const client = useQueryClient();
  const review = useReview();
  const saleVoided = useSaleVoided();
  const [open, setOpen] = useState<SaleView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function markDone(sale: SaleView) {
    setNotice(null);
    try {
      await api(`/review/${sale.id}/done`, { method: "POST" });
      client.setQueryData<SaleView[]>(["review"], (list) => list?.filter((s) => s.id !== sale.id));
      void client.invalidateQueries({ queryKey: ["review"] });
      setNotice(`Sale No. ${sale.receiptNo} is reviewed.`);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not mark the sale. Please try again.");
    }
  }

  if (review.isPending) return <Loading what="the sales to review" />;
  if (review.isError) return <LoadProblem error={review.error} retry={review.refetch} />;
  const count = review.data.length;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{count === 0 ? "Nothing needs a look right now." : `${count} ${count === 1 ? "sale needs" : "sales need"} a look.`}</p>
      <Notice text={notice} />
      {count > 0 && (
        <ul aria-label="Sales to review" className="overflow-hidden rounded-card bg-raised/40">
          {review.data.map((sale) => (
            <ReviewRow key={sale.id} sale={sale} onOpen={() => setOpen(sale)} onDone={() => void markDone(sale)} />
          ))}
        </ul>
      )}
      {open && (
        <SaleDetail
          sale={open}
          onClose={() => setOpen(null)}
          onVoided={(voided) => {
            setOpen(voided);
            void saleVoided(voided);
          }}
        />
      )}
    </div>
  );
}
