import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";

/** The reference's "‹ Title" step back to the list a screen belongs to. */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center gap-1 self-start rounded-control pr-3 text-muted hover:text-text">
      <ChevronLeft aria-hidden size={18} />
      {label}
    </Link>
  );
}
