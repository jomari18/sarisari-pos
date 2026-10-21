import { formatPeso, type DaySales } from "@sari/shared";
import { bestDay, compactPeso, shortDate } from "./chartText";

// The plot stretches to its box; the axis labels are HTML so they stay 12 px at any width.
const WIDTH = 600;
const HEIGHT = 200;
const PAD = 6;
const GRID = 4;

/** A round top for the y axis: 4 equal steps of 1, 2 or 5 × 10ⁿ centavos. */
function niceTop(max: number): number {
  if (max <= 0) return 100 * GRID;
  const raw = max / GRID;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((n) => n * power).find((n) => n >= raw)!;
  return step * GRID;
}

/**
 * A smooth line through the points that never overshoots between them (monotone cubic, Fritsch–Carlson), so
 * the line cannot dip under zero between two quiet days.
 */
function smoothPath(points: [number, number][]): string {
  const n = points.length;
  const f = (value: number) => Math.round(value * 10) / 10;
  if (n === 1) return `M${f(points[0]![0])},${f(points[0]![1])}`;
  const slopes = points.slice(0, -1).map(([x, y], i) => (points[i + 1]![1] - y) / (points[i + 1]![0] - x));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0]!;
    if (i === n - 1) return slopes[n - 2]!;
    const [before, after] = [slopes[i - 1]!, slopes[i]!];
    return before * after <= 0 ? 0 : (before + after) / 2;
  });
  slopes.forEach((slope, i) => {
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      return;
    }
    const a = tangents[i]! / slope;
    const b = tangents[i + 1]! / slope;
    const length = a * a + b * b;
    if (length > 9) {
      const scale = 3 / Math.sqrt(length);
      tangents[i] = scale * a * slope;
      tangents[i + 1] = scale * b * slope;
    }
  });
  let path = `M${f(points[0]![0])},${f(points[0]![1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const third = (x1 - x0) / 3;
    path += `C${f(x0 + third)},${f(y0 + tangents[i]! * third)} ${f(x1 - third)},${f(y1 - tangents[i + 1]! * third)} ${f(x1)},${f(y1)}`;
  }
  return path;
}

/** Sales per day as the reference's "Overview" line: gridlines, peso labels on the right, dates below. */
export function TrendChart({ days }: { days: DaySales[] }) {
  const total = days.reduce((sum, day) => sum + day.salesCentavos, 0);
  const best = bestDay(days);
  const label = best
    ? `Sales for the last ${days.length} days: ${formatPeso(total)} in total, highest ${formatPeso(best.salesCentavos)} on ${shortDate(best.date)}.`
    : `Sales for the last ${days.length} days: no sales yet.`;

  const top = niceTop(best?.salesCentavos ?? 0);
  const xOf = (i: number) => (days.length === 1 ? WIDTH / 2 : (i * WIDTH) / (days.length - 1));
  const yOf = (centavos: number) => PAD + (1 - centavos / top) * (HEIGHT - 2 * PAD);
  const line = smoothPath(days.map((day, i): [number, number] => [xOf(i), yOf(day.salesCentavos)]));
  const baseline = yOf(0);
  const area = `${line}L${xOf(days.length - 1)},${baseline}L${xOf(0)},${baseline}Z`;
  const dates = days.length <= 7 ? days : [days[0]!, days[Math.floor((days.length - 1) / 2)]!, days.at(-1)!];

  return (
    <figure className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2">
      <svg role="img" aria-label={label} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-56 w-full">
        {Array.from({ length: GRID + 1 }, (_, i) => (
          <line key={i} x1={0} x2={WIDTH} y1={yOf((top * i) / GRID)} y2={yOf((top * i) / GRID)} className="stroke-raised" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} className="fill-accent/15" />
        <path data-series="sales" d={line} fill="none" className="stroke-accent" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div aria-hidden className="flex h-56 flex-col justify-between py-0.5 text-xs text-muted">
        {Array.from({ length: GRID + 1 }, (_, i) => (
          <span key={i}>{compactPeso(top - (top * i) / GRID)}</span>
        ))}
      </div>
      <div aria-hidden className="flex justify-between text-xs text-muted">
        {dates.map((day) => (
          <span key={day.date}>{shortDate(day.date)}</span>
        ))}
      </div>
    </figure>
  );
}
