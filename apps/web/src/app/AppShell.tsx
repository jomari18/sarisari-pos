import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, useMatches, useNavigate, type UIMatch } from "react-router";
import { logout, refreshSession } from "../api/client";
import { clearSession, deviceRecord, getNotice, getSession, useSession } from "../auth/session";
import { DemoBanner } from "../features/demo/DemoBanner";
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

/** After a reload only the device record is left: try the refresh cookie before sending anyone to sign in. */
function useRestoredSession(): boolean {
  const [restoring, setRestoring] = useState(() => getSession() === null && getNotice() === null && deviceRecord() !== null);
  useEffect(() => {
    if (!restoring) return;
    let live = true;
    void refreshSession().finally(() => {
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
  const navigate = useNavigate();
  const title = pageTitle(useMatches());
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const signOut = useCallback(() => {
    void logout().then(() => {
      clearSession();
      navigate("/login", { replace: true });
    });
  }, [navigate]);

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
    </div>
  );
}
