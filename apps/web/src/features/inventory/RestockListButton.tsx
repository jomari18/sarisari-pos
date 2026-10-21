import type { ProductView } from "@sari/shared";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { ApiError, api } from "../../api/client";

/** What happened, for the page to show; `manualText` when the browser refused the clipboard, so it can be copied by hand. */
export type RestockListResult = { message: string; manualText?: string };

/** Copies the products at or below their reorder level as plain text, ready to send to the supplier (spec 8.3). */
export function RestockListButton({ onResult, className = "" }: { onResult: (result: RestockListResult) => void; className?: string }) {
  const [busy, setBusy] = useState(false);

  async function copy() {
    setBusy(true);
    try {
      const list = await api<{ items: ProductView[]; text: string }>("/stock/restock-list");
      if (list.items.length === 0) return onResult({ message: "Nothing is at or below its reorder level." });
      try {
        await navigator.clipboard.writeText(list.text);
        onResult({ message: "Restock list copied." });
      } catch {
        onResult({ message: "This browser blocked copying. Select the list below and copy it.", manualText: list.text });
      }
    } catch (err) {
      onResult({ message: err instanceof ApiError ? err.message : "Could not load the restock list. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={() => void copy()} disabled={busy} className={`gap-2 transition-opacity disabled:opacity-60 ${className}`}>
      <ClipboardList aria-hidden size={18} />
      Copy restock list
    </button>
  );
}
