import { formatPeso } from "@sari/shared";
import { Banknote, PiggyBank, Wallet } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { DemoLoginsCard } from "../demo/DemoLoginsCard";
import { StatCard } from "../../components/StatCard";
import { ALL_ACTIVE, useProducts } from "../inventory/queries";
import { BarSpark } from "../reports/BarSpark";
import { TrendChart } from "../reports/TrendChart";
import { shortDate, sparkLabel } from "../reports/chartText";
import { useReview, useSummary } from "../reports/queries";
import { FLAG_LABELS } from "../sales/SaleDetail";

const LOW_STOCK = { ...ALL_ACTIVE, lowStock: true };
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The reference's list card ("Popular Dishes"): a title with its count, a few rows and "See all". */
function ListCard({ title, count, seeAll, empty, children }: { title: string; count: string | null; seeAll: string; empty: string | null; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-card bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-xl font-medium">
            {title}
          </h2>
          <p className="text-sm text-muted">{count ?? "Loading…"}</p>
        </div>
        <Link to={seeAll} className="text-sm text-accent underline underline-offset-2">
          See all
        </Link>
      </div>
      {empty ? <p className="rounded-control bg-raised px-4 py-6 text-center text-muted">{empty}</p> : children}
    </section>
  );
}

/** The owner's dashboard (spec 3.3; reference "Dashboard"): today's numbers, what needs restocking or a look, and the month's trend. */
export function DashboardPage() {
  const today = useSummary("today");
  const month = useSummary("30d");
  const low = useProducts(LOW_STOCK);
  const review = useReview();
  const trendId = useId();
  // Spec 3.1: a new demo store opens here with its two logins on show.
  const welcome = (useLocation().state as { welcome?: boolean } | null)?.welcome === true;
  const day = today.data?.days[0]?.date;
  const week = month.data?.days.slice(-7);

  return (
    <div className="flex flex-col gap-6">
      {welcome && <DemoLoginsCard />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Today's sales"
          value={today.data ? formatPeso(today.data.salesCentavos) : null}
          note={today.data && `${plural(today.data.count, "sale", "sales")}${day ? ` · ${shortDate(day)}` : ""}`}
          icon={Banknote}
        >
          {week && <BarSpark values={week.map((d) => d.salesCentavos)} label={sparkLabel(week)} />}
        </StatCard>
        <StatCard
          title="Expected cash"
          value={today.data ? formatPeso(today.data.expectedCashCentavos) : null}
          note="Cash sales plus cash utang payments today"
          icon={Wallet}
        />
        <StatCard title="Profit today" value={today.data ? formatPeso(today.data.profitCentavos) : null} note="Custom items are not included" icon={PiggyBank} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ListCard
          title="Low stock"
          count={low.data ? plural(low.data.length, "product", "products") : null}
          seeAll="/app/products"
          empty={low.data?.length === 0 ? "Nothing is running low." : null}
        >
          <ul className="flex flex-col gap-2">
            {(low.data ?? []).slice(0, 5).map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 rounded-control bg-raised px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{product.name}</span>
                  <span className="block text-sm text-muted">{product.brand ?? "No brand"}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-sm ${product.stock <= 0 ? "text-danger" : "text-warning"}`}>{product.stock <= 0 ? "None left" : `${product.stock} left`}</span>
                  <Link to={`/app/stock/restock?productId=${product.id}`} className="text-sm text-accent underline underline-offset-2">
                    Restock
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </ListCard>
        <ListCard
          title="Needs review"
          count={review.data ? plural(review.data.length, "sale", "sales") : null}
          seeAll="/app/review"
          empty={review.data?.length === 0 ? "Nothing needs a look right now." : null}
        >
          <ul className="flex flex-col gap-2">
            {(review.data ?? []).slice(0, 5).map((sale) => (
              <li key={sale.id} className="flex items-center justify-between gap-3 rounded-control bg-raised px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{`Receipt No. ${sale.receiptNo}`}</span>
                  <span className="block truncate text-sm text-warning">{sale.flags.map((flag) => FLAG_LABELS[flag]).join(" · ")}</span>
                </span>
                <span className="shrink-0 font-medium">{formatPeso(sale.totalCentavos)}</span>
              </li>
            ))}
          </ul>
        </ListCard>
      </div>

      <section aria-labelledby={trendId} className="flex flex-col gap-4 rounded-card bg-surface p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id={trendId} className="text-xl font-medium">
            Overview
          </h2>
          <Link to="/app/reports" className="text-sm text-accent underline underline-offset-2">
            Reports
          </Link>
        </div>
        {month.data ? <TrendChart days={month.data.days} /> : <p className="text-muted">Loading the last 30 days…</p>}
      </section>
    </div>
  );
}
