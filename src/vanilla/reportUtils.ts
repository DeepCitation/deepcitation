/**
 * Shared utilities for vanilla report renderers.
 *
 * Extracted from renderReport.ts and renderBrandedReport.ts to avoid duplication.
 */

/**
 * Escape a string for safe embedding in a JSON `<script>` block.
 * Prevents `</script>` injection and problematic Unicode line terminators.
 */
export function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Strip wrapping `<style>` tags from a style block, returning only the CSS body.
 */
export function stripStyleTags(css: string): string {
  return css.replace(/^<style>\n?/, "").replace(/\n?<\/style>$/, "");
}
