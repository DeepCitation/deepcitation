import type React from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { BLINK_ENTER_TOTAL_MS, GUARD_MAX_HEIGHT_VAR, GUARD_MAX_WIDTH_VAR, VIEWPORT_MARGIN_PX } from "../constants.js";
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
        el.style.removeProperty(GUARD_MAX_HEIGHT_VAR);
      }
      prevViewStateRef.current = null;
      return;
    }

    const isInitialOpen = prevViewStateRef.current === null;
    const isViewStateChange = !isInitialOpen && prevViewStateRef.current !== popoverViewState;
    prevViewStateRef.current = popoverViewState;

    if (isViewStateChange) {
      clamp(el);
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

    rafIdRef.current = requestAnimationFrame(() => {
      const current = popoverContentRef.current;
      if (current) clamp(current);
    });

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
      el.style.removeProperty(GUARD_MAX_HEIGHT_VAR);
    };
  }, [isOpen]);
}

function clamp(el: HTMLElement): void {
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

  if (dx !== 0) {
    el.style.translate = `${dx}px 0px`;
  }

  // Dynamic max-height: constrain so the popover cannot exceed the viewport.
  // For side="bottom": available = viewport bottom − wrapper top.
  // For side="top": available = content bottom − viewport top (the content's
  // bottom edge is anchored near the trigger; it grows upward).
  // This runs in useLayoutEffect (before paint), preventing the single-frame
  // overflow flash that occurs when content grows on viewState change.
  const wrapper = el.parentElement;
  if (wrapper) {
    const vh = window.innerHeight;
    const isTop = el.dataset.side === "top";
    const available = isTop
      ? el.getBoundingClientRect().bottom - VIEWPORT_MARGIN_PX
      : vh - wrapper.getBoundingClientRect().top - VIEWPORT_MARGIN_PX;
    if (available > 0) {
      el.style.setProperty(GUARD_MAX_HEIGHT_VAR, `${available}px`);
    }
  }
}
