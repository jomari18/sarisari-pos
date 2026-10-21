import { receiptLines, type SaleView } from "@sari/shared";
import { Printer, Share2 } from "lucide-react";
import { useState } from "react";
import "./print.css";
import { renderReceiptPng, shareReceipt } from "./receiptPng";

type Props = { sale: SaleView; storeName: string; queued: boolean; onNewSale: () => void };

const fileName = (sale: SaleView) =>
  sale.receiptNo === null ? `receipt-${sale.id.slice(0, 6)}.png` : `receipt-${String(sale.receiptNo).padStart(4, "0")}.png`;

/**
 * The receipt (spec 10): the same 32-character text the 58 mm printer gets, with Print and Share. A sale
 * still in the offline queue says "Pending sync" and shows a short code instead of the receipt number.
 */
export function ReceiptView({ sale, storeName, queued, onNewSale }: Props) {
  const lines = receiptLines(sale, { name: storeName });
  const [note, setNote] = useState<string | null>(null);

  async function share() {
    try {
      const outcome = await shareReceipt(await renderReceiptPng(lines), fileName(sale));
      setNote(outcome === "shared" ? "Receipt shared." : "Receipt image saved.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not share the receipt.");
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {queued && <p className="self-start rounded-full bg-raised px-3 py-1 text-sm text-warning">Pending sync</p>}
      <pre className="receipt-print overflow-x-auto rounded-card bg-white px-5 py-4 font-mono text-[13px] leading-snug text-[#111315]">{lines.join("\n")}</pre>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => window.print()} className="flex min-h-12 items-center gap-2 rounded-control bg-raised px-4">
          <Printer aria-hidden size={18} />
          Print
        </button>
        <button type="button" onClick={share} className="flex min-h-12 items-center gap-2 rounded-control bg-raised px-4">
          <Share2 aria-hidden size={18} />
          Share
        </button>
        <button type="button" onClick={onNewSale} className="ml-auto min-h-12 rounded-control bg-accent px-6 font-medium text-accent-ink">
          New sale
        </button>
      </div>
      {note && (
        <p role="status" className="text-sm text-muted">
          {note}
        </p>
      )}
    </div>
  );
}
