/**
 * Popover component built on Radix UI primitives.
 * This is a shadcn-style component - copy/paste friendly.
 *
 * @see https://ui.shadcn.com/docs/components/popover
 * @see https://www.radix-ui.com/primitives/docs/components/popover
 */

import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";
import { Z_INDEX_BACKDROP_DEFAULT, Z_INDEX_POPOVER_VAR } from "./constants.js";

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 8, sticky = "always", style, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      // sticky="always" keeps the popover anchored to the trigger even when content changes.
      // This prevents confusing UX where the popover shifts position when expanding/collapsing
      // sections like search details. The popover may be partially offscreen but stays in place.
      sticky={sticky}
      style={{ zIndex: `var(${Z_INDEX_POPOVER_VAR}, ${Z_INDEX_BACKDROP_DEFAULT})`, ...style } as React.CSSProperties}
      className={cn(
        // Base styling: fit-content dimensions, viewport-aware max for both width and height
        // Ensures popover never exceeds screen bounds, leaving room for positioning
        "rounded-lg border bg-white shadow-xl outline-none",
        "w-fit max-w-[min(400px,calc(100vw-2rem))] max-h-[calc(100vh-4rem)]",
        "overflow-auto",
        "border-gray-200 dark:border-gray-700 dark:bg-gray-900",
        // Animations
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2",
        "data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2",
        "data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { PopoverContent };
