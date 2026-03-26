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
import { isValidProofImageSrc } from "../constants.js";

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
  return text?.toLowerCase().replace(/\s+/g, " ").trim() ?? "";
}

export function resolveEvidenceSourceAnchorRatio(
  verification: Verification | null | undefined,
): { x: number; y: number } | null {
  const evidence = verification?.evidence;
  const dims = evidence?.dimensions;
  const items = evidence?.textItems;
  if (!dims || dims.width <= 0 || dims.height <= 0 || !items || items.length === 0) return null;

  const targets = [
    verification?.verifiedAnchorText,
    verification?.document?.anchorTextMatchDeepItems?.[0]?.text,
    verification?.verifiedFullPhrase,
    verification?.document?.phraseMatchDeepItem?.text,
  ]
    .map(normalizeEvidenceText)
    .filter(Boolean);

  let bestItem: DeepTextItem | null = null;
  let bestScore = 0;

  for (const item of items) {
    const itemText = normalizeEvidenceText(item.text);
    if (!itemText) continue;
    for (const target of targets) {
      let score = 0;
      if (itemText === target) score = 4000 + itemText.length;
      else if (target.includes(itemText)) score = 3000 + itemText.length;
      else if (itemText.includes(target)) score = 2000 + target.length;
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }
  }

  if (!bestItem) return null;

  const x = Math.max(0, Math.min(1, (bestItem.x + bestItem.width / 2) / dims.width));
  const y = Math.max(0, Math.min(1, (bestItem.y + bestItem.height / 2) / dims.height));
  return { x, y };
}
