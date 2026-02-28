import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { VIEWPORT_MARGIN_PX } from "../constants.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";

/**
 * Computes an alignOffset that prevents the popover from overflowing the
 * viewport horizontally. With avoidCollisions={false}, Radix's shift middleware
 * is disabled — this hook replaces it for the horizontal axis.
 *
 * Isolated into its own hook because `setState` inside `useLayoutEffect`
 * causes the React Compiler to bail out — keeping this in CitationComponent
 * would prevent the compiler from optimizing the entire component.
 *
 * Uses useLayoutEffect (runs before paint) so the offset is applied before the
 * popover is visible — no flash of wrong position.
 *
 * Reactivity: ResizeObserver on popover element + window resize listener
 * catch late-arriving width changes (image loads, viewport resize).
 *
 * Math (with align="center"):
 *   idealLeft  = triggerCenter - popoverWidth / 2
 *   idealRight = triggerCenter + popoverWidth / 2
 *   If idealLeft  < MARGIN → shift right:  offset = MARGIN - idealLeft
 *   If idealRight > vw - MARGIN → shift left: offset = (vw - MARGIN) - idealRight
 */
export function usePopoverAlignOffset(
  isOpen: boolean,
  popoverViewState: PopoverViewState,
  triggerRef: React.RefObject<HTMLSpanElement | null>,
  popoverContentRef: React.RefObject<HTMLElement | null>,
): number {
  const [offset, setOffset] = useState(0);

  // Shared measurement logic — called from both useLayoutEffect and observers.
  // biome-ignore lint/correctness/useExhaustiveDependencies: triggerRef and popoverContentRef have stable identity — refs should not be in deps per React docs
  const recompute = useCallback(() => {
    if (!isOpen) {
      setOffset(0);
      return;
    }

    const triggerRect = triggerRef.current?.getBoundingClientRect();
    const popoverEl = popoverContentRef.current;
    if (!triggerRect || !popoverEl) {
      setOffset(0);
      return;
    }

    const viewportWidth = window.innerWidth;
    const popoverWidth = popoverEl.getBoundingClientRect().width;
    const triggerCenter = triggerRect.left + triggerRect.width / 2;

    // Where the popover edges would sit with align="center" and no offset.
    // This computation is independent of the current alignOffset, so
    // the effect converges in a single pass without oscillation.
    const idealLeft = triggerCenter - popoverWidth / 2;
    const idealRight = triggerCenter + popoverWidth / 2;

    if (idealLeft < VIEWPORT_MARGIN_PX) {
      setOffset(VIEWPORT_MARGIN_PX - idealLeft);
    } else if (idealRight > viewportWidth - VIEWPORT_MARGIN_PX) {
      setOffset(viewportWidth - VIEWPORT_MARGIN_PX - idealRight);
    } else {
      setOffset(0);
    }
  }, [isOpen]);

  // Initial computation + re-run on viewState change (before paint).
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute is stable via useCallback; popoverViewState triggers re-measurement
  useLayoutEffect(() => {
    recompute();
  }, [recompute, popoverViewState]);

  // Reactive re-computation: ResizeObserver catches popover content reflow
  // (image loads, dynamic content), window resize catches viewport changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity — refs should not be in deps per React docs
  useEffect(() => {
    if (!isOpen) return;

    const popoverEl = popoverContentRef.current;
    if (!popoverEl) return;

    const ro = new ResizeObserver(() => recompute());
    ro.observe(popoverEl);

    window.addEventListener("resize", recompute);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [isOpen, recompute]);

  return offset;
}
