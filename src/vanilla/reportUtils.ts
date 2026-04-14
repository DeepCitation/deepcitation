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

  // Strip <script> blocks by ID using string search to avoid ReDoS.
  // Regex with multiple [^>]* groups on uncontrolled input is polynomial.
  for (const id of ["dc-data", "dc-key-map"]) {
    const idMarker = `id="${id}"`;
    let changed = true;
    while (changed) {
      changed = false;
      const idIdx = result.indexOf(idMarker);
      if (idIdx === -1) break;
      const tagStart = result.lastIndexOf("<script", idIdx);
      if (tagStart === -1) break;
      const closeIdx = result.indexOf("</script>", idIdx);
      if (closeIdx === -1) break;
      const end = closeIdx + "</script>".length;
      // Consume trailing whitespace
      let ws = end;
      while (
        ws < result.length &&
        (result[ws] === " " || result[ws] === "\t" || result[ws] === "\n" || result[ws] === "\r")
      )
        ws++;
      result = result.slice(0, tagStart) + result.slice(ws);
      hadExisting = true;
      changed = true;
    }
  }

  // Strip plain <script> blocks (no attributes) that are DeepCitation-owned.
  // Uses indexOf to scan structurally — regex on full HTML is polynomial here.
  // CDN bundle: large script without id that *defines* DeepCitationPopover.
  // Requires assignment (`window.DeepCitationPopover=` or `window.DeepCitationPopover =`)
  // to avoid stripping user scripts that merely reference the API.
  let pos = 0;
  while (true) {
    const scriptStart = result.indexOf("<script>", pos);
    if (scriptStart === -1) break;
    const contentStart = scriptStart + "<script>".length;
    const closeIdx = result.indexOf("</script>", contentStart);
    if (closeIdx === -1) break;
    const content = result.slice(contentStart, closeIdx);

    // Init call: bounded check on first 80 chars (trimStart + literal prefix)
    const trimmed = content.trimStart();
    const isInitCall =
      trimmed.startsWith("window.DeepCitationPopover") &&
      /^window\.DeepCitationPopover\s*&&/.test(trimmed.slice(0, 80));
    // CDN bundle: linear regex applied only to bounded content string
    const isCdnBundle =
      content.includes("window.DeepCitationPopover") && /window\.DeepCitationPopover\s*=/.test(content);

    if (isInitCall || isCdnBundle) {
      hadExisting = true;
      const end = closeIdx + "</script>".length;
      let ws = end;
      while (
        ws < result.length &&
        (result[ws] === " " || result[ws] === "\t" || result[ws] === "\n" || result[ws] === "\r")
      )
        ws++;
      result = result.slice(0, scriptStart) + result.slice(ws);
      // Don't advance pos — content was removed at this position
    } else {
      pos = contentStart;
    }
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
export function normalizeNumericMarkers(text: string, sourceMatchMap: Record<string, string>): string {
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
  const entries = Object.entries(sourceMatchMap).sort(([a], [b]) => Number(b) - Number(a));

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
 * Build sourceMatchMap (citationNumber → sourceMatch) and keyMap ("cite-N" → hash)
 * from a CitationRecord. Used by markdownToHtml and CDN runtime respectively.
 */
export function buildCitationMaps(citations: CitationRecord): {
  sourceMatchMap: Record<string, string>;
  keyMap: Record<string, string>;
} {
  const sourceMatchMap: Record<string, string> = {};
  const keyMap: Record<string, string> = {};
  for (const [hash, citation] of Object.entries(citations)) {
    const num = citation.citationNumber;
    if (num != null && citation.sourceMatch) {
      sourceMatchMap[String(num)] = citation.sourceMatch;
      keyMap[`cite-${num}`] = hash;
    }
  }
  return { sourceMatchMap, keyMap };
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
 * when the visible text is NOT a substring of the citation's `sourceMatch`.
 *
 * The CDN runtime reads `data-dc-display-label` at click time so the popover
 * shows the visible (paraphrase) text on the "displayed as" line — without
 * this attribute, paraphrase inlines render with no annotation, leaving
 * inattentive readers no signal that the bolded inline and the anchor differ.
 *
 * Returns the rewritten HTML and a log of `[hashPrefix] claimText/anchor`
 * lines for each element that was auto-fixed. Both the standalone `inject`
 * command and `injectCdnRuntime` (verify --markdown) use this helper so the
 * two paths produce identical HTML.
 */
export function autoFixDisplayLabels(
  html: string,
  verifications: Record<string, unknown>,
): { html: string; log: string[] } {
  const log: string[] = [];
  // Use string scanning instead of regex on the full HTML to avoid ReDoS.
  // The pattern [^>]*\s...[^>]* applied to uncontrolled input is polynomial.
  const attrMarker = ' data-citation-key="';
  const parts: string[] = [];
  let lastEnd = 0;
  let searchPos = 0;

  while (true) {
    const attrIdx = html.indexOf(attrMarker, searchPos);
    if (attrIdx === -1) break;

    // Find the enclosing tag's opening < (must not be a closing tag)
    const tagStart = html.lastIndexOf("<", attrIdx);
    if (tagStart === -1 || tagStart < lastEnd || html[tagStart + 1] === "/") {
      searchPos = attrIdx + 1;
      continue;
    }

    // Find the end of the opening tag
    const tagClose = html.indexOf(">", attrIdx);
    if (tagClose === -1) {
      searchPos = attrIdx + 1;
      continue;
    }

    // Extract tag name from between < and first whitespace or >
    const afterAngle = tagStart + 1;
    const tagHeaderSlice = html.slice(afterAngle, tagClose);
    const tagNameEnd = tagHeaderSlice.search(/[\s/>]/);
    const tagName = tagNameEnd >= 0 ? tagHeaderSlice.slice(0, tagNameEnd) : tagHeaderSlice;
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(tagName)) {
      searchPos = tagClose + 1;
      continue;
    }

    // Extract citation key (bounded between the attribute marker and the next quote)
    const keyStart = attrIdx + attrMarker.length;
    const keyEnd = html.indexOf('"', keyStart);
    if (keyEnd === -1) {
      searchPos = attrIdx + 1;
      continue;
    }
    const hashedKey = html.slice(keyStart, keyEnd);

    // Skip if opening tag already has data-dc-display-label
    const openingTag = html.slice(tagStart, tagClose + 1);
    if (openingTag.includes("data-dc-display-label=")) {
      searchPos = tagClose + 1;
      continue;
    }

    const sourceMatch = (verifications[hashedKey] as { citation?: { sourceMatch?: string } } | undefined)?.citation
      ?.sourceMatch;
    if (!sourceMatch) {
      searchPos = tagClose + 1;
      continue;
    }

    // Find closing tag (uses first occurrence — same behaviour as the original lazy regex)
    const closeTag = `</${tagName}>`;
    const contentStart = tagClose + 1;
    const closeIdx = html.indexOf(closeTag, contentStart);
    if (closeIdx === -1) {
      searchPos = tagClose + 1;
      continue;
    }

    const content = html.slice(contentStart, closeIdx);

    // Strip inner HTML tags to get approximate visible text.
    // Loop until stable to handle nested fragments like <scr<script>ipt>.
    // Applied to bounded content string — no ReDoS risk.
    let visibleText = content;
    let prev: string;
    do {
      prev = visibleText;
      visibleText = visibleText.replace(/<[^>]+>/g, "");
    } while (visibleText !== prev);
    visibleText = visibleText.replace(/\s+/g, " ").trim();

    const matchEnd = closeIdx + closeTag.length;

    if (!visibleText || visibleText.length > 80 || sourceMatch.toLowerCase().includes(visibleText.toLowerCase())) {
      searchPos = tagClose + 1;
      continue;
    }

    const escaped = visibleText.replace(/"/g, "&quot;");
    log.push(
      `  [${hashedKey.slice(0, 8)}…] claimText="${visibleText}" sourceMatch="${sourceMatch.slice(0, 60)}${sourceMatch.length > 60 ? "…" : ""}"`,
    );

    // Emit unchanged HTML up to this element, then the patched element
    parts.push(html.slice(lastEnd, tagStart));
    const fullMatch = html.slice(tagStart, matchEnd);
    parts.push(
      fullMatch.replace(
        `data-citation-key="${hashedKey}"`,
        `data-citation-key="${hashedKey}" data-dc-display-label="${escaped}"`,
      ),
    );
    lastEnd = matchEnd;
    searchPos = matchEnd;
  }

  if (parts.length === 0) return { html, log };
  parts.push(html.slice(lastEnd));
  return { html: parts.join(""), log };
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
  // citation's sourceMatch. Mirrors the behavior of the standalone `inject`
  // command — extracted to a shared helper so verify --markdown gets parity.
  const autoFixed = autoFixDisplayLabels(stripped.html, verifications);
  if (autoFixed.log.length > 0) {
    console.error(
      `Auto-set display label on ${autoFixed.log.length} element(s) where visible text differs from sourceMatch:\n` +
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
