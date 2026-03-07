/**
 * Internal popover primitives for citation UI composition.
 *
 * Provides Popover, PopoverTrigger, PopoverAnchor, and PopoverPortal
 * building blocks used by CitationComponent.
 */

import {
  cloneElement,
  forwardRef,
  type HTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { getPortalContainer } from "./constants.js";
import { PopoverContext, type PopoverContextValue, usePopoverContext } from "./popoverContext.js";
import { composeRefs } from "./refUtils.js";

export interface PopoverRootProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

export function Popover({ open = false, onOpenChange, children }: PopoverRootProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: triggerRef and contentRef have stable identity but must be in deps for React Compiler dependency tracking
  const value = useMemo<PopoverContextValue>(
    () => ({
      open,
      onOpenChange,
      triggerRef,
      contentRef,
    }),
    [open, onOpenChange, triggerRef, contentRef],
  );

  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>;
}

export interface PopoverTriggerProps extends HTMLAttributes<HTMLElement> {
  asChild?: boolean;
  children?: ReactNode;
}

export const PopoverTrigger = forwardRef<HTMLElement, PopoverTriggerProps>(
  ({ asChild = false, children, ...props }, forwardedRef) => {
    const { triggerRef } = usePopoverContext();

    if (asChild) {
      if (!isValidElement(children)) return null;
      const child = children as ReactElement<{ ref?: Ref<HTMLElement> }>;
      const childRef = (child.props as { ref?: Ref<HTMLElement> }).ref;
      return cloneElement(child, {
        ...props,
        ref: composeRefs(childRef, forwardedRef, triggerRef),
      });
    }

    return (
      <button type="button" {...props} ref={composeRefs(forwardedRef, triggerRef)}>
        {children}
      </button>
    );
  },
);
PopoverTrigger.displayName = "PopoverTrigger";

export const PopoverAnchor = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>((props, ref) => {
  return <div ref={ref} {...props} />;
});
PopoverAnchor.displayName = "PopoverAnchor";

export interface PopoverPortalProps {
  children?: ReactNode;
  container?: HTMLElement | null;
}

export function PopoverPortal({ children, container }: PopoverPortalProps) {
  const portalContainer = container ?? getPortalContainer();
  if (!portalContainer) return null;
  return createPortal(children, portalContainer);
}
