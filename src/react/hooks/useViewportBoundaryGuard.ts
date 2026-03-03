import type React from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { GUARD_MAX_WIDTH_VAR, POPOVER_MORPH_EXPAND_MS, VIEWPORT_MARGIN_PX } from "../constants.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";
import { SCROLL_LOCK_LAYOUT_SHIFT_EVENT } from "../scrollLock.js";

/**
 * Hard viewport boundary guard for popover positioning (Layer 3 safety net).
 *
 * Observes the popover's actual rendered bounding rect and applies a corrective
 * CSS `translate` if any edge extends beyond the viewport margin. Acts on the
 * final position — if the existing positioning hooks (Layer 2) got it right,
 * the guard is a no-op.
 *
 * Key design points:
 * - Uses CSS `translate` property (separate from `transform`). The popover
 *   wrapper sets `transform: translate3d(x,y,0)` — the browser composes both
 *   additively, so our correction stacks without overwriting the positioning.
 * - `translate` doesn't affect the content box → ResizeObserver won't
 *   re-fire → no infinite observation loops.
 * - No `useState` → no re-renders → React Compiler friendly.
 * - Sets `--dc-guard-max-width` CSS custom property using
 *   `document.documentElement.clientWidth` (visible viewport excluding
 *   scrollbar). CSS maxWidth formulas reference this variable, eliminating
 *   the mismatch between CSS `100dvw` (includes scrollbar) and the actual
 *   visible viewport.
 *
 * Animation safety:
 * - The synchronous `useLayoutEffect` clamps on initial open AND on view-state
 *   transitions. On view-state change, stale corrections are cleared immediately.
 * - A `useEffect` re-clamps after React has fully committed all batched state
 *   updates from sibling hooks (usePopoverAlignOffset, useExpandedPageSideOffset)
 *   so the guard measures the final positioned rect.
 * - The ResizeObserver is debounced by SETTLE_MS (> morph duration + overshoot)
 *   so the guard never fires during CSS transitions.
 */

/** Debounce delay for ResizeObserver callbacks only.
 *  Must exceed POPOVER_MORPH_EXPAND_MS + overshoot settling time (~100ms)
 *  so the guard never fires during CSS transitions. */
const SETTLE_MS = POPOVER_MORPH_EXPAND_MS + 100;

/**
 * Returns the visible viewport width excluding the scrollbar.
 * `document.documentElement.clientWidth` gives the usable area, unlike
 * `window.innerWidth` which includes the scrollbar (matching CSS `100dvw`).
 */
function getVisibleViewportWidth(): number {
  return document.documentElement.clientWidth;
}

export function useViewportBoundaryGuard(
  isOpen: boolean,
  popoverViewState: PopoverViewState,
  popoverContentRef: React.RefObject<HTMLElement | null>,
): void {
  const prevViewStateRef = useRef<PopoverViewState | null>(null);
  const rafIdRef = useRef<number>(0);
  const timerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Timestamp (ms) after which the active morph transition is considered done.
   *  Set by the post-render useEffect on every view-state change so the
   *  ResizeObserver can skip debouncing once the animation window has passed. */
  const transitionEndsAtRef = useRef(0);

  // Unified layout effect: handles initial open, view-state transitions, and
  // re-renders within the same state. Uses prevViewStateRef to distinguish.
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity — refs should not be in deps per React docs
  useLayoutEffect(() => {
    // Cancel any pending rAF from a previous rapid view-state toggle.
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = 0;

    const el = popoverContentRef.current;
    if (!isOpen || !el) {
      // Clear correction when closing so it doesn't persist across cycles.
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

    if (isViewStateChange) {
      // Re-clamp immediately (before paint) to avoid a one-frame jump where
      // clearing translate can push the popover outside viewport.
      // A post-render re-clamp still runs below once sibling hooks settle.
      clamp(el);
      return;
    }

    if (isInitialOpen) {
      // On initial open, the popover wrapper positions itself via its own
      // useLayoutEffect (setting transform from computePosition). Because
      // both useLayoutEffects fire in the same synchronous commit pass, we
      // cannot guarantee this guard's effect runs after the wrapper's. If
      // the wrapper hasn't positioned yet, getBoundingClientRect() returns
      // the pre-positioned rect (left:0, top:0) and clamp() would compute
      // a wrong correction. Only set the max-width constraint here; the
      // post-render useEffect + rAF below handles the first translate
      // correction after layout is committed. The fade-in-0 animation
      // (opacity: 0 start) keeps the element invisible until positioned.
      const vw = getVisibleViewportWidth();
      el.style.setProperty(GUARD_MAX_WIDTH_VAR, `${vw - 2 * VIEWPORT_MARGIN_PX}px`);
      return;
    }

    // Same view state, subsequent render: full clamp (wrapper has already
    // positioned by now).
    clamp(el);
  }, [isOpen, popoverViewState]);

  // Post-render re-clamp: fires after React has fully committed all batched
  // state updates from sibling hooks (usePopoverAlignOffset,
  // useExpandedPageSideOffset). Their setState calls during useLayoutEffect
  // trigger a batched re-render; by the time this useEffect runs, the
  // wrapper has repositioned with the final offsets. The rAF then measures
  // the settled position and applies the guard correction.
  //
  // Also marks the active transition window so the ResizeObserver debounces
  // during morph animations but fires immediately outside them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity — refs should not be in deps per React docs
  useEffect(() => {
    if (!isOpen) return;
    const el = popoverContentRef.current;
    if (!el) return;

    // Mark active transition window so ResizeObserver debounces during morph animation.
    transitionEndsAtRef.current = Date.now() + SETTLE_MS;

    rafIdRef.current = requestAnimationFrame(() => {
      const current = popoverContentRef.current;
      if (current) clamp(current);
    });

    // Safety-net re-clamp: if the ResizeObserver misses a reflow (e.g.,
    // wrapper replacement during re-render), this guaranteed timeout catches
    // up after the morph animation settles. clamp() is idempotent — the
    // extra getBoundingClientRect() call is free when the guard already
    // clamped correctly via RO.
    const safetyTimer = setTimeout(() => {
      const current = popoverContentRef.current;
      if (current) clamp(current);
    }, SETTLE_MS);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      clearTimeout(safetyTimer);
    };
  }, [isOpen, popoverViewState]);

  // Reactive clamping from two independent sources:
  // - ResizeObserver on the content: debounced during morph transitions
  //   (which fire rapid size changes), immediate outside them. Catches
  //   content reflow (e.g., image loads).
  // - Window resize + scroll-lock layout shifts: rAF-deferred so
  //   measurement happens after the popover's own reposition settles.
  //
  // No infinite loop: ResizeObserver watches content size, and CSS
  // `translate` doesn't affect the content box. Window resize is external.
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity — refs should not be in deps per React docs
  useEffect(() => {
    if (!isOpen) return;
    const el = popoverContentRef.current;
    if (!el) return;

    // ResizeObserver: debounce only during active morph transitions; fire
    // immediately (next event-loop turn) once the animation window has passed.
    // This prevents visible overflow from image-load width changes (which happen
    // outside any transition window) while still avoiding jitter during morphs.
    const debouncedClamp = () => {
      if (timerIdRef.current !== null) clearTimeout(timerIdRef.current);
      const delay = Date.now() < transitionEndsAtRef.current ? SETTLE_MS : 0;
      timerIdRef.current = setTimeout(() => clamp(el), delay);
    };
    const ro = new ResizeObserver(debouncedClamp);
    ro.observe(el);

    // Geometry shifts (window resize + scroll-lock style changes): rAF-deferred
    // so measurement happens after the popover's own reposition resolves.
    let geometryRafId = 0;
    const onGeometryChange = () => {
      cancelAnimationFrame(geometryRafId);
      geometryRafId = requestAnimationFrame(() => clamp(el));
    };
    window.addEventListener("resize", onGeometryChange);
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
      // Clean up guard overrides so they don't persist to next open cycle.
      el.style.translate = "";
      el.style.removeProperty(GUARD_MAX_WIDTH_VAR);
    };
    // Dep array: [isOpen] only. popoverViewState is intentionally excluded —
    // the RO observes DOM changes (not React state), and `el` is the same
    // DOM node for the popover's entire lifecycle. View-state transitions are
    // handled by the rAF-based useEffect above which has [isOpen, popoverViewState].
  }, [isOpen]);
}

/**
 * Measures the popover's actual bounding rect and applies a corrective
 * `translate` to pull any overflowing edge back within VIEWPORT_MARGIN_PX
 * of the viewport boundary.
 *
 * Also sets --dc-guard-max-width using the visible viewport width
 * (document.documentElement.clientWidth, excluding scrollbar) so CSS
 * maxWidth formulas constrain the element to the usable viewport area.
 */
function clamp(el: HTMLElement | null): void {
  if (!el) return;
  // 1. Set the guard's max-width constraint using the visible viewport width
  //    (excludes scrollbar). This is a CSS custom property that all maxWidth
  //    formulas reference, so React re-renders don't clobber it.
  const vw = getVisibleViewportWidth();
  const vh = document.documentElement.clientHeight;
  el.style.setProperty(GUARD_MAX_WIDTH_VAR, `${vw - 2 * VIEWPORT_MARGIN_PX}px`);

  // 2. Remove previous translate correction so we measure the base position.
  el.style.translate = "";

  // 3. Measure actual rendered position (now with guard-constrained width).
  const rect = el.getBoundingClientRect();

  let dx = 0;
  let dy = 0;

  // Horizontal clamping (using visible viewport width, not window.innerWidth)
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

  // 4. Apply correction (or clear if no correction needed).
  if (dx !== 0 || dy !== 0) {
    el.style.translate = `${dx}px ${dy}px`;
  }
}
