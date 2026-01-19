/**
 * Popover component built on Radix UI primitives.
 * This is a shadcn-style component - copy/paste friendly.
 *
 * @see https://ui.shadcn.com/docs/components/popover
 * @see https://www.radix-ui.com/primitives/docs/components/popover
 */
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverPortal = PopoverPrimitive.Portal;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 8, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // Base styling: fit-content width, viewport-aware max, larger shadow for image preview
        // Max width accommodates image preview (400px) plus padding, capped at viewport
        "z-[9998] rounded-lg border bg-white shadow-xl outline-none",
        "w-fit max-w-[min(420px,calc(100vw-2rem))]",
        "border-gray-200 dark:border-gray-700 dark:bg-gray-900",
        // Animations
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2",
        "data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2",
        "data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor, PopoverPortal };
