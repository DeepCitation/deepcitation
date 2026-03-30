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

/**
 * Strip existing DeepCitation injection scripts from HTML to prevent duplicates.
 * The old CDN wins due to `if (!window.DeepCitationPopover)` guard, so
 * re-injecting without stripping silently uses stale verification data.
 */
export function stripExistingInjection(html: string): { html: string; hadExisting: boolean } {
  let result = html;
  let hadExisting = false;

  const patterns = [
    // dc-data and dc-key-map JSON blocks
    /<script[^>]*id="dc-data"[^>]*>[\s\S]*?<\/script>\s*/g,
    /<script[^>]*id="dc-key-map"[^>]*>[\s\S]*?<\/script>\s*/g,
    // Init call
    /<script>\s*window\.DeepCitationPopover\s*&&[\s\S]*?<\/script>\s*/g,
  ];

  for (const pattern of patterns) {
    if (pattern.test(result)) {
      hadExisting = true;
      // Reset lastIndex since we tested before replacing
      pattern.lastIndex = 0;
      result = result.replace(pattern, "");
    }
  }

  // CDN bundle: large script without id that *defines* DeepCitationPopover.
  // Requires assignment (`window.DeepCitationPopover=` or `window.DeepCitationPopover =`)
  // to avoid stripping user scripts that merely reference the API.
  const cdnBundlePattern = /<script>(?:(?!<\/script>)[\s\S])*?window\.DeepCitationPopover\s*=[\s\S]*?<\/script>\s*/g;
  if (cdnBundlePattern.test(result)) {
    hadExisting = true;
    cdnBundlePattern.lastIndex = 0;
    result = result.replace(cdnBundlePattern, "");
  }

  return { html: result, hadExisting };
}
