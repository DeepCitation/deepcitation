/**
 * Escape user-controlled strings for safe HTML interpolation.
 *
 * Handles the five XML-reserved characters: & < > " '. The apostrophe is
 * encoded as `&#39;` (numeric reference) because `&apos;` is HTML5-only.
 * Shared across the CLI entrypoints (auth browser response, markdown → HTML
 * converter, verify banner injection) to avoid drift between escape tables.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
