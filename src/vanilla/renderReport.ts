import { renderCitationsAsHtml } from "../rendering/html/htmlRenderer.js";
import { generateStyleBlock } from "../rendering/html/styles.js";
import { RUNTIME_JS } from "./_generated.js";
import { POPOVER_CSS } from "./popoverStyles.js";
import type { VanillaReportOptions } from "./types.js";

/**
 * Escape a string for safe embedding in a JSON `<script>` block.
 * Prevents `</script>` injection and problematic Unicode line terminators.
 */
function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Render a fully self-contained HTML report with interactive citation popovers.
 *
 * @example
 * ```typescript
 * import { renderCitationReport } from 'deepcitation/vanilla';
 *
 * const html = renderCitationReport(llmOutput, {
 *   verifications,
 *   theme: 'auto',
 *   title: 'Analysis Report',
 * });
 *
 * fs.writeFileSync('report.html', html);
 * ```
 */
export function renderCitationReport(input: string, options: VanillaReportOptions = {}): string {
  const {
    verifications = {},
    variant = "brackets",
    theme = "auto",
    title = "Citation Report",
    fullPage = true,
    includeStyles = true,
    includeRuntime = true,
    indicatorStyle = "check",
    classPrefix = "dc-",
    proofBaseUrl,
    sourceLabels = {},
  } = options;

  // Render citations using existing HTML renderer
  const rendered = renderCitationsAsHtml(input, {
    verifications,
    variant,
    indicatorStyle,
    proofBaseUrl,
    sourceLabels,
    includeStyles: false, // We'll handle styles ourselves
    inlineStyles: false,
    includeTooltips: false, // Popovers replace tooltips
    theme,
    classPrefix,
  });

  const parts: string[] = [];

  // Citation trigger styles from the HTML renderer
  const triggerStyles = includeStyles ? generateStyleBlock(classPrefix, theme) : "";
  // Remove wrapping <style> tags since we'll add our own
  const triggerCssBody = triggerStyles.replace(/^<style>\n?/, "").replace(/\n?<\/style>$/, "");

  // Build styles block
  if (includeStyles) {
    parts.push(`<style>\n${triggerCssBody}\n${POPOVER_CSS}\n</style>`);
  }

  // Report content
  parts.push(`<div class="${classPrefix}report">\n${rendered.html}\n</div>`);

  // Embedded verification data for runtime hydration
  if (includeRuntime) {
    const jsonData = escapeJsonForScript(JSON.stringify(verifications));
    parts.push(`<script type="application/json" id="dc-data">${jsonData}</script>`);
  }

  // Popover runtime IIFE
  if (includeRuntime) {
    parts.push(`<script>${RUNTIME_JS}</script>`);
  }

  const body = parts.join("\n\n");

  if (!fullPage) return body;

  return `<!DOCTYPE html>
<html lang="en" data-dc-theme="${escapeHtml(theme)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body>
${body}
</body>
</html>`;
}
