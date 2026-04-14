// packages/deepcitation/src/render/renderVerifiedHtml.ts
/**
 * Shared HTML render pipeline: markdown visible text + citation data
 * + verification results → self-contained HTML with CDN runtime injected.
 *
 * Used by the Functions `createReport` handler (server-side) and
 * available for any other consumer that needs to render a verified report.
 */

import { markdownToHtml } from "../cli/markdownToHtml.js";
import type { CitationRecord } from "../types/citation.js";
import type { AttachmentAssets, Verification } from "../types/verification.js";
import {
  buildCitationMaps,
  injectCdnRuntime,
  normalizeNumericMarkers,
  reattachPageImages,
  replaceCitationMarkers,
} from "../vanilla/reportUtils.js";

export interface RenderVerifiedHtmlOptions {
  title?: string;
  theme?: "light" | "dark" | "auto";
  indicatorVariant?: "icon" | "dot" | "none";
}

/**
 * Render a self-contained verified HTML report from in-memory data.
 *
 * @param visibleText - Markdown from the LLM with CITATION_DATA already stripped
 * @param parsedCitations - CitationRecord keyed by citation hash
 * @param verifications - Verification results keyed by citation hash
 * @param attachments - Optional attachment assets (for page image re-attachment)
 * @param options - Title, theme, indicator variant
 * @returns Complete HTML string ready to store or serve
 */
export function renderVerifiedHtml(
  visibleText: string,
  parsedCitations: CitationRecord,
  verifications: Record<string, Verification>,
  attachments?: Record<string, AttachmentAssets>,
  options?: RenderVerifiedHtmlOptions,
): string {
  const { title = "", theme = "auto", indicatorVariant = "icon" } = options ?? {};
  const citationCount = Object.keys(parsedCitations).length;
  const { sourceMatchMap, keyMap } = buildCitationMaps(parsedCitations);
  const normalizedText = normalizeNumericMarkers(visibleText, sourceMatchMap);
  let html = markdownToHtml(normalizedText, { style: "report", title, citationCount, sourceMatchMap });
  html = replaceCitationMarkers(html, parsedCitations);
  const cdnVerifications = { ...verifications };
  reattachPageImages(cdnVerifications, attachments);
  const { html: injected } = injectCdnRuntime(html, cdnVerifications, keyMap, { theme, indicatorVariant });
  return injected;
}
