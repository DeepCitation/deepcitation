import type React from "react";
import { useLayoutEffect, useRef } from "react";
import {
  BLINK_ENTER_EASING,
  BLINK_ENTER_TOTAL_MS,
  SHARED_ORIGIN_BLEND,
  SHARED_ORIGIN_MAX_SCALE,
  SHARED_ORIGIN_MIN_SCALE,
  SHARED_ORIGIN_TRANSLATE_LIMIT_PX,
} from "../constants.js";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion.js";

const MIN_RECT_SIZE_PX = 4;

export interface SharedOriginRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type SharedOriginRectResolver = () => SharedOriginRect | null;

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isValidSharedOriginRect(rect: SharedOriginRect | null | undefined): rect is SharedOriginRect {
  if (!rect) return false;
  return (
    isFiniteNumber(rect.left) &&
    isFiniteNumber(rect.top) &&
    isFiniteNumber(rect.width) &&
    isFiniteNumber(rect.height) &&
    rect.width >= MIN_RECT_SIZE_PX &&
    rect.height >= MIN_RECT_SIZE_PX
  );
}

export function toSharedOriginRect(rect: DOMRect | DOMRectReadOnly): SharedOriginRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function buildSourceKey(rect: SharedOriginRect): string {
  return `${rect.left.toFixed(2)}:${rect.top.toFixed(2)}:${rect.width.toFixed(2)}:${rect.height.toFixed(2)}`;
}

/**
 * Shared-origin transition for entering expanded-page.
 * Applies an image-layer transform so the full page appears to grow from the
 * source keyhole/annotation rect, while outer popover layout remains snap-based.
 */
export function useSharedOriginExpandTransition(
  enabled: boolean,
  sourceRect: SharedOriginRect | null,
  targetRectOrResolver: SharedOriginRect | null | SharedOriginRectResolver,
  animatedRef: React.RefObject<HTMLElement | null>,
  overflowGuardRef?: React.RefObject<HTMLElement | null>,
  onConsumed?: () => void,
): void {
  const prefersReducedMotion = usePrefersReducedMotion();
  const lastSourceKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      lastSourceKeyRef.current = null;
      return;
    }
    if (!isValidSharedOriginRect(sourceRect)) return;

    const sourceKey = buildSourceKey(sourceRect);
    if (lastSourceKeyRef.current === sourceKey) return;

    const targetRect = typeof targetRectOrResolver === "function" ? targetRectOrResolver() : targetRectOrResolver;

    if (prefersReducedMotion || !isValidSharedOriginRect(targetRect)) {
      lastSourceKeyRef.current = sourceKey;
      onConsumed?.();
      return;
    }

    const el = animatedRef.current;
    if (!el) return;

    const hostRect = el.getBoundingClientRect();
    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const originX = targetCenterX - hostRect.left;
    const originY = targetCenterY - hostRect.top;
    const rawTranslateX = sourceCenterX - targetCenterX;
    const rawTranslateY = sourceCenterY - targetCenterY;
    const rawScaleX = sourceRect.width / targetRect.width;
    const rawScaleY = sourceRect.height / targetRect.height;
    const translateX = clamp(
      rawTranslateX * SHARED_ORIGIN_BLEND,
      -SHARED_ORIGIN_TRANSLATE_LIMIT_PX,
      SHARED_ORIGIN_TRANSLATE_LIMIT_PX,
    );
    const translateY = clamp(
      rawTranslateY * SHARED_ORIGIN_BLEND,
      -SHARED_ORIGIN_TRANSLATE_LIMIT_PX,
      SHARED_ORIGIN_TRANSLATE_LIMIT_PX,
    );
    const scaleX = clamp(1 + (rawScaleX - 1) * SHARED_ORIGIN_BLEND, SHARED_ORIGIN_MIN_SCALE, SHARED_ORIGIN_MAX_SCALE);
    const scaleY = clamp(1 + (rawScaleY - 1) * SHARED_ORIGIN_BLEND, SHARED_ORIGIN_MIN_SCALE, SHARED_ORIGIN_MAX_SCALE);

    if (
      !isFiniteNumber(originX) ||
      !isFiniteNumber(originY) ||
      !isFiniteNumber(translateX) ||
      !isFiniteNumber(translateY) ||
      !isFiniteNumber(scaleX) ||
      !isFiniteNumber(scaleY)
    ) {
      lastSourceKeyRef.current = sourceKey;
      onConsumed?.();
      return;
    }

    lastSourceKeyRef.current = sourceKey;
    const previousTransformOrigin = el.style.transformOrigin;
    const overflowEl = overflowGuardRef?.current ?? null;
    const previousOverflow = overflowEl?.style.overflow ?? "";
    const previousOverflowX = overflowEl?.style.overflowX ?? "";
    const previousOverflowY = overflowEl?.style.overflowY ?? "";
    let rafId = 0;
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(rafId);
      el.removeEventListener("transitionend", onTransitionEnd);
      el.style.transition = "";
      el.style.transform = "";
      el.style.willChange = "";
      el.style.transformOrigin = previousTransformOrigin;
      if (overflowEl) {
        overflowEl.style.overflow = previousOverflow;
        overflowEl.style.overflowX = previousOverflowX;
        overflowEl.style.overflowY = previousOverflowY;
      }
    };

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== el) return;
      if (event.propertyName !== "transform") return;
      cleanup();
      onConsumed?.();
    };

    el.style.willChange = "transform";
    el.style.transition = "none";
    el.style.transformOrigin = `${originX}px ${originY}px`;
    el.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
    if (overflowEl) {
      overflowEl.style.overflow = "hidden";
      overflowEl.style.overflowX = "hidden";
      overflowEl.style.overflowY = "hidden";
    }
    el.getBoundingClientRect();

    rafId = requestAnimationFrame(() => {
      el.addEventListener("transitionend", onTransitionEnd);
      el.style.transition = `transform ${BLINK_ENTER_TOTAL_MS}ms ${BLINK_ENTER_EASING}`;
      el.style.transform = "translate(0px, 0px) scale(1, 1)";
    });

    return cleanup;
  }, [enabled, sourceRect, targetRectOrResolver, animatedRef, overflowGuardRef, prefersReducedMotion, onConsumed]);
}
