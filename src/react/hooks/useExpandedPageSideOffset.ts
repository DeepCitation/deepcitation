import type React from "react";
import { useMemo } from "react";
import { VIEWPORT_MARGIN_PX } from "../constants.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";

/**
 * Computes a sideOffset that positions the popover at 1rem from the viewport
 * edge in expanded-page mode. Respects the locked side so the popover fills
 * the viewport without jumping between top/bottom.
 *
 * Uses `useMemo` so the offset is available **during the same render** as the
 * view-state change — no one-frame delay where the popover has viewport
 * dimensions but the old sideOffset (which caused the popover to shoot upward
 * out of the viewport).
 *
 * Previous approach used `useLayoutEffect` + `setState`, which required a
 * synchronous re-render before paint. While React 18 batches this before paint,
 * Floating UI's async `computePosition()` could resolve with the stale offset
 * from the first render, causing a visible flash.
 *
 * Offset math by side:
 * - bottom: sideOffset = 16 - triggerRect.bottom  → top edge at 1rem from viewport top
 * - top:    sideOffset = triggerRect.top - (viewportHeight - 16) → bottom edge at 1rem from viewport bottom
 */
export function useExpandedPageSideOffset(
  popoverViewState: PopoverViewState,
  triggerRef: React.RefObject<HTMLSpanElement | null>,
  lockedSide: "top" | "bottom",
): number | undefined {
  // biome-ignore lint/correctness/useExhaustiveDependencies: triggerRef has stable identity — refs should not be in deps per React docs
  return useMemo(() => {
    if (popoverViewState !== "expanded-page") return undefined;
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) return undefined;
    return lockedSide === "bottom"
      ? VIEWPORT_MARGIN_PX - triggerRect.bottom
      : triggerRect.top - (window.innerHeight - VIEWPORT_MARGIN_PX);
  }, [popoverViewState, lockedSide]);
}
