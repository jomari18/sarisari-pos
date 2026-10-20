import { describe, expect, it } from "vitest";
import { ERROR_STATUS } from "../src/errors.js";

describe("error codes (spec 8.7)", () => {
  it("maps every code to its HTTP status", () => {
    expect(ERROR_STATUS).toEqual({
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
    });
  });
});
