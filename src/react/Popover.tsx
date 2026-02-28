/**
 * Popover component built on Radix UI primitives.
 * This is a shadcn-style component - copy/paste friendly.
 *
 * @see https://ui.shadcn.com/docs/components/popover
 * @see https://www.radix-ui.com/primitives/docs/components/popover
 */

import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";
import {
  EXPANDED_POPOVER_HEIGHT,
  GUARD_MAX_WIDTH_VAR,
  POPOVER_WIDTH_DEFAULT,
  POPOVER_WIDTH_VAR,
  Z_INDEX_BACKDROP_DEFAULT,
  Z_INDEX_POPOVER_VAR,
} from "./constants.js";

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 8, sticky = "always", collisionPadding = 8, style, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      // sticky="always" keeps the popover anchored to the trigger even when content changes.
      // This prevents confusing UX where the popover shifts position when expanding/collapsing
      // sections like search details. The popover may be partially offscreen but stays in place.
      sticky={sticky}
      collisionPadding={collisionPadding}
      style={
        {
          zIndex: `var(${Z_INDEX_POPOVER_VAR}, ${Z_INDEX_BACKDROP_DEFAULT})`,
          // Max width respects the CSS custom property (--dc-popover-width) and caps to viewport.
          // var(--dc-guard-max-width) is set by useViewportBoundaryGuard using
          // document.documentElement.clientWidth (visible viewport excluding scrollbar).
          // Falls back to calc(100dvw - 2rem) for SSR or before the guard runs.
          maxWidth: `min(var(${POPOVER_WIDTH_VAR}, ${POPOVER_WIDTH_DEFAULT}), var(${GUARD_MAX_WIDTH_VAR}, calc(100dvw - 2rem)))`,
          // Fixed to calc(100dvh - 2rem). Intentionally not using Radix's
          // --radix-popover-content-available-height — that var caused the popover to
          // resize as the trigger scrolled out of view.
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
  </PopoverPrimitive.Portal>
)) as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> &
    React.RefAttributes<React.ElementRef<typeof PopoverPrimitive.Content>>
>;
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { PopoverContent };
