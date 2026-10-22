import { WifiOff } from "lucide-react";

/** Spec 9: utang payments, product edits and stock changes need the server; they say so while offline. */
export function NeedsInternet() {
  return (
    <p className="flex items-center gap-2 text-sm text-warning">
      <WifiOff aria-hidden size={16} />
      Needs internet
    </p>
  );
}
