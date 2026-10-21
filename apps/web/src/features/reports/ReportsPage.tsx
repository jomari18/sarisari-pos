import { formatPeso, manilaDate, type PaymentMethod, type ReportRange, type SummaryReport } from "@sari/shared";
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Field, inputClass } from "../../components/Field";
import { LoadProblem } from "../../components/LoadProblem";
import { agingText } from "../suki/queries";
import { HourlyChart } from "./HourlyChart";
import { TrendChart } from "./TrendChart";
import { useHourly, useProductReport, useSummary, useUtangReport } from "./queries";

const RANGES: { value: ReportRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];
const METHODS: { method: PaymentMethod; label: string; tone: string }[] = [
  { method: "CASH", label: "Cash", tone: "text-accent" },
  { method: "GCASH", label: "GCash", tone: "text-success" },
  { method: "UTANG", label: "Utang", tone: "text-warning" },
];
const pill = "min-h-11 rounded-control px-5 font-medium aria-pressed:bg-accent aria-pressed:text-accent-ink";

function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={`flex flex-col gap-4 rounded-card bg-surface p-5 sm:p-6 ${className}`}>
      <h2 id={titleId} className="text-xl font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The reference's "Total Revenue" ring: the range's sales split by payment method, total in the middle. */
function MethodRing({ report }: { report: SummaryReport }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const label = METHODS.map(({ method, label }) => `${label} ${formatPeso(report.byMethod[method])}`).join(", ");
  return (
    <div className="relative grid size-44 shrink-0 place-items-center">
      <svg role="img" aria-label={`Sales by payment method: ${label}`} viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx={50} cy={50} r={radius} fill="none" strokeWidth={14} className="stroke-raised" />
        {report.salesCentavos > 0 &&
          METHODS.map(({ method, tone }) => {
            const length = (report.byMethod[method] / report.salesCentavos) * circumference;
            const segment = (
              <circle key={method} cx={50} cy={50} r={radius} fill="none" strokeWidth={14} stroke="currentColor" className={tone} strokeDasharray={`${length} ${circumference}`} strokeDashoffset={-offset} />
            );
            offset += length;
            return segment;
          })}
      </svg>
      <p className="relative text-center">
        <span className="block text-sm text-muted">Total</span>
        <span className="block text-xl font-semibold">{formatPeso(report.salesCentavos)}</span>
      </p>
    </div>
  );
}

function SalesCard({ report, range }: { report: SummaryReport | undefined; range: ReportRange }) {
  return (
    <Card title="Sales">
      {report ? (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <MethodRing report={report} />
          <div className="flex w-full flex-col gap-3">
            <p className="text-muted">{`${report.count} ${report.count === 1 ? "sale" : "sales"} ${range === "today" ? "today" : `in the last ${range === "7d" ? 7 : 30} days`}`}</p>
            <ul className="flex flex-col gap-2">
              {METHODS.map(({ method, label, tone }) => (
                <li key={method} className="flex items-center gap-3">
                  <span aria-hidden className={`size-3 rounded-full bg-current ${tone}`} />
                  <span>
                    {label} <span className="font-medium">{formatPeso(report.byMethod[method])}</span>
                  </span>
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-2 gap-3 border-t border-raised pt-3">
              <div>
                <dt className="text-sm text-muted">Expected cash</dt>{" "}
                <dd className="text-lg font-semibold">{formatPeso(report.expectedCashCentavos)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Profit</dt> <dd className="text-lg font-semibold">{formatPeso(report.profitCentavos)}</dd>
                <dd className="text-xs text-muted">Custom items are not included</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : (
        <p className="text-muted">Loading…</p>
      )}
    </Card>
  );
}

/** Reports (spec 8.6; reference "Reports"): a range's sales and best sellers, a day by hour, and the utang. */
export function ReportsPage() {
  const [range, setRange] = useState<ReportRange>("today");
  const [day, setDay] = useState(() => manilaDate(new Date()));
  const [rank, setRank] = useState<"quantity" | "profit">("quantity");
  const summary = useSummary(range);
  const products = useProductReport(range);
  const hourly = useHourly(day);
  const utang = useUtangReport();
  const rows = rank === "quantity" ? products.data?.bestByQuantity : products.data?.bestByProfit;

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="Range" className="flex flex-wrap gap-2">
        {RANGES.map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)} className={pill}>
            {label}
          </button>
        ))}
      </div>
      {summary.isError && <LoadProblem error={summary.error} retry={summary.refetch} />}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <SalesCard report={summary.data} range={range} />
        <Card title="Sales trend">
          {range === "today" ? (
            <p className="text-muted">Choose 7 days or 30 days to see the trend. Today by the hour is below.</p>
          ) : summary.data ? (
            <TrendChart days={summary.data.days} />
          ) : (
            <p className="text-muted">Loading…</p>
          )}
        </Card>
      </div>

      <Card title="Best sellers">
        <div role="group" aria-label="Rank by" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={rank === "quantity"} onClick={() => setRank("quantity")} className={pill}>
            Most sold
          </button>
          <button type="button" aria-pressed={rank === "profit"} onClick={() => setRank("profit")} className={pill}>
            Most profit
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left">
            <caption className="sr-only">Best sellers</caption>
            <thead className="text-sm text-muted">
              <tr>
                <th className="py-2 pr-3 font-normal">#</th>
                <th className="py-2 pr-3 font-normal">Product</th>
                <th className="py-2 pr-3 text-right font-normal">Sold</th>
                <th className="py-2 pr-3 text-right font-normal">Sales</th>
                <th className="py-2 text-right font-normal">Profit</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((row, i) => (
                <tr key={row.productId} className="border-t border-raised">
                  <td className="py-3 pr-3 text-muted">{i + 1}</td>
                  <td className="py-3 pr-3 font-medium">{row.name}</td>
                  <td className="py-3 pr-3 text-right">{row.quantity}</td>
                  <td className="py-3 pr-3 text-right">{formatPeso(row.salesCentavos)}</td>
                  <td className="py-3 text-right">{formatPeso(row.profitCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows?.length === 0 && <p className="text-muted">No sales in this range yet.</p>}
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card title="Sales by hour">
          <div className="max-w-56">
            <Field label="Day">
              {(control) => <input {...control} type="date" value={day} max={manilaDate(new Date())} onChange={(e) => e.target.value && setDay(e.target.value)} className={inputClass} />}
            </Field>
          </div>
          {hourly.data ? <HourlyChart buckets={hourly.data} /> : <p className="text-muted">Loading…</p>}
        </Card>
        <Card title="Slow movers">
          <p className="text-sm text-muted">Active products that did not sell in this range.</p>
          {products.data && products.data.slowMovers.length === 0 && <p className="text-muted">Everything sold at least once.</p>}
          <ul className="flex flex-col gap-2">
            {(products.data?.slowMovers ?? []).map((item) => (
              <li key={item.productId} className="flex items-center justify-between gap-3 rounded-control bg-raised px-4 py-3">
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 text-sm text-muted">{`${item.stock} in stock`}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Utang">
        {utang.data ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="flex flex-col gap-3">
              <p>
                <span className="block text-sm text-muted">Owed by all suki</span>
                <span className="block text-3xl font-semibold">{formatPeso(utang.data.totalCentavos)}</span>
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                <li>
                  0–7 days <span className="font-medium">{formatPeso(utang.data.aging.d0to7)}</span>
                </li>
                <li className="text-warning">
                  8–30 days <span className="font-medium">{formatPeso(utang.data.aging.d8to30)}</span>
                </li>
                <li className="text-danger">
                  31+ days <span className="font-medium">{formatPeso(utang.data.aging.d31plus)}</span>
                </li>
              </ul>
            </div>
            <ul aria-label="Most owed" className="flex flex-col gap-2">
              {utang.data.top.map((customer) => (
                <li key={customer.id}>
                  <Link to={`/app/suki/${customer.id}`} className="flex items-center justify-between gap-3 rounded-control bg-raised px-4 py-3 hover:bg-raised/70">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{customer.name}</span>
                      <span className="block text-sm text-muted">{agingText(customer.oldestUnpaidDays) ?? "Nothing unpaid"}</span>
                    </span>
                    <span className="shrink-0 font-semibold">{formatPeso(customer.balanceCentavos)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted">Loading…</p>
        )}
      </Card>
    </div>
  );
}
