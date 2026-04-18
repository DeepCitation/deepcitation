/**
 * Pure image-resolution functions for the evidence display system.
 *
 * Resolves which image source to use for keyhole crops and expanded page
 * views from verification data, with validation and priority logic.
 *
 * @packageDocumentation
 */

import type { DeepTextItem, ScreenBox } from "../../types/boxes.js";
import type { PageImage, Verification } from "../../types/verification.js";
import { normalizeQuotes } from "../../utils/normalizeQuotes.js";
import { isValidProofImageSrc } from "../constants.js";

/** Identity render scale for image sources where coords are already in pixel space. */
export const IDENTITY_RENDER_SCALE = { x: 1, y: 1 } as const;

/** Source data for the expanded page viewer. */
export interface ExpandedImageSource {
  src: string;
  dimensions?: { width: number; height: number } | null;
  highlightBox?: ScreenBox | null;
  renderScale?: { x: number; y: number } | null;
  textItems?: DeepTextItem[];
}

function toExpandedImageSource(
  page: PageImage,
  overrides?: {
    highlightBox?: ScreenBox | null;
    renderScale?: { x: number; y: number } | null;
    textItems?: DeepTextItem[] | null;
  },
): ExpandedImageSource {
  return {
    src: page.imageUrl,
    dimensions: page.dimensions,
    highlightBox: overrides?.highlightBox ?? page.highlightBox ?? null,
    renderScale: overrides?.renderScale ?? page.renderScale ?? null,
    textItems: overrides?.textItems ?? page.textItems ?? [],
  };
}

/**
 * Resolves the evidence crop image (keyhole source) from verification data.
 * Returns `verification.evidence.src` when present and valid, otherwise `null`.
 */
export function resolveEvidenceSrc(verification: Verification | null | undefined): string | null {
  const snippetSrc = verification?.evidence?.src;
  if (!snippetSrc) return null;
  return isValidProofImageSrc(snippetSrc) ? snippetSrc : null;
}

/** Check whether a PageImage represents the verification match page. */
function isMatchPageImage(page: PageImage, verification: Verification | null | undefined): boolean {
  if (page.isMatchPage) return true;
  const matchNum = Number(verification?.document?.verifiedPageNumber);
  return Number.isFinite(matchNum) && page.pageNumber === matchNum;
}

/** Extract verification.document overrides for toExpandedImageSource (highlightBox, renderScale, textItems). */
function documentOverrides(doc: Verification["document"]) {
  return doc
    ? {
        highlightBox: doc.highlightBox ?? null,
        renderScale: doc.renderScale ?? null,
        textItems: doc.textItems ?? null,
      }
    : undefined;
}

/**
 * Single resolver for the best available full-page image from verification data.
 * Tries in order:
 * 1. match page from pageImages (best: has image + dimensions)
 * 2. first page fallback from pageImages (for not_found or unknown page)
 *
 * Note: evidence.src is intentionally excluded — it is the keyhole crop, not a
 * full-page image. Using it here would make "View page" re-show the same image as the keyhole.
 * URL full-page screenshots are now in attachment.pageImages (not on the verification object).
 *
 * Each source is validated with isValidProofImageSrc() before use, blocking SVG data URIs
 * (which can contain scripts), javascript: URIs, and untrusted hosts. Localhost is allowed
 * for development. Invalid sources are skipped and the next tier is tried.
 */
export function resolveExpandedImage(
  verification: Verification | null | undefined,
  pageImages?: PageImage[] | null,
): ExpandedImageSource | null {
  if (!verification) return null;

  // Two-pass priority: isMatchPage flag always wins over pageNumber match,
  // regardless of array ordering. A single-pass find(isMatchPageImage) would
  // pick whichever condition matches first positionally.
  const matchPageNumber = verification.document?.verifiedPageNumber;
  const matchPage =
    pageImages?.find(p => p.isMatchPage) ??
    (matchPageNumber ? pageImages?.find(p => p.pageNumber === matchPageNumber) : undefined);
  if (matchPage?.imageUrl && isValidProofImageSrc(matchPage.imageUrl)) {
    return toExpandedImageSource(matchPage, documentOverrides(verification.document));
  }

  // Fallback: first available page image
  const anyPage = pageImages?.[0];
  if (anyPage?.imageUrl && isValidProofImageSrc(anyPage.imageUrl)) {
    return toExpandedImageSource(anyPage);
  }

  return null;
}

/**
 * Resolve an expanded image for a specific page number.
 * Falls back to resolveExpandedImage() when an exact page image isn't present.
 */
export function resolveExpandedImageForPage(
  verification: Verification | null | undefined,
  pageNumber: number | null | undefined,
  pageImages?: PageImage[] | null,
): ExpandedImageSource | null {
  const normalizedPage = Number(pageNumber);
  if (pageImages && Number.isFinite(normalizedPage) && normalizedPage > 0) {
    const exactPage = pageImages.find(p => Number(p.pageNumber) === normalizedPage && isValidProofImageSrc(p.imageUrl));
    if (exactPage) {
      return isMatchPageImage(exactPage, verification)
        ? toExpandedImageSource(exactPage, documentOverrides(verification?.document))
        : toExpandedImageSource(exactPage);
    }
  }
  return resolveExpandedImage(verification, pageImages);
}

function normalizeEvidenceText(text: string | null | undefined): string {
  return normalizeQuotes(text?.toLowerCase().replace(/\s+/g, " ").trim() ?? "");
}

export function resolveEvidenceSourceAnchorRatio(
  verification: Verification | null | undefined,
): { x: number; y: number } | null {
  const evidence = verification?.evidence;
  const dims = evidence?.dimensions;
  const items = evidence?.textItems;
  if (!dims || dims.width <= 0 || dims.height <= 0 || !items || items.length === 0) return null;

  const targets = [
    verification?.verifiedSourceMatch,
    verification?.document?.sourceMatchDeepItems?.[0]?.text,
    verification?.verifiedSourceContext,
    verification?.document?.sourceContextDeepItem?.text,
  ]
    .map(normalizeEvidenceText)
    .filter(Boolean);

  // Tier 3 (exact): itemText === target       → score 4000 + itemText.length
  // Tier 2 (fragment): target.includes(item)  → score 3000 + itemText.length
  // Tier 1 (container): item.includes(target) → score 2000 + target.length
  // Longer matches within a tier score higher, so a wrapped line like
  // "founders make them" beats a stray "the" inside the same tier.
  const scoreOf = (itemText: string, target: string): number => {
    if (itemText === target) return 4000 + itemText.length;
    if (target.includes(itemText)) return 3000 + itemText.length;
    if (itemText.includes(target)) return 2000 + target.length;
    return 0;
  };
  const tierOf = (score: number): number => (score >= 4000 ? 3 : score >= 3000 ? 2 : score >= 2000 ? 1 : 0);

  // Score every (item, target) pair. For each candidate, record the [start, end)
  // range of the TARGET string that the item covers — that range is the key to
  // rejecting short-substring pollution (see kept-set loop below).
  type Candidate = {
    item: (typeof items)[number];
    score: number;
    target: string;
    start: number;
    end: number;
  };
  const candidates: Candidate[] = [];
  for (const item of items) {
    const itemText = normalizeEvidenceText(item.text);
    if (!itemText) continue;
    for (const target of targets) {
      const score = scoreOf(itemText, target);
      if (score === 0) continue;
      const start = itemText === target || itemText.includes(target) ? 0 : target.indexOf(itemText);
      const end = itemText === target || itemText.includes(target) ? target.length : start + itemText.length;
      candidates.push({ item, score, target, start, end });
    }
  }
  if (candidates.length === 0) return null;

  // sourceContextDeepItem defines the spotlight center in CitationAnnotationOverlay.
  // When it produces candidates, it always wins as winningTarget — even if
  // verifiedSourceMatch has a higher raw score (which happens when verifiedSourceMatch
  // is shorter and exact-matches a fragment while the context spans multiple lines or columns).
  const contextText = normalizeEvidenceText(verification?.document?.sourceContextDeepItem?.text);
  const contextCandidates = contextText ? candidates.filter(c => c.target === contextText) : [];

  let winningTarget: string;
  let winningTier: number;
  if (contextCandidates.length > 0) {
    contextCandidates.sort((a, b) => b.score - a.score);
    winningTarget = contextText;
    winningTier = tierOf(contextCandidates[0].score);
  } else {
    candidates.sort((a, b) => b.score - a.score);
    winningTarget = candidates[0].target;
    winningTier = tierOf(candidates[0].score);
  }
  const targetCandidates = candidates.filter(c => c.target === winningTarget && tierOf(c.score) === winningTier);

  // Greedy non-overlapping cover of the target string, by score DESC.
  // A candidate is KEPT only if its target-text range is not entirely subsumed
  // by an already-kept candidate's range. This rejects the pollution that broke
  // scratch/collapse5.png: when the keyhole is expanded to full-page size,
  // `evidence.textItems` includes every word on the page, and common short
  // words like "the", "a", "make", "take" all satisfy target.includes(itemText).
  // Their ranges (e.g. "the" at chars 14-17 inside "them") sit INSIDE the
  // wrapped citation line's range ("founders make them" at chars 0-18), so the
  // subset check drops them — regardless of how far their bbox sits from the
  // real citation on the page. Disjoint wrapped lines (0-18 vs 19-37) keep
  // each other (neither range is a subset of the other) and the union bbox
  // matches the spotlight, which is centered on the `sourceContextDeepItem`
  // multi-line bbox in CitationAnnotationOverlay.
  const kept: Candidate[] = [];
  for (const cand of targetCandidates) {
    const subsumed = kept.some(k => k.start <= cand.start && cand.end <= k.end);
    if (!subsumed) kept.push(cand);
  }

  let unionLeft = Number.POSITIVE_INFINITY;
  let unionTop = Number.POSITIVE_INFINITY;
  let unionRight = Number.NEGATIVE_INFINITY;
  let unionBottom = Number.NEGATIVE_INFINITY;
  for (const cand of kept) {
    const it = cand.item;
    unionLeft = Math.min(unionLeft, it.x);
    unionTop = Math.min(unionTop, it.y);
    unionRight = Math.max(unionRight, it.x + it.width);
    unionBottom = Math.max(unionBottom, it.y + it.height);
  }
  if (!Number.isFinite(unionLeft)) return null;

  const x = Math.max(0, Math.min(1, (unionLeft + unionRight) / 2 / dims.width));
  const y = Math.max(0, Math.min(1, (unionTop + unionBottom) / 2 / dims.height));
  return { x, y };
}
