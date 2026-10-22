import { ean13Modules } from "@sari/shared";

// EAN-13 geometry in module widths: a quiet zone wide enough for the first digit on the left.
const LEFT_QUIET = 11;
const RIGHT_QUIET = 7;
const BAR_HEIGHT = 52;
const GUARD_HEIGHT = 58;
const WIDTH = LEFT_QUIET + 95 + RIGHT_QUIET;
const HEIGHT = 66;
/** Start, middle and end guards, drawn a little longer as on a real label. */
const isGuard = (i: number) => i < 3 || (i >= 45 && i < 50) || i >= 92;

/** A scannable EAN-13: its 95 modules as bars, black on white, with the digits under them. */
export function Ean13Svg({ code, className = "" }: { code: string; className?: string }) {
  const modules = ean13Modules(code);
  return (
    <svg role="img" aria-label={`Barcode ${code}`} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} shapeRendering="crispEdges" className={className}>
      <rect width={WIDTH} height={HEIGHT} fill="#FFFFFF" />
      {[...modules].map((module, i) =>
        module === "1" ? <rect key={i} data-module={i} x={LEFT_QUIET + i} y={0} width={1} height={isGuard(i) ? GUARD_HEIGHT : BAR_HEIGHT} fill="#111315" /> : null,
      )}
      <g fill="#111315" fontFamily="ui-monospace, monospace" fontSize={8} textAnchor="middle">
        <text x={LEFT_QUIET - 5} y={HEIGHT - 2}>
          {code[0]}
        </text>
        <text x={LEFT_QUIET + 24} y={HEIGHT - 2} letterSpacing={1.6}>
          {code.slice(1, 7)}
        </text>
        <text x={LEFT_QUIET + 71} y={HEIGHT - 2} letterSpacing={1.6}>
          {code.slice(7)}
        </text>
      </g>
    </svg>
  );
}
