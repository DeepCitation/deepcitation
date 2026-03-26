/**
 * React hooks for resolving and prefetching verification images.
 *
 * Primary API: `useEvidenceImages(verification, pageImages)`
 * Returns resolved image sources + derived booleans, with automatic prefetching.
 *
 * @packageDocumentation
 */

import { useEffect, useMemo } from "react";
import type { PageImage, Verification } from "../../types/verification.js";
import { prefetchImages } from "../prefetchCache.js";
import {
  type ExpandedImageSource,
  resolveEvidenceSrc,
  resolveExpandedImage,
  resolveExpandedImageForPage,
} from "./resolvers.js";

// =============================================================================
// TYPES
// =============================================================================

export interface EvidenceImages {
  /** Keyhole crop src ready to render, or null. */
  keySrc: string | null;
  /** Full-page expanded image data, or null. */
  expanded: ExpandedImageSource | null;
  /** Whether any renderable image exists (for conditional UI). */
  hasImage: boolean;
  /** Whether expanded page view would add value (image exists). */
  canExpandToPage: boolean;
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * One-stop hook for all image evidence needs.
 * Resolves keyhole + expanded image sources and prefetches them.
 */
export function useEvidenceImages(
  verification: Verification | null | undefined,
  pageImages?: PageImage[] | null,
): EvidenceImages {
  const keySrc = useMemo(() => resolveEvidenceSrc(verification), [verification]);
  const expanded = useMemo(() => resolveExpandedImage(verification, pageImages), [verification, pageImages]);

  const hasImage = !!keySrc || (pageImages != null && pageImages.length > 0);
  const canExpandToPage = !!expanded;

  // Prefetch resolved images (low priority, skips data URIs)
  useEffect(() => {
    const srcs: string[] = [];
    if (keySrc && !keySrc.startsWith("data:")) srcs.push(keySrc);
    if (expanded?.src && !expanded.src.startsWith("data:")) srcs.push(expanded.src);
    if (srcs.length > 0) prefetchImages(srcs);
  }, [keySrc, expanded?.src]);

  return useMemo(
    () => ({ keySrc, expanded, hasImage, canExpandToPage }),
    [keySrc, expanded, hasImage, canExpandToPage],
  );
}

/**
 * Page-specific variant for CitationDrawer page navigation.
 */
export function useEvidenceImagesForPage(
  verification: Verification | null | undefined,
  pageNumber: number | null | undefined,
  pageImages?: PageImage[] | null,
): EvidenceImages {
  const keySrc = useMemo(() => resolveEvidenceSrc(verification), [verification]);
  const expanded = useMemo(
    () => resolveExpandedImageForPage(verification, pageNumber, pageImages),
    [verification, pageNumber, pageImages],
  );

  const hasImage = !!keySrc || (pageImages != null && pageImages.length > 0);
  const canExpandToPage = !!expanded;

  useEffect(() => {
    const srcs: string[] = [];
    if (keySrc && !keySrc.startsWith("data:")) srcs.push(keySrc);
    if (expanded?.src && !expanded.src.startsWith("data:")) srcs.push(expanded.src);
    if (srcs.length > 0) prefetchImages(srcs);
  }, [keySrc, expanded?.src]);

  return useMemo(
    () => ({ keySrc, expanded, hasImage, canExpandToPage }),
    [keySrc, expanded, hasImage, canExpandToPage],
  );
}
