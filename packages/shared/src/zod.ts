import { z } from "zod";

// The website's Content Security Policy refuses eval, so in the browser zod's compiled parsers would only log a
// violation when a schema is built; there the schemas parse without them. The API keeps the compiled path.
// Every schema module imports zod from here, so this runs before the first schema exists.
if ("document" in globalThis) z.config({ jitless: true });

export { z };
