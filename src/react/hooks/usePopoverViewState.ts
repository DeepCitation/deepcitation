// React Compiler opt-out: viewStateRef is mutated in transition/onEscapeKeyDown
// callbacks and read in useLayoutEffect — the compiler cannot safely memoize
// across this boundary.
// "use no memo" — React Compiler opt-out (would be a directive if compiler were active).

import type { MutableRefObject, RefObject } from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PopoverViewState } from "../DefaultPopoverContent.js";
import { triggerHaptic } from "../haptics.js";
import {
  startEvidencePageCollapseTransition,
  startEvidencePageExpandTransition,
  startEvidenceViewTransition,
} from "../viewTransition.js";

export interface UsePopoverViewStateConfig {
  popoverContentRef: RefObject<HTMLElement | null>;
  experimentalHaptics?: boolean;
  isMobile?: boolean;
  prefersReducedMotion?: boolean;
  /** Called when Escape at summary level should dismiss the popover */
  onDismiss?: () => void;
  /** Called when any transition collapses back to summary */
  onCollapseToSummary?: () => void;
}

export interface PopoverViewStateHandle {
  /** Current view state for rendering */
  current: PopoverViewState;
  /** Ref in sync with current — safe in addEventListener handlers */
  ref: RefObject<PopoverViewState>;
  /** Transition to a new state (handles haptics, VT, scroll lock, history) */
  transition: (next: PopoverViewState) => void;
  /** Escape key handler — wire to PopoverContent.onEscapeKeyDown */
  onEscapeKeyDown: (e: KeyboardEvent) => void;
  /** Ref for child components to register escape intercepts */
  escapeInterceptRef: MutableRefObject<(() => void) | null>;
  /** Tracks which state preceded expanded-page (for back-nav rendering) */
  prevBeforeExpandedPageRef: RefObject<"summary" | "expanded-keyhole">;
  /** Expanded image natural width (null when in summary) */
  expandedNaturalWidth: number | null;
  /** Which expanded state reported the width */
  expandedWidthSource: "expanded-keyhole" | "expanded-page" | null;
  /** Width change handler — wire to DefaultPopoverContent.onExpandedWidthChange */
  onExpandedWidthChange: (width: number | null, source?: "expanded-keyhole" | "expanded-page" | null) => void;
  /** Reset view state to summary and clear width/expanded state (for popover open).
   *  NOTE: Does NOT invoke onCollapseToSummary — callers must handle side effects separately. */
  resetToSummary: () => void;
}

const ORDER: Record<PopoverViewState, number> = { summary: 0, "expanded-keyhole": 1, "expanded-page": 2 };

export function usePopoverViewState(config: UsePopoverViewStateConfig): PopoverViewStateHandle {
  const { popoverContentRef, experimentalHaptics, isMobile, prefersReducedMotion, onDismiss, onCollapseToSummary } =
    config;

  const [viewState, setViewState] = useState<PopoverViewState>("summary");
  const [expandedNaturalWidth, setExpandedNaturalWidth] = useState<number | null>(null);
  const [expandedWidthSource, setExpandedWidthSource] = useState<"expanded-keyhole" | "expanded-page" | null>(null);

  const prevBeforeExpandedPageRef = useRef<"summary" | "expanded-keyhole">("summary");
  const escapeInterceptRef = useRef<(() => void) | null>(null);

  // Ref kept in sync so addEventListener handlers read the latest value.
  // useLayoutEffect ensures the ref is updated before any synchronous reads
  // in the same tick — React 18 automatic batching can call transition()
  // twice in one handler, and useEffect would leave the ref stale until after paint.
  const viewStateRef = useRef<PopoverViewState>("summary");
  useLayoutEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  // Keep callback refs in sync to avoid stale closures
  const onDismissRef = useRef(onDismiss);
  useLayoutEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const onCollapseToSummaryRef = useRef(onCollapseToSummary);
  useLayoutEffect(() => {
    onCollapseToSummaryRef.current = onCollapseToSummary;
  }, [onCollapseToSummary]);

  const handleExpandedWidthChange = useCallback(
    (width: number | null, sourceOverride?: "expanded-keyhole" | "expanded-page" | null) => {
      const source = sourceOverride ?? viewStateRef.current;
      if (source !== "expanded-keyhole" && source !== "expanded-page") {
        setExpandedNaturalWidth(null);
        setExpandedWidthSource(null);
        return;
      }
      setExpandedNaturalWidth(width);
      setExpandedWidthSource(source);
    },
    [],
  );

  const transition = useCallback(
    (newState: PopoverViewState) => {
      const prev = viewStateRef.current;
      if (experimentalHaptics && isMobile) {
        const isExpanding = (newState === "expanded-page" || newState === "expanded-keyhole") && prev === "summary";
        const isCollapsing = newState === "summary" && (prev === "expanded-page" || prev === "expanded-keyhole");
        if (isExpanding) triggerHaptic("expand");
        else if (isCollapsing) triggerHaptic("collapse");
      }
      // Track which state preceded expanded-page for back-nav
      if (newState === "expanded-page" && prev !== "expanded-page") {
        prevBeforeExpandedPageRef.current = prev === "expanded-keyhole" ? "expanded-keyhole" : "summary";
      }
      // Collapse direction for VT timing
      const isCollapse = ORDER[newState] < ORDER[prev];
      const commitViewState = () => {
        if (newState === "summary") {
          setExpandedNaturalWidth(null);
          setExpandedWidthSource(null);
          onCollapseToSummaryRef.current?.();
        }
        setViewState(newState);
      };
      const isPageExpand = !isCollapse && newState === "expanded-page";
      const isPageCollapse = isCollapse && prev === "expanded-page";
      if (isPageExpand) {
        startEvidencePageExpandTransition(commitViewState, {
          root: popoverContentRef.current,
          skipAnimation: prefersReducedMotion,
        });
        return;
      }
      if (isPageCollapse) {
        startEvidencePageCollapseTransition(commitViewState, {
          root: popoverContentRef.current,
          skipAnimation: prefersReducedMotion,
        });
        return;
      }
      startEvidenceViewTransition(commitViewState, {
        isCollapse,
        skipAnimation: prefersReducedMotion,
        root: popoverContentRef.current,
      });
    },
    [experimentalHaptics, isMobile, prefersReducedMotion, popoverContentRef],
  );

  const onEscapeKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      if (escapeInterceptRef.current) {
        escapeInterceptRef.current();
        return;
      }
      const vs = viewStateRef.current;
      if (vs === "summary") {
        onDismissRef.current?.();
      } else if (vs === "expanded-page") {
        const prev = prevBeforeExpandedPageRef.current;
        transition(prev);
      } else {
        transition("summary");
      }
    },
    [transition],
  );

  const resetToSummary = useCallback(() => {
    setViewState("summary");
    setExpandedNaturalWidth(null);
    setExpandedWidthSource(null);
    prevBeforeExpandedPageRef.current = "summary";
  }, []);

  return useMemo(
    (): PopoverViewStateHandle => ({
      current: viewState,
      ref: viewStateRef,
      transition,
      onEscapeKeyDown,
      escapeInterceptRef,
      prevBeforeExpandedPageRef,
      expandedNaturalWidth,
      expandedWidthSource,
      onExpandedWidthChange: handleExpandedWidthChange,
      resetToSummary,
    }),
    [
      viewState,
      expandedNaturalWidth,
      expandedWidthSource,
      transition,
      onEscapeKeyDown,
      handleExpandedWidthChange,
      resetToSummary,
    ],
  );
}
