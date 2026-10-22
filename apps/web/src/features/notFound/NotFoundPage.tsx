import { Link } from "react-router";
import { BrandMark } from "../../components/BrandMark";

/** Any address the app does not know: say so, and offer the way home. */
export function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-12 text-text">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <BrandMark size={64} className="text-accent" />
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="text-muted">There is nothing at this address. The link may be old, or it may have a typo.</p>
        <Link to="/" className="inline-flex min-h-12 items-center rounded-control bg-accent px-6 font-medium text-accent-ink">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
