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
  options?: { showTime?: boolean },
): { display: string; tooltip: string } | null {
  if (!date) return null;

  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = new Date();
  const sameYear = parsed.getFullYear() === now.getFullYear();

  const dateFormatOptions: Intl.DateTimeFormatOptions = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };

  let display = new Intl.DateTimeFormat("en-US", dateFormatOptions).format(parsed);

  if (options?.showTime) {
    const timeStr = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(parsed);
    display += ` at ${timeStr}`;
  }

  return { display, tooltip: parsed.toISOString() };
}
