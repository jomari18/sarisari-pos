import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, useMatches, useNavigate, type UIMatch } from "react-router";
import { clearSession, useSession } from "../auth/session";
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

/** The signed-in app: rail (or drawer on phones), top bar and the current screen. */
export function AppShell() {
  const session = useSession();
  const navigate = useNavigate();
  const title = pageTitle(useMatches());
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const signOut = useCallback(() => {
    clearSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    document.title = `${title} · SariSari POS`;
  }, [title]);

  if (!session) return <Navigate to="/login" replace />;
  const { role } = session.user;
  return (
    <div className="flex min-h-dvh bg-bg text-text">
      <SideRail role={role} onSignOut={signOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} session={session} onOpenMenu={() => setMenuOpen(true)} />
        <main className="flex-1 px-4 pb-10 md:px-8">
          <Outlet />
        </main>
      </div>
      <MenuDrawer open={menuOpen} role={role} onClose={closeMenu} onSignOut={signOut} />
    </div>
  );
}
