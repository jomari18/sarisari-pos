// The Philippines has no daylight saving time, so Manila is always UTC+8.
export const MANILA_TZ = "Asia/Manila";
const OFFSET_MS = 8 * 60 * 60 * 1000;

/** Manila calendar date ("YYYY-MM-DD") of an instant. */
export function manilaDate(instant: Date): string {
  return new Date(instant.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a Manila day ("YYYY-MM-DD") begins. */
export function manilaDayStart(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  return new Date(`${date}T00:00:00+08:00`);
}

/** Manila hour (0–23) of an instant. */
export function manilaHour(instant: Date): number {
  return new Date(instant.getTime() + OFFSET_MS).getUTCHours();
}
