import { useNavigate } from "react-router";
import { clearSession } from "../auth/session";
import { clearDevice } from "./outbox";

/**
 * Review Focus 5: the demo store is gone, so its queued sales can never be sent. The device says so, and
 * either starts over with a new demo or just forgets the store.
 */
export function StoreEndedScreen({ queued }: { queued: number }) {
  const navigate = useNavigate();

  async function forget(to: string) {
    await clearDevice();
    clearSession();
    navigate(to, { replace: true });
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-12 text-text">
      <section className="flex w-full max-w-lg flex-col gap-4 rounded-card bg-surface p-8 text-center">
        <h1 className="text-2xl font-medium">This demo store has ended.</h1>
        <p className="text-muted">{`Unsynced sales can't be sent. ${queued} ${queued === 1 ? "sale stays" : "sales stay"} on this device until you clear it.`}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => void forget("/")} className="min-h-12 rounded-control bg-accent px-6 font-medium text-accent-ink">
            Start a new demo
          </button>
          <button type="button" onClick={() => void forget("/login")} className="min-h-12 rounded-control bg-raised px-6 font-medium">
            Clear this device
          </button>
        </div>
      </section>
    </main>
  );
}
