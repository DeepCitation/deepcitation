/**
 * Popover Primitive Exports
 *
 * This module exports Radix UI Popover primitives for composition.
 * These are low-level building blocks for creating custom popover implementations.
 *
 * @see https://www.radix-ui.com/primitives/docs/components/popover
 */

import * as PopoverPrimitive from "@radix-ui/react-popover";

export const Popover: typeof PopoverPrimitive.Root = PopoverPrimitive.Root;

export const PopoverTrigger: typeof PopoverPrimitive.Trigger = PopoverPrimitive.Trigger;

export const PopoverAnchor: typeof PopoverPrimitive.Anchor = PopoverPrimitive.Anchor;

export const PopoverPortal: typeof PopoverPrimitive.Portal = PopoverPrimitive.Portal;
