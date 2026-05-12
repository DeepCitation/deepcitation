import { useMemo } from "react";
import type { PageImage, Verification } from "../../types/verification.js";
import { isValidProofImageSrc } from "../constants.js";
import { resolveExpandedImage } from "../evidence/resolvers.js";

export function useResolvedExpandedImage({
  expandedImageSrcOverride,
  pageImages,
  renderExpandedPage,
  verification,
}: {
  expandedImageSrcOverride?: string | null;
  pageImages?: PageImage[];
  renderExpandedPage?: unknown;
  verification: Verification | null;
}) {
  const expandedImage = useMemo(() => {
    const resolved = resolveExpandedImage(verification, pageImages);
    if (!expandedImageSrcOverride || !isValidProofImageSrc(expandedImageSrcOverride)) return resolved;
    return resolved
      ? { ...resolved, src: expandedImageSrcOverride, dimensions: null, highlightBox: null, renderScale: null }
      : { src: expandedImageSrcOverride };
  }, [verification, pageImages, expandedImageSrcOverride]);

  return {
    canExpandToPage: !!expandedImage || !!renderExpandedPage,
    expandedImage,
  };
}
