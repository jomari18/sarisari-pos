import { LogOut, UserRound } from "lucide-react";
import { useId } from "react";
import { setTheme, useTheme, type Theme } from "../../app/ThemeToggle";
import { initials } from "../../app/TopBar";
import { useSession } from "../../auth/session";
import { useSignOut } from "../../offline/useSignOut";
import { DemoLoginsCard } from "../demo/DemoLoginsCard";

const THEMES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

/** Settings (spec 11.3; reference "Profile"): who is signed in, the store, the theme, demo logins and log out. */
export function SettingsPage() {
  const session = useSession();
  const theme = useTheme();
  const { signOut, warning } = useSignOut();
  const infoId = useId();
  const themeId = useId();
  if (!session) return null;
  const { user, store } = session;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Settings" className="flex flex-col gap-2 rounded-card bg-surface p-4">
        <p className="flex min-h-11 items-center gap-3 rounded-control bg-accent px-4 font-medium text-accent-ink">
          <UserRound aria-hidden size={18} />
          My profile
        </p>
        <button type="button" onClick={signOut} className="flex min-h-11 items-center gap-3 rounded-control px-4 text-left hover:bg-raised">
          <LogOut aria-hidden size={18} />
          Log out
        </button>
      </nav>

      <div className="flex flex-col gap-6">
        <section aria-labelledby={infoId} className="flex flex-col gap-5 rounded-card bg-surface p-5 sm:p-6">
          <h2 id={infoId} className="text-xl font-medium">
            Personal information
          </h2>
          <div className="flex items-center gap-4">
            <span aria-hidden className="grid size-16 place-items-center rounded-full bg-accent text-xl font-semibold text-accent-ink">
              {initials(user.displayName)}
            </span>
            <div>
              <p className="text-lg font-medium">{user.displayName}</p>
              <p className="text-accent">{user.role === "OWNER" ? "Owner" : "Bantay"}</p>
            </div>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-control bg-raised px-4 py-3">
              <dt className="text-sm text-muted">Username</dt>
              <dd className="font-mono">{user.username}</dd>
            </div>
            <div className="rounded-control bg-raised px-4 py-3">
              <dt className="text-sm text-muted">Store</dt>
              <dd>{`${store.name} (${store.code})`}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby={themeId} className="flex flex-col gap-4 rounded-card bg-surface p-5 sm:p-6">
          <h2 id={themeId} className="text-xl font-medium">
            Theme
          </h2>
          <div role="radiogroup" aria-labelledby={themeId} className="grid max-w-md grid-cols-2 gap-2">
            {THEMES.map(({ value, label }) => (
              <label key={value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-transparent bg-raised px-4 has-checked:border-text">
                <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} className="size-4 accent-accent" />
                {label}
              </label>
            ))}
          </div>
        </section>

        <DemoLoginsCard />
      </div>
      {warning}
    </div>
  );
}
