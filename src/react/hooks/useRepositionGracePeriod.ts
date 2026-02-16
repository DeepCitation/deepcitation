import { useCallback, useEffect, useRef } from "react";

/**
 * Manages a grace period to prevent popover dismissal during content resize/reposition.
 *
 * When popover content changes size (e.g., expanding search details), the popover
 * repositions and the cursor may end up outside the popover, triggering a mouseleave.
 * This hook provides a grace period that suppresses the close during the repositioning window.
 *
 * @param contentExpanded - Whether the popover content is currently expanded
 * @param isOpen - Whether the popover is currently open
 * @param gracePeriodMs - Duration of the grace period in milliseconds (default: 300ms)
 * @returns Object with isInGracePeriod flag and clearGracePeriod function
 *
 * @example
 * ```tsx
 * const { isInGracePeriod, clearGracePeriod } = useRepositionGracePeriod(
 *   isPhrasesExpanded,
 *   isHovering,
 *   300
 * );
 *
 * // In mouseleave handler:
 * if (isInGracePeriod.current) return; // Don't close during grace period
 *
 * // In mouseenter handler:
 * clearGracePeriod(); // Clear grace period when cursor re-enters
 * ```
 */
export function useRepositionGracePeriod(
  contentExpanded: boolean,
  isOpen: boolean,
  gracePeriodMs: number = 300,
): {
  isInGracePeriod: React.MutableRefObject<boolean>;
  clearGracePeriod: () => void;
} {
  /**
   * Grace period flag to prevent popover from closing during content resize/reposition.
   * When popover content changes size, the popover repositions and the cursor may end up
   * outside the popover, triggering a mouseleave. This ref suppresses the close during
   * the repositioning window (gracePeriodMs).
   */
  const isInGracePeriod = useRef(false);

  /** Timer handle for clearing the reposition grace period. */
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Track previous expansion state to detect changes. */
  const prevContentExpandedRef = useRef(contentExpanded);

  /**
   * Clear the grace period and any pending timer.
   * Called when cursor re-enters popover or when popover closes.
   */
  const clearGracePeriod = useCallback(() => {
    isInGracePeriod.current = false;
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  // When popover content resizes (details expand/collapse), the popover repositions
  // and the cursor may land outside the new bounds, firing a spurious mouseleave.
  // Set a grace period to suppress the close during repositioning.
  useEffect(() => {
    if (prevContentExpandedRef.current !== contentExpanded && isOpen) {
      isInGracePeriod.current = true;
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current); // Clear any existing grace period
      }
      graceTimerRef.current = setTimeout(() => {
        isInGracePeriod.current = false;
        graceTimerRef.current = null;
      }, gracePeriodMs);
    }
    prevContentExpandedRef.current = contentExpanded;
  }, [contentExpanded, isOpen, gracePeriodMs]);

  // Cleanup grace timer on unmount and when popover closes
  // biome-ignore lint/correctness/useExhaustiveDependencies: clearGracePeriod is stable via useCallback with empty deps
  useEffect(() => {
    // Clear grace period when popover closes (prevents stale state on next open)
    if (!isOpen) {
      clearGracePeriod();
    }
    // Cleanup on unmount
    return () => {
      clearGracePeriod();
    };
  }, [isOpen]);

  return { isInGracePeriod, clearGracePeriod };
}
