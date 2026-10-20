import type { Request, Response } from "express";

/** The refresh cookie (spec 7.2). The `__Host-` prefix makes browsers insist on Secure, Path=/ and no Domain. */
export const REFRESH_COOKIE = "__Host-sari_refresh";

const OPTIONS = { httpOnly: true, secure: true, sameSite: "strict", path: "/" } as const;

/** The cookie lives exactly as long as the session: until the store expires. */
export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, { ...OPTIONS, expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, OPTIONS);
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === "string" && value ? value : undefined;
}
