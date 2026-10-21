import { formatPeso, type HourlyBucket } from "@sari/shared";
import { hourLabel } from "./chartText";

const SLOT = 20;
const BAR = 12;
const HEIGHT = 160;
const TICKS = [0, 6, 12, 18, 23];

/** Sales by Manila hour as 24 bars; the busiest hour stands out and is named in the label (spec 8.6). */
export function HourlyChart({ buckets }: { buckets: HourlyBucket[] }) {
  const busiest = buckets.reduce<HourlyBucket | null>((best, bucket) => (bucket.salesCentavos > (best?.salesCentavos ?? 0) ? bucket : best), null);
  const label = busiest
    ? `Sales by hour. Busiest: ${hourLabel(busiest.hour)}, ${formatPeso(busiest.salesCentavos)} from ${busiest.count} ${busiest.count === 1 ? "sale" : "sales"}.`
    : "Sales by hour. No sales on this day.";
  const max = busiest?.salesCentavos ?? 0;
  return (
    <figure className="flex flex-col gap-2">
      <svg role="img" aria-label={label} viewBox={`0 0 ${24 * SLOT} ${HEIGHT}`} preserveAspectRatio="none" className="h-40 w-full">
        {buckets.map((bucket) => {
          const height = max === 0 ? 2 : Math.max(2, (bucket.salesCentavos / max) * (HEIGHT - 8));
          return (
            <rect
              key={bucket.hour}
              x={bucket.hour * SLOT + (SLOT - BAR) / 2}
              y={HEIGHT - height}
              width={BAR}
              height={height}
              rx={3}
              className={bucket === busiest ? "fill-accent" : "fill-success"}
            />
          );
        })}
      </svg>
      <div aria-hidden className="flex justify-between text-xs text-muted">
        {TICKS.map((hour) => (
          <span key={hour}>{hourLabel(hour)}</span>
        ))}
      </div>
    </figure>
  );
}
