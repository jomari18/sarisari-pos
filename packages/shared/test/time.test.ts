import { describe, expect, it } from "vitest";
import { manilaDate, manilaDayStart, manilaHour } from "../src/time.js";

describe("Manila time", () => {
  it("gives the Manila calendar date of an instant", () => {
    expect(manilaDate(new Date("2026-10-20T16:30:00Z"))).toBe("2026-10-21");
    expect(manilaDate(new Date("2026-10-20T15:59:59Z"))).toBe("2026-10-20");
    expect(manilaDate(new Date("2026-10-20T16:00:00Z"))).toBe("2026-10-21");
  });

  it("gives the instant a Manila day starts", () => {
    expect(manilaDayStart("2026-10-21").toISOString()).toBe("2026-10-20T16:00:00.000Z");
    expect(() => manilaDayStart("21/10/2026")).toThrow(RangeError);
  });

  it("gives the Manila hour of an instant", () => {
    expect(manilaHour(new Date("2026-10-21T10:15:00Z"))).toBe(18);
    expect(manilaHour(new Date("2026-10-20T16:00:00Z"))).toBe(0);
  });
});
