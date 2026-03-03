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
import { PopoverPortal } from "./PopoverPrimitives.js";
import { usePopoverContext } from "./popoverContext.js";
import { assignRef } from "./refUtils.js";
import { SCROLL_LOCK_LAYOUT_SHIFT_EVENT } from "./scrollLock.js";

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
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
  let x = triggerRect.left;
  let y = triggerRect.bottom + sideOffset;

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
    const [isMounted, setIsMounted] = React.useState(open);
    const [state, setState] = React.useState<"open" | "closed">(open ? "open" : "closed");
    const [coords, setCoords] = React.useState<Coords>({ x: 0, y: 0 });

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

    const exitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
      if (open) {
        // Cancel any pending exit so re-opening during the exit window works.
        if (exitTimerRef.current !== null) {
          clearTimeout(exitTimerRef.current);
          exitTimerRef.current = null;
        }
        setIsMounted(true);
        setState("open");
        return;
      }

      // Begin exit: set data-state="closed" so CSS animate-out runs, then
      // unmount after the exit animation duration (80ms, matches duration-[80ms]).
      setState("closed");
      exitTimerRef.current = setTimeout(() => {
        setIsMounted(false);
        exitTimerRef.current = null;
      }, 80);

      return () => {
        if (exitTimerRef.current !== null) {
          clearTimeout(exitTimerRef.current);
          exitTimerRef.current = null;
        }
      };
    }, [open]);

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

    if (!isMounted) return null;

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
            pointerEvents: state === "open" ? "auto" : "none",
            transform: `translate3d(${coords.x}px, ${coords.y}px, 0)`,
          }}
        >
          <div
            ref={setContentRefs}
            data-state={state}
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
                ...style,
              } as React.CSSProperties
            }
            className={cn(
              // Base styling: fit-content dimensions, viewport-aware max height
              // Ensures popover never exceeds screen bounds, leaving room for positioning
              "rounded-lg border bg-white shadow-xl outline-none",
              "w-fit",
              "overflow-y-auto overflow-x-hidden",
              "border-gray-200 dark:border-gray-700 dark:bg-gray-900",
              // Animations — asymmetric timing: 200ms entry (deliberate arrival), 80ms exit (snappy dismiss).
              // Entry uses zoom-in-[0.96] with Vercel-style fast-settle easing; exit uses zoom-out-[0.97]
              // with no directional slide. Slide reduced to 0.5 (2px) to avoid competing with zoom motion.
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=open]:zoom-in-[0.96] data-[state=closed]:zoom-out-[0.97]",
              "data-[state=open]:data-[side=bottom]:slide-in-from-top-0.5",
              "data-[state=open]:data-[side=left]:slide-in-from-right-0.5",
              "data-[state=open]:data-[side=right]:slide-in-from-left-0.5",
              "data-[state=open]:data-[side=top]:slide-in-from-bottom-0.5",
              "data-[state=open]:duration-200 data-[state=closed]:duration-[80ms]",
              "data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)]",
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
