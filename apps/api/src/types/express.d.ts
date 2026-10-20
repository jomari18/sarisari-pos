import type { AuthUser } from "../services/tokens.js";

declare global {
  namespace Express {
    interface Request {
      /** The signed-in user, set by `requireAuth`. */
      user?: AuthUser;
    }
  }
}
