import { useCallback, useEffect, useRef, useState } from "react";
import { DRAWER_DRAG_CLOSE_THRESHOLD_PX } from "../constants.js";

/** Minimum downward velocity (px/ms) to trigger flick-to-dismiss. ~500px/s. */
const FLICK_VELOCITY_THRESHOLD = 0.5;
/** Number of recent touch samples to keep for velocity estimation. */
const VELOCITY_SAMPLE_COUNT = 4;
/** Rubber-banding damping factor after exceeding threshold. */
const RUBBER_BAND_FACTOR = 0.4;

interface TouchSample {
  y: number;
  t: number;
}

interface UseDrawerDragToCloseOptions {
  /** Called when the drag distance exceeds the threshold. */
  onClose: () => void;
  /** Called when upward drag distance exceeds the expand threshold. */
  onExpand?: () => void;
  /** Override the default threshold (px). */
  threshold?: number;
  /** Whether drag-to-close is enabled (default: true). */
  enabled?: boolean;
}

interface UseDrawerDragToCloseResult {
  /** Attach to the handle bar element. */
  handleRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the drawer container for the transform. */
  drawerRef: React.RefObject<HTMLDivElement | null>;
  /** Current drag offset in px (positive = down, negative = up, 0 when not dragging). */
  dragOffset: number;
  /** Whether a drag gesture is active. */
  isDragging: boolean;
  /** Current drag direction: "up" (expanding), "down" (closing), or null (idle). */
  dragDirection: "up" | "down" | null;
}

/**
 * Hook that enables bidirectional drag on a bottom-sheet drawer handle bar.
 *
 * - `touchstart` on the handle captures startY.
 * - `touchmove` on the document computes delta (negative = up, positive = down).
 *   - Downward: rubber-banded past threshold for close gesture.
 *   - Upward: clamped to -threshold for expand gesture.
 * - `touchend` closes if past threshold (down) or fast flick, expands if past threshold (up),
 *   otherwise snaps back with CSS transition.
 */
export function useDrawerDragToClose({
  onClose,
  onExpand,
  threshold = DRAWER_DRAG_CLOSE_THRESHOLD_PX,
  enabled = true,
}: UseDrawerDragToCloseOptions): UseDrawerDragToCloseResult {
  const handleRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef<number | null>(null);

  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragDirection, setDragDirection] = useState<"up" | "down" | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const onExpandRef = useRef(onExpand);
  useEffect(() => {
    onExpandRef.current = onExpand;
  });

  const isMountedRef = useRef(true);
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  /** Tracks whether we've already fired haptic feedback for this gesture. Resets on touchstart. */
  const hasVibratedRef = useRef(false);

  /** Ring buffer of recent touch samples for velocity estimation. */
  const touchHistoryRef = useRef<TouchSample[]>([]);

  /** rAF ID for snap-back sequencing (deferred dragOffset reset). */
  const snapBackRafRef = useRef<number | null>(null);

  // Clean up rAF on unmount
  useEffect(
    () => () => {
      if (snapBackRafRef.current !== null) cancelAnimationFrame(snapBackRafRef.current);
    },
    [],
  );

  /** Apply rubber-banding: linear up to threshold, diminishing returns past it. */
  const applyRubberBand = useCallback(
    (rawDelta: number): number => {
      if (rawDelta <= threshold) return rawDelta;
      return threshold + (rawDelta - threshold) * RUBBER_BAND_FACTOR;
    },
    [threshold],
  );

  /** Compute downward velocity (px/ms) from the touch history ring buffer. */
  const computeVelocity = useCallback((): number => {
    const history = touchHistoryRef.current;
    if (history.length < 2) return 0;
    const first = history[0];
    const last = history[history.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return 0;
    // Positive = moving downward
    return (last.y - first.y) / dt;
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      // Cancel any pending snap-back animation from a previous gesture
      if (snapBackRafRef.current !== null) {
        cancelAnimationFrame(snapBackRafRef.current);
        snapBackRafRef.current = null;
      }
      startYRef.current = e.touches[0].clientY;
      hasVibratedRef.current = false;
      touchHistoryRef.current = [{ y: e.touches[0].clientY, t: Date.now() }];
      setIsDragging(true);
    },
    [enabled],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (startYRef.current === null) return;
      const clientY = e.touches[0].clientY;
      const deltaY = clientY - startYRef.current;

      // Record touch sample for velocity estimation (ring buffer)
      const now = Date.now();
      const history = touchHistoryRef.current;
      history.push({ y: clientY, t: now });
      if (history.length > VELOCITY_SAMPLE_COUNT) {
        history.shift();
      }

      if (deltaY >= 0) {
        // Downward drag — close gesture (rubber-banded past threshold)
        setDragOffset(applyRubberBand(deltaY));
        setDragDirection("down");
      } else if (onExpandRef.current) {
        // Upward drag — expand gesture (negative offset, clamped to -threshold)
        setDragOffset(Math.max(-threshold, deltaY));
        setDragDirection("up");
      } else {
        // No onExpand handler — ignore upward drag
        setDragOffset(0);
        setDragDirection(null);
      }

      // Fire haptic feedback once when the drag crosses the threshold
      if (!hasVibratedRef.current && (deltaY >= threshold || deltaY <= -threshold)) {
        hasVibratedRef.current = true;
        navigator.vibrate?.(10);
      }
    },
    [threshold, applyRubberBand],
  );

  const handleTouchEnd = useCallback(() => {
    if (startYRef.current === null) return;
    startYRef.current = null;

    const velocity = computeVelocity();
    touchHistoryRef.current = [];

    // Determine action from current state
    // We read dragOffset via the functional updater to get the latest value
    setDragOffset(prev => {
      const shouldClose =
        (prev >= threshold || velocity > FLICK_VELOCITY_THRESHOLD) && isMountedRef.current;
      const shouldExpand =
        prev <= -threshold && isMountedRef.current && onExpandRef.current;

      if (shouldClose) {
        // Fire close after state settles
        queueMicrotask(() => {
          if (isMountedRef.current) onCloseRef.current();
        });
        // Keep offset at current position — the drawer will unmount
        return prev;
      }

      if (shouldExpand) {
        queueMicrotask(() => {
          if (isMountedRef.current) onExpandRef.current?.();
        });
        return prev;
      }

      // Snap back: set isDragging=false first (enables CSS transition),
      // then defer dragOffset=0 to the next frame so the transition animates.
      setIsDragging(false);
      setDragDirection(null);

      snapBackRafRef.current = requestAnimationFrame(() => {
        snapBackRafRef.current = null;
        if (isMountedRef.current) {
          setDragOffset(0);
        }
      });

      // Return prev for now — the rAF will set it to 0
      return prev;
    });
  }, [threshold, computeVelocity]);

  // Attach touchstart to handle, touchmove/touchend to document
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle || !enabled) return;

    handle.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      handle.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { handleRef, drawerRef, dragOffset, isDragging, dragDirection };
}
