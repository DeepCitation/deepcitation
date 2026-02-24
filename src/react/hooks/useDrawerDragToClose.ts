import { useCallback, useEffect, useRef, useState } from "react";
import { DRAWER_DRAG_CLOSE_THRESHOLD_PX } from "../constants.js";

interface UseDrawerDragToCloseOptions {
  /** Called when the drag distance exceeds the threshold. */
  onClose: () => void;
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
  /** Current downward drag offset in px (0 when not dragging). */
  dragOffset: number;
  /** Whether a drag gesture is active. */
  isDragging: boolean;
}

/**
 * Hook that enables drag-to-close on a bottom-sheet drawer handle bar.
 *
 * - `touchstart` on the handle captures startY.
 * - `touchmove` on the document computes downward delta (clamped ≥ 0).
 * - `touchend` closes if past threshold, otherwise snaps back.
 */
export function useDrawerDragToClose({
  onClose,
  threshold = DRAWER_DRAG_CLOSE_THRESHOLD_PX,
  enabled = true,
}: UseDrawerDragToCloseOptions): UseDrawerDragToCloseResult {
  const handleRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef<number | null>(null);

  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      startYRef.current = e.touches[0].clientY;
      setIsDragging(true);
    },
    [enabled],
  );

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startYRef.current === null) return;
    const deltaY = e.touches[0].clientY - startYRef.current;
    // Only allow downward dragging (clamped ≥ 0)
    setDragOffset(Math.max(0, deltaY));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (startYRef.current === null) return;
    startYRef.current = null;
    setIsDragging(false);

    setDragOffset(prev => {
      if (prev >= threshold) {
        // Close — use a microtask so the state update doesn't conflict
        queueMicrotask(() => onCloseRef.current());
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
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      handle.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { handleRef, drawerRef, dragOffset, isDragging };
}
