import { useEffect } from "react";

/**
 * Low-priority prefetch: queues image downloads as soon as verification arrives,
 * so they're already cached when the user clicks to open the popover.
 *
 * Data URIs are skipped — they're inline and don't need network fetching.
 * The normal-priority prefetch in DefaultPopoverContent still fires on popover
 * open, upgrading the browser's fetch priority if the request is still in-flight.
 *
 * @param prefetchMode - "eager" prefetches immediately; "lazy" skips prefetch.
 * @param prefetchEvidenceSrc - URL of the evidence crop (keyhole) image, or null.
 * @param prefetchExpandedSrc - URL of the full-page expanded image, or null.
 */
export function useCitationPrefetch(
  prefetchMode: "eager" | "lazy",
  prefetchEvidenceSrc: string | null,
  prefetchExpandedSrc: string | null,
): void {
  // Dependencies: resolved URL strings (not the verification object) so re-renders
  // with the same verification data don't re-fire.
  useEffect(() => {
    if (prefetchMode === "lazy") return;

    const images: HTMLImageElement[] = [];

    if (prefetchEvidenceSrc && !prefetchEvidenceSrc.startsWith("data:")) {
      const img = new Image();
      img.fetchPriority = "low";
      img.src = prefetchEvidenceSrc;
      images.push(img);
    }

    if (prefetchExpandedSrc && !prefetchExpandedSrc.startsWith("data:")) {
      const img = new Image();
      img.fetchPriority = "low";
      img.src = prefetchExpandedSrc;
      images.push(img);
    }

    return () => {
      for (const img of images) {
        img.src = "";
      }
    };
  }, [prefetchMode, prefetchEvidenceSrc, prefetchExpandedSrc]);
}
