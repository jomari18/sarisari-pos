import { formatPeso } from "./money.js";
import type { SaleView } from "./views.js";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const AMOUNT_COLUMN = 10;

function center(text: string, width: number): string {
  return " ".repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text;
}

/** A label on the left and an amount right-aligned in the last 10 (or more) columns. */
function pair(label: string, amount: string, width: number): string {
  const right = Math.max(AMOUNT_COLUMN, amount.length);
  return label.slice(0, width - right).padEnd(width - right) + amount.padStart(right);
}

/** Word wrap; a single word longer than the width is split. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    for (let piece = word; piece.length > 0; piece = piece.slice(width)) {
      const chunk = piece.slice(0, width);
      if (!current) current = chunk;
      else if (current.length + 1 + chunk.length <= width) current += ` ${chunk}`;
      else {
        lines.push(current);
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function manilaStamp(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + MANILA_OFFSET_MS).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)}`;
}

/** The receipt as plain text lines for a 58 mm printer (32 characters) and the shared image. */
export function receiptLines(sale: SaleView, store: { name: string }, width = 32): string[] {
  const rule = "-".repeat(width);
  const lines = wrap(store.name, width).map((line) => center(line, width));
  lines.push(manilaStamp(sale.soldAt));
  lines.push(
    sale.pending || sale.receiptNo === null
      ? `PENDING SYNC ${sale.id.slice(0, 6).toUpperCase()}`
      : `No. ${String(sale.receiptNo).padStart(4, "0")}`,
  );
  lines.push(...wrap(`Cashier: ${sale.cashier.displayName}`, width));
  lines.push(rule);

  for (const line of sale.lines) {
    lines.push(...wrap(line.name, width));
    lines.push(pair(`  ${line.quantity} x ${formatPeso(line.unitPriceCentavos)}`, formatPeso(line.lineTotalCentavos), width));
  }

  lines.push(rule);
  lines.push(pair("TOTAL", formatPeso(sale.totalCentavos), width));
  if (sale.method === "CASH" && sale.tenderedCentavos !== null) {
    lines.push(pair("Cash", formatPeso(sale.tenderedCentavos), width));
    lines.push(pair("Change", formatPeso(sale.changeCentavos ?? 0), width));
  } else if (sale.method === "GCASH") {
    lines.push("Paid by GCash");
    if (sale.gcashRef) lines.push(...wrap(`GCash ref: ${sale.gcashRef}`, width));
  } else if (sale.method === "UTANG" && sale.customer) {
    lines.push(...wrap(`Utang: ${sale.customer.name}`, width));
    lines.push(pair("Utang balance", formatPeso(sale.customer.balanceAfterCentavos), width));
  }

  if (sale.voidedAt) {
    lines.push(center("*** VOIDED ***", width));
    if (sale.voidReason) lines.push(...wrap(`Reason: ${sale.voidReason}`, width));
  }

  lines.push(rule);
  lines.push(center("Salamat po!", width));
  return lines;
}
