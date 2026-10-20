/** An ILIKE pattern that finds `text` anywhere. A typed % or _ is escaped so it matches itself, not anything. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}
