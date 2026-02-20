import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Scroll position state for determining fade visibility and pan affordance.
 */
export interface ScrollState {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

const INITIAL_SCROLL_STATE: ScrollState = {
  scrollLeft: 0,
  scrollWidth: 0,
  clientWidth: 0,
  canScrollLeft: false,
  canScrollRight: false,
};

/** Minimum drag distance (px) before a mousedown+mouseup is treated as a drag rather than a click. */
const DRAG_THRESHOLD = 5;

/**
 * Hook for drag-to-pan on a scrollable container.
 *
 * - **Mouse**: drag to pan (grab cursor). Click suppression when drag > 5px.
 * - **Touch**: relies on native overflow scrolling (no manual touch handling).
 * - **Scroll state**: tracks canScrollLeft/canScrollRight for fade mask updates.
 * - **direction**: `"x"` (default) for horizontal-only; `"xy"` for both axes.
 *
 * @example
 * ```tsx
 * const { containerRef, isDragging, handlers, scrollState, wasDragging } = useDragToPan();
 *
 * <div ref={containerRef} style={{ overflowX: "auto" }} {...handlers}>
 *   <img ... />
 * </div>
 *
 * // In click handler:
 * if (wasDragging.current) { wasDragging.current = false; return; }
 * ```
 */
export function useDragToPan(options: { direction?: "x" | "xy" } = {}): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
  };
  scrollTo: (x: number) => void;
  scrollState: ScrollState;
  /** Ref that is true after a drag gesture ended. Consumer should check and reset in click handler. */
  wasDragging: React.MutableRefObject<boolean>;
} {
  const { direction = "x" } = options;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scrollState, setScrollState] = useState<ScrollState>(INITIAL_SCROLL_STATE);

  // Drag tracking via refs (avoids re-renders during active drag)
  const isPressed = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startScrollLeft = useRef(0);
  const startScrollTop = useRef(0);
  const dragDistance = useRef(0);
  const wasDragging = useRef(false);

  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setScrollState({
      scrollLeft,
      scrollWidth,
      clientWidth,
      canScrollLeft: scrollLeft > 2,
      canScrollRight: scrollLeft + clientWidth < scrollWidth - 2,
    });
  }, []);

  // Listen for scroll events (native touch scroll + programmatic) with RAF debounce
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        updateScrollState();
        rafId = null;
      });
    };

    const listenerOptions: AddEventListenerOptions = { passive: true };
    el.addEventListener("scroll", onScroll, listenerOptions);

    // Initial measurement
    updateScrollState();

    return () => {
      el.removeEventListener("scroll", onScroll, listenerOptions);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [updateScrollState]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    // Only primary mouse button
    if (e.button !== 0) return;

    isPressed.current = true;
    dragDistance.current = 0;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startScrollLeft.current = el.scrollLeft;
    startScrollTop.current = el.scrollTop;
    // Don't set isDragging yet — wait until threshold is exceeded
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPressed.current) return;
      const el = containerRef.current;
      if (!el) return;

      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;
      // For xy mode use the larger axis; for x-only keep original horizontal-only check
      // so vertical jitter doesn't suppress clicks on the keyhole strip.
      dragDistance.current = direction === "xy" ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.abs(dx);

      if (dragDistance.current > DRAG_THRESHOLD) {
        if (!isDragging) setIsDragging(true);
      }

      el.scrollLeft = startScrollLeft.current - dx;
      if (direction === "xy") {
        el.scrollTop = startScrollTop.current - dy;
      }
    },
    [isDragging, direction],
  );

  const finishDrag = useCallback(() => {
    if (!isPressed.current) return;
    isPressed.current = false;
    if (dragDistance.current > DRAG_THRESHOLD) {
      wasDragging.current = true;
    }
    setIsDragging(false);
    updateScrollState();
  }, [updateScrollState]);

  // Global mouseup catches releases outside the container (image drags, mouse leaving window, etc.)
  // Without this, isPressed stays true and any future mousemove causes phantom panning.
  useEffect(() => {
    document.addEventListener("mouseup", finishDrag);
    return () => document.removeEventListener("mouseup", finishDrag);
  }, [finishDrag]);

  const onMouseUp = finishDrag;
  const onMouseLeave = finishDrag;

  const scrollTo = useCallback(
    (x: number) => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollLeft = x;
      updateScrollState();
    },
    [updateScrollState],
  );

  return {
    containerRef,
    isDragging,
    handlers: { onMouseDown, onMouseMove, onMouseUp, onMouseLeave },
    scrollTo,
    scrollState,
    wasDragging,
  };
}
