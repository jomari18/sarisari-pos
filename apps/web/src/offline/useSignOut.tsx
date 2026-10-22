import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { logout } from "../api/client";
import { clearSession } from "../auth/session";
import { Dialog } from "../components/Dialog";
import { clearDevice, deviceQueueCount, onOutboxChange } from "./outbox";

/**
 * Logging out (spec 7.2): the session ends on the server and the device forgets its catalog and queue, after
 * a warning when sales are still waiting to sync. Render `warning` where the hook is used.
 */
export function useSignOut(): { signOut: () => void; warning: ReactNode } {
  const navigate = useNavigate();
  const [queued, setQueued] = useState<number | null>(null);

  async function finish() {
    setQueued(null);
    await logout();
    await clearDevice();
    clearSession();
    navigate("/login", { replace: true });
  }

  async function signOut() {
    const count = await deviceQueueCount();
    if (count > 0) setQueued(count);
    else await finish();
  }

  const warning =
    queued === null ? null : (
      <Dialog title={`${queued} ${queued === 1 ? "sale" : "sales"} not yet synced`} onClose={() => setQueued(null)}>
        <p className="mt-3 text-muted">
          Logging out removes them from this device and they will never be recorded. Stay signed in and connect to the internet to send them first.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setQueued(null)} className="min-h-12 rounded-control bg-accent px-6 font-medium text-accent-ink">
            Stay signed in
          </button>
          <button type="button" onClick={() => void finish()} className="min-h-12 rounded-control px-5 font-medium text-danger hover:bg-raised">
            Log out anyway
          </button>
        </div>
      </Dialog>
    );
  return { signOut: () => void signOut(), warning };
}

/** How many sales this device still holds, for the login page (spec 7.3: sign in again to send them). */
export function useDeviceQueue(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      void deviceQueueCount()
        .then((next) => live && setCount(next))
        .catch(() => live && setCount(0));
    load();
    const stop = onOutboxChange(load);
    return () => {
      live = false;
      stop();
    };
  }, []);
  return count;
}
