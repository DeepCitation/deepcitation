/**
 * Format a date as "MMM D" (e.g., "Feb 12") or "MMM D, YYYY" if not current year.
 * Returns empty string for invalid dates or null/undefined input.
 */
export function formatShortDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  return sameYear ? `${month} ${day}` : `${month} ${day}, ${d.getFullYear()}`;
}
