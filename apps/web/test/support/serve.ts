import { json, mockFetch, type Call } from "./fetch";

export type Handler = (call: Call, url: URL) => Response | Promise<Response>;

const pathOf = (call: Call) => new URL(call.url, "http://localhost").pathname;

/** A fake API that answers by "METHOD /path" (the query is ignored); anything else gets 404. */
export function serveRoutes(handlers: Record<string, Handler>) {
  const calls = mockFetch((call) => {
    const url = new URL(call.url, "http://localhost");
    const handler = handlers[`${call.method} ${url.pathname}`];
    return handler ? handler(call, url) : json(404, { error: { code: "not_found", message: "Not found" } });
  });
  const matching = (method: string, path: string) => calls.filter((c) => c.method === method && pathOf(c) === path);
  return {
    calls,
    /** Every URL requested with this method and path, query included, oldest first. */
    urlsOf: (method: string, path: string) => matching(method, path).map((c) => c.url),
    /** The JSON bodies sent with this method and path, oldest first. */
    bodiesOf: (method: string, path: string) => matching(method, path).map((c) => JSON.parse(c.body ?? "null") as Record<string, unknown>),
  };
}
