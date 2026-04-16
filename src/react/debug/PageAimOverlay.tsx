import { type RefObject, useLayoutEffect, useMemo, useState } from "react";
import type { Verification } from "../../types/verification";
import { resolveEvidenceSourceAnchorRatio } from "../evidence/resolvers.js";
import { AimOverlay } from "./AimOverlay.js";

/**
 * Dev-only crosshair for the InlineExpandedImage (page) view. Owns a ResizeObserver
 * on the image element so aim is pinned to the actual rendered box — robust to
 * fill/non-fill modes, zoom, and CSS constraints that the intrinsic-aspect math
 * would get wrong.
 *
 * Caller MUST gate mount with `process.env.NODE_ENV !== "production"` so the
 * ResizeObserver and resolver call tree-shake out of prod bundles.
 */
export function PageAimOverlay({
  imgRef,
  verification,
}: {
  imgRef: RefObject<HTMLImageElement | null>;
  verification: Verification | null | undefined;
}): React.ReactElement | null {
  const ratio = useMemo(() => resolveEvidenceSourceAnchorRatio(verification), [verification]);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const read = () => setBox({ width: el.offsetWidth, height: el.offsetHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [imgRef]);

  if (!ratio || !box || box.width === 0 || box.height === 0) return null;
  return <AimOverlay kind="page" label="page-aim" x={ratio.x * box.width} y={ratio.y * box.height} />;
}
