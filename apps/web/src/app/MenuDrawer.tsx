import type { Role } from "@sari/shared";
import { LogOut, Settings, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import { isActive, navItems } from "./nav";
import { Brand } from "./SideRail";

type Props = { open: boolean; role: Role; onClose: () => void; onSignOut: () => void };

/** Phones: the rail's sections in a drawer from the top bar. Escape, the backdrop or a link closes it. */
export function MenuDrawer({ open, role, onClose, onSignOut }: Props) {
  const { pathname } = useLocation();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const row = "flex min-h-11 items-center gap-3 rounded-control px-3 py-2.5 text-base transition-colors";
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div aria-hidden className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col rounded-r-3xl bg-surface p-5">
        <div className="flex items-center justify-between">
          <Brand />
          <button ref={closeButton} type="button" aria-label="Close menu" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-raised">
            <X aria-hidden size={20} />
          </button>
        </div>
        <nav aria-label="Main" className="mt-6 flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-1">
            {navItems(role).map((item) => {
              const active = isActive(item, pathname);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    onClick={onClose}
                    className={`${row} ${active ? "bg-accent text-accent-ink" : "text-text hover:bg-raised"}`}
                  >
                    <Icon aria-hidden size={20} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mt-4 flex flex-col gap-1 border-t border-raised pt-4">
          <Link to="/app/settings" onClick={onClose} className={`${row} text-text hover:bg-raised`}>
            <Settings aria-hidden size={20} />
            Settings
          </Link>
          <button type="button" onClick={onSignOut} className={`${row} text-left text-text hover:bg-raised`}>
            <LogOut aria-hidden size={20} />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
