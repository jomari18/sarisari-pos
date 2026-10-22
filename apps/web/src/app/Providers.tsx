import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Outlet, ScrollRestoration, type Location } from "react-router";

// Every fresh page load is the history entry "default", so those are told apart by their path.
const scrollKey = (location: Location) => (location.key === "default" ? location.pathname : location.key);

/** The root route: one query cache per app (and per test router), so nothing leaks between them. */
export function Providers() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // The API answers 4xx on purpose; only a lost connection is worth one more try.
          // "always": offline, a read still runs and fails fast (or the catalog falls back to its snapshot) instead of waiting paused.
          queries: { networkMode: "always", retry: (failures, error) => failures < 1 && (error as { status?: number }).status === 0, refetchOnWindowFocus: false },
          mutations: { networkMode: "always" },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {/* A new page opens at its top (Back returns to where it was); a page changing its own query string opts out. */}
      <ScrollRestoration getKey={scrollKey} />
      <Outlet />
    </QueryClientProvider>
  );
}
