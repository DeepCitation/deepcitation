/**
 * Formats a capture/verification date for display in citation popovers and drawers.
 *
 * - `display` uses the user's local timezone for readability
 * - `tooltip` always returns a full ISO 8601 timestamp (UTC) for audit precision
 *
 * @param date - Date object, ISO string, or null/undefined
 * @param options - Optional config: `showTime` adds time component (for URL citations)
 * @returns `{ display, tooltip }` or null if input is falsy/unparseable
 */
export function formatCaptureDate(
  date: Date | string | null | undefined,
  options?: { showTime?: boolean; locale?: string },
): { display: string; tooltip: string } | null {
  if (!date) return null;

  // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by the ECMAScript
  // spec, which causes them to display as the previous day in UTC- timezones.
  // Treat them as local noon instead — this preserves the intended calendar date
  // across any timezone offset from UTC-12 to UTC+12.
  const normalized = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date;

  const parsed = normalized instanceof Date ? normalized : new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  const locale = options?.locale; // undefined → browser runtime locale
  const now = new Date();
  const sameYear = parsed.getFullYear() === now.getFullYear();

  const dateFormatOptions: Intl.DateTimeFormatOptions = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };

  let display = new Intl.DateTimeFormat(locale, dateFormatOptions).format(parsed);

  if (options?.showTime) {
    const timeStr = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(parsed);
    display += ` at ${timeStr}`;
  }

  return { display, tooltip: parsed.toISOString() };
}
