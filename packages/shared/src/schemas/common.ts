import { z } from "zod";
import { normalizeName } from "../normalize.js";

/** A trimmed, single-spaced name of at most `max` characters. */
export const nameSchema = (max: number) => z.string().transform(normalizeName).pipe(z.string().min(1).max(max));

/** Prices and costs: whole centavos up to ₱100,000. */
export const moneySchema = z.int().min(0).max(10_000_000);

/** Times sent by devices, as ISO 8601 with an offset ("2026-10-21T10:15:00.000Z"). */
export const isoTimeSchema = z.iso.datetime({ offset: true });

export const noteSchema = z.string().trim().min(1).max(120);
