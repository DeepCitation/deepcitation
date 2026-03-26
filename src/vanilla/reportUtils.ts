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
 * Escape JS source code for safe embedding inside a `<script>` tag.
 * The HTML tokenizer terminates `<script>` on `</script` but some browsers
 * also react to other `</` sequences (e.g. `</body>` inside JS string
 * literals). We split every `</` by inserting a backslash: `<\/`.
 *
 * In JS string contexts, `\/` === `/` so the semantics are preserved.
 * The `</` sequences in JS code (not strings) only appear inside string
 * literals — there's no JS operator that produces `</`.
 */
export function escapeJsForScript(js: string): string {
  // Replace `</` with `<` + unicode escape `\u002f` so the HTML parser
  // never sees a close-tag sequence inside <script>.
  // We build the replacement string char-by-char to prevent the minifier
  // from collapsing it back into `</`.
  const R = ["<", "\\", "u", "0", "0", "2", "f"].join("");
  return js.replace(/<\//g, R);
}

/**
 * Strip wrapping `<style>` tags from a style block, returning only the CSS body.
 */
export function stripStyleTags(css: string): string {
  return css.replace(/^<style>\n?/, "").replace(/\n?<\/style>$/, "");
}
