import { demoBarcodes } from "@sari/shared";
import { Printer, ScanBarcode } from "lucide-react";
import { Link } from "react-router";
import { Ean13Svg } from "./Ean13Svg";

/**
 * Spec 10: the demo products' barcodes, to scan from another screen. Every demo store gets these same codes
 * (in-store prefix 2, so none is a real product), so the page needs no sign-in and no server.
 */
export function SampleBarcodesPage() {
  const codes = demoBarcodes();
  return (
    <main className="min-h-dvh bg-bg px-4 py-10 text-text md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-medium">Sample barcodes</h1>
            <p className="mt-2 max-w-2xl text-muted">
              Open the POS on your phone, tap <span className="whitespace-nowrap text-text">Scan</span> and point the camera at a code on this screen. These are the
              products every ZariZari demo store starts with.
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-control bg-surface px-4 font-medium">
              <Printer aria-hidden size={18} />
              Print
            </button>
            <Link to="/app/pos" className="inline-flex min-h-11 items-center gap-2 rounded-control bg-accent px-5 font-medium text-accent-ink">
              <ScanBarcode aria-hidden size={18} />
              Open the POS
            </Link>
          </div>
        </header>
        <ul aria-label="Demo products" className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
          {codes.map((item) => (
            <li key={item.barcode} className="flex break-inside-avoid flex-col gap-3 rounded-card bg-white p-4 text-[#111315]">
              <div>
                <p className="font-medium leading-snug">{item.name}</p>
                <p className="text-sm text-[#5B6066]">{[item.brand, item.category].filter(Boolean).join(" · ")}</p>
              </div>
              <Ean13Svg code={item.barcode} className="w-full" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
