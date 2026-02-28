import type React from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { VIEWPORT_MARGIN_PX } from "../constants.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";

/**
 * Hard viewport boundary guard for popover positioning (Layer 3 safety net).
 *
 * Observes the popover's actual rendered bounding rect and applies a corrective
 * CSS `translate` if any edge extends beyond the viewport margin. Acts on the
 * final position — if the existing positioning hooks (Layer 2) got it right,
 * the guard is a no-op.
 *
 * Key design points:
 * - Uses CSS `translate` property (separate from `transform`). Radix sets
 *   `transform: translate3d(x,y,0)` — the browser composes both additively,
 *   so our correction stacks without overwriting Radix's positioning.
 * - `translate` doesn't affect the content box → ResizeObserver won't
 *   re-fire → no infinite observation loops.
 * - No `useState` → no re-renders → React Compiler friendly.
 *
 * Animation safety:
 * - The synchronous `useLayoutEffect` clamps on initial open AND on view-state
 *   transitions. On view-state change, stale corrections are cleared immediately
 *   and a `requestAnimationFrame` schedules a re-clamp — rAF fires after all
 *   `useLayoutEffect`s and microtasks (including Floating UI's `computePosition`)
 *   but before the next paint, so we measure the final Radix-positioned rect.
 * - The ResizeObserver is debounced by SETTLE_MS (> morph duration + overshoot)
 *   so the guard never fires during CSS transitions.
 */

/** Debounce delay for ResizeObserver callbacks only.
 *  Must exceed POPOVER_MORPH_EXPAND_MS (200ms) + overshoot settling time. */
const SETTLE_MS = 300;

export function useViewportBoundaryGuard(
  isOpen: boolean,
  popoverViewState: PopoverViewState,
  popoverContentRef: React.RefObject<HTMLElement | null>,
): void {
  const prevViewStateRef = useRef<PopoverViewState | null>(null);
  const rafIdRef = useRef<number>(0);

  // Unified layout effect: clamps on initial open and on view-state transitions.
  // Uses prevViewStateRef to distinguish the two cases.
  //
  // On view-state change, clears stale correction immediately and schedules
  // a rAF re-clamp. rAF fires after all useLayoutEffects and microtasks
  // (including Floating UI's computePosition().then()) but before the next
  // paint — so we measure the final Radix-positioned rect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity — refs should not be in deps per React docs
  useLayoutEffect(() => {
    // Cancel any pending rAF from a previous rapid view-state toggle.
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = 0;

    const el = popoverContentRef.current;
    if (!isOpen || !el) {
      // Clear correction when closing so it doesn't persist across cycles.
      if (el) el.style.translate = "";
      prevViewStateRef.current = null;
      return;
    }

    const isViewStateChange = prevViewStateRef.current !== null && prevViewStateRef.current !== popoverViewState;
    prevViewStateRef.current = popoverViewState;

    if (isViewStateChange) {
      // Clear stale correction immediately (before paint).
      el.style.translate = "";
      // Re-clamp after Radix has repositioned. rAF fires after all
      // useLayoutEffects and microtasks but before the next paint,
      // so we measure the final Radix-positioned rect.
      rafIdRef.current = requestAnimationFrame(() => clamp(el));
      return;
    }

    // Initial open: clamp before first paint (no flash).
    clamp(el);
  }, [isOpen, popoverViewState]);

  // Reactive clamping from two independent sources:
  // - ResizeObserver: debounced (morph animations fire rapid size changes).
  // - Window resize: immediate (user dragging browser edge — no morph conflict).
  //
  // Bug fix: the previous implementation shared a single debounced callback
  // for both. During continuous window drag, the 300ms timer reset on every
  // event, so the clamp only fired after the user stopped dragging.
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity — refs should not be in deps per React docs
  useEffect(() => {
    if (!isOpen) return;
    const el = popoverContentRef.current;
    if (!el) return;

    // ResizeObserver: debounced to avoid fighting CSS morph transitions.
    let timerId: ReturnType<typeof setTimeout>;
    const debouncedClamp = () => {
      clearTimeout(timerId);
      timerId = setTimeout(() => clamp(el), SETTLE_MS);
    };
    const ro = new ResizeObserver(debouncedClamp);
    ro.observe(el);

    // Window resize: immediate clamp (no animation conflict).
    const onResize = () => clamp(el);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      clearTimeout(timerId);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen]);
}

/**
 * Measures the popover's actual bounding rect and applies a corrective
 * `translate` to pull any overflowing edge back within VIEWPORT_MARGIN_PX
 * of the viewport boundary.
 */
function clamp(el: HTMLElement): void {
  // 1. Remove previous correction so we measure the Radix-only position.
  el.style.translate = "";

  // 2. Measure actual rendered position.
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let dx = 0;
  let dy = 0;

  // Horizontal clamping
  if (rect.left < VIEWPORT_MARGIN_PX) {
    dx = VIEWPORT_MARGIN_PX - rect.left;
  } else if (rect.right > vw - VIEWPORT_MARGIN_PX) {
    dx = vw - VIEWPORT_MARGIN_PX - rect.right;
  }

  // Vertical clamping
  if (rect.top < VIEWPORT_MARGIN_PX) {
    dy = VIEWPORT_MARGIN_PX - rect.top;
  } else if (rect.bottom > vh - VIEWPORT_MARGIN_PX) {
    dy = vh - VIEWPORT_MARGIN_PX - rect.bottom;
  }

  // 3. Apply correction (or clear if no correction needed).
  if (dx !== 0 || dy !== 0) {
    el.style.translate = `${dx}px ${dy}px`;
  }
}
