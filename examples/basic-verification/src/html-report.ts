/**
 * Shared HTML report generation pipeline.
 *
 * Both the fixture converter (fixture-to-html.ts) and the live verification
 * workflow (shared.ts) follow the same 5-step pipeline:
 *
 *   parsedCitations  ->  anchorMap/keyMap  ->  normalize markers
 *                    ->  markdownToHtml   ->  replace data-cite
 *                    ->  inject CDN runtime
 *
 * This module extracts that pipeline into a single function so the two
 * callers stay in sync and don't drift.
 */

import type { CitationRecord } from "../../../src/types/citation.js";
import type { AttachmentAssets } from "../../../src/types/verification.js";

// CLI internals -- direct source imports (monorepo-only, not public API)
import { markdownToHtml } from "../../../src/cli/markdownToHtml.js";
import {
  buildCitationMaps,
  injectCdnRuntime,
  normalizeNumericMarkers,
  reattachPageImages,
  replaceCitationMarkers,
} from "../../../src/vanilla/reportUtils.js";

export interface GenerateHtmlReportOptions {
  /** Visible markdown text from the LLM (after stripping <<<CITATION_DATA>>>) */
  visibleText: string;
  /** Parsed citation record from getAllCitationsFromLlmOutput */
  parsedCitations: CitationRecord;
  /** Verification results (real or stubbed) keyed by citation hash */
  verifications: Record<string, unknown>;
  /** Title for the HTML document */
  title: string;
  /** Hoisted attachment assets (for re-attaching pageImages to CDN data) */
  attachments?: Record<string, AttachmentAssets>;
}

/**
 * Generate a self-contained HTML report with embedded CDN popover runtime.
 *
 * Returns the complete HTML string ready to write to disk.
 */
export function generateHtmlReport(opts: GenerateHtmlReportOptions): string {
  const { visibleText, parsedCitations, verifications, title, attachments } = opts;
  const citationCount = Object.keys(parsedCitations).length;

  const { anchorMap, keyMap } = buildCitationMaps(parsedCitations);

  const normalizedText = normalizeNumericMarkers(visibleText, anchorMap);

  let html = markdownToHtml(normalizedText, {
    style: "report",
    title,
    citationCount,
    anchorMap,
  });

  html = replaceCitationMarkers(html, parsedCitations);

  // Re-attach pageImages from hoisted attachments so CDN popover renders them
  const cdnVerifications = { ...verifications };
  reattachPageImages(
    cdnVerifications as Record<string, import("../../../src/types/verification.js").Verification>,
    attachments,
  );

  const injected = injectCdnRuntime(html, cdnVerifications, keyMap);
  return injected.html;
}

export { buildCitationMaps };
