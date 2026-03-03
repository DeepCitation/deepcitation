import type React from "react";
import { useLayoutEffect, useRef } from "react";
import { EASE_COLLAPSE, POPOVER_MORPH_COLLAPSE_MS } from "../constants.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion.js";

type RectSnapshot = { left: number; top: number; width: number; height: number };
const POSITION_SETTLE_FRACTION = 0.35; // Keep first frame close enough to avoid recenter flash.
const SIZE_SETTLE_FRACTION = 0.35; // Symmetric two-sided reveal from a stable starting box.

function hasActiveGuardTranslate(translateValue: string): boolean {
  if (!translateValue || translateValue === "none") return false;
  const nums = translateValue.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  const dx = nums[0] ?? 0;
  const dy = nums[1] ?? 0;
  return Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
}

/**
 * Edge-linear morph for popover view-state transitions.
 * Layout dimensions still snap, but this hook animates translation + reveal
 * (clip-path) so all four edges move at consistent rates without scaling
 * content (avoids "gooey" text/image distortion from non-uniform FLIP scales).
 */
export function usePopoverMorphTransition(
  isOpen: boolean,
  viewState: PopoverViewState,
  popoverContentRef: React.RefObject<HTMLElement | null>,
): void {
  const prefersReducedMotion = usePrefersReducedMotion();
  const prevRectRef = useRef<RectSnapshot | null>(null);
  const prevViewStateRef = useRef<PopoverViewState | null>(null);
  const suppressNextKeyholeFlipRef = useRef(false);
  const rafIdRef = useRef<number>(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const el = popoverContentRef.current;
    if (!isOpen || !el) {
      cancelAnimationFrame(rafIdRef.current);
      cleanupRef.current?.();
      cleanupRef.current = null;
      prevRectRef.current = null;
      prevViewStateRef.current = null;
      suppressNextKeyholeFlipRef.current = false;
      return;
    }

    // If a prior morph is still active (rapid state toggle), clear our inline
    // transform first so measurements are taken from settled layout geometry.
    cleanupRef.current?.();
    cleanupRef.current = null;

    const rect = el.getBoundingClientRect();
    const currentRect: RectSnapshot = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    const prevRect = prevRectRef.current;
    const prevViewState = prevViewStateRef.current;

    // Record baseline on first open or same-state re-renders.
    if (!prevRect || !prevViewState || prevViewState === viewState) {
      prevRectRef.current = currentRect;
      prevViewStateRef.current = viewState;
      return;
    }

    // Update snapshots first so rapid toggles always animate from latest geometry.
    prevRectRef.current = currentRect;
    prevViewStateRef.current = viewState;

    // Any transition away from expanded-page can involve async re-positioning.
    // Suppress the *next* summary->keyhole morph so we don't animate from a
    // transient top-left frame before Radix settles.
    if (prevViewState === "expanded-page" && viewState === "summary") {
      suppressNextKeyholeFlipRef.current = true;
      return;
    }

    // Stability-first scope: animate only the initial summary -> keyhole expand.
    // All collapse/back/full-page transitions snap to avoid unstable trajectories.
    if (!(prevViewState === "summary" && viewState === "expanded-keyhole")) {
      return;
    }
    if (suppressNextKeyholeFlipRef.current) {
      suppressNextKeyholeFlipRef.current = false;
      return;
    }

    if (
      prefersReducedMotion ||
      currentRect.width <= 0 ||
      currentRect.height <= 0 ||
      prevRect.width <= 0 ||
      prevRect.height <= 0
    ) {
      return;
    }

    // When the viewport boundary guard is actively correcting position (via CSS
    // `translate`), avoid layering an additional FLIP `transform` animation on top.
    // Near constrained viewport edges this combination can create visible up/down
    // jitter during summary -> expanded-keyhole transitions.
    if (hasActiveGuardTranslate(el.style.translate)) {
      return;
    }

    // Two-phase settle:
    // 1) Instant jump close to final.
    // 2) Animate remaining residual. Size settle is symmetric on all edges to
    //    avoid one-sided reveal bias.
    const finalLeft = currentRect.left;
    const finalTop = currentRect.top;
    const finalRight = currentRect.left + currentRect.width;
    const finalBottom = currentRect.top + currentRect.height;
    const prevLeft = prevRect.left;
    const prevTop = prevRect.top;
    const prevRight = prevRect.left + prevRect.width;
    const prevBottom = prevRect.top + prevRect.height;

    const finalCenterX = (finalLeft + finalRight) / 2;
    const finalCenterY = (finalTop + finalBottom) / 2;
    const prevCenterX = (prevLeft + prevRight) / 2;
    const prevCenterY = (prevTop + prevBottom) / 2;
    const finalWidth = finalRight - finalLeft;
    const finalHeight = finalBottom - finalTop;
    const prevWidth = prevRight - prevLeft;
    const prevHeight = prevBottom - prevTop;

    const dx = (prevCenterX - finalCenterX) * POSITION_SETTLE_FRACTION;
    const dy = (prevCenterY - finalCenterY) * POSITION_SETTLE_FRACTION;
    const clipInsetX = Math.max(0, (finalWidth - prevWidth) * SIZE_SETTLE_FRACTION * 0.5);
    const clipInsetY = Math.max(0, (finalHeight - prevHeight) * SIZE_SETTLE_FRACTION * 0.5);

    const nearlyIdentity = Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && clipInsetX < 0.5 && clipInsetY < 0.5;
    if (nearlyIdentity) return;

    const duration = POPOVER_MORPH_COLLAPSE_MS;
    const easing = EASE_COLLAPSE;

    cancelAnimationFrame(rafIdRef.current);

    el.style.willChange = "transform, clip-path";
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.clipPath = `inset(${clipInsetY}px ${clipInsetX}px ${clipInsetY}px ${clipInsetX}px round 8px)`;

    // Force style flush so the next frame transitions from inverted -> identity.
    el.getBoundingClientRect();

    const onEnd = (event: TransitionEvent) => {
      if (event.propertyName !== "transform" && event.propertyName !== "clip-path") return;
      el.removeEventListener("transitionend", onEnd);
      el.style.transition = "";
      el.style.transform = "";
      el.style.clipPath = "";
      el.style.willChange = "";
      cleanupRef.current = null;
    };

    cleanupRef.current = () => {
      el.removeEventListener("transitionend", onEnd);
      el.style.transition = "";
      el.style.transform = "";
      el.style.clipPath = "";
      el.style.willChange = "";
    };

    rafIdRef.current = requestAnimationFrame(() => {
      el.addEventListener("transitionend", onEnd);
      el.style.transition = `transform ${duration}ms ${easing}, clip-path ${duration}ms ${easing}`;
      el.style.transform = "translate(0px, 0px)";
      el.style.clipPath = "inset(0px 0px 0px 0px round 8px)";
    });

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [isOpen, viewState, popoverContentRef, prefersReducedMotion]);
}
