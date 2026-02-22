/**
 * Click/touch outside dismiss hook for popovers.
 *
 * Consolidates mobile outside-touch and desktop outside-click dismiss
 * into a single hook with platform-aware logic.
 *
 * @packageDocumentation
 */

import { type RefObject, useEffect, useRef } from "react";

export interface UsePopoverDismissOptions {
  /** Whether the popover is currently open */
  isOpen: boolean;
  /** Ref to the trigger element */
  triggerRef: RefObject<HTMLElement | null>;
  /** Ref to the popover content element */
  contentRef: RefObject<HTMLElement | null>;
  /** Callback when outside interaction is detected */
  onDismiss: () => void;
  /** Whether on a mobile/touch device */
  isMobile: boolean;
  /** Whether any overlay (e.g. zoomed image) is currently open */
  isAnyOverlayOpen?: boolean;
}

/**
 * Handles click-outside / touch-outside dismiss for popovers.
 *
 * On mobile: uses `touchstart` capture-phase listener.
 * On desktop: uses `mousedown` capture-phase listener.
 *
 * Skips dismissal when an overlay (e.g. zoomed image) is open.
 */
export function usePopoverDismiss({
  isOpen,
  triggerRef,
  contentRef,
  onDismiss,
  isMobile,
  isAnyOverlayOpen = false,
}: UsePopoverDismissOptions): void {
  // Ref to avoid stale closure for isAnyOverlayOpen
  const isAnyOverlayOpenRef = useRef(isAnyOverlayOpen);
  isAnyOverlayOpenRef.current = isAnyOverlayOpen;

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: TouchEvent | MouseEvent) => {
      // Don't dismiss while an image overlay is open
      if (isAnyOverlayOpenRef.current) return;

      const target = e.target;
      if (!(target instanceof Node)) return;

      // Check if interaction is inside the trigger or popover content
      if (triggerRef.current?.contains(target)) return;
      if (contentRef.current?.contains(target)) return;

      onDismiss();
    };

    if (isMobile) {
      document.addEventListener("touchstart", handleOutside, { capture: true });
      return () => {
        document.removeEventListener("touchstart", handleOutside, { capture: true });
      };
    }

    document.addEventListener("mousedown", handleOutside, { capture: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside, { capture: true });
    };
  }, [isOpen, isMobile, onDismiss, triggerRef, contentRef]);
}
