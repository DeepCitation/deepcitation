import type React from "react";
import { useLayoutEffect, useState } from "react";
import { lockSide } from "../../shared/popoverGeometry.js";
import { findPageScrollEl } from "../../shared/scroll.js";

/**
 * Computes the optimal popover side (top or bottom) once when the popover
 * opens, then locks it for the duration. Prevents the jarring UX where
 * the popover jumps between sides as the user scrolls.
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
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Compute the scroll container's top edge so lockSide knows how much space
    // above the trigger is actually usable (excluding any fixed header above
    // the scroll area).
    const scrollEl = findPageScrollEl(triggerRef.current);
    const containerTop = Math.max(0, scrollEl.getBoundingClientRect().top);
    setSide(lockSide(rect.bottom, rect.top, window.innerHeight, preferredSide, undefined, containerTop));
  }, [isOpen, preferredSide]);

  return side;
}
