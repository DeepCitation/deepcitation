import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import type { PopoverViewState } from "../DefaultPopoverContent.js";

/**
 * Animates the height of a wrapper element when `viewState` changes.
 *
 * Uses an imperative `useLayoutEffect` approach — zero React re-renders:
 * 1. `useLayoutEffect` fires after DOM commit, before paint.
 * 2. Measure new content height (`contentRef.getBoundingClientRect().height`).
 * 3. Pin wrapper to the **old** height (stored in `prevHeightRef`) — browser
 *    paints the old height, no visual jump.
 * 4. In the next `requestAnimationFrame`, set the new height with a CSS
 *    transition — smooth animation begins.
 * 5. Caller handles `transitionend` to clear explicit height (back to `auto`).
 *
 * Bail-out conditions: first render, no viewState change, same height.
 *
 * @param wrapperRef - Outer div whose `style.height` is manipulated
 * @param contentRef - Inner div measured via `getBoundingClientRect().height`
 * @param viewState  - Current popover view state (triggers animation on change)
 * @param expandDurationMs  - Duration for expand transitions (summary → expanded)
 * @param collapseDurationMs - Duration for collapse transitions (expanded → summary)
 * @param expandEasing  - CSS easing for expand
 * @param collapseEasing - CSS easing for collapse
 */
export function useAnimatedHeight(
  wrapperRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
  viewState: PopoverViewState,
  expandDurationMs: number,
  collapseDurationMs: number,
  expandEasing: string,
  collapseEasing: string,
): void {
  const prevHeightRef = useRef<number | null>(null);
  const prevViewStateRef = useRef<PopoverViewState>(viewState);
  const rafIdRef = useRef<number>(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: wrapperRef and contentRef have stable identity — refs should not be in deps per React docs
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    const newHeight = content.getBoundingClientRect().height;
    const oldHeight = prevHeightRef.current;
    const viewStateChanged = viewState !== prevViewStateRef.current;

    // Always record current state for next run
    prevHeightRef.current = newHeight;
    prevViewStateRef.current = viewState;

    // Bail out: first render, no viewState change, or same height
    if (oldHeight === null || !viewStateChanged || oldHeight === newHeight) return;

    // Skip animation when height is shrinking: pinning the wrapper to the old
    // (larger) height creates a visible gap below the shorter content. Only
    // animate growing content (text gradually revealed via overflow:hidden).
    // Clear any stale inline styles from a previous interrupted grow animation.
    if (newHeight < oldHeight) {
      wrapper.style.height = "";
      wrapper.style.overflow = "";
      wrapper.style.transition = "";
      return;
    }

    // Cancel any in-flight animation frame from a previous rapid toggle
    cancelAnimationFrame(rafIdRef.current);

    // Pin wrapper to old height — this runs before paint, so user sees no jump
    wrapper.style.height = `${oldHeight}px`;
    wrapper.style.overflow = "hidden";
    wrapper.style.transition = "none";

    // Next frame: set new height with CSS transition → smooth animation
    const isExpanding = viewState !== "summary";
    const duration = isExpanding ? expandDurationMs : collapseDurationMs;
    const easing = isExpanding ? expandEasing : collapseEasing;

    rafIdRef.current = requestAnimationFrame(() => {
      wrapper.style.transition = `height ${duration}ms ${easing}`;
      wrapper.style.height = `${newHeight}px`;
    });

    return () => {
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [viewState, expandDurationMs, collapseDurationMs, expandEasing, collapseEasing]);
}
