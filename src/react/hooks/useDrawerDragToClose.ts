import { useCallback, useEffect, useRef, useState } from "react";
import { DRAWER_DRAG_CLOSE_THRESHOLD_PX } from "../constants.js";

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
 *   - Downward: clamped ≥ 0 for close gesture.
 *   - Upward: clamped to -threshold for expand gesture.
 * - `touchend` closes if past threshold (down), expands if past threshold (up),
 *   otherwise snaps back.
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

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      startYRef.current = e.touches[0].clientY;
      hasVibratedRef.current = false;
      setIsDragging(true);
    },
    [enabled],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (startYRef.current === null) return;
      const deltaY = e.touches[0].clientY - startYRef.current;

      if (deltaY >= 0) {
        // Downward drag — close gesture (positive offset)
        setDragOffset(deltaY);
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
    [threshold],
  );

  const handleTouchEnd = useCallback(() => {
    if (startYRef.current === null) return;
    startYRef.current = null;
    setIsDragging(false);
    setDragDirection(null);

    setDragOffset(prev => {
      if (prev >= threshold && isMountedRef.current) {
        // Close — drag exceeded downward threshold
        queueMicrotask(() => {
          if (isMountedRef.current) onCloseRef.current();
        });
      } else if (prev <= -threshold && isMountedRef.current && onExpandRef.current) {
        // Expand — drag exceeded upward threshold
        queueMicrotask(() => {
          if (isMountedRef.current) onExpandRef.current?.();
        });
      }
      return 0;
    });
  }, [threshold]);

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
