/** Every API error code and its HTTP status (spec 8.7). */
export const ERROR_STATUS = {
  invalid_input: 400,
  overpayment: 400,
  unauthenticated: 401,
  invalid_credentials: 401,
  session_expired: 401,
  forbidden: 403,
  bad_proxy_signature: 403,
  not_found: 404,
  stale_edit: 409,
  credit_limit_exceeded: 409,
  already_voided: 409,
  limit_reached: 409,
  account_locked: 423,
  rate_limited: 429,
  demo_limit: 429,
  demo_full: 503,
  service_unavailable: 503,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;

export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; field?: string; retryAfter?: string };
};
