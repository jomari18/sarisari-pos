/** What the last action did ("Saved …"), announced politely. */
export function Notice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="status" className="rounded-control bg-raised px-4 py-3">
      {text}
    </p>
  );
}
