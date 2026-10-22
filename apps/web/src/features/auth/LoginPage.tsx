import { Eye, EyeOff, Store } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ApiError, loginWith } from "../../api/client";
import { getNotice, storeHasEnded, useSession } from "../../auth/session";
import { StoreEndedScreen } from "../../offline/StoreEndedScreen";
import { useDeviceQueue } from "../../offline/useSignOut";

const field = "h-14 w-full rounded-control bg-raised px-5 text-base text-text placeholder:text-muted";

/** The reference's login card (spec 11.1), for the owner's password or a bantay's PIN. */
export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const ids = { username: useId(), secret: useId(), error: useId() };
  const notice = getNotice();
  const queued = useDeviceQueue() ?? 0;

  if (session) return <Navigate to="/app" replace />;
  // Review Focus 5: an ended demo store's queued sales can never be sent.
  if (queued > 0 && storeHasEnded()) return <StoreEndedScreen queued={queued} />;

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await loginWith(String(form.get("username") ?? "").trim(), String(form.get("secret") ?? ""));
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12 text-text">
      <Link to="/" className="flex items-center gap-3 text-accent">
        <Store aria-hidden size={44} />
        <span className="text-3xl font-semibold uppercase tracking-[0.08em] sm:text-5xl">ZariZari</span>
      </Link>

      <section className="mt-12 w-full max-w-[760px] rounded-[40px] bg-surface px-6 py-12 sm:mt-16 sm:px-28 sm:py-16">
        <h1 className="text-center text-4xl font-medium">Sign in</h1>
        <p className="mt-4 text-center text-muted">Use the owner&apos;s password or a bantay&apos;s PIN.</p>

        {notice && (
          <p role="status" className="mt-8 rounded-control bg-raised px-5 py-3 text-sm text-warning">
            {notice}
          </p>
        )}
        {queued > 0 && (
          // Spec 7.3: queued sales wait on the device until someone signs in again to send them.
          <p className="mt-4 rounded-control bg-raised px-5 py-3 text-sm">{`Sign in to send ${queued} queued ${queued === 1 ? "sale" : "sales"}.`}</p>
        )}

        <form className="mt-8 flex flex-col gap-6" onSubmit={signIn} aria-describedby={error ? ids.error : undefined}>
          <div className="flex flex-col gap-3">
            <label htmlFor={ids.username} className="text-sm font-medium">
              Username
            </label>
            <input
              id={ids.username}
              name="username"
              required
              minLength={3}
              maxLength={40}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Enter your username"
              className={field}
            />
          </div>
          <div className="flex flex-col gap-3">
            <label htmlFor={ids.secret} className="text-sm font-medium">
              Password or PIN
            </label>
            <div className="relative">
              <input
                id={ids.secret}
                name="secret"
                type={showSecret ? "text" : "password"}
                required
                minLength={6}
                maxLength={128}
                autoComplete="current-password"
                placeholder="Enter your password or PIN"
                className={`${field} pr-14`}
              />
              <button
                type="button"
                aria-label={showSecret ? "Hide password or PIN" : "Show password or PIN"}
                onClick={() => setShowSecret((shown) => !shown)}
                className="absolute inset-y-0 right-2 my-auto grid size-11 place-items-center rounded-full text-muted hover:text-text"
              >
                {showSecret ? <EyeOff aria-hidden size={20} /> : <Eye aria-hidden size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <p id={ids.error} role="alert" className="rounded-control bg-raised px-5 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mx-auto min-h-14 min-w-36 rounded-control bg-accent px-8 font-medium text-accent-ink transition-opacity disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-muted">
          No store yet?{" "}
          <Link to="/" className="text-accent underline underline-offset-4">
            Try the demo
          </Link>
        </p>
      </section>
    </main>
  );
}
