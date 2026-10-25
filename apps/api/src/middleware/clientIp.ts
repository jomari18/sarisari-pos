import type { Request } from "express";

/**
 * The visitor's IP. Only meaningful after `requireProxySignature`, because the header comes from Netlify.
 * X-Forwarded-For is not read: its leftmost entry is whatever the caller wrote (review I3).
 */
export function clientIp(req: Pick<Request, "headers" | "socket">): string {
  const netlify = req.headers["x-nf-client-connection-ip"];
  if (typeof netlify === "string" && netlify.trim()) return netlify.trim();
  return req.socket.remoteAddress ?? "unknown";
}
