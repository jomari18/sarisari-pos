import { MessageSquareText } from "lucide-react";
import { useState } from "react";
import { ApiError, api } from "../../api/client";
import { copyText } from "../../components/copyText";

/** Copies the API's polite reminder ("Hi Aling Rosa, paalala lang po…") to paste in a text or chat (spec 8.5). */
export function ReminderButton({ customerId }: { customerId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Shown when the browser refuses the clipboard, so the text can still be copied by hand.
  const [manual, setManual] = useState<string | null>(null);

  async function copy() {
    setBusy(true);
    setMessage(null);
    setManual(null);
    try {
      const { text } = await api<{ text: string }>(`/customers/${customerId}/reminder`);
      if (await copyText(text)) setMessage("Reminder copied. Paste it in a text or chat.");
      else {
        setManual(text);
        setMessage("This browser blocked copying. Select the reminder below and copy it.");
      }
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not get the reminder. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-5">
      <button
        type="button"
        onClick={() => void copy()}
        disabled={busy}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-raised px-5 font-medium transition-opacity disabled:opacity-60"
      >
        <MessageSquareText aria-hidden size={18} />
        Copy reminder
      </button>
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
      {manual && (
        <textarea
          readOnly
          aria-label="Reminder"
          value={manual}
          rows={3}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded-control bg-raised p-3 text-sm"
        />
      )}
    </div>
  );
}
