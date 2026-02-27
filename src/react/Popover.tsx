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
          // This must match the inner content width to prevent horizontal scrollbar.
          maxWidth: `min(var(${POPOVER_WIDTH_VAR}, ${POPOVER_WIDTH_DEFAULT}), calc(100vw - 2rem))`,
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
        // Animations — 150ms entry/exit. Tighter zoom (98%) for a precise, editorial feel.
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]",
        "data-[side=bottom]:slide-in-from-top-1",
        "data-[side=left]:slide-in-from-right-1",
        "data-[side=right]:slide-in-from-left-1",
        "data-[side=top]:slide-in-from-bottom-1",
        "duration-150",
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
