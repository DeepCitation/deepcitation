import type React from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { GUARD_MAX_WIDTH_VAR, POPOVER_MORPH_EXPAND_MS, VIEWPORT_MARGIN_PX } from "../constants.js";
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
 *   so the guard measures the final Radix-positioned rect.
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

  // Unified layout effect: clamps on initial open and on view-state transitions.
  // Uses prevViewStateRef to distinguish the two cases.
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

    const isViewStateChange = prevViewStateRef.current !== null && prevViewStateRef.current !== popoverViewState;
    prevViewStateRef.current = popoverViewState;

    if (isViewStateChange) {
      // Clear stale correction immediately (before paint). The useEffect
      // below re-clamps after React has committed all batched state updates
      // from sibling hooks.
      el.style.translate = "";
      return;
    }

    // Initial open: clamp before first paint (no flash).
    clamp(el);
  }, [isOpen, popoverViewState]);

  // Post-render re-clamp: fires after React has fully committed all batched
  // state updates from sibling hooks (usePopoverAlignOffset,
  // useExpandedPageSideOffset). Their setState calls during useLayoutEffect
  // trigger a batched re-render; by the time this useEffect runs, Radix has
  // repositioned the wrapper with the final offsets. The rAF then measures
  // the settled position and applies the guard correction.
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity — refs should not be in deps per React docs
  useEffect(() => {
    if (!isOpen) return;
    const el = popoverContentRef.current;
    if (!el) return;

    rafIdRef.current = requestAnimationFrame(() => {
      const current = popoverContentRef.current;
      if (current) clamp(current);
    });

    return () => cancelAnimationFrame(rafIdRef.current);
  }, [isOpen, popoverViewState]);

  // Reactive clamping from three independent sources:
  // - MutationObserver on the Radix wrapper: catches @floating-ui transform
  //   updates that move the wrapper after our rAF-based clamp has already fired.
  //   Without this, a race condition between the guard's rAF and floating-ui's
  //   rAF leaves the correction stale (computed for an intermediate position).
  // - ResizeObserver on the content: debounced (morph animations fire rapid size
  //   changes). Catches content reflow (e.g., image loads).
  // - Window resize: immediate (user dragging browser edge — no morph conflict).
  //
  // No infinite loop: MutationObserver watches the *wrapper*'s style attribute,
  // but we only modify the *content* element's CSS translate property. The
  // ResizeObserver watches content size, and CSS translate doesn't affect the
  // content box. Window resize is external.
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity — refs should not be in deps per React docs
  useEffect(() => {
    if (!isOpen) return;
    const el = popoverContentRef.current;
    if (!el) return;

    // MutationObserver on the Radix wrapper: re-clamp whenever @floating-ui
    // updates the wrapper's transform (style attribute changes).
    // Uses attributeOldValue to skip no-op mutations (same style rewritten).
    const wrapper = el.closest("[data-radix-popper-content-wrapper]") as HTMLElement | null;
    let mo: MutationObserver | null = null;
    if (wrapper) {
      mo = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.oldValue !== wrapper.getAttribute("style")) {
            clamp(el);
            break;
          }
        }
      });
      mo.observe(wrapper, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
    }

    // ResizeObserver: debounced to avoid fighting CSS morph transitions.
    let timerId: ReturnType<typeof setTimeout>;
    const debouncedClamp = () => {
      clearTimeout(timerId);
      timerId = setTimeout(() => clamp(el), SETTLE_MS);
    };
    const ro = new ResizeObserver(debouncedClamp);
    ro.observe(el);

    // Window resize: rAF-deferred so measurement happens after @floating-ui's
    // async computePosition() resolves. Uses a local rafId (not the shared
    // rafIdRef) to avoid canceling post-render clamps from the useEffect above.
    let resizeRafId = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => clamp(el));
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      cancelAnimationFrame(resizeRafId);
      clearTimeout(timerId);
      mo?.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      // Clean up guard overrides so they don't persist to next open cycle.
      el.style.translate = "";
      el.style.removeProperty(GUARD_MAX_WIDTH_VAR);
    };
    // Dep array: [isOpen] only. popoverViewState is intentionally excluded —
    // the MO/RO observe DOM changes (not React state), and `el` is the same
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

  // 2. Remove previous translate correction so we measure the Radix-only position.
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
