/**
 * Internal popover content component.
 *
 * Maintains familiar DOM semantics (`data-state`, `data-side`, portal wrapper)
 * with in-repo positioning logic. No external dependencies.
 */

import * as React from "react";
import {
  EXPANDED_POPOVER_HEIGHT,
  GUARD_MAX_WIDTH_VAR,
  HIDE_SCROLLBAR_STYLE,
  POPOVER_WIDTH_DEFAULT,
  POPOVER_WIDTH_VAR,
  Z_INDEX_BACKDROP_DEFAULT,
  Z_INDEX_POPOVER_VAR,
} from "./constants.js";
import { useBlinkMotionStage } from "./hooks/useBlinkMotionStage.js";
import { getBlinkContainerMotionStyle } from "./motion/blinkAnimation.js";
import { PopoverPortal } from "./PopoverPrimitives.js";
import { usePopoverContext } from "./popoverContext.js";
import { assignRef } from "./refUtils.js";
import { SCROLL_LOCK_LAYOUT_SHIFT_EVENT } from "./scrollLock.js";
import { cn } from "./utils.js";

/**
 * Walk from `triggerEl` up the DOM to find the page's actual scroll container.
 * Handles SPAs where html/body have overflow:hidden and scroll lives on a wrapper div.
 * Falls back to the viewport scrolling element.
 */
function findPageScrollEl(triggerEl: HTMLElement | null): Element {
  let n: Element | null = triggerEl?.parentElement ?? null;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

type PopoverSide = "top" | "right" | "bottom" | "left";
type PopoverAlign = "start" | "center" | "end";

type PopoverContentProps = React.HTMLAttributes<HTMLDivElement> & {
  align?: PopoverAlign;
  side?: PopoverSide;
  sideOffset?: number;
  alignOffset?: number;
  onCloseAutoFocus?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
};

type Coords = { x: number; y: number };

function computePosition(
  triggerRect: DOMRect,
  contentRect: DOMRect,
  side: PopoverSide,
  align: PopoverAlign,
  sideOffset: number,
  alignOffset: number,
): Coords {
  let x: number;
  let y: number;

  if (side === "top" || side === "bottom") {
    if (align === "center") {
      x = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2;
    } else if (align === "end") {
      x = triggerRect.right - contentRect.width;
    } else {
      x = triggerRect.left;
    }
    x += alignOffset;
    y = side === "bottom" ? triggerRect.bottom + sideOffset : triggerRect.top - contentRect.height - sideOffset;
    return { x: Math.round(x), y: Math.round(y) };
  }

  if (align === "center") {
    y = triggerRect.top + triggerRect.height / 2 - contentRect.height / 2;
  } else if (align === "end") {
    y = triggerRect.bottom - contentRect.height;
  } else {
    y = triggerRect.top;
  }
  y += alignOffset;
  x = side === "right" ? triggerRect.right + sideOffset : triggerRect.left - contentRect.width - sideOffset;

  return { x: Math.round(x), y: Math.round(y) };
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  (
    {
      className,
      align = "center",
      side = "bottom",
      sideOffset = 8,
      alignOffset = 0,
      style,
      onCloseAutoFocus,
      onEscapeKeyDown,
      role,
      ...props
    },
    forwardedRef,
  ) => {
    // coordsRef holds the last-computed position. It is written imperatively in recomputePosition
    // (via wrapper.style.transform). The transform is NOT included in the JSX style object —
    // React only manages style properties it controls, so omitting transform here means React
    // never overwrites the imperatively-set value on re-renders. recomputePosition is called in
    // useLayoutEffect (fires before paint) so the initial position is set before first paint.
    const { open, onOpenChange, triggerRef, contentRef } = usePopoverContext();
    const localContentRef = React.useRef<HTMLDivElement | null>(null);
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    const prevOpenRef = React.useRef(open);
    const { mounted: isMounted, stage: blinkStage, prefersReducedMotion } = useBlinkMotionStage(open, "container");
    const coordsRef = React.useRef<Coords>({ x: 0, y: 0 });
    const dataState: "open" | "closed" = open ? "open" : "closed";

    const setContentRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        localContentRef.current = node;
        contentRef.current = node;
        assignRef(forwardedRef, node);
      },
      [contentRef, forwardedRef],
    );

    const recomputePosition = React.useCallback(() => {
      if (!open) return;
      const triggerEl = triggerRef.current;
      const contentEl = localContentRef.current;
      const wrapper = wrapperRef.current;
      if (!isMounted || !triggerEl || !contentEl || !wrapper) return;
      const triggerRect = triggerEl.getBoundingClientRect();
      const contentRect = contentEl.getBoundingClientRect();
      const next = computePosition(triggerRect, contentRect, side, align, sideOffset, alignOffset);
      // Skip if coords haven't changed — BUT only when the wrapper already has a transform.
      // On remount the wrapper is a fresh DOM node with no transform; coordsRef still holds
      // the previous open's coords, so the diff check would fire and leave the wrapper at (0,0).
      const alreadyPositioned = wrapper.style.transform !== "";
      if (
        alreadyPositioned &&
        Math.abs(coordsRef.current.x - next.x) < 0.5 &&
        Math.abs(coordsRef.current.y - next.y) < 0.5
      )
        return;
      coordsRef.current = next;
      wrapper.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
    }, [align, alignOffset, isMounted, open, side, sideOffset, triggerRef]);

    React.useLayoutEffect(() => {
      if (!isMounted || !open) return;
      recomputePosition();
    }, [isMounted, open, recomputePosition]);

    React.useEffect(() => {
      if (prevOpenRef.current && !open) {
        onCloseAutoFocus?.(new Event("closeAutoFocus", { cancelable: true }));
      }
      prevOpenRef.current = open;
    }, [open, onCloseAutoFocus]);

    React.useEffect(() => {
      if (!isMounted || !open) return;

      let rafId = 0;
      const scheduleRecompute = () => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => recomputePosition());
      };

      scheduleRecompute();

      const ro = new ResizeObserver(scheduleRecompute);
      if (localContentRef.current) ro.observe(localContentRef.current);
      if (triggerRef.current) ro.observe(triggerRef.current);

      window.addEventListener("resize", scheduleRecompute);
      window.addEventListener("scroll", scheduleRecompute, { capture: true, passive: true });
      window.addEventListener(SCROLL_LOCK_LAYOUT_SHIFT_EVENT, scheduleRecompute as EventListener);

      return () => {
        cancelAnimationFrame(rafId);
        ro.disconnect();
        window.removeEventListener("resize", scheduleRecompute);
        window.removeEventListener("scroll", scheduleRecompute, { capture: true });
        window.removeEventListener(SCROLL_LOCK_LAYOUT_SHIFT_EVENT, scheduleRecompute as EventListener);
      };
    }, [isMounted, open, recomputePosition, triggerRef]);

    // Refs keep document-level listeners stable — only added/removed when the
    // popover opens/closes, not on every render. Without refs, inline callback
    // props create new identities each render, causing useEffect to teardown and
    // re-register listeners. Because useEffect runs *after* paint, there are
    // brief gaps between teardown and re-setup where no listener exists.
    // Cache the page scroll container so wheel/touch handlers avoid repeated
    // getComputedStyle() walks on every event. Resolved once on mount.
    const scrollContainerRef = React.useRef<Element | null>(null);
    React.useEffect(() => {
      if (isMounted && triggerRef.current) {
        scrollContainerRef.current = findPageScrollEl(triggerRef.current);
      } else {
        scrollContainerRef.current = null;
      }
    }, [isMounted, triggerRef]);

    const getPageScrollEl = React.useCallback(
      () => scrollContainerRef.current ?? findPageScrollEl(triggerRef.current),
      [triggerRef],
    );

    const onEscapeKeyDownRef = React.useRef(onEscapeKeyDown);
    const onOpenChangeRef = React.useRef(onOpenChange);
    React.useLayoutEffect(() => {
      onEscapeKeyDownRef.current = onEscapeKeyDown;
      onOpenChangeRef.current = onOpenChange;
    });

    // Outside-click dismiss is handled by CitationComponent (the sole consumer)
    // via its own desktop mousedown and mobile touchstart handlers. These provide
    // richer context (overlay awareness, tap-vs-scroll detection) that a generic
    // handler here cannot replicate.

    React.useEffect(() => {
      if (!open || !isMounted) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        onEscapeKeyDownRef.current?.(event);
        if (event.defaultPrevented) return;
        onOpenChangeRef.current?.(false);
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [open, isMounted]);

    // Shared scroll-detection helper: walk from target up to boundary, checking
    // if any ancestor can scroll vertically in the given direction.
    const canChildScrollVertically = React.useCallback(
      (target: HTMLElement | null, boundary: HTMLElement | null, deltaY: number): boolean => {
        let node = target;
        while (node && node !== boundary) {
          const oy = getComputedStyle(node).overflowY;
          if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) {
            if (deltaY > 0 && Math.ceil(node.scrollTop) < node.scrollHeight - node.clientHeight) return true;
            if (deltaY < 0 && node.scrollTop > 0) return true;
          }
          node = node.parentElement;
        }
        return false;
      },
      [],
    );

    // Wheel passthrough: the popover's position:fixed wrapper + child scroll
    // containers (e.g. keyhole strip with overflow-x:auto) cause Chrome's scroll
    // latching to trap vertical wheel events even when nothing inside can scroll
    // vertically. Detect that case, cancel the broken routing, and forward the
    // scroll to the page's scroll container manually.
    React.useEffect(() => {
      const el = localContentRef.current;
      if (!el || !isMounted) return;

      const onWheel = (e: WheelEvent) => {
        if (e.defaultPrevented) return; // Already handled (e.g. useWheelZoom zoom gesture)
        if (e.deltaY === 0) return; // Purely horizontal — let native handle (keyhole pan)

        if (canChildScrollVertically(e.target as HTMLElement | null, el.parentElement, e.deltaY)) return;

        // Nothing inside can scroll vertically — forward to page.
        e.preventDefault();
        const pixelDelta =
          e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
        getPageScrollEl().scrollTop += pixelDelta;
      };

      // passive: false is required — onWheel calls e.preventDefault() to forward scroll to the page.
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [isMounted, getPageScrollEl, canChildScrollVertically]);

    // Touch scroll passthrough: mirrors the wheel handler above for mobile.
    // Touches on the popover's position:fixed surface dead-end at the viewport
    // (overflow:hidden in consumer apps). We intercept vertical swipes and
    // forward them to the page's real scroll container.
    React.useEffect(() => {
      const el = localContentRef.current;
      if (!el || !isMounted) return;

      const AXIS_LOCK_PX = 8;
      const COAST_DECELERATION = 0.95;
      const COAST_CUTOFF = 0.5; // px/frame
      const VELOCITY_SAMPLES = 5;
      const STALE_MS = 100;

      let startX = 0;
      let startY = 0;
      type Axis = "undecided" | "vertical" | "horizontal";
      let axis: Axis = "undecided";
      let coastRafId: number | null = null;
      let velocityHistory: { y: number; t: number }[] = [];

      const cancelCoast = () => {
        if (coastRafId !== null) {
          cancelAnimationFrame(coastRafId);
          coastRafId = null;
        }
      };

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        cancelCoast();
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        axis = "undecided";
        velocityHistory = [{ y: t.clientY, t: Date.now() }];
      };

      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;

        // If a child already handled this (e.g. keyhole panning), reset start
        // so when it releases (edge passthrough) our axis evaluation starts fresh.
        if (e.defaultPrevented) {
          const t = e.touches[0];
          startX = t.clientX;
          startY = t.clientY;
          axis = "undecided";
          velocityHistory = [{ y: t.clientY, t: Date.now() }];
          return;
        }

        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        if (axis === "undecided") {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < AXIS_LOCK_PX) return;
          axis = Math.abs(dy) >= Math.abs(dx) ? "vertical" : "horizontal";
        }

        if (axis === "horizontal") return; // let native/keyhole handle

        // Vertical: check if anything inside can scroll
        if (canChildScrollVertically(e.target as HTMLElement | null, el.parentElement, dy > 0 ? 1 : -1)) return;

        // Nothing can scroll — forward to page
        e.preventDefault();
        const pageEl = getPageScrollEl();
        pageEl.scrollTop -= dy;
        // Reset start position so next delta is incremental
        startX = t.clientX;
        startY = t.clientY;

        // Record velocity sample
        const now = Date.now();
        velocityHistory.push({ y: t.clientY, t: now });
        if (velocityHistory.length > VELOCITY_SAMPLES) velocityHistory.shift();
      };

      const onTouchEnd = () => {
        if (axis !== "vertical") {
          axis = "undecided";
          return;
        }

        // Compute velocity for momentum coast
        if (velocityHistory.length >= 2) {
          const first = velocityHistory[0];
          const last = velocityHistory[velocityHistory.length - 1];
          const timeSinceLast = Date.now() - last.t;
          if (timeSinceLast < STALE_MS) {
            const dt = last.t - first.t;
            if (dt > 0) {
              // Velocity in px/ms — inverted because we subtracted dy from scrollTop
              const vy = (first.y - last.y) / dt;
              if (Math.abs(vy) > 0.08) {
                let frameVy = vy * 16.67;
                let lastTime = performance.now();
                const pageEl = getPageScrollEl();

                const coast = () => {
                  const now = performance.now();
                  const frameDt = now - lastTime;
                  lastTime = now;
                  const factor = COAST_DECELERATION ** (frameDt / 16.67);
                  pageEl.scrollTop += frameVy;
                  frameVy *= factor;
                  if (Math.abs(frameVy) > COAST_CUTOFF) {
                    coastRafId = requestAnimationFrame(coast);
                  } else {
                    coastRafId = null;
                  }
                };
                coastRafId = requestAnimationFrame(coast);
              }
            }
          }
        }

        axis = "undecided";
        velocityHistory = [];
      };

      el.addEventListener("touchstart", onTouchStart, { passive: true });
      // passive: false is required — onTouchMove calls e.preventDefault() to forward scroll to the page.
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd, { passive: true });
      el.addEventListener("touchcancel", onTouchEnd, { passive: true });
      return () => {
        cancelCoast();
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        el.removeEventListener("touchcancel", onTouchEnd);
      };
    }, [isMounted, getPageScrollEl, canChildScrollVertically]);

    if (!isMounted) return null;

    const managesOverflow = style?.overflow === undefined && style?.overflowY === undefined;

    // Decompose shorthand `overflow` into longhand to avoid React's
    // "removing overflow while overflowX is set" warning on re-render.
    const { overflow: incomingOverflow, ...styleWithoutOverflow } = style ?? {};

    return (
      <PopoverPortal>
        <div
          ref={wrapperRef}
          data-dc-popover-wrapper=""
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            width: "max-content",
            zIndex: `var(${Z_INDEX_POPOVER_VAR}, ${Z_INDEX_BACKDROP_DEFAULT})`,
            pointerEvents: dataState === "open" ? "auto" : "none",
            // transform is managed imperatively by recomputePosition — not in JSX style
            // so React never clears it on re-renders. The wrapper starts at (0,0) until
            // the first recomputePosition call; pointerEvents:"none" while closed ensures
            // the unpositioned wrapper is never interactive or visible before that runs.
          }}
        >
          <style>{`[data-dc-popover-content]::-webkit-scrollbar { display: none; }`}</style>
          <div
            ref={setContentRefs}
            data-dc-popover-content=""
            data-state={dataState}
            data-side={side}
            data-align={align}
            role={role ?? "dialog"}
            style={
              {
                // Max width respects the CSS custom property (--dc-popover-width) and caps to viewport.
                // var(--dc-guard-max-width) is set by useViewportBoundaryGuard using
                // document.documentElement.clientWidth (visible viewport excluding scrollbar).
                // Falls back to calc(100dvw - 2rem) for SSR or before the guard runs.
                maxWidth: `min(var(${POPOVER_WIDTH_VAR}, ${POPOVER_WIDTH_DEFAULT}), var(${GUARD_MAX_WIDTH_VAR}, calc(100dvw - 2rem)))`,
                // Fixed to calc(100dvh - 2rem). Intentionally not tying this to trigger movement.
                maxHeight: EXPANDED_POPOVER_HEIGHT,
                ...getBlinkContainerMotionStyle(blinkStage, prefersReducedMotion),
                overflowX: "clip",
                ...styleWithoutOverflow,
                ...(incomingOverflow !== undefined ? { overflowX: incomingOverflow, overflowY: incomingOverflow } : {}),
                ...(managesOverflow ? { overflowY: "clip" } : {}),
                ...HIDE_SCROLLBAR_STYLE,
              } as React.CSSProperties
            }
            className={cn(
              // Base styling: fit-content dimensions, viewport-aware max height
              // Ensures popover never exceeds screen bounds, leaving room for positioning
              "rounded-lg border bg-white shadow-xl outline-none",
              "w-fit",
              // overflow-x is handled via inline style (clip, not hidden — avoids scroll container)
              "border-gray-200 dark:border-gray-700 dark:bg-gray-900",
              className,
            )}
            {...props}
          />
        </div>
      </PopoverPortal>
    );
  },
);
PopoverContent.displayName = "PopoverContent";

export { PopoverContent };
