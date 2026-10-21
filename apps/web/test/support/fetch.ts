import { vi } from "vitest";

export type Call = { method: string; url: string; headers: Headers; body?: string };

/** Replaces fetch with a handler and records every request. */
export function mockFetch(handler: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const call: Call = {
        method: init.method ?? "GET",
        url: String(input),
        headers: new Headers(init.headers),
        body: typeof init.body === "string" ? init.body : undefined,
      };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const apiError = (status: number, code: string, message: string, extra: Record<string, string> = {}) =>
  json(status, { error: { code, message, ...extra } });

export const store = { id: "s1", code: "7k2f", name: "Tindahan ni Mang Ben", expiresAt: new Date(Date.now() + 23.5 * 3600_000).toISOString() };
export const owner = { id: "u1", role: "OWNER", username: "mayari.7k2f", displayName: "Mang Ben" } as const;
export const bantay = { id: "u2", role: "BANTAY", username: "nena.7k2f", displayName: "Nena" } as const;
export const demoLogins = { owner: { username: "mayari.7k2f", password: "Xy7kPq2mRt8vNw4z" }, bantay: { username: "nena.7k2f", pin: "482915" } };
