import { MANILA_TZ, formatPeso } from "@sari/shared";

/** "12.00": a peso amount as it sits in a text field (no sign or grouping, so it parses back exactly). */
export const pesoField = (centavos: number) => (centavos / 100).toFixed(2);

/** A blank field is 0; anything but digits is NaN. */
export const wholeNumber = (text: string) => (text.trim() === "" ? 0 : /^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

/** "+₱150.00" or "−₱50.00", with a real minus sign. */
export const signedPeso = (centavos: number) => (centavos > 0 ? `+${formatPeso(centavos)}` : centavos < 0 ? `−${formatPeso(-centavos)}` : formatPeso(0));

const stamp = new Intl.DateTimeFormat("en-PH", { timeZone: MANILA_TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "Oct 21, 10:30 AM" in Manila time, whatever the device's time zone. */
export const manilaStamp = (iso: string) => stamp.format(new Date(iso));
