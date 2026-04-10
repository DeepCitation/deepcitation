/**
 * Shared utilities for vanilla report renderers.
 *
 * Extracted from renderReport.ts and renderBrandedReport.ts to avoid duplication.
 */

import type { CitationRecord } from "../types/citation.js";
import type { AttachmentAssets, Verification } from "../types/verification.js";
import { safeReplace } from "../utils/regexSafety.js";
import { CDN_JS } from "./_generated_cdn.js";

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

// ── Marker normalization ──────────────────────────────────────────────

// Max prefix length for fuzzy anchor matching — long enough to be unique,
// short enough to tolerate LLM paraphrasing at the tail end.
const ANCHOR_MATCH_PREFIX = 40;

/**
 * Normalize `[N]` markers so they always appear AFTER their anchor text.
 *
 * LLMs produce three styles:
 *   - OpenAI:    `anchor text [N]`          → already correct
 *   - Anthropic: `[N] anchor text`          → needs reordering
 *   - Gemini:    `text [N, M] more text`    → needs expansion + reordering
 *
 * wrapCitationMarkers expects `anchor text [N]` — this function normalizes
 * all styles to that format before markdownToHtml processes them.
 */
export function normalizeNumericMarkers(text: string, anchorMap: Record<string, string>): string {
  // Expand grouped markers  [1, 5] → [1][5]
  let result = safeReplace(text, /\[(\d+(?:\s*,\s*\d+)+)\]/g, (_, group: string) =>
    group
      .split(",")
      .map(n => `[${n.trim()}]`)
      .join(""),
  );

  // For each citation, ensure [N] follows its anchor text.
  // Process in descending order so index shifts from earlier edits
  // don't affect later ones.
  const entries = Object.entries(anchorMap).sort(([a], [b]) => Number(b) - Number(a));

  for (const [num, anchor] of entries) {
    const markerRe = new RegExp(`\\[${num}\\]`);
    const markerMatch = markerRe.exec(result);
    if (!markerMatch) continue;

    const markerPos = markerMatch.index;
    const anchorIdx = result.toLowerCase().indexOf(anchor.slice(0, ANCHOR_MATCH_PREFIX).toLowerCase());
    if (anchorIdx < 0) continue;

    const anchorEnd = anchorIdx + anchor.length;

    // If marker already follows the anchor (within a small gap), leave it
    if (markerPos >= anchorEnd && markerPos <= anchorEnd + 5) continue;

    // Remove marker from current position
    result = result.slice(0, markerMatch.index) + result.slice(markerMatch.index + markerMatch[0].length);

    // Recalculate anchor position after removal (may have shifted)
    const newAnchorIdx = result.toLowerCase().indexOf(anchor.slice(0, ANCHOR_MATCH_PREFIX).toLowerCase());
    if (newAnchorIdx < 0) continue;
    const insertPos = newAnchorIdx + anchor.length;
    result = `${result.slice(0, insertPos)} [${num}]${result.slice(insertPos)}`;
  }

  return result;
}

// ── Shared report helpers ─────────────────────────────────────────────

/**
 * Build anchorMap (citationNumber → anchorText) and keyMap ("cite-N" → hash)
 * from a CitationRecord. Used by markdownToHtml and CDN runtime respectively.
 */
export function buildCitationMaps(citations: CitationRecord): {
  anchorMap: Record<string, string>;
  keyMap: Record<string, string>;
} {
  const anchorMap: Record<string, string> = {};
  const keyMap: Record<string, string> = {};
  for (const [hash, citation] of Object.entries(citations)) {
    const num = citation.citationNumber;
    if (num != null && citation.anchorText) {
      anchorMap[String(num)] = citation.anchorText;
      keyMap[`cite-${num}`] = hash;
    }
  }
  return { anchorMap, keyMap };
}

/**
 * Replace `data-cite="N"` attributes with `data-citation-key="<hash>"` and
 * strip leftover `[N]` text markers for all citations in the record.
 */
export function replaceCitationMarkers(html: string, citations: CitationRecord): string {
  let result = html;
  for (const [hash, citation] of Object.entries(citations)) {
    const num = citation.citationNumber;
    if (num == null) continue;
    result = safeReplace(result, new RegExp(`data-cite="${num}"`, "g"), `data-citation-key="${hash}"`);
  }
  for (const citation of Object.values(citations)) {
    const num = citation.citationNumber;
    if (num == null) continue;
    result = safeReplace(result, new RegExp(`\\s*\\[${num}\\]`, "g"), "");
  }
  return result;
}

/**
 * Re-attach pageImages from the hoisted `attachments` map onto each
 * verification entry (in-place). The CDN runtime expects `pageImages`
 * on each verification object, but the SDK normalizes them to a
 * per-attachment map to avoid duplication in the API response.
 */
export function reattachPageImages(
  verifications: Record<string, Verification>,
  attachments?: Record<string, AttachmentAssets>,
): void {
  if (!attachments) return;
  for (const v of Object.values(verifications) as Record<string, unknown>[]) {
    const aid = v.attachmentId as string | undefined;
    if (aid && attachments[aid]?.pageImages) {
      v.pageImages = attachments[aid].pageImages;
    }
  }
}

/**
 * Walk every `data-citation-key` element and stamp `data-dc-display-label`
 * when the visible text is NOT a substring of the citation's `anchorText`.
 *
 * The CDN runtime reads `data-dc-display-label` at click time so the popover
 * shows the visible (paraphrase) text on the "displayed as" line — without
 * this attribute, paraphrase inlines render with no annotation, leaving
 * inattentive readers no signal that the bolded inline and the anchor differ.
 *
 * Returns the rewritten HTML and a log of `[hashPrefix] displayLabel/anchor`
 * lines for each element that was auto-fixed. Both the standalone `inject`
 * command and `injectCdnRuntime` (verify --markdown) use this helper so the
 * two paths produce identical HTML.
 */
export function autoFixDisplayLabels(
  html: string,
  verifications: Record<string, unknown>,
): { html: string; log: string[] } {
  const log: string[] = [];
  const elementRe = /<([a-zA-Z][a-zA-Z0-9]*)[^>]*\sdata-citation-key="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g;
  const fixedHtml = html.replace(elementRe, (fullMatch, _tag, hashedKey, rest, content) => {
    // Skip if data-dc-display-label is already set on this element
    if (/data-dc-display-label=/.test(rest) || /data-dc-display-label=/.test(fullMatch)) return fullMatch;

    const anchorText = (verifications[hashedKey] as { citation?: { anchorText?: string } } | undefined)?.citation
      ?.anchorText;
    if (!anchorText) return fullMatch;

    // Strip inner HTML tags to get approximate visible text.
    // Loop until stable to handle nested fragments like <scr<script>ipt>.
    let visibleText = content as string;
    let prev: string;
    do {
      prev = visibleText;
      visibleText = visibleText.replace(/<[^>]+>/g, "");
    } while (visibleText !== prev);
    visibleText = visibleText.replace(/\s+/g, " ").trim();

    if (!visibleText || visibleText.length > 80) return fullMatch;
    if (anchorText.toLowerCase().includes(visibleText.toLowerCase())) return fullMatch;

    const escaped = visibleText.replace(/"/g, "&quot;");
    log.push(
      `  [${hashedKey.slice(0, 8)}…] displayLabel="${visibleText}" anchorText="${anchorText.slice(0, 60)}${anchorText.length > 60 ? "…" : ""}"`,
    );
    return fullMatch.replace(
      `data-citation-key="${hashedKey}"`,
      `data-citation-key="${hashedKey}" data-dc-display-label="${escaped}"`,
    );
  });
  return { html: fixedHtml, log };
}

/** Options for {@link injectCdnRuntime}. */
export interface InjectCdnOptions {
  theme?: string;
  indicatorVariant?: string;
}

/**
 * Inject the CDN popover runtime into an HTML string.
 *
 * Strips any existing injection first, then appends dc-data, dc-key-map,
 * the CDN JS bundle, and the init call before `</body>`.
 */
export function injectCdnRuntime(
  html: string,
  verifications: Record<string, unknown>,
  keyMap: Record<string, string>,
  opts: InjectCdnOptions = {},
): { html: string; hadExisting: boolean } {
  const { theme = "auto", indicatorVariant } = opts;
  const stripped = stripExistingInjection(html);

  // Stamp data-dc-display-label on paraphrase inlines so the popover's
  // "displayed as" annotation fires for visible text that differs from the
  // citation's anchorText. Mirrors the behavior of the standalone `inject`
  // command — extracted to a shared helper so verify --markdown gets parity.
  const autoFixed = autoFixDisplayLabels(stripped.html, verifications);
  if (autoFixed.log.length > 0) {
    console.error(
      `Auto-set display label on ${autoFixed.log.length} element(s) where visible text differs from anchorText:\n` +
        autoFixed.log.join("\n"),
    );
  }

  const initParts = [`theme:${JSON.stringify(theme)}`];
  if (indicatorVariant && indicatorVariant !== "icon") {
    initParts.push(`indicatorVariant:${JSON.stringify(indicatorVariant)}`);
  }

  const snippet = [
    `<script type="application/json" id="dc-data">${escapeJsonForScript(JSON.stringify(verifications))}</script>`,
    `<script type="application/json" id="dc-key-map">${escapeJsonForScript(JSON.stringify(keyMap))}</script>`,
    `<script>${escapeJsForScript(CDN_JS)}</script>`,
    `<script>window.DeepCitationPopover&&window.DeepCitationPopover.init({${initParts.join(",")}});</script>`,
  ].join("\n");

  let result = autoFixed.html;
  if (result.includes("</body>")) {
    result = result.replace("</body>", () => `${snippet}\n</body>`);
  } else if (result.includes("</html>")) {
    result = result.replace("</html>", () => `${snippet}\n</html>`);
  } else {
    result = `${result}\n${snippet}`;
  }

  return { html: result, hadExisting: stripped.hadExisting };
}
