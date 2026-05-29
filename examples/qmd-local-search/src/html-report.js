/**
 * Shared HTML report generation pipeline.
 *
 * Both the fixture converter (fixture-to-html.ts) and the live verification
 * workflow (shared.ts) follow the same 5-step pipeline:
 *
 *   parsedCitations  ->  sourceMatchMap/keyMap  ->  normalize markers
 *                    ->  markdownToHtml   ->  replace data-cite
 *                    ->  inject CDN runtime
 *
 * This module extracts that pipeline into a single function so the two
 * callers stay in sync and don't drift.
 */
// CLI internals -- direct source imports (monorepo-only, not public API)
import { markdownToHtml } from "../../../src/cli/markdownToHtml.js";
import { safeReplace } from "../../../src/utils/regexSafety.js";
import { buildCitationMaps, injectCdnRuntime, normalizeNumericMarkers, reattachPageImages, replaceCitationMarkers, } from "../../../src/vanilla/reportUtils.js";
/**
 * Remove duplicate [N] citation markers that appear within `window` characters of
 * a previous occurrence of the same N. This collapses the common LLM pattern of
 * citing the same source multiple times within a single sentence
 * (e.g. "**gov** [5], **industry** [5], **third parties** [5]" → "**gov** [5], **industry**, **third parties**")
 * without removing legitimate cross-paragraph citations.
 */
function deduplicateCloseMarkers(text, window = 150 /* ~1–2 sentences of prose */) {
    const lastSeen = new Map();
    return safeReplace(text, /\[(\d+)\]/g, (match, n, offset) => {
        const prev = lastSeen.get(n);
        if (prev !== undefined && offset - prev <= window)
            return "";
        lastSeen.set(n, offset);
        return match;
    });
}
/**
 * Generate a self-contained HTML report with embedded CDN popover runtime.
 *
 * Returns the complete HTML string ready to write to disk.
 */
export function generateHtmlReport(opts) {
    const { visibleText, parsedCitations, verifications, title, attachments } = opts;
    const citationCount = Object.keys(parsedCitations).length;
    const { sourceMatchMap, keyMap } = buildCitationMaps(parsedCitations);
    const deduplicatedText = deduplicateCloseMarkers(visibleText);
    const normalizedText = normalizeNumericMarkers(deduplicatedText, sourceMatchMap);
    let html = markdownToHtml(normalizedText, {
        style: "report",
        title,
        citationCount,
        sourceMatchMap,
    });
    html = replaceCitationMarkers(html, parsedCitations);
    // Re-attach pageImages from hoisted attachments so CDN popover renders them
    const cdnVerifications = { ...verifications };
    reattachPageImages(cdnVerifications, attachments);
    const injected = injectCdnRuntime(html, cdnVerifications, keyMap);
    return injected.html;
}
export { buildCitationMaps };
