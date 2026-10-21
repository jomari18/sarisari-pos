import { useId, type ReactNode } from "react";

export const inputClass = "h-12 w-full rounded-control bg-raised px-4 text-text placeholder:text-muted aria-invalid:outline-2 aria-invalid:outline-danger";

type Control = { id: string; "aria-describedby"?: string; "aria-invalid"?: true };

/** A labelled control whose error (or hint) is its accessible description (spec 11.6: labels on every control). */
export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: (control: Control) => ReactNode }) {
  const id = useId();
  const describedBy = error || hint ? `${id}-note` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, ...(error ? { "aria-invalid": true as const } : {}) })}
      {(error || hint) && (
        <p id={describedBy} className={`text-sm ${error ? "text-danger" : "text-muted"}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
