import { useEffect } from "react";
import { isValidProofImageSrc } from "../proofImageSecurity.js";

export function usePopoverImagePreload({
  evidenceSrc,
  expandedImageSrc,
  isVisible,
  recordKeyholeNaturalWidth,
}: {
  evidenceSrc: string | null | undefined;
  expandedImageSrc: string | null | undefined;
  isVisible: boolean;
  recordKeyholeNaturalWidth: (width: number, src: string) => void;
}) {
  useEffect(() => {
    if (!isVisible) return;
    let disposed = false;
    let keyholePreload: HTMLImageElement | null = null;
    if (evidenceSrc) {
      const preloadSrc = evidenceSrc;
      keyholePreload = new Image();
      keyholePreload.onload = () => {
        if (disposed) return;
        const width = keyholePreload?.naturalWidth ?? 0;
        if (!Number.isFinite(width) || width <= 0) return;
        recordKeyholeNaturalWidth(width, preloadSrc);
      };
      keyholePreload.src = preloadSrc;
    }

    let pagePreload: HTMLImageElement | null = null;
    if (expandedImageSrc && isValidProofImageSrc(expandedImageSrc)) {
      pagePreload = new Image();
      pagePreload.src = expandedImageSrc;
    }
    return () => {
      disposed = true;
      if (keyholePreload) keyholePreload.onload = null;
      if (pagePreload) {
        pagePreload.src = "";
        pagePreload = null;
      }
    };
  }, [isVisible, evidenceSrc, expandedImageSrc, recordKeyholeNaturalWidth]);
}
