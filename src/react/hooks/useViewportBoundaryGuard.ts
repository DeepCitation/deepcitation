import type React from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { guardClamp } from "../../shared/popoverGeometry.js";
import { findPageScrollEl } from "../../shared/scroll.js";
import { BLINK_ENTER_TOTAL_MS, GUARD_MAX_WIDTH_VAR, VIEWPORT_MARGIN_PX } from "../constants.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";
import { SCROLL_LOCK_LAYOUT_SHIFT_EVENT } from "../scrollLock.js";

/**
 * Hard viewport boundary guard (Layer 3 safety net).
 * Applies corrective CSS `translate` if any popover edge exceeds viewport margin.
 * Uses `translate` (not `transform`) so it composes with the wrapper's positioning.
 * No useState — no re-renders — React Compiler friendly.
 */

const SETTLE_MS = BLINK_ENTER_TOTAL_MS + 16;

function getVisibleViewportWidth(): number {
  return document.documentElement.clientWidth;
}

/** Sets GUARD_MAX_WIDTH_VAR only when the value changed (avoids unnecessary style invalidation). */
function applyGuardMaxWidth(el: HTMLElement, vw: number): void {
  const value = `${vw - 2 * VIEWPORT_MARGIN_PX}px`;
  if (el.style.getPropertyValue(GUARD_MAX_WIDTH_VAR) !== value) {
    el.style.setProperty(GUARD_MAX_WIDTH_VAR, value);
  }
}

export function useViewportBoundaryGuard(
  isOpen: boolean,
  popoverViewState: PopoverViewState,
  popoverContentRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLElement | null>,
  sideOffset?: number,
): void {
  const prevViewStateRef = useRef<PopoverViewState | null>(null);
  const rafIdRef = useRef<number>(0);
  const timerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionEndsAtRef = useRef(0);
  // Top edge of the scroll container (e.g. header height). Cached when the
  // popover opens so all clamp calls use the same reference point.
  const containerTopRef = useRef(0);
  // Written by useLayoutEffect, read by the sibling useEffect on the same deps.
  // True when this render cycle is a view-state transition (not initial open).
  const isViewStateTransitionRef = useRef(false);

  // Cache the scroll container's top edge (= header height) when the popover
  // opens. Stable for the duration of the open session; re-read on re-open.
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      containerTopRef.current = 0;
      return;
    }
    const scrollEl = findPageScrollEl(triggerRef.current);
    containerTopRef.current = Math.max(0, scrollEl.getBoundingClientRect().top);
  }, [isOpen, triggerRef]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity
  useLayoutEffect(() => {
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = 0;

    const el = popoverContentRef.current;
    if (!isOpen || !el) {
      if (el) {
        el.style.translate = "";
        el.style.removeProperty(GUARD_MAX_WIDTH_VAR);
      }
      prevViewStateRef.current = null;
      return;
    }

    const isInitialOpen = prevViewStateRef.current === null;
    const isViewStateChange = !isInitialOpen && prevViewStateRef.current !== popoverViewState;
    prevViewStateRef.current = popoverViewState;
    // Signal to the sibling useEffect (which runs after this) whether this cycle
    // is a view-state transition. useEffect cannot compute this itself because
    // prevViewStateRef has already been updated by this point.
    isViewStateTransitionRef.current = isViewStateChange;

    if (isViewStateChange) {
      // Apply full vertical clamping immediately on view-state change. The
      // original skipVertical=true guard predated View Transitions: when CSS
      // transitions animated the popover position directly, continuous vertical
      // corrections in layout effects would oscillate against the running
      // animation. Now View Transitions capture before/after DOM snapshots and
      // animate between them independently, so the live element's `translate`
      // during VT playback is invisible to the user. The one-time clamp here
      // fires once (not in a loop), preventing the expanded-keyhole popover from
      // overshooting above the viewport when content height exceeds the space
      // above a top-side trigger.
      clamp(el, false, containerTopRef.current);
      return;
    }

    if (isInitialOpen) {
      // Only set max-width here; wrapper may not have positioned yet.
      // Post-render useEffect + rAF handles the first translate correction.
      applyGuardMaxWidth(el, getVisibleViewportWidth());
      return;
    }

    clamp(el, false, containerTopRef.current);
  }, [isOpen, popoverViewState, sideOffset]);

  // Post-render re-clamp after sibling hooks settle.
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity
  useEffect(() => {
    if (!isOpen) return;
    const el = popoverContentRef.current;
    if (!el) return;

    transitionEndsAtRef.current = Date.now() + SETTLE_MS;

    // Immediate rAF: horizontal-only to avoid vertical oscillation during animation.
    rafIdRef.current = requestAnimationFrame(() => {
      const current = popoverContentRef.current;
      if (current) clamp(current, true, containerTopRef.current);
    });

    // Safety timer: horizontal-only for view-state transitions, full clamp on initial open.
    // Vertical correction is intentionally skipped on view-state transitions — the user may
    // have deliberately scrolled the popover out of the viewport (e.g. page→focus collapse
    // after scrolling away), and applying dy would pull it back into view unexpectedly.
    // The ResizeObserver / window-resize path in the sibling useEffect([isOpen]) handles
    // ongoing repositioning when the popover *should* stay visible.
    // isViewStateTransitionRef is written by the sibling useLayoutEffect on the same deps
    // and is readable here because layout effects flush before passive effects.
    const skipVerticalInTimer = isViewStateTransitionRef.current;
    const safetyTimer = setTimeout(() => {
      const current = popoverContentRef.current;
      if (current) clamp(current, skipVerticalInTimer, containerTopRef.current);
    }, SETTLE_MS);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      clearTimeout(safetyTimer);
    };
  }, [isOpen, popoverViewState]);

  // ResizeObserver + window resize reactive clamping.
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity
  useEffect(() => {
    if (!isOpen) return;
    const el = popoverContentRef.current;
    if (!el) return;

    const debouncedClamp = () => {
      if (timerIdRef.current !== null) clearTimeout(timerIdRef.current);
      const delay = Date.now() < transitionEndsAtRef.current ? SETTLE_MS : 0;
      timerIdRef.current = setTimeout(() => clamp(el, false, containerTopRef.current), delay);
    };
    const ro = new ResizeObserver(debouncedClamp);
    ro.observe(el);

    let geometryRafId = 0;
    const onGeometryChange = () => {
      cancelAnimationFrame(geometryRafId);
      geometryRafId = requestAnimationFrame(() => clamp(el, false, containerTopRef.current));
    };
    window.addEventListener("resize", onGeometryChange, { passive: true });
    window.addEventListener(SCROLL_LOCK_LAYOUT_SHIFT_EVENT, onGeometryChange as EventListener);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      cancelAnimationFrame(geometryRafId);
      if (timerIdRef.current !== null) {
        clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
      ro.disconnect();
      window.removeEventListener("resize", onGeometryChange);
      window.removeEventListener(SCROLL_LOCK_LAYOUT_SHIFT_EVENT, onGeometryChange as EventListener);
      el.style.translate = "";
      el.style.removeProperty(GUARD_MAX_WIDTH_VAR);
    };
  }, [isOpen]);
}

/**
 * Clamp the popover to viewport edges using CSS `translate`.
 *
 * @param skipVertical  When true, only horizontal (dx) is corrected.
 *   Pass true during live animation frames to prevent oscillation — the
 *   safety timer calls with skipVertical=false after animation settles.
 * @param topInset  Minimum viewport Y the popover top may reach (e.g. the
 *   scroll container's top edge when a fixed header sits above it). Defaults to 0.
 *
 * Horizontal uses VIEWPORT_MARGIN_PX (16px) to avoid page-chrome clipping.
 * Vertical top uses topInset (defaults to 0 = viewport top).
 */
function clamp(el: HTMLElement, skipVertical = false, topInset = 0): void {
  const vw = getVisibleViewportWidth();
  applyGuardMaxWidth(el, vw);

  el.style.translate = "";
  const rect = el.getBoundingClientRect();

  const { dx, dy } = guardClamp(rect, vw, window.innerHeight, skipVertical, VIEWPORT_MARGIN_PX, topInset);

  if (dx !== 0 || dy !== 0) {
    el.style.translate = dy !== 0 ? `${dx}px ${dy}px` : `${dx}px`;
  }
}
