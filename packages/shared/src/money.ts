// Money is always an integer number of centavos; these helpers are the only place pesos become text.

const GROUPED = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/;
const PLAIN = /^\d+(\.\d{1,2})?$/;

/** Parses what a person types ("₱50", "1,000", "1000.5") into centavos; null when it is not a valid amount. */
export function parsePesos(input: string): number | null {
  let text = input.trim();
  if (text.startsWith("₱")) text = text.slice(1).trim();
  if (!GROUPED.test(text) && !PLAIN.test(text)) return null;
  const [whole = "0", fraction = ""] = text.replace(/,/g, "").split(".");
  const centavos = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** 123450 → "₱1,234.50"; negative amounts get a leading minus. */
export function formatPeso(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const absolute = Math.abs(centavos);
  const whole = Math.floor(absolute / 100).toLocaleString("en-US");
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}₱${whole}.${fraction}`;
}

/** Sukli for a cash sale. */
export function changeFor(totalCentavos: number, tenderedCentavos: number): number {
  if (tenderedCentavos < totalCentavos) throw new RangeError("The cash given is less than the total.");
  return tenderedCentavos - totalCentavos;
}
