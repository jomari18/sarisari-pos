import type { Request } from "express";

/** The visitor's IP. Only meaningful after `requireProxySignature`, because the headers come from Netlify. */
export function clientIp(req: Pick<Request, "headers" | "socket">): string {
  const netlify = req.headers["x-nf-client-connection-ip"];
  if (typeof netlify === "string" && netlify.trim()) return netlify.trim();
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  if (first) return first;
  return req.socket.remoteAddress ?? "unknown";
}
