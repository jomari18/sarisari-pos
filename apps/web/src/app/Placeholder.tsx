/** Stands in for a screen that a later step of the plan builds. The top bar already shows its title. */
export function ScreenPlaceholder() {
  return <section className="rounded-card bg-surface p-6 text-muted">This screen is on its way.</section>;
}

/** Stands in for a page outside the signed-in app (landing, login, credits) until its step is built. */
export function PagePlaceholder({ title }: { title: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6 text-text">
      <div className="text-center">
        <h1 className="text-2xl font-medium">{title}</h1>
        <p className="mt-2 text-muted">This page is on its way.</p>
      </div>
    </main>
  );
}
