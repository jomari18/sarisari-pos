import { formatPeso } from "@sari/shared";
import { useEffect, useId, useState } from "react";
import { Dialog } from "../components/Dialog";
import { manilaStamp } from "../lib/format";
import type { QueuedSale } from "./db";
import { failedSales, onOutboxChange, removeSale, retrySale } from "./outbox";
import { useSyncStatus } from "./status";
import { flush } from "./syncEngine";

const METHODS = { CASH: "Cash", GCASH: "GCash", UTANG: "Utang" } as const;

/**
 * Sales the server refused (spec 9): they stay on this device with the reason, to send again after the
 * problem is fixed, or to remove after a confirmation.
 */
export function CouldntSyncList({ className = "" }: { className?: string }) {
  const titleId = useId();
  const { failed } = useSyncStatus();
  const [rows, setRows] = useState<QueuedSale[]>([]);
  const [removing, setRemoving] = useState<QueuedSale | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => void failedSales().then((next) => live && setRows(next));
    load();
    const stop = onOutboxChange(load);
    return () => {
      live = false;
      stop();
    };
  }, [failed]);

  async function tryAgain(row: QueuedSale) {
    await retrySale(row.id);
    await flush().catch(() => undefined);
  }

  async function remove() {
    if (!removing) return;
    await removeSale(removing.id);
    setRemoving(null);
  }

  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className={`flex flex-col gap-3 rounded-card border border-danger/50 bg-surface p-5 ${className}`}>
      <div>
        <h2 id={titleId} className="text-lg font-medium text-danger">
          Couldn't sync
        </h2>
        <p className="text-sm text-muted">The server refused these sales, so they are not recorded. Send them again once fixed, or remove them.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 rounded-control bg-raised px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{`${manilaStamp(row.sale.soldAt)} · ${formatPeso(row.sale.totalCentavos)} · ${METHODS[row.sale.payment.method]}`}</p>
              <p className="text-sm text-danger">{row.error?.message ?? "The server refused this sale."}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => void tryAgain(row)} className="min-h-11 rounded-control bg-surface px-4 text-sm font-medium">
                Try again
              </button>
              <button type="button" onClick={() => setRemoving(row)} className="min-h-11 rounded-control px-4 text-sm font-medium text-danger hover:bg-surface">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {removing && (
        <Dialog title="Remove this sale?" onClose={() => setRemoving(null)}>
          <p className="mt-3 text-muted">{`The ${formatPeso(removing.sale.totalCentavos)} sale from ${manilaStamp(removing.sale.soldAt)} was never recorded. Removing it means it will not count in sales or stock.`}</p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => setRemoving(null)} className="min-h-12 rounded-control px-5 text-muted hover:text-text">
              Keep it
            </button>
            <button type="button" onClick={() => void remove()} className="min-h-12 rounded-control bg-danger px-6 font-medium text-accent-ink">
              Remove sale
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
