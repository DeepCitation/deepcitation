import type React from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
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
): void {
  const prevViewStateRef = useRef<PopoverViewState | null>(null);
  const rafIdRef = useRef<number>(0);
  const timerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionEndsAtRef = useRef(0);

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

    if (isViewStateChange) {
      // Skip vertical on view-state transitions: vertical correction during the
      // FLIP animation causes oscillation. The safety timer applies full clamping
      // (including vertical) after SETTLE_MS once the animation has finished.
      clamp(el, true);
      return;
    }

    if (isInitialOpen) {
      // Only set max-width here; wrapper may not have positioned yet.
      // Post-render useEffect + rAF handles the first translate correction.
      applyGuardMaxWidth(el, getVisibleViewportWidth());
      return;
    }

    clamp(el);
  }, [isOpen, popoverViewState]);

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
      if (current) clamp(current, true);
    });

    // Safety timer: full clamp (including vertical) after animation has settled.
    const safetyTimer = setTimeout(() => {
      const current = popoverContentRef.current;
      if (current) clamp(current);
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
      timerIdRef.current = setTimeout(() => clamp(el), delay);
    };
    const ro = new ResizeObserver(debouncedClamp);
    ro.observe(el);

    let geometryRafId = 0;
    const onGeometryChange = () => {
      cancelAnimationFrame(geometryRafId);
      geometryRafId = requestAnimationFrame(() => clamp(el));
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
 *
 * Horizontal uses VIEWPORT_MARGIN_PX (16px) to avoid page-chrome clipping.
 * Vertical uses 0px margin (flush): vertical overflow is far less common and
 * the popover's own max-height already keeps it within the viewport.
 */
function clamp(el: HTMLElement, skipVertical = false): void {
  const vw = getVisibleViewportWidth();
  applyGuardMaxWidth(el, vw);

  el.style.translate = "";
  const rect = el.getBoundingClientRect();

  let dx = 0;

  if (rect.left < VIEWPORT_MARGIN_PX) {
    dx = VIEWPORT_MARGIN_PX - rect.left;
  } else if (rect.right > vw - VIEWPORT_MARGIN_PX) {
    dx = vw - VIEWPORT_MARGIN_PX - rect.right;
  }

  let dy = 0;

  if (!skipVertical) {
    const vh = window.innerHeight;
    if (rect.top < 0) {
      dy = -rect.top;
    } else if (rect.bottom > vh) {
      dy = vh - rect.bottom;
    }
  }

  if (dx !== 0 || dy !== 0) {
    el.style.translate = dy !== 0 ? `${dx}px ${dy}px` : `${dx}px`;
  }
}
