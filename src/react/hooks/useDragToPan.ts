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
  canScrollUp: boolean;
  canScrollDown: boolean;
}

const INITIAL_SCROLL_STATE: ScrollState = {
  scrollLeft: 0,
  scrollWidth: 0,
  clientWidth: 0,
  canScrollLeft: false,
  canScrollRight: false,
  canScrollUp: false,
  canScrollDown: false,
};

/** Minimum drag distance (px) before a mousedown+mouseup is treated as a drag rather than a click. */
const DRAG_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Momentum / inertia constants (local — not exported)
// ---------------------------------------------------------------------------
/** Number of recent move samples for velocity estimation. */
const VELOCITY_SAMPLE_COUNT = 5;
/** Minimum velocity (px/ms) to trigger momentum coast after release. */
const VELOCITY_THRESHOLD = 0.08;
/** Max age (ms) of the newest move sample for momentum to apply. If the user paused longer than this before releasing, momentum is suppressed. */
const STALE_SAMPLE_MS = 80;
/** Per-frame deceleration multiplier (~0.3s coast at 60fps — TikTok flick-and-stop). */
const DECELERATION = 0.88;
/** Velocity cutoff (px/frame) below which momentum stops. */
const VELOCITY_CUTOFF = 0.3;
/** Initial velocity boost — amplifies the "launch" before deceleration kicks in. */
const VELOCITY_BOOST = 2.0;

/** Dead zone before axis lock on touch (direction === "x" only). */
const TOUCH_LOCK_PX = 10;

interface MoveSample {
  x: number;
  y: number;
  t: number;
}

/**
 * Compute velocity from move history and start a momentum coast animation.
 * Shared between mouse finishDrag and touch onTouchEnd.
 *
 * @returns true if momentum was started, false otherwise.
 */
function startMomentumCoast(
  history: MoveSample[],
  el: HTMLElement,
  direction: "x" | "xy",
  momentumRafRef: React.MutableRefObject<number | null>,
  onDone: () => void,
): boolean {
  if (history.length < 2) return false;

  const first = history[0];
  const last = history[history.length - 1];
  const timeSinceLastMove = Date.now() - last.t;
  if (timeSinceLastMove > STALE_SAMPLE_MS) return false;

  const dt = last.t - first.t;
  if (dt <= 0) return false;

  // Velocity in px/ms (drag direction is inverted — dragging right scrolls left)
  const vx = -(last.x - first.x) / dt;
  const vy = direction === "xy" ? -(last.y - first.y) / dt : 0;
  const speed = Math.sqrt(vx * vx + vy * vy);

  if (speed <= VELOCITY_THRESHOLD) return false;

  // Convert px/ms to px/frame (~16.67ms per frame at 60fps)
  let frameVx = vx * VELOCITY_BOOST * 16.67;
  let frameVy = vy * VELOCITY_BOOST * 16.67;
  let lastFrameTime = performance.now();

  const coast = () => {
    const now = performance.now();
    const frameDt = now - lastFrameTime;
    lastFrameTime = now;
    const factor = DECELERATION ** (frameDt / 16.67);

    el.scrollLeft += frameVx;
    if (direction === "xy") {
      el.scrollTop += frameVy;
    }

    frameVx *= factor;
    frameVy *= factor;

    if (Math.abs(frameVx) > VELOCITY_CUTOFF || Math.abs(frameVy) > VELOCITY_CUTOFF) {
      momentumRafRef.current = requestAnimationFrame(coast);
    } else {
      momentumRafRef.current = null;
      onDone();
    }
  };

  momentumRafRef.current = requestAnimationFrame(coast);
  return true;
}

/**
 * Hook for drag-to-pan on a scrollable container.
 *
 * - **Mouse**: drag to pan (grab cursor). Click suppression when drag > 5px.
 * - **Touch (x)**: direction-locked with edge passthrough to popover handler.
 * - **Touch (xy)**: relies on native overflow scrolling.
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
    const { scrollLeft, scrollWidth, clientWidth, scrollTop, scrollHeight, clientHeight } = el;
    setScrollState({
      scrollLeft,
      scrollWidth,
      clientWidth,
      canScrollLeft: scrollLeft > 2,
      canScrollRight: scrollLeft + clientWidth < scrollWidth - 2,
      canScrollUp: scrollTop > 2,
      canScrollDown: scrollTop + clientHeight < scrollHeight - 2,
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
    // Suppress click if the mouse moved beyond the drag threshold OR if the
    // container actually scrolled (even 1px). The scroll check catches slow,
    // deliberate pans that move the image but keep mouse movement under DRAG_THRESHOLD.
    const el = containerRef.current;
    const scrollMoved =
      el &&
      (el.scrollLeft !== startScrollLeft.current || (direction === "xy" && el.scrollTop !== startScrollTop.current));
    if (dragDistance.current > DRAG_THRESHOLD || scrollMoved) {
      wasDraggingRef.current = true;
    }
    setIsDragging(false);

    // Compute velocity from move history for momentum
    const history = moveHistoryRef.current;
    moveHistoryRef.current = [];

    if (el && startMomentumCoast(history, el, direction, momentumRafRef, updateScrollState)) {
      return; // Momentum loop handles updateScrollState
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

  // ---------------------------------------------------------------------------
  // Touch handling (direction === "x" only)
  // ---------------------------------------------------------------------------
  // For horizontal-only containers (keyhole strip), we need JS control over
  // touch gestures: direction lock decides whether the gesture pans the
  // keyhole (horizontal) or passes through to the popover's touch handler
  // for page scrolling (vertical). At scroll edges, panning transitions to
  // passthrough so continued swiping scrolls the page.

  // Disable native touch scroll so our direction lock has full control.
  // Only for direction="x" — the "xy" case (InlineExpandedImage) uses native scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || direction !== "x") return;
    const prev = el.style.touchAction;
    el.style.touchAction = "none";
    return () => {
      el.style.touchAction = prev;
    };
  }, [direction]);

  // Touch event handlers for direction-locked panning + edge passthrough.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || direction !== "x") return;

    type Phase = "undecided" | "panning" | "passthrough";
    let phase: Phase = "undecided";
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartScrollLeft = 0;
    const touchHistory: MoveSample[] = [];

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      cancelMomentum();
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartScrollLeft = el.scrollLeft;
      phase = "undecided";
      touchHistory.length = 0;
      touchHistory.push({ x: t.clientX, y: t.clientY, t: Date.now() });
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;

      if (phase === "undecided") {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < TOUCH_LOCK_PX) return;
        // Lock direction
        if (Math.abs(dx) >= Math.abs(dy)) {
          phase = "panning";
        } else {
          phase = "passthrough";
          return; // Bubbles to Popover touch handler
        }
      }

      if (phase === "passthrough") return;

      // --- Phase: panning ---
      // Check if we're at a scroll edge
      const targetScroll = touchStartScrollLeft - dx;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (
        (targetScroll <= 0 && dx > 0) || // At left edge, swiping right
        (targetScroll >= maxScroll && dx < 0) // At right edge, swiping left
      ) {
        // Switch to passthrough — stop preventing default so the popover
        // handler picks up the vertical component of continued swiping.
        phase = "passthrough";
        return;
      }

      e.preventDefault();
      el.scrollLeft = touchStartScrollLeft - dx;

      // Record velocity sample
      const now = Date.now();
      touchHistory.push({ x: t.clientX, y: t.clientY, t: now });
      if (touchHistory.length > VELOCITY_SAMPLE_COUNT) touchHistory.shift();
    };

    const onTouchEnd = () => {
      if (phase === "panning") {
        wasDraggingRef.current = true;
        // Apply momentum via shared helper — use x-only velocity
        startMomentumCoast([...touchHistory], el, "x", momentumRafRef, updateScrollState);
      }
      phase = "undecided";
      touchHistory.length = 0;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [direction, cancelMomentum, updateScrollState]);

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
