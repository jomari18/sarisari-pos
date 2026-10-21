import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "../../auth/session";

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** "Demo store, deleted in 23 h": whole hours, then minutes in the last hour (spec 7.5: stores last 24 h). */
export function timeLeftLabel(expiresAt: string, now: number): string {
  const left = Date.parse(expiresAt) - now;
  if (left <= 0) return "Demo store has ended";
  if (left >= HOUR) return `Demo store, deleted in ${Math.floor(left / HOUR)} h`;
  return `Demo store, deleted in ${Math.max(1, Math.floor(left / MINUTE))} min`;
}

export function DemoBanner() {
  const session = useSession();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE);
    return () => window.clearInterval(timer);
  }, []);
  if (!session) return null;
  return (
    <p className="inline-flex items-center gap-2 rounded-full bg-raised px-3 py-1.5 text-xs text-muted">
      <Clock aria-hidden size={14} />
      {timeLeftLabel(session.store.expiresAt, now)}
    </p>
  );
}
