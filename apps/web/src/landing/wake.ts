/**
 * Spec 3.1: Render's free plan sleeps and takes up to a minute to wake, so the landing page asks the API's
 * /health directly (not through Netlify) until it answers. True when the server is up, false at the timeout.
 */
export async function wakeApi(url: string, { timeoutMs = 90_000, intervalMs = 3_000 }: { timeoutMs?: number; intervalMs?: number } = {}): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // A sleeping instance holds the request while it boots; never wait past the deadline for it.
      const signal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(Math.max(1, deadline - Date.now())) : undefined;
      const res = await fetch(url, { cache: "no-store", credentials: "omit", signal });
      if (res.ok) return true;
    } catch {
      // Not up yet.
    }
    if (Date.now() + intervalMs >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
