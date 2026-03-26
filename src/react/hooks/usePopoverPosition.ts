/**
 * Composed popover positioning hook.
 *
 * Orchestrates the 5 individual positioning hooks + width projection into a
 * single call that returns everything Citation.tsx needs for popover placement.
 *
 * Individual hooks remain as internal implementation — they exist as separate
 * files for readability and to isolate `setState`-in-`useLayoutEffect` patterns
 * that would cause React Compiler bailouts in the parent component.
 *
 * @packageDocumentation
 */

import type { MutableRefObject, RefObject } from "react";
import { useMemo } from "react";
import { KEYHOLE_STRIP_HEIGHT_DEFAULT } from "../constants.js";
import type { PopoverViewState } from "../DefaultPopoverContent.js";
import { getExpandedPopoverWidthPx, getSummaryPopoverWidthPx } from "../expandedWidthPolicy.js";
import { useExpandedPageSideOffset } from "./useExpandedPageSideOffset.js";
import { useLockedPopoverSide } from "./useLockedPopoverSide.js";
import { usePopoverAlignOffset } from "./usePopoverAlignOffset.js";
import { usePopoverViewState } from "./usePopoverViewState.js";
import { useViewportBoundaryGuard } from "./useViewportBoundaryGuard.js";

// =============================================================================
// TYPES
// =============================================================================

export interface UsePopoverPositionConfig {
  /** Whether the popover is currently open/hovered. */
  isOpen: boolean;
  /** Ref to the trigger element. */
  triggerRef: RefObject<HTMLSpanElement | null>;
  /** Ref to the popover content element. */
  popoverContentRef: RefObject<HTMLElement | null>;
  /** Preferred vertical side. */
  preferredSide: "top" | "bottom";
  /** Enable haptic feedback on mobile. */
  experimentalHaptics?: boolean;
  /** Whether the device is mobile. */
  isMobile?: boolean;
  /** Whether the user prefers reduced motion. */
  prefersReducedMotion?: boolean;
  /** Called when escape at summary level should dismiss the popover. */
  onDismiss?: () => void;
  /** Called when any transition collapses back to summary. */
  onCollapseToSummary?: () => void;
  /** Evidence image dimensions for width projection (from verification.evidence.dimensions). */
  evidenceDimensions?: { width: number; height: number } | null;
}

export interface PopoverPositionResult {
  // View state management (delegated from usePopoverViewState)
  /** Current view state for rendering. */
  viewState: PopoverViewState;
  /** Ref in sync with current — safe in addEventListener handlers. */
  viewStateRef: RefObject<PopoverViewState>;
  /** Transition to a new state (handles haptics, VT, scroll lock, history). */
  transition: (next: PopoverViewState) => void;
  /** Escape key handler — wire to PopoverContent.onEscapeKeyDown. */
  onEscapeKeyDown: (e: KeyboardEvent) => void;
  /** Ref for child components to register escape intercepts. */
  escapeInterceptRef: MutableRefObject<(() => void) | null>;
  /** Tracks which state preceded expanded-page (for back-nav rendering). */
  prevBeforeExpandedPageRef: RefObject<"summary" | "expanded-keyhole">;
  /** Expanded image natural width (null when in summary). */
  expandedNaturalWidth: number | null;
  /** Which expanded state reported the width. */
  expandedWidthSource: "expanded-keyhole" | "expanded-page" | null;
  /** Width change handler — wire to DefaultPopoverContent.onExpandedWidthChange. */
  onExpandedWidthChange: (width: number | null, source?: "expanded-keyhole" | "expanded-page" | null) => void;
  /** Reset view state to summary and clear width/expanded state. */
  resetToSummary: () => void;

  // Positioning outputs
  /** Locked popover side (top or bottom). */
  side: "top" | "bottom";
  /** Side offset for expanded-page mode (undefined otherwise). */
  sideOffset: number | undefined;
  /** Horizontal align offset for viewport clamping. */
  alignOffset: number;
}

// =============================================================================
// COMPOSED HOOK
// =============================================================================

/**
 * Single hook that orchestrates all popover positioning for Citation.tsx.
 *
 * Absorbs:
 * - usePopoverViewState (view state + transitions)
 * - useLockedPopoverSide (side locking)
 * - useExpandedPageSideOffset (expanded-page vertical offset)
 * - projectedPopoverWidthPx (width projection from evidence dimensions)
 * - usePopoverAlignOffset (horizontal viewport clamping)
 * - useViewportBoundaryGuard (DOM-level safety net)
 */
export function usePopoverPosition(config: UsePopoverPositionConfig): PopoverPositionResult {
  const {
    isOpen,
    triggerRef,
    popoverContentRef,
    preferredSide,
    experimentalHaptics,
    isMobile,
    prefersReducedMotion,
    onDismiss,
    onCollapseToSummary,
    evidenceDimensions,
  } = config;

  // 1. View state management
  const viewStateHandle = usePopoverViewState({
    isOpen,
    popoverContentRef,
    experimentalHaptics,
    isMobile,
    prefersReducedMotion,
    onDismiss,
    onCollapseToSummary,
  });

  // 2. Side locking
  const side = useLockedPopoverSide(isOpen, preferredSide, triggerRef);

  // 3. Expanded-page side offset
  const sideOffset = useExpandedPageSideOffset(viewStateHandle.current, triggerRef, side);

  // 4. Width projection (absorbed from Citation.tsx inline useMemo)
  const projectedSummaryKeyholeWidth = useMemo(() => {
    if (!evidenceDimensions) return null;
    const { width, height } = evidenceDimensions;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return width * (KEYHOLE_STRIP_HEIGHT_DEFAULT / height);
  }, [evidenceDimensions]);

  const projectedPopoverWidthPx = useMemo(() => {
    if (!isOpen || typeof document === "undefined") return null;
    const viewportWidth = document.documentElement.clientWidth;
    if (viewStateHandle.current === "summary") {
      return getSummaryPopoverWidthPx(projectedSummaryKeyholeWidth, viewportWidth);
    }
    if (viewStateHandle.expandedNaturalWidth === null) return null;
    const shouldProjectExpandedWidth =
      (viewStateHandle.current === "expanded-keyhole" && viewStateHandle.expandedWidthSource === "expanded-keyhole") ||
      (viewStateHandle.current === "expanded-page" &&
        (viewStateHandle.expandedWidthSource === "expanded-page" ||
          viewStateHandle.expandedWidthSource === "expanded-keyhole"));
    if (shouldProjectExpandedWidth) {
      return getExpandedPopoverWidthPx(viewStateHandle.expandedNaturalWidth, viewportWidth);
    }
    return null;
  }, [
    isOpen,
    viewStateHandle.current,
    projectedSummaryKeyholeWidth,
    viewStateHandle.expandedNaturalWidth,
    viewStateHandle.expandedWidthSource,
  ]);

  // 5. Horizontal align offset
  const alignOffset = usePopoverAlignOffset(
    isOpen,
    viewStateHandle.current,
    triggerRef,
    popoverContentRef,
    projectedPopoverWidthPx,
  );

  // 6. Viewport boundary guard (imperative DOM side-effect, no return value)
  useViewportBoundaryGuard(isOpen, viewStateHandle.current, popoverContentRef);

  return useMemo(
    (): PopoverPositionResult => ({
      // View state
      viewState: viewStateHandle.current,
      viewStateRef: viewStateHandle.ref,
      transition: viewStateHandle.transition,
      onEscapeKeyDown: viewStateHandle.onEscapeKeyDown,
      escapeInterceptRef: viewStateHandle.escapeInterceptRef,
      prevBeforeExpandedPageRef: viewStateHandle.prevBeforeExpandedPageRef,
      expandedNaturalWidth: viewStateHandle.expandedNaturalWidth,
      expandedWidthSource: viewStateHandle.expandedWidthSource,
      onExpandedWidthChange: viewStateHandle.onExpandedWidthChange,
      resetToSummary: viewStateHandle.resetToSummary,
      // Positioning
      side,
      sideOffset,
      alignOffset,
    }),
    [viewStateHandle, side, sideOffset, alignOffset],
  );
}
