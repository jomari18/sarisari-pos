import { Menu } from "lucide-react";
import type { Session } from "../auth/session";
import { DemoBanner } from "../features/demo/DemoBanner";
import { SyncBadge } from "../offline/SyncBadge";
import { ThemeToggle } from "./ThemeToggle";

/** "Mang Ben" → "MB", "Nena" → "N": the avatar letters everywhere a person is shown. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

/** The page title, as in the reference, with the store, the theme toggle and who is signed in on the right. */
export function TopBar({ title, session, onOpenMenu }: { title: string; session: Session; onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-bg/95 px-4 py-4 backdrop-blur md:static md:px-8 md:py-7">
      <button type="button" aria-label="Open menu" onClick={onOpenMenu} className="grid size-11 place-items-center rounded-full bg-raised md:hidden">
        <Menu aria-hidden size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-medium md:text-2xl">{title}</h1>
        <SyncBadge />
      </div>
      <div className="hidden lg:block">
        <DemoBanner />
      </div>
      <span className="hidden max-w-56 truncate text-sm text-muted sm:inline">{session.store.name}</span>
      <ThemeToggle />
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-ink" title={session.user.displayName}>
        <span aria-hidden>{initials(session.user.displayName)}</span>
        <span className="sr-only">
          Signed in as {session.user.displayName}, {session.user.role === "OWNER" ? "owner" : "bantay"}
        </span>
      </span>
    </header>
  );
}
