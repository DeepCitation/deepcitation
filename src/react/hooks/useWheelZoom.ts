import { useEffect, useRef, useState } from "react";

/**
 * GPU-accelerated wheel-zoom hook for scroll-to-zoom without Ctrl key.
 *
 * During a zoom gesture, CSS `transform: scale()` is applied to a wrapper div
 * (GPU-composited, zero layout reflow). After 150ms of no events the final zoom
 * is committed to React state. The consumer's `useLayoutEffect` on `zoom` should
 * remove the transform and apply scroll correction.
 *
 * Hover tracking is included: `isHovering` reflects whether the pointer is over
 * the container, enabling visual affordances like a ring highlight.
 *
 * `e.preventDefault()` blocks page scroll while the cursor is over the container
 * — matching Google Maps behavior where hovering + scrolling controls zoom.
 */
export interface UseWheelZoomOptions {
  /** Whether wheel-zoom is active. Set false to disable (e.g. when the container is hidden). */
  enabled: boolean;
  /** Sensitivity multiplier mapping deltaY → zoom delta. */
  sensitivity: number;
  /** Ref to the scroll container element. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Ref to the inner wrapper div that receives CSS transform during gesture. */
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  /** Current committed zoom level (React state in the consumer). */
  zoom: number;
  /** Raw clamp function (no rounding) for continuous GPU scaling. */
  clampZoomRaw: (z: number) => number;
  /** Final clamp function (with rounding) applied on commit. */
  clampZoom: (z: number) => number;
  /** Callback to commit the final zoom to React state. */
  onZoomCommit: (zoom: number) => void;
  /** When true, only zoom on Ctrl+wheel (expanded page behavior). Defaults to false. */
  requireCtrl?: boolean;
}

export interface UseWheelZoomReturn {
  /** Whether the pointer is currently hovering over the container. */
  isHovering: boolean;
  /** Gesture anchor ref — consumer reads this in useLayoutEffect for scroll correction. */
  gestureAnchorRef: React.MutableRefObject<{ mx: number; my: number; sx: number; sy: number } | null>;
  /** Active gesture zoom level (null = no gesture). Consumer reads for transform cleanup. */
  gestureZoomRef: React.MutableRefObject<number | null>;
}

/**
 * Apply a CSS transform to the wrapper during a zoom gesture.
 * Uses `transform-origin: 0 0` with translate+scale so the content point under
 * the anchor stays visually stable without updating origin per-frame.
 */
function applyGestureTransform(
  wrapper: HTMLDivElement,
  gestureZoom: number,
  committedZoom: number,
  anchor: { mx: number; my: number; sx: number; sy: number },
): void {
  const s = gestureZoom / committedZoom;
  const cx = anchor.mx + anchor.sx;
  const cy = anchor.my + anchor.sy;
  wrapper.style.transform = `translate(${cx * (1 - s)}px, ${cy * (1 - s)}px) scale(${s})`;
}

export function useWheelZoom({
  enabled,
  sensitivity,
  containerRef,
  wrapperRef,
  zoom,
  clampZoomRaw,
  clampZoom,
  onZoomCommit,
  requireCtrl = false,
}: UseWheelZoomOptions): UseWheelZoomReturn {
  const [isHovering, setIsHovering] = useState(false);

  // Stable ref mirror of zoom for use in wheel handler (avoids stale closures).
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  });

  const gestureZoomRef = useRef<number | null>(null);
  const gestureAnchorRef = useRef<{ mx: number; my: number; sx: number; sy: number } | null>(null);

  // Hover tracking via pointer events on the container.
  useEffect(() => {
    if (!enabled) {
      setIsHovering(false);
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    const onEnter = () => setIsHovering(true);
    const onLeave = () => setIsHovering(false);

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled, containerRef]);

  // Stable ref for clampZoom/clampZoomRaw/onZoomCommit to avoid re-attaching the wheel listener.
  const clampZoomRef = useRef(clampZoom);
  const clampZoomRawRef = useRef(clampZoomRaw);
  const onZoomCommitRef = useRef(onZoomCommit);
  useEffect(() => {
    clampZoomRef.current = clampZoom;
    clampZoomRawRef.current = clampZoomRaw;
    onZoomCommitRef.current = onZoomCommit;
  });

  // Wheel zoom handler — no Ctrl requirement.
  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;
    let commitTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const onWheel = (e: WheelEvent) => {
      // When requireCtrl is set (expanded page), let normal scroll through
      if (requireCtrl && !e.ctrlKey) return;
      e.preventDefault(); // Block page scroll — zoom active

      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      // Normalize deltaY across deltaMode values:
      // mode 0 = pixels (trackpad/smooth wheel), mode 1 = lines (~16px each),
      // mode 2 = pages (rare).
      const normalizedDeltaY = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
      const delta = -normalizedDeltaY * sensitivity;

      // First event of gesture: initialize from committed zoom and capture anchor
      if (gestureZoomRef.current === null) {
        gestureZoomRef.current = zoomRef.current;
        const rect = el.getBoundingClientRect();
        gestureAnchorRef.current = {
          mx: e.clientX - rect.left,
          my: e.clientY - rect.top,
          sx: el.scrollLeft,
          sy: el.scrollTop,
        };
        wrapper.style.willChange = "transform";
        wrapper.style.transformOrigin = "0 0";
      }

      // Accumulate delta — raw clamp for continuous GPU scaling
      gestureZoomRef.current = clampZoomRawRef.current(gestureZoomRef.current + delta);

      // Apply transform directly to DOM — no React render
      if (gestureAnchorRef.current) {
        applyGestureTransform(wrapper, gestureZoomRef.current, zoomRef.current, gestureAnchorRef.current);
      }

      // Debounce commit: after 150ms of no events, flush to React state
      if (commitTimeoutId !== null) clearTimeout(commitTimeoutId);
      commitTimeoutId = setTimeout(() => {
        commitTimeoutId = null;
        const finalZoom = gestureZoomRef.current;
        if (finalZoom === null) return;
        gestureZoomRef.current = null;
        onZoomCommitRef.current(clampZoomRef.current(finalZoom));
        wrapper.style.willChange = "";
      }, 150);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (commitTimeoutId !== null) {
        clearTimeout(commitTimeoutId);
        // Cleanup with pending gesture: commit immediately
        const finalZoom = gestureZoomRef.current;
        if (finalZoom !== null) {
          gestureZoomRef.current = null;
          onZoomCommitRef.current(clampZoomRef.current(finalZoom));
        }
        const wrapper = wrapperRef.current;
        if (wrapper) {
          wrapper.style.transform = "";
          wrapper.style.willChange = "";
        }
      }
    };
  }, [enabled, sensitivity, containerRef, wrapperRef, requireCtrl]);

  return { isHovering, gestureAnchorRef, gestureZoomRef };
}
