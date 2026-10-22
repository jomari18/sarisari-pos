import { useSyncStatus } from "./status";

const TONES = { online: "bg-success", offline: "bg-warning", syncing: "bg-accent" } as const;

/** The header's connection badge (spec 9): "Online", "Offline: sales will sync" or "Syncing 3 sales…". */
export function SyncBadge() {
  const { state, pending } = useSyncStatus();
  const text = state === "offline" ? "Offline: sales will sync" : state === "syncing" ? `Syncing ${pending} ${pending === 1 ? "sale" : "sales"}…` : "Online";
  return (
    <p role="status" className="flex items-center gap-2 text-xs text-muted">
      <span aria-hidden className={`size-2 rounded-full ${TONES[state]}`} />
      {text}
    </p>
  );
}
