import { createContext, type MutableRefObject, useContext } from "react";

export type PopoverContextValue = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerRef: MutableRefObject<HTMLElement | null>;
  contentRef: MutableRefObject<HTMLElement | null>;
};

export const PopoverContext = createContext<PopoverContextValue | null>(null);

export function usePopoverContext(): PopoverContextValue {
  const ctx = useContext(PopoverContext);
  if (!ctx) {
    throw new Error("Popover primitives must be used within <Popover>.");
  }
  return ctx;
}
