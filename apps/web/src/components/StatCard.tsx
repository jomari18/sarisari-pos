import type { LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

type Props = { title: string; value: string | null; note?: ReactNode; icon?: LucideIcon; children?: ReactNode };

/** The reference's stat card: a title, a big number, a small note, a round icon and room for a chart. */
export function StatCard({ title, value, note, icon: Icon, children }: Props) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex min-h-40 flex-col justify-between gap-4 rounded-card bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-muted">
            {title}
          </h2>
          <p className="mt-2 text-3xl font-semibold">{value ?? "…"}</p>
        </div>
        {Icon && (
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
            <Icon size={18} />
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        {note && <p className="text-sm text-muted">{note}</p>}
        {children}
      </div>
    </section>
  );
}
