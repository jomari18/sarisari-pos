import { afterEach, describe, expect, it, vi } from "vitest";
import { wakeApi } from "../src/landing/wake";
import { json, mockFetch } from "./support/fetch";

const URL = "https://api.zarizari.test/api/health";

afterEach(() => vi.unstubAllGlobals());

describe("wakeApi (spec 3.1)", () => {
  it("keeps asking /health until the server answers, then says it is awake", async () => {
    let asked = 0;
    const calls = mockFetch(() => {
      asked += 1;
      if (asked === 1) throw new TypeError("Failed to fetch");
      return asked < 3 ? json(503, { error: { code: "service_unavailable", message: "Waking up" } }) : json(200, { ok: true });
    });
    await expect(wakeApi(URL, { intervalMs: 5, timeoutMs: 1_000 })).resolves.toBe(true);
    expect(calls.map((call) => call.url)).toEqual([URL, URL, URL]);
  });

  it("gives up after the timeout", async () => {
    mockFetch(() => json(503, { error: { code: "service_unavailable", message: "Waking up" } }));
    await expect(wakeApi(URL, { intervalMs: 5, timeoutMs: 40 })).resolves.toBe(false);
  });
});
