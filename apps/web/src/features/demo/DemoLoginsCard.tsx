import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, loginWith } from "../../api/client";
import { useSession } from "../../auth/session";

function Login({ who, username, secretLabel, secret }: { who: string; username: string; secretLabel: string; secret: string }) {
  return (
    <div className="rounded-control bg-raised px-4 py-3">
      <p className="text-sm font-medium">{who}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Username</dt>
        <dd className="font-mono select-all">{username}</dd>
        <dt className="text-muted">{secretLabel}</dt>
        <dd className="font-mono select-all">{secret}</dd>
      </dl>
    </div>
  );
}

/**
 * The demo store's two logins, kept on this device (spec 7.5), and a one-tap switch between the owner's
 * view and the bantay's.
 */
export function DemoLoginsCard() {
  const session = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logins = session?.demoLogins;
  if (!session || !logins) return null;

  const asBantay = session.user.role === "BANTAY";
  async function switchRole() {
    setBusy(true);
    setError(null);
    try {
      if (asBantay) await loginWith(logins!.owner.username, logins!.owner.password);
      else await loginWith(logins!.bantay.username, logins!.bantay.pin);
      // Straight to the new role's home: "/app" would cut off the bantay's own redirect to the POS mid-way and
      // leave them on an empty page.
      navigate(asBantay ? "/app" : "/app/pos");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not switch. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="demo-logins-title" className="rounded-card bg-surface p-5">
      <h2 id="demo-logins-title" className="text-lg font-medium">
        Demo logins
      </h2>
      <p className="mt-1 text-sm text-muted">Kept on this device so you can try both roles.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Login who="Owner (may-ari)" username={logins.owner.username} secretLabel="Password" secret={logins.owner.password} />
        <Login who="Bantay" username={logins.bantay.username} secretLabel="PIN" secret={logins.bantay.pin} />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={switchRole}
        className="mt-4 min-h-11 rounded-control bg-accent px-5 font-medium text-accent-ink transition-opacity disabled:opacity-60"
      >
        {asBantay ? "Switch to owner" : "Switch to bantay"}
      </button>
    </section>
  );
}
