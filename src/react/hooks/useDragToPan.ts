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

// ---------------------------------------------------------------------------
// Momentum / inertia constants (local — not exported)
// ---------------------------------------------------------------------------
/** Number of recent move samples for velocity estimation. */
const VELOCITY_SAMPLE_COUNT = 4;
/** Minimum velocity (px/ms) to trigger momentum coast after release. */
const VELOCITY_THRESHOLD = 0.15;
/** Per-frame deceleration multiplier (~1s coast at 60fps, matching iOS normal). */
const DECELERATION = 0.95;
/** Velocity cutoff (px/frame) below which momentum stops. */
const VELOCITY_CUTOFF = 0.5;

interface MoveSample {
  x: number;
  y: number;
  t: number;
}

/**
 * Hook for drag-to-pan on a scrollable container.
 *
 * - **Mouse**: drag to pan (grab cursor). Click suppression when drag > 5px.
 * - **Touch**: relies on native overflow scrolling (no manual touch handling).
 * - **Scroll state**: tracks canScrollLeft/canScrollRight for fade mask updates.
 * - **Momentum**: on mouse release, applies deceleration physics if velocity exceeds threshold.
 * - **direction**: `"x"` (default) for horizontal-only; `"xy"` for both axes.
 *
 * @example
 * ```tsx
 * const { containerRef, isDragging, handlers, scrollState, wasDraggingRef } = useDragToPan();
 *
 * <div ref={containerRef} style={{ overflowX: "auto" }} {...handlers}>
 *   <img ... />
 * </div>
 *
 * // In click handler:
 * if (wasDraggingRef.current) { wasDraggingRef.current = false; return; }
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
  wasDraggingRef: React.MutableRefObject<boolean>;
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
  const wasDraggingRef = useRef(false);

  // Momentum tracking
  const moveHistoryRef = useRef<MoveSample[]>([]);
  const momentumRafRef = useRef<number | null>(null);

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

  /** Cancel any active momentum animation. */
  const cancelMomentum = useCallback(() => {
    if (momentumRafRef.current !== null) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
  }, []);

  // Clean up momentum on unmount
  useEffect(() => () => cancelMomentum(), [cancelMomentum]);

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

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      // Only primary mouse button
      if (e.button !== 0) return;

      // Cancel active momentum on new mousedown
      cancelMomentum();

      isPressed.current = true;
      dragDistance.current = 0;
      startX.current = e.clientX;
      startY.current = e.clientY;
      startScrollLeft.current = el.scrollLeft;
      startScrollTop.current = el.scrollTop;
      moveHistoryRef.current = [{ x: e.clientX, y: e.clientY, t: Date.now() }];
      // Don't set isDragging yet — wait until threshold is exceeded
    },
    [cancelMomentum],
  );

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

      // Record move sample for velocity estimation (ring buffer)
      const now = Date.now();
      const history = moveHistoryRef.current;
      history.push({ x: e.clientX, y: e.clientY, t: now });
      if (history.length > VELOCITY_SAMPLE_COUNT) {
        history.shift();
      }
    },
    [isDragging, direction],
  );

  const finishDrag = useCallback(() => {
    if (!isPressed.current) return;
    isPressed.current = false;
    if (dragDistance.current > DRAG_THRESHOLD) {
      wasDraggingRef.current = true;
    }
    setIsDragging(false);

    // Compute velocity from move history for momentum
    const history = moveHistoryRef.current;
    moveHistoryRef.current = [];

    if (history.length >= 2) {
      const first = history[0];
      const last = history[history.length - 1];
      const dt = last.t - first.t;

      if (dt > 0) {
        // Velocity in px/ms (drag direction is inverted — dragging right scrolls left)
        const vx = -(last.x - first.x) / dt;
        const vy = direction === "xy" ? -(last.y - first.y) / dt : 0;
        const speed = Math.sqrt(vx * vx + vy * vy);

        if (speed > VELOCITY_THRESHOLD) {
          // Convert px/ms to px/frame (~16.67ms per frame at 60fps)
          let frameVx = vx * 16.67;
          let frameVy = vy * 16.67;

          const coast = () => {
            const el = containerRef.current;
            if (!el) return;

            el.scrollLeft += frameVx;
            if (direction === "xy") {
              el.scrollTop += frameVy;
            }

            frameVx *= DECELERATION;
            frameVy *= DECELERATION;

            if (Math.abs(frameVx) > VELOCITY_CUTOFF || Math.abs(frameVy) > VELOCITY_CUTOFF) {
              momentumRafRef.current = requestAnimationFrame(coast);
            } else {
              momentumRafRef.current = null;
              updateScrollState();
            }
          };

          momentumRafRef.current = requestAnimationFrame(coast);
          return; // Skip updateScrollState — momentum loop handles it
        }
      }
    }

    updateScrollState();
  }, [updateScrollState, direction]);

  // Stable ref to finishDrag so the global mouseup listener doesn't need to
  // re-attach every time finishDrag gets a new identity (which happens when
  // updateScrollState changes). Without this, each render cycle would
  // remove + re-add the document-level listener.
  const finishDragRef = useRef(finishDrag);
  useEffect(() => {
    finishDragRef.current = finishDrag;
  }, [finishDrag]);

  // Global mouseup catches releases outside the container (image drags, mouse leaving window, etc.)
  // Without this, isPressed stays true and any future mousemove causes phantom panning.
  useEffect(() => {
    const handler = () => finishDragRef.current();
    document.addEventListener("mouseup", handler);
    return () => document.removeEventListener("mouseup", handler);
  }, []);

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
    wasDraggingRef,
  };
}
