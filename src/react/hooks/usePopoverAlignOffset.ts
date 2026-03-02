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
 * Reactivity:
 * - Window resize: viewport width changes.
 * - ResizeObserver (inline size only): reacts immediately when the popover's
 *   width changes mid-state (e.g., keyhole image load, keyhole expand,
 *   expandedNaturalWidth confirmation). This prevents overflow that would
 *   otherwise persist until the guard's 300ms debounce fires.
 * - popoverViewState: view-state changes via useLayoutEffect.
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

  // Shared measurement logic — called from useLayoutEffect and resize listener.
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

    // Use clientWidth (visible viewport excluding scrollbar) instead of
    // window.innerWidth (which includes scrollbar like CSS 100dvw).
    const viewportWidth = document.documentElement.clientWidth;
    const popoverWidth = popoverEl.getBoundingClientRect().width;
    if (popoverWidth <= 0) {
      setOffset(0);
      return;
    }
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

  // Window resize listener for viewport width changes.
  useEffect(() => {
    if (!isOpen) return;

    let rafId = 0;
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => recompute());
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen, recompute]);

  // Width-change observer: recompute alignment whenever the popover's inline
  // size changes mid-state. Handles shellWidth updates from image load
  // (onKeyholeWidth), keyhole expand, or expandedNaturalWidth confirmation.
  // Sentinel prevInlineSize=-1 ensures a recompute on first observation,
  // covering cases where useLayoutEffect ran with width=0 (ref not yet set).
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity
  useEffect(() => {
    if (!isOpen) return;
    const el = popoverContentRef.current;
    if (!el) return;

    let prevInlineSize = -1;

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const inlineSize =
          entry.borderBoxSize?.[0]?.inlineSize ?? el.getBoundingClientRect().width;
        if (inlineSize !== prevInlineSize) {
          prevInlineSize = inlineSize;
          recompute();
          break;
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, recompute]);

  return offset;
}
