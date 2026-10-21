import type { ApiError } from "../api/client";

/** A read that failed: the API's own message and a way to try again. */
export function LoadProblem({ error, retry }: { error: ApiError | null; retry: () => unknown }) {
  return (
    <div role="alert" className="rounded-card bg-surface p-6">
      <p>{error?.message ?? "Something went wrong. Please try again."}</p>
      <button type="button" onClick={() => void retry()} className="mt-4 min-h-11 rounded-control bg-raised px-5 font-medium">
        Try again
      </button>
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return <p className="rounded-card bg-surface p-6 text-muted">Loading {what}…</p>;
}
