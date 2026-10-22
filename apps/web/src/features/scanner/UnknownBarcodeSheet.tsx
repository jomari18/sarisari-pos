import { Link } from "react-router";
import { Dialog } from "../../components/Dialog";

/**
 * Spec 10: a code that matches no product. The owner adds it to the products with the barcode filled in;
 * the bantay sells it as a custom item, which the owner sees in "Needs review".
 */
export function UnknownBarcodeSheet({ code, isOwner, onCustom, onClose }: { code: string; isOwner: boolean; onCustom: () => void; onClose: () => void }) {
  return (
    <Dialog title="Not in your products" onClose={onClose}>
      <p className="mt-3 text-muted">
        No product has the barcode <span className="font-mono text-text">{code}</span>.
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="min-h-12 rounded-control px-5 text-muted hover:text-text">
          Close
        </button>
        {isOwner ? (
          <Link to={`/app/products/new?${new URLSearchParams({ barcode: code })}`} className="inline-flex min-h-12 items-center rounded-control bg-accent px-6 font-medium text-accent-ink">
            Add product
          </Link>
        ) : (
          <button type="button" onClick={onCustom} className="min-h-12 rounded-control bg-accent px-6 font-medium text-accent-ink">
            Sell as custom item
          </button>
        )}
      </div>
    </Dialog>
  );
}
