import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Outlet } from "react-router";

/** The root route: one query cache per app (and per test router), so nothing leaks between them. */
export function Providers() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // The API answers 4xx on purpose; only a lost connection is worth one more try.
          queries: { retry: (failures, error) => failures < 1 && (error as { status?: number }).status === 0, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Outlet />
    </QueryClientProvider>
  );
}
