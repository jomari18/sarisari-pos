import type { DemoLogins, StoreView, UserView } from "@sari/shared";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError, api } from "../api/client";
import { setSession } from "../auth/session";

type DemoStart = { accessToken: string; user: UserView; store: StoreView; demoLogins: DemoLogins; expiresAt: string };
type Problem = { message: string; signIn: boolean };

const OPENING = "Opening your store… (the free server takes up to a minute to wake up)";

/**
 * Spec 3.1: waits for the sleeping API, then opens one demo store, signs the visitor in as its owner with
 * the demo logins kept on the device, and shows the dashboard with those logins.
 */
export function TryDemoButton({ waitForServer, className = "" }: { waitForServer: () => Promise<boolean>; className?: string }) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // A second click while the store is being made must not make a second store.
  const starting = useRef(false);

  async function start() {
    if (starting.current) return;
    starting.current = true;
    setOpening(true);
    setProblem(null);
    try {
      if (!(await waitForServer())) {
        setProblem({ message: "The store server is taking long to wake up. Try again in a minute.", signIn: false });
        return;
      }
      const demo = await api<DemoStart>("/demo", { method: "POST" });
      setSession({ accessToken: demo.accessToken, user: demo.user, store: demo.store, demoLogins: demo.demoLogins });
      navigate("/app", { state: { welcome: true } });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not open a demo store. Please try again.";
      setProblem({ message, signIn: err instanceof ApiError && err.code === "demo_limit" });
    } finally {
      starting.current = false;
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void start()}
        disabled={opening}
        aria-busy={opening}
        className={`min-h-14 rounded-control bg-accent px-7 text-lg font-medium text-accent-ink transition-opacity disabled:opacity-80 ${className}`}
      >
        {opening ? OPENING : "Try the demo"}
      </button>
      {problem && (
        <p role="alert" className="max-w-md text-sm text-warning">
          {problem.message}{" "}
          {problem.signIn && (
            <Link to="/login" className="font-medium text-accent underline underline-offset-2">
              Sign in
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
