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

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

const HIDE_SCROLLBAR_STYLE: React.CSSProperties = {
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

/**
 * After the last page-level scroll event, wait this long before restoring
 * pointer-events on the popover wrapper. While the page is actively scrolling
 * the wrapper stays transparent (`pointer-events: none`) so wheel events pass
 * through to the page element underneath — native scroll continues.
 */
const SCROLL_PASSTHROUGH_IDLE_MS = 500;

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
    const { open, onOpenChange, triggerRef, contentRef } = usePopoverContext();
    const localContentRef = React.useRef<HTMLDivElement | null>(null);
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    const prevOpenRef = React.useRef(open);
    const { mounted: isMounted, stage: blinkStage, prefersReducedMotion } = useBlinkMotionStage(open, "container");
    const [coords, setCoords] = React.useState<Coords>({ x: 0, y: 0 });
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
      const triggerEl = triggerRef.current;
      const contentEl = localContentRef.current;
      if (!isMounted || !triggerEl || !contentEl) return;
      const triggerRect = triggerEl.getBoundingClientRect();
      const contentRect = contentEl.getBoundingClientRect();
      const next = computePosition(triggerRect, contentRect, side, align, sideOffset, alignOffset);
      setCoords(prev =>
        Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : { x: next.x, y: next.y },
      );
    }, [align, alignOffset, isMounted, side, sideOffset, triggerRef]);

    React.useLayoutEffect(() => {
      if (!isMounted) return;
      recomputePosition();
    }, [isMounted, recomputePosition]);

    React.useEffect(() => {
      if (prevOpenRef.current && !open) {
        onCloseAutoFocus?.(new Event("closeAutoFocus", { cancelable: true }));
      }
      prevOpenRef.current = open;
    }, [open, onCloseAutoFocus]);

    React.useEffect(() => {
      if (!isMounted) return;

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
    }, [isMounted, recomputePosition, triggerRef]);

    // Refs keep document-level listeners stable — only added/removed when the
    // popover opens/closes, not on every render. Without refs, inline callback
    // props create new identities each render, causing useEffect to teardown and
    // re-register listeners. Because useEffect runs *after* paint, there are
    // brief gaps between teardown and re-setup where no listener exists.
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

    // Wheel passthrough: the popover's position:fixed wrapper + child scroll
    // containers (e.g. keyhole strip with overflow-x:auto) cause Chrome's scroll
    // latching to trap vertical wheel events even when nothing inside can scroll
    // vertically. Detect that case, cancel the broken routing, and forward the
    // scroll to the page's scroll container manually.
    React.useEffect(() => {
      const el = localContentRef.current;
      if (!el || !isMounted) return;

      // Find the page's actual scroll container by walking up from the trigger
      // element (which sits in the page's normal document flow). This correctly
      // handles SPAs where html/body have overflow:hidden and scroll lives on a
      // wrapper div. Falls back to the viewport scrolling element.
      // Not cached — the walk is O(DOM-depth) and only runs during active
      // wheel scrolling, so the cost is negligible. Caching would risk holding
      // a stale reference if the SPA replaces the scroll container.
      const findPageScrollEl = (): Element => {
        let n: Element | null = triggerRef.current?.parentElement ?? null;
        while (n) {
          const oy = getComputedStyle(n).overflowY;
          if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
          n = n.parentElement;
        }
        return document.scrollingElement ?? document.documentElement;
      };

      const onWheel = (e: WheelEvent) => {
        if (e.defaultPrevented) return; // Already handled (e.g. useWheelZoom zoom gesture)
        if (e.deltaY === 0) return; // Purely horizontal — let native handle (keyhole pan)

        // Walk from event target up to the popover content div, looking for any
        // element that can scroll vertically in the wheel direction.
        let node = e.target as HTMLElement | null;
        while (node && node !== el.parentElement) {
          const oy = getComputedStyle(node).overflowY;
          if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) {
            // Found a vertically scrollable element — check direction
            if (e.deltaY > 0 && Math.ceil(node.scrollTop) < node.scrollHeight - node.clientHeight) return;
            if (e.deltaY < 0 && node.scrollTop > 0) return;
          }
          node = node.parentElement;
        }

        // Nothing inside can scroll vertically — forward to page.
        e.preventDefault();
        const pixelDelta =
          e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
        findPageScrollEl().scrollTop += pixelDelta;
      };

      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [isMounted, triggerRef]);

    // Scroll passthrough: while the page is actively scrolling, make the
    // popover wrapper transparent to pointer events so wheel events reach the
    // page element underneath and native scroll continues uninterrupted.
    // Without this, a cursor crossing the popover during a scroll gesture
    // immediately switches to programmatic forwarding (above) which feels
    // different from native scroll.  After scroll activity goes idle for
    // SCROLL_PASSTHROUGH_IDLE_MS the wrapper regains pointer-events.
    React.useEffect(() => {
      const wrapper = wrapperRef.current;
      if (!wrapper || !isMounted) return;

      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const onScroll = (e: Event) => {
        // Ignore scroll events originating inside the popover (e.g. keyhole
        // horizontal pan) — only page-level scroll should trigger passthrough.
        const target = e.target;
        if (target instanceof Node && wrapper.contains(target)) return;

        wrapper.style.pointerEvents = "none";
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (!wrapper.isConnected) return;
          wrapper.style.pointerEvents = "";
          idleTimer = null;
        }, SCROLL_PASSTHROUGH_IDLE_MS);
      };

      window.addEventListener("scroll", onScroll, { capture: true, passive: true });
      return () => {
        window.removeEventListener("scroll", onScroll, { capture: true });
        if (idleTimer !== null) {
          clearTimeout(idleTimer);
          wrapper.style.pointerEvents = "";
        }
      };
    }, [isMounted]);

    if (!isMounted) return null;

    const managesOverflow = style?.overflow === undefined && style?.overflowY === undefined;

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
            transform: `translate3d(${coords.x}px, ${coords.y}px, 0)`,
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
                ...style,
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
