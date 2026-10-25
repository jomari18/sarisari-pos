import { SaleInput } from "@sari/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// The site's Content Security Policy has no 'unsafe-eval'. zod's compiled parsers probe `new Function` when a
// schema is built, which the browser refuses and reports as a violation, so in the browser the shared schemas
// parse without them.
describe("zod under the site's Content Security Policy", () => {
  it("builds the shared schemas without compiled parsers in the browser", () => {
    expect(z.config().jitless).toBe(true);
    expect(SaleInput.safeParse({}).success).toBe(false);
  });
});
