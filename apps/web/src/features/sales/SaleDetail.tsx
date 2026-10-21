import type { SaleFlag, SaleView } from "@sari/shared";
import { useState } from "react";
import { useSession } from "../../auth/session";
import { Dialog } from "../../components/Dialog";
import { ReceiptView } from "../receipt/ReceiptView";
import { VoidDialog } from "./VoidDialog";

/** What each review flag means, in the store's words (spec 6). */
export const FLAG_LABELS: Record<SaleFlag, string> = {
  NEGATIVE_STOCK: "Stock went below zero",
  OVER_CREDIT_LIMIT: "Over the credit limit",
  PRICE_CHANGED: "Price changed while offline",
  CUSTOM_ITEM: "Custom item",
  CLOCK_ADJUSTED: "Phone clock was off",
};

export const saleTitle = (sale: SaleView) => (sale.receiptNo === null ? "Pending sale" : `Sale No. ${sale.receiptNo}`);

/** A recorded sale with its receipt; the owner can void it from here (spec 6, rule 7). */
export function SaleDetail({ sale, onClose, onVoided }: { sale: SaleView; onClose: () => void; onVoided: (sale: SaleView) => void }) {
  const session = useSession();
  const [voiding, setVoiding] = useState(false);
  const canVoid = session?.user.role === "OWNER" && !sale.voidedAt;
  const title = voiding ? `Void sale No. ${sale.receiptNo}?` : saleTitle(sale);

  return (
    <Dialog title={title} onClose={onClose} wide>
      {voiding ? (
        <VoidDialog
          sale={sale}
          onCancel={() => setVoiding(false)}
          onVoided={(voided) => {
            setVoiding(false);
            onVoided(voided);
          }}
        />
      ) : (
        <>
          {sale.voidedAt && <p className="mt-4 rounded-control bg-raised px-4 py-3 text-warning">{`Voided: ${sale.voidReason ?? ""}`}</p>}
          {sale.flags.length > 0 && (
            <ul aria-label="Flags" className="mt-4 flex flex-wrap gap-2">
              {sale.flags.map((flag) => (
                <li key={flag} className="rounded-full bg-raised px-3 py-1 text-sm text-warning">
                  {FLAG_LABELS[flag]}
                </li>
              ))}
            </ul>
          )}
          <ReceiptView sale={sale} storeName={session?.store.name ?? ""} queued={false} />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {canVoid && (
              <button type="button" onClick={() => setVoiding(true)} className="min-h-12 rounded-control px-5 font-medium text-danger hover:bg-raised">
                Void sale
              </button>
            )}
            <button type="button" onClick={onClose} className="min-h-12 rounded-control bg-raised px-6 font-medium">
              Close
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
