import type React from "react";
import { useLayoutEffect, useState } from "react";
import { VIEWPORT_MARGIN_PX } from "../constants.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";

/**
 * Computes a sideOffset that positions the popover at 1rem from the viewport
 * edge in expanded-page mode. Respects the locked side so the popover fills
 * the viewport without jumping between top/bottom.
 *
 * Isolated into its own hook because `setState` inside `useLayoutEffect`
 * causes the React Compiler to bail out — keeping this in CitationComponent
 * would prevent the compiler from optimizing the entire component.
 *
 * Uses useLayoutEffect (runs after DOM commit, before paint) so the offset is
 * applied before the popover is visible — no flash of wrong position.
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
  const [offset, setOffset] = useState<number | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: triggerRef has stable identity — refs should not be in deps per React docs
  useLayoutEffect(() => {
    const triggerRect = popoverViewState === "expanded-page" ? triggerRef.current?.getBoundingClientRect() : null;
    if (!triggerRect) {
      setOffset(undefined);
      return;
    }
    setOffset(
      lockedSide === "bottom"
        ? VIEWPORT_MARGIN_PX - triggerRect.bottom
        : triggerRect.top - (window.innerHeight - VIEWPORT_MARGIN_PX),
    );
  }, [popoverViewState, lockedSide]);
  return offset;
}
