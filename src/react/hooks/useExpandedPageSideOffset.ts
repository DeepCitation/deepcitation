import type React from "react";
import { useLayoutEffect, useState } from "react";
import { expandedPageOffset } from "../../shared/popoverGeometry.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";

/**
 * Computes a sideOffset that positions the popover at 1rem from the viewport
 * edge in expanded-page mode. Respects the locked side so the popover fills
 * the viewport without jumping between top/bottom.
 *
 * Uses `useLayoutEffect` + `useState` so the offset is computed **after DOM
 * mutations but before paint**. React 18+ batches the synchronous re-render
 * triggered by `setState` inside `useLayoutEffect` within the same paint
 * frame, so the popover's `recomputePosition` sees the final offset.
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
      expandedPageOffset(lockedSide, triggerRect.top, triggerRect.bottom, document.documentElement.clientHeight),
    );
  }, [popoverViewState, lockedSide, triggerRef]);

  return offset;
}
