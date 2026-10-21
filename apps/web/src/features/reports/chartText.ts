import { MANILA_TZ, formatPeso, type DaySales } from "@sari/shared";

const startOf = (date: string) => new Date(`${date}T00:00:00+08:00`);
const weekday = new Intl.DateTimeFormat("en-PH", { timeZone: MANILA_TZ, weekday: "long" });
const monthDay = new Intl.DateTimeFormat("en-PH", { timeZone: MANILA_TZ, month: "short", day: "numeric" });

/** "Tuesday" for a Manila date ("2026-10-20"). */
export const weekdayOf = (date: string) => weekday.format(startOf(date));

/** "Oct 20" for a Manila date. */
export const shortDate = (date: string) => monthDay.format(startOf(date));

/** "12 AM", "9 AM", "6 PM". */
export const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`;

/** "₱1.2k" style axis labels. */
export function compactPeso(centavos: number): string {
  const pesos = centavos / 100;
  if (pesos >= 1000) return `₱${(pesos / 1000).toFixed(pesos % 1000 === 0 ? 0 : 1)}k`;
  return `₱${Math.round(pesos)}`;
}

/** The busiest day of a run of days, or null when nothing sold. */
export const bestDay = (days: DaySales[]) => days.reduce<DaySales | null>((best, day) => (day.salesCentavos > (best?.salesCentavos ?? 0) ? day : best), null);

/** The stat card spark's label: "Sales for the last 7 days, highest ₱3,200.00 on Thursday". */
export function sparkLabel(days: DaySales[]): string {
  const best = bestDay(days);
  if (!best) return `Sales for the last ${days.length} days: no sales yet`;
  return `Sales for the last ${days.length} days, highest ${formatPeso(best.salesCentavos)} on ${weekdayOf(best.date)}`;
}
