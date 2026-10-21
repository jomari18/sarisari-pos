import type { Role } from "@sari/shared";
import { LogOut, Settings, Store } from "lucide-react";
import { Link, useLocation } from "react-router";
import { isActive, navItems, type NavItem } from "./nav";

/** The reference layout's rail item: an icon in a circle over its label; the current one sits on the accent. */
export function RailLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`${RAIL_ITEM} ${active ? "bg-accent text-accent-ink" : "text-text hover:bg-raised"}`}
    >
      <span className={`${RAIL_ICON} ${active ? "bg-accent-ink text-accent" : "bg-text text-surface"}`}>
        <Icon aria-hidden size={15} strokeWidth={2.25} />
      </span>
      {item.label}
    </Link>
  );
}

// Eight owner sections must fit a laptop screen, so items get denser on short viewports.
const RAIL_ITEM =
  "flex flex-col items-center gap-1 rounded-card px-2 py-2 text-center text-[13px] leading-[18px] transition-colors [@media(max-height:820px)]:py-1.5";
const RAIL_ICON = "grid size-7 place-items-center rounded-full [@media(max-height:820px)]:size-6";

export function Brand() {
  return (
    <Link to="/app" aria-label="SariSari POS home" className="flex flex-col items-center gap-1 text-accent">
      <Store aria-hidden size={26} />
      <span className="text-sm font-semibold uppercase tracking-[0.14em]">SariSari</span>
    </Link>
  );
}

const settingsItem: NavItem = { to: "/app/settings", label: "Settings", icon: Settings, match: ["/app/settings"] };

/** Desktop and tablet navigation (spec 11.1): a 140 px rail on the left; phones use the menu drawer instead. */
export function SideRail({ role, onSignOut }: { role: Role; onSignOut: () => void }) {
  const { pathname } = useLocation();
  return (
    // The whole rail scrolls on very short screens; the gutter on both edges keeps the items centred.
    <aside className="sticky top-0 hidden h-dvh w-[140px] shrink-0 flex-col items-center overflow-y-auto rounded-r-3xl bg-surface py-6 [scrollbar-gutter:stable_both-edges] [scrollbar-width:thin] md:flex">
      <Brand />
      <nav aria-label="Main" className="mt-6 w-full flex-1">
        <ul className="flex flex-col items-center">
          {navItems(role).map((item, i) => (
            <li key={item.to} className={`w-[116px] ${i > 0 ? "mt-1 border-t border-raised pt-1" : ""}`}>
              <RailLink item={item} active={isActive(item, pathname)} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-4 flex w-[116px] flex-col gap-1">
        <RailLink item={settingsItem} active={isActive(settingsItem, pathname)} />
        <button type="button" onClick={onSignOut} className={`${RAIL_ITEM} text-text hover:bg-raised`}>
          <span className={RAIL_ICON}>
            <LogOut aria-hidden size={20} />
          </span>
          Log out
        </button>
      </div>
    </aside>
  );
}
