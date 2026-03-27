/**
 * Date formatting utilities for citation display.
 *
 * Pure functions with no React dependency -- safe to use in any context
 * (server-side rendering, CLI, vanilla JS, etc.).
 */

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

  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;

  const locale = options?.locale; // undefined -> browser runtime locale
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
