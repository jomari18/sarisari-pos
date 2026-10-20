import { pino } from "pino";

// Logs carry ids, codes and timings only; never request bodies or secrets (spec 12).
export const logger = pino({ level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info") });
