import type React from "react";
import { useLayoutEffect, useState } from "react";
import { VIEWPORT_MARGIN_PX } from "../constants.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";

/**
 * Computes a sideOffset that positions the popover at 1rem from the viewport
 * edge in expanded-page mode. Respects the locked side so the popover fills
 * the viewport without jumping between top/bottom.
 *
 * Uses `useLayoutEffect` + `useState` so the offset is computed **after DOM
 * mutations but before paint**. React 18+ batches the synchronous re-render
 * triggered by `setState` inside `useLayoutEffect` within the same paint
 * frame, so Floating UI never sees a stale offset.
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

  useLayoutEffect(() => {
    if (popoverViewState !== "expanded-page") {
      setOffset(undefined);
      return;
    }
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      setOffset(undefined);
      return;
    }
    setOffset(
      lockedSide === "bottom"
        ? VIEWPORT_MARGIN_PX - triggerRect.bottom
        : triggerRect.top - (document.documentElement.clientHeight - VIEWPORT_MARGIN_PX),
    );
  }, [popoverViewState, lockedSide, triggerRef]);

  return offset;
}
