import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, useMatches, type UIMatch } from "react-router";
import { refreshSession } from "../api/client";
import { deviceRecord, getNotice, getSession, setSession, storeHasEnded, useSession } from "../auth/session";
import { DemoBanner } from "../features/demo/DemoBanner";
import { startSyncLoop } from "../offline/syncEngine";
import { useSignOut } from "../offline/useSignOut";
import { MenuDrawer } from "./MenuDrawer";
import { SideRail } from "./SideRail";
import { TopBar } from "./TopBar";

export type RouteHandle = { title?: string };

/** The deepest matched route's title. */
function pageTitle(matches: UIMatch[]): string {
  for (const match of [...matches].reverse()) {
    const title = (match.handle as RouteHandle | undefined)?.title;
    if (title) return title;
  }
  return "SariSari POS";
}

/**
 * After a reload only the device record is left: try the refresh cookie before sending anyone to sign in.
 * With no connection the device opens from what it remembers, to keep selling into the queue (spec 7.3).
 */
function useRestoredSession(): boolean {
  const [restoring, setRestoring] = useState(() => getSession() === null && getNotice() === null && deviceRecord() !== null);
  useEffect(() => {
    if (!restoring) return;
    let live = true;
    void refreshSession()
      .then((outcome) => {
        const record = deviceRecord();
        if (outcome === "offline" && record && !storeHasEnded()) setSession({ accessToken: null, ...record });
      })
      .finally(() => {
        if (live) setRestoring(false);
      });
    return () => {
      live = false;
    };
  }, [restoring]);
  return restoring;
}

/** The signed-in app: rail (or drawer on phones), top bar and the current screen. */
export function AppShell() {
  const session = useSession();
  const restoring = useRestoredSession();
  const client = useQueryClient();
  const title = pageTitle(useMatches());
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const { signOut, warning } = useSignOut();
  const signedInAs = session?.user.id;

  // While someone is signed in, queued sales keep moving (spec 9); what they changed loads again once sent.
  useEffect(() => {
    if (!signedInAs) return;
    return startSyncLoop({
      onSynced: () => {
        for (const key of ["catalog", "sales", "reports", "review", "products", "product", "movements", "ledger", "customers"]) {
          void client.invalidateQueries({ queryKey: [key] });
        }
      },
    });
  }, [signedInAs, client]);

  useEffect(() => {
    document.title = `${title} · SariSari POS`;
  }, [title]);

  if (restoring) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg text-muted">
        <p role="status">Opening your store…</p>
      </main>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  const { role } = session.user;
  return (
    <div className="flex min-h-dvh bg-bg text-text">
      <SideRail role={role} onSignOut={signOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} session={session} onOpenMenu={() => setMenuOpen(true)} />
        <main className="flex-1 px-4 pb-10 md:px-8">
          <div className="mb-4 lg:hidden">
            <DemoBanner />
          </div>
          <Outlet />
        </main>
      </div>
      <MenuDrawer open={menuOpen} role={role} onClose={closeMenu} onSignOut={signOut} />
      {warning}
    </div>
  );
}
