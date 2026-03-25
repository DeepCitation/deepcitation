import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { POPOVER_WIDTH_DEFAULT_PX, VIEWPORT_MARGIN_PX } from "../constants.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";
import { SCROLL_LOCK_LAYOUT_SHIFT_EVENT } from "../scrollLock.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isValidProjectedWidth(px: number | null | undefined): px is number {
  return px !== null && px !== undefined && Number.isFinite(px) && px > 0;
}

function computeAlignOffset(
  viewportWidth: number,
  triggerLeft: number,
  triggerWidth: number,
  popoverWidth: number,
): number {
  const triggerCenter = triggerLeft + triggerWidth / 2;
  const centeredLeft = triggerCenter - popoverWidth / 2;
  const minLeft = VIEWPORT_MARGIN_PX;
  const maxLeft = viewportWidth - VIEWPORT_MARGIN_PX - popoverWidth;
  const desiredLeft = maxLeft < minLeft ? minLeft : clamp(centeredLeft, minLeft, maxLeft);
  // With align="start", base X is triggerLeft. alignOffset shifts to desiredLeft.
  return desiredLeft - triggerLeft;
}

/**
 * Computes an alignOffset that prevents the popover from overflowing the
 * viewport horizontally. The custom popover has no shift middleware —
 * this hook handles horizontal clamping.
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
 * Math (with align="start"):
 *   baseLeft    = triggerLeft
 *   centeredLeft= triggerCenter - popoverWidth / 2
 *   desiredLeft = clamp(centeredLeft, MARGIN, vw - MARGIN - popoverWidth)
 *   alignOffset = desiredLeft - baseLeft
 */
export function usePopoverAlignOffset(
  isOpen: boolean,
  popoverViewState: PopoverViewState,
  triggerRef: React.RefObject<HTMLSpanElement | null>,
  popoverContentRef: React.RefObject<HTMLElement | null>,
  projectedWidthPx?: number | null,
): number {
  const [offset, setOffset] = useState(0);
  const prevOpenRef = useRef(isOpen);

  // Shared measurement logic — called from useLayoutEffect and resize listener.
  const recompute = useCallback(() => {
    if (!isOpen) {
      // Keep the last computed offset while the popover is closing.
      // The popover delays unmount for exit animation, so resetting to 0
      // here would cause a visible "teleport" before fade-out completes.
      return;
    }

    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      // Keep last known offset until geometry is measurable again.
      return;
    }

    // Use clientWidth (visible viewport excluding scrollbar) instead of
    // window.innerWidth (which includes scrollbar like CSS 100dvw).
    const viewportWidth = document.documentElement.clientWidth;
    let popoverWidth = isValidProjectedWidth(projectedWidthPx)
      ? projectedWidthPx
      : (popoverContentRef.current?.getBoundingClientRect().width ?? 0);
    if (popoverWidth <= 0) {
      // Fall back to the default width instead of preserving a stale offset.
      // This prevents reopening with an offset from a previous expanded view.
      popoverWidth = POPOVER_WIDTH_DEFAULT_PX;
    }
    setOffset(computeAlignOffset(viewportWidth, triggerRect.left, triggerRect.width, popoverWidth));
  }, [isOpen, triggerRef, popoverContentRef, projectedWidthPx]);

  // Reset alignment at the start of a new open cycle so stale offsets from a
  // previous expanded view can't leak into the next open.
  useLayoutEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setOffset(0);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen]);

  // Initial computation + re-run on viewState change (before paint).
  // Also schedule one post-layout pass: initial open can measure width=0 when
  // content ref assignment and layout settle after this first layout effect.
  // The rAF pass picks up the real inline size before user interaction.
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute is stable via useCallback; popoverViewState triggers re-measurement
  useLayoutEffect(() => {
    recompute();
    if (!isOpen) return;
    const rafId = requestAnimationFrame(() => recompute());
    return () => cancelAnimationFrame(rafId);
  }, [recompute, popoverViewState, isOpen]);

  // Window resize and layout-shift listeners for viewport geometry changes.
  // Scroll-lock transitions can shift page layout without firing `resize`.
  useEffect(() => {
    if (!isOpen) return;

    let rafId = 0;
    const onGeometryChange = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => recompute());
    };
    window.addEventListener("resize", onGeometryChange, { passive: true });
    window.addEventListener(SCROLL_LOCK_LAYOUT_SHIFT_EVENT, onGeometryChange as EventListener, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onGeometryChange);
      window.removeEventListener(SCROLL_LOCK_LAYOUT_SHIFT_EVENT, onGeometryChange as EventListener);
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
    if (isValidProjectedWidth(projectedWidthPx)) {
      return;
    }
    const el = popoverContentRef.current;
    if (!el) return;

    let prevInlineSize = -1;

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const inlineSize = entry.borderBoxSize?.[0]?.inlineSize ?? el.getBoundingClientRect().width;
        if (inlineSize !== prevInlineSize) {
          prevInlineSize = inlineSize;
          recompute();
          break;
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, recompute, projectedWidthPx]);

  return offset;
}
