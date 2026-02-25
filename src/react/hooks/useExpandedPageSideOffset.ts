import type React from "react";
import { useLayoutEffect, useState } from "react";
import type { PopoverViewState } from "../DefaultPopoverContent.js";

/**
 * Computes a sideOffset that positions the popover at 1rem from viewport top
 * in expanded-page mode. Isolated into its own hook because `setState` inside
 * `useLayoutEffect` causes the React Compiler to bail out — keeping this in
 * CitationComponent would prevent the compiler from optimizing the entire component.
 *
 * Uses useLayoutEffect (runs after DOM commit, before paint) so the offset is
 * applied before the popover is visible — no flash of wrong position.
 */
export function useExpandedPageSideOffset(
  popoverViewState: PopoverViewState,
  triggerRef: React.RefObject<HTMLSpanElement | null>,
): number | undefined {
  const [offset, setOffset] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const VIEWPORT_MARGIN = 16; // 1rem
    const triggerRect = popoverViewState === "expanded-page" ? triggerRef.current?.getBoundingClientRect() : null;
    setOffset(triggerRect ? VIEWPORT_MARGIN - triggerRect.bottom : undefined);
  }, [popoverViewState, triggerRef]);
  return offset;
}
