import type React from "react";
import { useLayoutEffect, useState } from "react";

/**
 * Minimum space (px) required on the preferred side before flipping to the
 * opposite side. Accommodates the typical summary popover height.
 */
const MIN_SPACE_PX = 200;

/**
 * Computes the optimal popover side (top or bottom) once when the popover
 * opens, then locks it for the duration. Prevents the jarring UX where
 * Radix's flip middleware repositions the popover as the user scrolls.
 *
 * Uses useLayoutEffect (runs after DOM commit, before paint) so the side is
 * resolved before the popover is visible — no flash of wrong position.
 *
 * Isolated into its own hook because `setState` inside `useLayoutEffect`
 * causes the React Compiler to bail out — keeping this in CitationComponent
 * would prevent the compiler from optimizing the entire component.
 */
export function useLockedPopoverSide(
  isOpen: boolean,
  preferredSide: "top" | "bottom",
  triggerRef: React.RefObject<HTMLSpanElement | null>,
): "top" | "bottom" {
  const [side, setSide] = useState(preferredSide);

  // biome-ignore lint/correctness/useExhaustiveDependencies: triggerRef has stable identity — refs should not be in deps per React docs
  useLayoutEffect(() => {
    // Only compute when the popover opens; stale value on close is harmless.
    if (!isOpen || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Respect the consumer's preference unless there's clearly not enough room.
    if (preferredSide === "bottom") {
      setSide(spaceBelow >= MIN_SPACE_PX ? "bottom" : "top");
    } else {
      setSide(spaceAbove >= MIN_SPACE_PX ? "top" : "bottom");
    }
  }, [isOpen, preferredSide]);

  return side;
}
