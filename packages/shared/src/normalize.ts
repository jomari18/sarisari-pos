/** Product and suki names: composed Unicode, single spaces, no padding. */
export function normalizeName(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Comparison key for search: "Niño" and "nino" match. */
export function searchKey(text: string): string {
  return normalizeName(text).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
