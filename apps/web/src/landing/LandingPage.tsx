import { NotebookPen, ScanBarcode, WifiOff, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { Link } from "react-router";
import { deviceRecord, storeHasEnded } from "../auth/session";
import { BrandMark } from "../components/BrandMark";
import { TindahanStage } from "./TindahanStage";
import { TryDemoButton } from "./TryDemoButton";
import { wakeApi } from "./wake";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ScanBarcode, title: "Point of sale", text: "Search, tap or scan. Cash with sukli, GCash or utang, and a receipt to print or share." },
  { icon: NotebookPen, title: "Utang ledger", text: "A credit limit for each suki, the oldest unpaid utang first, and a polite reminder to copy." },
  { icon: WifiOff, title: "Works offline", text: "No signal? Keep selling. Sales wait on the phone and sync once, in order, when it is back." },
];

const quietLink = "inline-flex min-h-11 items-center rounded-control px-3 text-muted hover:text-text";

/** The landing page (spec 3.1, 11.4): what ZariZari is, a one-click demo store, and the API waking up meanwhile. */
export function LandingPage() {
  const waking = useRef<Promise<boolean> | null>(null);
  // One wake-up for the whole visit: started on arrival, shared with the button; a timeout lets a click retry.
  const waitForServer = useCallback(() => {
    waking.current ??= wakeApi(import.meta.env.VITE_API_WAKE_URL || "/api/health").then((awake) => {
      if (!awake) waking.current = null;
      return awake;
    });
    return waking.current;
  }, []);
  useEffect(() => {
    void waitForServer();
  }, [waitForServer]);

  const returning = deviceRecord() !== null && !storeHasEnded();

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 md:px-8">
        <Link to="/" className="flex items-center gap-3 font-semibold uppercase tracking-[0.12em] text-accent">
          <BrandMark size={34} />
          ZariZari
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1">
          {/* On a phone the footer carries this one, so the header fits on one line. */}
          <Link to="/barcodes" className={`${quietLink} max-sm:hidden`}>
            Sample barcodes
          </Link>
          <Link to="/login" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control bg-surface px-4 font-medium">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-4 pb-16 pt-6 md:px-8 md:pt-12">
        <section aria-labelledby="landing-title" className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <h1 id="landing-title" className="text-4xl font-semibold leading-tight sm:text-5xl">
              <span className="mb-3 block text-base font-semibold uppercase tracking-[0.2em] text-accent">ZariZari</span>
              The point of sale for the neighborhood sari-sari store.
            </h1>
            <p className="max-w-xl text-lg text-muted">
              Sell by search or barcode, give the right sukli, keep the utang list, count the stock and see the day&apos;s numbers, on a phone and even
              offline.
            </p>
            <div className="flex flex-wrap items-start gap-3">
              <TryDemoButton waitForServer={waitForServer} />
              {returning && (
                <Link to="/app" className="inline-flex min-h-14 items-center rounded-control bg-surface px-6 text-lg font-medium">
                  Open your demo store
                </Link>
              )}
            </div>
            <p className="text-sm text-muted">A demo store with 60 products, 12 suki and a month of sales is yours for 24 hours. No sign-up.</p>
          </div>
          <TindahanStage />
        </section>

        <ul aria-label="Features" className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex flex-col gap-3 rounded-card bg-surface p-6">
              <span aria-hidden className="grid size-11 place-items-center rounded-full bg-accent text-accent-ink">
                <Icon size={20} />
              </span>
              <h2 className="text-lg font-medium">{title}</h2>
              <p className="text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="border-t border-raised">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-1 px-4 py-6 md:px-8">
          <Link to="/credits" className={quietLink}>
            Credits
          </Link>
          <Link to="/barcodes" className={quietLink}>
            Sample barcodes
          </Link>
          <Link to="/login" className={quietLink}>
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
