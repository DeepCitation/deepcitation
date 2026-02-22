/**
 * Popover positioning hook for expanded-page mode.
 *
 * Computes a sideOffset that positions the popover at 1rem from viewport top.
 * floating-ui's shift middleware only shifts on the main axis (horizontal for
 * side="bottom"), not vertically. This hook uses the offset middleware instead
 * by computing the exact vertical offset needed.
 *
 * @packageDocumentation
 */

import { type RefObject, useLayoutEffect, useState } from "react";
import type { PopoverViewState } from "../DefaultPopoverContent.js";

const VIEWPORT_MARGIN = 16; // 1rem

export interface UsePopoverPositionOptions {
  /** Current popover view state */
  viewState: PopoverViewState;
  /** Ref to the trigger element for positioning calculations */
  triggerRef: RefObject<HTMLElement | null>;
}

export interface UsePopoverPositionResult {
  /** Side offset for the popover, or undefined for default positioning */
  sideOffset: number | undefined;
}

/**
 * Computes popover side offset for expanded-page mode.
 *
 * Uses `useLayoutEffect` to run after DOM commit but before paint,
 * so the offset is applied before the popover is visible.
 */
export function usePopoverPosition({ viewState, triggerRef }: UsePopoverPositionOptions): UsePopoverPositionResult {
  const [sideOffset, setSideOffset] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (viewState !== "expanded-page") {
      setSideOffset(undefined);
      return;
    }
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      setSideOffset(undefined);
      return;
    }
    // For side="bottom": popover.top = trigger.bottom + sideOffset
    // We want popover.top = VIEWPORT_MARGIN
    setSideOffset(VIEWPORT_MARGIN - triggerRect.bottom);
  }, [viewState, triggerRef]);

  return { sideOffset };
}
