import type React from "react";
import { useEffect, useLayoutEffect } from "react";
import { VIEWPORT_MARGIN_PX } from "../constants.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";

/**
 * Hard viewport boundary guard for popover positioning (Layer 3 safety net).
 *
 * Observes the popover's actual rendered bounding rect and applies a corrective
 * CSS `translate` if any edge extends beyond the viewport margin. Acts on the
 * final position — if the existing positioning hooks (Layer 2) got it right,
 * the guard applies `translate: 0px 0px` (no-op).
 *
 * Key design points:
 * - Uses CSS `translate` property (separate from `transform`). Radix sets
 *   `transform: translate3d(x,y,0)` — the browser composes both additively,
 *   so our correction stacks without overwriting Radix's positioning.
 * - `translate` doesn't affect the content box → ResizeObserver won't
 *   re-fire → no infinite observation loops.
 * - No `useState` → no re-renders → React Compiler friendly.
 *
 * Reactivity:
 * - `useLayoutEffect` on [isOpen, popoverViewState] — initial + state-change
 *   checks (runs before paint, no flash).
 * - `ResizeObserver` on popover element — catches image loads, content reflow.
 * - `window.addEventListener("resize")` — catches viewport size changes.
 */
export function useViewportBoundaryGuard(
  isOpen: boolean,
  popoverViewState: PopoverViewState,
  popoverContentRef: React.RefObject<HTMLElement | null>,
): void {
  // Core clamping logic — imperatively adjusts the popover's position.
  // Removes any previous corrective translate before measuring so we
  // get the Radix-only position (prevents correction drift on re-runs).

  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity — refs should not be in deps per React docs
  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = popoverContentRef.current;
    if (!el) return;
    clamp(el);
  }, [isOpen, popoverViewState]);

  // Reactive observers: ResizeObserver catches content reflow (image loads),
  // window resize catches viewport size changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: popoverContentRef has stable identity — refs should not be in deps per React docs
  useEffect(() => {
    if (!isOpen) return;
    const el = popoverContentRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => clamp(el));
    ro.observe(el);

    const onResize = () => clamp(el);
    window.addEventListener("resize", onResize);

    return () => {
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
