import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

/** The theme lives on <html data-theme> and in localStorage "sari-theme" (read by public/theme-init.js). */
export const THEME_KEY = "sari-theme";

const listeners = new Set<() => void>();
const currentTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The choice still applies for this visit.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, currentTheme, () => "dark" as const) === "dark";
  return (
    <button
      type="button"
      aria-label="Dark theme"
      aria-pressed={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={`grid size-11 place-items-center rounded-full bg-raised text-text transition-colors hover:bg-raised/70 ${className}`}
    >
      {dark ? <Moon aria-hidden size={20} /> : <Sun aria-hidden size={20} />}
    </button>
  );
}
