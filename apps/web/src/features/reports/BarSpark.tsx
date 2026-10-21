const BAR = 6;
const GAP = 9;
const HEIGHT = 52;
/** An empty day still shows, so seven bars always read as seven days. */
const STUB = 4;

/** The reference's small green bars in a stat card: one per value, the tallest at full height (spec 11.1). */
export function BarSpark({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(0, ...values);
  const width = values.length * (BAR + GAP) - GAP;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} className="shrink-0 text-success">
      {values.map((value, i) => {
        const height = max === 0 ? STUB : Math.max(STUB, Math.round((value / max) * HEIGHT));
        return <rect key={i} x={i * (BAR + GAP)} y={HEIGHT - height} width={BAR} height={height} rx={BAR / 2} fill="currentColor" />;
      })}
    </svg>
  );
}
