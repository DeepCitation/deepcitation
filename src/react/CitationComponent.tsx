import React, { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { CitationContentDisplay } from "./CitationContentDisplay.js";
import {
  getDefaultContent,
  getDisplayText,
  getStatusHoverClasses,
  VARIANTS_WITH_OWN_HOVER,
} from "./CitationContentDisplay.utils.js";
import { useCitationOverlay } from "./CitationOverlayContext.js";
import type { CitationStatusIndicatorProps, SpinnerStage } from "./CitationStatusIndicator.js";
import { getStatusFromVerification, getStatusLabel } from "./citationStatus.js";
import {
  EXPANDED_IMAGE_SHELL_PX,
  isValidProofImageSrc,
  POPOVER_WIDTH,
  SPINNER_TIMEOUT_MS,
  TOUCH_CLICK_DEBOUNCE_MS,
} from "./constants.js";
import { DefaultPopoverContent, type PopoverViewState } from "./DefaultPopoverContent.js";
import { useIsTouchDevice } from "./hooks/useIsTouchDevice.js";
import { WarningIcon } from "./icons.js";
import { PopoverContent } from "./Popover.js";
import { Popover, PopoverTrigger } from "./PopoverPrimitives.js";
import { REVIEW_DWELL_THRESHOLD_MS, useCitationTiming } from "./timingUtils.js";
import type {
  BaseCitationProps,
  CitationBehaviorActions,
  CitationBehaviorConfig,
  CitationBehaviorContext,
  CitationContent,
  CitationEventHandlers,
  CitationInteractionMode,
  CitationRenderProps,
  CitationVariant,
  IndicatorVariant,
} from "./types.js";
import { cn, generateCitationInstanceId, generateCitationKey } from "./utils.js";

// Re-export types for convenience
export type {
  CitationContent,
  CitationInteractionMode,
  CitationVariant,
  IndicatorVariant,
} from "./types.js";

/** Tracks which deprecation warnings have already been emitted (dev-mode only). */
const deprecationWarned = new Set<string>();

// ---------- Body scroll lock (ref-counted) ----------
// Multiple CitationComponent instances may open simultaneously (hover overlap).
// A simple capture-and-restore pattern breaks when locks stack. Instead we
// ref-count: the first lock captures the original values, the last unlock
// restores them. This prevents leaving the page permanently scroll-locked.
let scrollLockCount = 0;
let scrollLockOriginalOverflow = "";
let scrollLockOriginalPaddingRight = "";

function acquireScrollLock() {
  if (scrollLockCount === 0) {
    scrollLockOriginalOverflow = document.body.style.overflow;
    scrollLockOriginalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  scrollLockCount++;
}

function releaseScrollLock() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = scrollLockOriginalOverflow;
    document.body.style.paddingRight = scrollLockOriginalPaddingRight;
  }
}

// =============================================================================
// ERROR BOUNDARY
// =============================================================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary for catching and displaying rendering errors in citation components.
 * Prevents the entire app from crashing if citation rendering fails.
 */
class CitationErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[DeepCitation] Citation component error:", error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      // Default fallback: minimal error indicator
      return (
        <span
          className="inline-flex items-center text-red-500 dark:text-red-400"
          title={`Citation error: ${this.state.error?.message || "Unknown error"}`}
        >
          <WarningIcon className="size-3" />
        </span>
      );
    }

    return this.props.children;
  }
}

// Utility functions and CitationContentDisplay
// imported from ./CitationContentDisplay.js (canonical location)

// =============================================================================
// TYPES
// =============================================================================

/**
 * Props for the CitationComponent.
 *
 * ## Behavior
 *
 * Default interaction pattern:
 * - **Hover**: Shows popover with verification image/details
 * - **Click**: Opens full-size image overlay (zoom)
 * - **Escape / Click outside / Click overlay**: Closes image overlay
 *
 * Custom behavior:
 * - Use `behaviorConfig.onClick` to replace the default click behavior
 * - Use `eventHandlers.onClick` to add side effects (disables default)
 *
 * @example Default usage
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   verification={verification}
 * />
 * ```
 *
 * @example Custom click behavior
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   verification={verification}
 *   behaviorConfig={{
 *     onClick: (context) => {
 *       // Custom action
 *       console.log('Clicked:', context.citationKey);
 *       return { setImageExpanded: true };
 *     }
 *   }}
 * />
 * ```
 */
export interface CitationComponentProps extends BaseCitationProps {
  /** Verification result from the DeepCitation API */
  verification?: Verification | null;
  /**
   * Explicitly show loading spinner. When true, displays spinner regardless
   * of verification status. Use this when verification is in-flight.
   */
  isLoading?: boolean;
  /**
   * Visual style variant for the citation.
   * - `linter`: Inline text with semantic underlines (default)
   * - `chip`: Pill/badge style with neutral gray background
   * - `brackets`: [text✓] with square brackets
   * - `text`: Plain text, inherits parent styling
   * - `superscript`: Small raised text like footnotes¹
   * - `badge`: ChatGPT-style source chip with favicon + count
   */
  variant?: CitationVariant;
  /**
   * What content to display in the citation.
   * - `anchorText`: Descriptive text (e.g., "Revenue Growth")
   * - `number`: Citation number (e.g., "1", "2", "3")
   * - `indicator`: Only the status icon, no text
   * - `source`: Source name (e.g., "Wikipedia")
   *
   * Defaults based on variant:
   * - `linter` → `anchorText`
   * - `chip` → `anchorText`
   * - `brackets` → `anchorText`
   * - `text` → `anchorText`
   * - `superscript` → `number`
   * - `badge` → `source`
   */
  content?: CitationContent;
  /**
   * @deprecated The interactionMode prop has been removed. The component now always uses
   * lazy mode behavior: click toggles popover, second click toggles search details.
   * This prop is ignored for backwards compatibility.
   */
  interactionMode?: CitationInteractionMode;
  /** Event handlers for citation interactions */
  eventHandlers?: CitationEventHandlers;
  /**
   * Configuration for customizing default click/hover behaviors.
   * Providing onClick REPLACES the default click behavior.
   */
  behaviorConfig?: CitationBehaviorConfig;
  /** Enable mobile touch handlers */
  isMobile?: boolean;
  /** Custom render function for the status indicator */
  renderIndicator?: (status: CitationStatus) => React.ReactNode;
  /** Custom render function for entire citation content */
  renderContent?: (props: CitationRenderProps) => React.ReactNode;
  /** Position of popover. Use "hidden" to disable. */
  popoverPosition?: "top" | "bottom" | "hidden";
  /** Custom render function for popover content */
  renderPopoverContent?: (props: {
    citation: BaseCitationProps["citation"];
    verification: Verification | null;
    status: CitationStatus;
  }) => React.ReactNode;
  /**
   * Number of additional citations grouped with this one (for source variant).
   * Shows as "+N" suffix (e.g., "Wikipedia +2")
   */
  additionalCount?: number;
  /**
   * Favicon URL to display (for source variant).
   * Falls back to citation.faviconUrl if not provided.
   */
  faviconUrl?: string;
  /**
   * Whether to show the status indicator (checkmark, warning, spinner).
   * Defaults to true. Set to false to hide the indicator.
   */
  showIndicator?: boolean;
  /**
   * Visual style for status indicators.
   * - `"icon"`: Checkmarks, spinner, X icons (default)
   * - `"dot"`: Subtle colored dots (like GitHub status dots / shadcn badge dots)
   * @default "icon"
   */
  indicatorVariant?: IndicatorVariant;
  /**
   * Callback for citation lifecycle timing events (telemetry).
   * Emits events: citation_seen, evidence_ready, popover_opened, popover_closed, citation_reviewed.
   * Side-effect only — never replaces default behavior.
   */
  onTimingEvent?: (event: import("../types/timing.js").CitationTimingEvent) => void;
}

// getStatusLabel, getTrustLevel, isLowTrustMatch, getStatusFromVerification
// imported from ./citationStatus.js (canonical location)

// Indicator components, SpinnerStage, CitationStatusIndicator
// imported from ./CitationStatusIndicator.js (canonical location)

// FooterHint, EvidenceTray components — imported from ./EvidenceTray.js
// CitationContentDisplay — imported from ./CitationContentDisplay.js

// ExpandedImageSource, normalizeScreenshotSrc, resolveExpandedImage,
// AnchorTextFocusedImage, EvidenceTray, InlineExpandedImage, SearchAnalysisSummary
// — imported from ./EvidenceTray.js (canonical location)

// DefaultPopoverContent, PopoverViewState — imported from ./DefaultPopoverContent.js (canonical location)

// =============================================================================
// SPINNER STAGE HOOK
// =============================================================================

/** Manages the 3-stage spinner progression: active (0–5s) → slow (5–15s) → stale (15s+). */
function useSpinnerStage(isLoading: boolean, isPending: boolean, hasDefinitiveResult: boolean): SpinnerStage {
  const shouldAnimate = (isLoading || isPending) && !hasDefinitiveResult;
  const [stage, setStage] = useState<SpinnerStage>("active");

  useEffect(() => {
    if (!shouldAnimate) return;
    // Timeouts advance the stage; cleanup resets to "active" for the next cycle
    const t1 = setTimeout(() => setStage("slow"), SPINNER_TIMEOUT_MS);
    const t2 = setTimeout(() => setStage("stale"), SPINNER_TIMEOUT_MS * 3);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      setStage("active");
    };
  }, [shouldAnimate]);

  // When not animating, always return "active" (derived, no setState needed)
  return shouldAnimate ? stage : "active";
}

// =============================================================================
// POPOVER CONTENT RENDERER
// =============================================================================

/**
 * Renders popover content — either a custom render prop or the default.
 * Extracted as a named component so React can track it as a stable fiber type
 * for proper reconciliation (avoids remounting on every parent render).
 */
const PopoverContentRenderer = memo(function PopoverContentRenderer({
  renderPopoverContent,
  citation,
  verification,
  status,
  isLoading,
  isVisible,
  sourceLabel,
  indicatorVariant,
  viewState,
  onViewStateChange,
  expandedImageSrcOverride,
  onExpandedWidthChange,
  prevBeforeExpandedPageRef,
}: {
  renderPopoverContent?: CitationComponentProps["renderPopoverContent"];
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  status: CitationStatus;
  isLoading: boolean;
  isVisible: boolean;
  sourceLabel?: string;
  indicatorVariant: "icon" | "dot";
  viewState: PopoverViewState;
  onViewStateChange: (viewState: PopoverViewState) => void;
  expandedImageSrcOverride: string | null;
  onExpandedWidthChange: (width: number | null) => void;
  prevBeforeExpandedPageRef: React.RefObject<"summary" | "expanded-evidence">;
}) {
  if (renderPopoverContent) {
    const CustomContent = renderPopoverContent;
    return (
      <CitationErrorBoundary>
        <CustomContent citation={citation} verification={verification} status={status} />
      </CitationErrorBoundary>
    );
  }
  return (
    <CitationErrorBoundary>
      <DefaultPopoverContent
        citation={citation}
        verification={verification}
        status={status}
        isLoading={isLoading}
        isVisible={isVisible}
        sourceLabel={sourceLabel}
        indicatorVariant={indicatorVariant}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        expandedImageSrcOverride={expandedImageSrcOverride}
        onExpandedWidthChange={onExpandedWidthChange}
        prevBeforeExpandedPageRef={prevBeforeExpandedPageRef}
      />
    </CitationErrorBoundary>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * CitationComponent displays a citation with verification status.
 *
 * ## Interaction Pattern
 *
 * - **Hover**: Style effects only (no popover)
 * - **First Click**: Shows popover with verification image and details
 * - **Second Click**: Closes the popover
 * - **Click Outside / Escape**: Closes the popover
 *
 * ## Customization
 *
 * Use `behaviorConfig.onClick` to completely replace the click behavior,
 * or `eventHandlers.onClick` to add side effects (which disables defaults).
 */
export const CitationComponent = forwardRef<HTMLSpanElement, CitationComponentProps>(
  (
    {
      citation,
      children,
      className,
      fallbackDisplay,
      verification,
      isLoading = false,
      variant = "linter",
      content: contentProp,
      interactionMode: _interactionMode, // Deprecated, ignored
      eventHandlers,
      behaviorConfig,
      isMobile: isMobileProp,
      renderIndicator,
      renderContent,
      popoverPosition = "bottom",
      renderPopoverContent,
      additionalCount,
      faviconUrl,
      showIndicator = true,
      indicatorVariant = "icon",
      sourceLabel,
      onTimingEvent,
    },
    ref,
  ) => {
    // Warn about deprecated props in development (once per prop to avoid console spam)
    if (process.env.NODE_ENV !== "production") {
      if (_interactionMode !== undefined && !deprecationWarned.has("interactionMode")) {
        deprecationWarned.add("interactionMode");
        console.warn(
          "CitationComponent: interactionMode prop is deprecated and has no effect. " +
            "The component now always uses click-to-show-popover behavior.",
        );
      }
      if (eventHandlers?.onClick && behaviorConfig?.onClick && !deprecationWarned.has("eventHandlers.onClick")) {
        deprecationWarned.add("eventHandlers.onClick");
        console.warn(
          "CitationComponent: eventHandlers.onClick is ignored when behaviorConfig.onClick is provided. " +
            "Prefer behaviorConfig.onClick for customizing click behavior.",
        );
      }
    }

    // Get overlay context for blocking hover when any image overlay is open
    const { isAnyOverlayOpen } = useCitationOverlay();

    // Auto-detect touch device if isMobile prop not explicitly provided
    const isTouchDevice = useIsTouchDevice();
    const isMobile = isMobileProp ?? isTouchDevice;

    // Resolve content: explicit content prop or default for variant
    const resolvedContent: CitationContent = useMemo(() => {
      if (contentProp) return contentProp;
      return getDefaultContent(variant);
    }, [contentProp, variant]);
    const [isHovering, setIsHovering] = useState(false);
    const [popoverViewState, setPopoverViewState] = useState<PopoverViewState>("summary");
    // Custom image src from behaviorConfig.onClick returning setImageExpanded: "<url>"
    const [customExpandedSrc, setCustomExpandedSrc] = useState<string | null>(null);
    // Natural width of the expanded image (propagated from DefaultPopoverContent).
    // Used to size PopoverContent so floating-ui can position it correctly.
    const [expandedImageWidth, setExpandedImageWidth] = useState<number | null>(null);
    // Tracks which state preceded expanded-page so Escape can navigate back correctly.
    // Lifted here (from DefaultPopoverContent) so onEscapeKeyDown on <PopoverContent> can read it.
    const prevBeforeExpandedPageRef = useRef<"summary" | "expanded-evidence">("summary");

    // Lock body scroll when the popover is open (ref-counted so overlapping
    // instances don't leave the page permanently locked). See acquireScrollLock().
    useEffect(() => {
      if (!isHovering) return;
      acquireScrollLock();
      return () => releaseScrollLock();
    }, [isHovering]);

    // Dismiss the popover and reset its view state in one step.
    // Replaces the old useEffect that watched isHovering — moving the reset into
    // the event handler avoids an extra render cycle (flash).
    const closePopover = useCallback(() => {
      setIsHovering(false);
      setPopoverViewState("summary");
      setCustomExpandedSrc(null);
      setExpandedImageWidth(null);
    }, []);

    // Track if popover was already open before current interaction (for mobile/lazy mode).
    // Lifecycle:
    // 1. Set in handleTouchStart to capture isHovering state BEFORE the touch triggers any changes
    // 2. Read in handleTouchEnd/handleClick to determine if this is a "first tap" or "second tap"
    // 3. First tap (ref=false): Opens popover
    // 4. Second tap (ref=true): Closes popover
    const wasPopoverOpenBeforeTap = useRef(false);

    // Track last touch time for touch-to-click debouncing (prevents double-firing).
    // Note: This ref is per-component-instance, so debouncing is citation-specific.
    // Tapping Citation A then quickly tapping Citation B will NOT incorrectly debounce B,
    // because each CitationComponent instance has its own lastTouchTimeRef.
    const lastTouchTimeRef = useRef(0);

    // Refs kept in sync with state/context via useLayoutEffect (runs before paint)
    // so event handlers always read the latest value without callback churn.
    // useLayoutEffect (not render-body assignment) avoids React Compiler bailouts.
    const isHoveringRef = useRef(isHovering);
    const isAnyOverlayOpenRef = useRef(isAnyOverlayOpen);
    useLayoutEffect(() => {
      isHoveringRef.current = isHovering;
      isAnyOverlayOpenRef.current = isAnyOverlayOpen;
    }, [isHovering, isAnyOverlayOpen]);

    // Ref for the popover content element (for mobile click-outside dismiss detection)
    const popoverContentRef = useRef<HTMLElement | null>(null);

    // Callback ref for setting the popover content element
    const setPopoverContentRef = useCallback((element: HTMLElement | null) => {
      popoverContentRef.current = element;
    }, []);

    // Ref for the trigger element (for mobile click-outside dismiss detection)
    // We need our own ref in addition to the forwarded ref to reliably check click targets
    const triggerRef = useRef<HTMLSpanElement>(null);

    // Merge the forwarded ref with our internal triggerRef
    const setTriggerRef = useCallback(
      (element: HTMLSpanElement | null) => {
        // Set our internal ref
        triggerRef.current = element;
        // Forward to the external ref
        if (typeof ref === "function") {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }
      },
      [ref],
    );

    // For expanded-page mode, compute a sideOffset that positions the popover
    // at 1rem from the viewport top. floating-ui's shift middleware only shifts
    // on the main axis (horizontal for side="bottom"), not vertically. We use the
    // offset middleware instead by computing the exact vertical offset needed.
    // useLayoutEffect runs after the DOM is committed (safe for getBoundingClientRect)
    // and before paint, so the offset is applied before the popover is visible.
    const [expandedPageSideOffset, setExpandedPageSideOffset] = useState<number | undefined>(undefined);
    useLayoutEffect(() => {
      // Compute sideOffset so the popover lands 1rem from viewport top in expanded-page mode.
      // For side="bottom": popover.top = trigger.bottom + sideOffset → target VIEWPORT_MARGIN.
      const VIEWPORT_MARGIN = 16; // 1rem
      const triggerRect = popoverViewState === "expanded-page" ? triggerRef.current?.getBoundingClientRect() : null;
      setExpandedPageSideOffset(triggerRect ? VIEWPORT_MARGIN - triggerRect.bottom : undefined);
    }, [popoverViewState]);

    const citationKey = useMemo(() => generateCitationKey(citation), [citation]);
    const citationInstanceId = useMemo(() => generateCitationInstanceId(citationKey), [citationKey]);

    // ========== TtC Timing ==========
    const { firstSeenAtRef } = useCitationTiming(citationKey, verification, onTimingEvent);
    const popoverOpenedAtRef = useRef<number | null>(null);
    const reviewedRef = useRef(false);

    // Stable ref for onTimingEvent to avoid re-triggering effects.
    // Synced in useLayoutEffect to avoid React Compiler bailout.
    const onTimingEventRef = useRef(onTimingEvent);
    useLayoutEffect(() => {
      onTimingEventRef.current = onTimingEvent;
    }, [onTimingEvent]);

    // ========== Popover Telemetry ==========
    // Track popover open/close for TtC telemetry events
    // biome-ignore lint/correctness/useExhaustiveDependencies: firstSeenAtRef/verification are stable refs or read at call-time — only isHovering transitions should trigger this effect
    useEffect(() => {
      if (isHovering && firstSeenAtRef.current != null) {
        popoverOpenedAtRef.current = performance.now();
        onTimingEventRef.current?.({
          event: "popover_opened",
          citationKey,
          timestamp: popoverOpenedAtRef.current,
          elapsedSinceSeenMs: popoverOpenedAtRef.current - firstSeenAtRef.current,
          verificationStatus: verification?.status ?? null,
        });
      } else if (!isHovering && popoverOpenedAtRef.current != null) {
        const now = performance.now();
        const dwellMs = now - popoverOpenedAtRef.current;

        onTimingEventRef.current?.({
          event: "popover_closed",
          citationKey,
          timestamp: now,
          elapsedSinceSeenMs: firstSeenAtRef.current != null ? now - firstSeenAtRef.current : null,
          popoverDurationMs: dwellMs,
          verificationStatus: verification?.status ?? null,
        });

        // Dwell threshold: if user spent ≥2s AND hasn't already been marked reviewed
        if (dwellMs >= REVIEW_DWELL_THRESHOLD_MS && !reviewedRef.current) {
          reviewedRef.current = true;
          onTimingEventRef.current?.({
            event: "citation_reviewed",
            citationKey,
            timestamp: now,
            elapsedSinceSeenMs: firstSeenAtRef.current != null ? now - firstSeenAtRef.current : null,
            popoverDurationMs: dwellMs,
            verificationStatus: verification?.status ?? null,
            userTtcMs: firstSeenAtRef.current != null ? now - firstSeenAtRef.current : undefined,
          });
        }

        popoverOpenedAtRef.current = null;
      }
    }, [isHovering, citationKey]);

    // Derive status from verification object
    const status = useMemo(() => getStatusFromVerification(verification), [verification]);
    const { isMiss, isPartialMatch, isVerified, isPending } = status;

    // Resolve the image source, preferring the new field name with fallback to deprecated one
    const resolvedImageSrc = verification?.document?.verificationImageSrc ?? null;

    const hasDefinitiveResult =
      resolvedImageSrc ||
      verification?.status === "found" ||
      verification?.status === "found_anchor_text_only" ||
      verification?.status === "found_phrase_missed_anchor_text" ||
      verification?.status === "not_found" ||
      verification?.status === "partial_text_found" ||
      verification?.status === "found_on_other_page" ||
      verification?.status === "found_on_other_line" ||
      verification?.status === "first_word_found";

    // 3-stage spinner: active (0–5s) → slow (5–15s) → stale (15s+)
    const spinnerStage = useSpinnerStage(isLoading, isPending, !!hasDefinitiveResult);
    const shouldShowSpinner = (isLoading || isPending) && !hasDefinitiveResult && spinnerStage !== "stale";

    const displayText = useMemo(() => {
      return getDisplayText(citation, resolvedContent, fallbackDisplay);
    }, [citation, resolvedContent, fallbackDisplay]);

    // Behavior context for custom handlers
    const getBehaviorContext = useCallback(
      (): CitationBehaviorContext => ({
        citation,
        citationKey,
        verification: verification ?? null,
        isTooltipExpanded: isHovering,
        isImageExpanded: popoverViewState !== "summary",
        hasImage: !!resolvedImageSrc,
      }),
      [citation, citationKey, verification, isHovering, popoverViewState, resolvedImageSrc],
    );

    // Apply behavior actions from custom handler
    const applyBehaviorActions = useCallback(
      (actions: CitationBehaviorActions) => {
        if (actions.setImageExpanded !== undefined) {
          if (actions.setImageExpanded === false) {
            // Close: collapse to summary and dismiss the popover
            closePopover();
          } else if (actions.setImageExpanded) {
            // Open: show popover in expanded (full page) view
            setIsHovering(true);
            setPopoverViewState("expanded-page");
            // If a custom image URL was provided, validate before storing
            if (typeof actions.setImageExpanded === "string" && isValidProofImageSrc(actions.setImageExpanded)) {
              setCustomExpandedSrc(actions.setImageExpanded);
            }
          }
        }
      },
      [closePopover],
    );

    // Shared tap/click action handler - used by both click and touch handlers.
    // Extracts the common logic to avoid duplication.
    //
    // Action types:
    // - "showPopover": Show the popover (first tap/click when popover is closed)
    // - "hidePopover": Hide the popover (for lazy mode toggle behavior)
    // - "expandImage": Transition popover to expanded view
    //
    // Dependency chain explanation:
    // - getBehaviorContext: Captures current state (citation, verification, isHovering, popoverViewState)
    //   and is itself a useCallback that updates when those values change
    // - applyBehaviorActions: Handles setImageExpanded by updating popoverViewState
    // - behaviorConfig/eventHandlers: User-provided callbacks that may change
    // - citation/citationKey: Core data passed to callbacks
    // - State setters (setIsHovering, etc.): Stable references included for exhaustive-deps
    const handleTapAction = useCallback(
      (
        e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
        action: "showPopover" | "hidePopover" | "expandImage",
      ): void => {
        const context = getBehaviorContext();

        // Custom onClick via behaviorConfig replaces default
        if (behaviorConfig?.onClick) {
          const result = behaviorConfig.onClick(context, e);
          if (result && typeof result === "object") {
            applyBehaviorActions(result);
          }
          eventHandlers?.onClick?.(citation, citationKey, e);
          return;
        }

        // Custom eventHandlers.onClick disables default
        if (eventHandlers?.onClick) {
          eventHandlers.onClick(citation, citationKey, e);
          return;
        }

        // Execute the requested action
        switch (action) {
          case "showPopover":
            setIsHovering(true);
            break;
          case "hidePopover":
            closePopover();
            break;
          case "expandImage":
            setPopoverViewState("expanded-page");
            break;
        }
      },
      [behaviorConfig, eventHandlers, citation, citationKey, getBehaviorContext, applyBehaviorActions, closePopover],
    );

    // Click handler
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();

        // Ignore click events that occur shortly after touch events (prevents double-firing)
        if (isMobile && Date.now() - lastTouchTimeRef.current < TOUCH_CLICK_DEBOUNCE_MS) {
          return;
        }

        // On mobile: first tap shows popover, second tap closes it
        // wasPopoverOpenBeforeTap is set in handleTouchStart before the click fires
        if (isMobile) {
          if (!wasPopoverOpenBeforeTap.current) {
            handleTapAction(e, "showPopover");
          } else {
            handleTapAction(e, "hidePopover");
          }
          return;
        }

        // Click toggles popover visibility
        if (!isHovering) {
          handleTapAction(e, "showPopover");
        } else {
          handleTapAction(e, "hidePopover");
        }
      },
      [isMobile, isHovering, handleTapAction],
    );

    // Keyboard handler for accessibility - Enter/Space triggers tap action
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();

          // Toggle popover visibility
          if (!isHovering) {
            handleTapAction(e, "showPopover");
          } else {
            handleTapAction(e, "hidePopover");
          }
        }
      },
      [isHovering, handleTapAction],
    );

    const handleMouseEnter = useCallback(() => {
      // Don't trigger hover popover if any image overlay is expanded
      if (isAnyOverlayOpen) return;
      // Don't show popover on hover - only on click (lazy mode behavior)
      if (behaviorConfig?.onHover?.onEnter) {
        behaviorConfig.onHover.onEnter(getBehaviorContext());
      }
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, behaviorConfig, citation, citationKey, getBehaviorContext, isAnyOverlayOpen]);

    const handleMouseLeave = useCallback(() => {
      // Popover is click-to-open, so it should only close on click (not on hover-away).
      // Fire external callbacks for consumers tracking hover state, but do not close the popover.
      if (behaviorConfig?.onHover?.onLeave) {
        behaviorConfig.onHover.onLeave(getBehaviorContext());
      }
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, behaviorConfig, citation, citationKey, getBehaviorContext]);

    // Escape key handling is managed by Radix Popover via onOpenChange and onEscapeKeyDown props

    // Mobile click-outside dismiss handler
    //
    // On mobile, tapping outside the citation trigger or popover should dismiss the popover.
    // Desktop uses a document-level mousedown listener (below) for click-outside dismiss.
    //
    // Why custom handling instead of Radix's built-in click-outside behavior:
    // The PopoverContent has onPointerDownOutside and onInteractOutside handlers that call
    // e.preventDefault() to give us full control over popover state. This is necessary for
    // the two-tap mobile interaction pattern (first tap shows popover, second tap opens image).
    // However, it means we need custom touch handling to dismiss the popover on outside taps.
    //
    // Event order when tapping the trigger while popover is open:
    // 1. handleOutsideTouch (capture phase, document) - checks .contains(), returns early
    // 2. handleTouchStart (bubble phase, trigger) - reads isHoveringRef.current
    // 3. handleTouchEnd/handleClick - determines first vs second tap action
    // The .contains() check in step 1 ensures we don't dismiss when tapping the trigger,
    // allowing the normal two-tap flow to proceed.
    //
    // Portal note: popoverContentRef works with portaled content because Radix renders
    // the popover content as a child of document.body, but we hold a direct ref to that
    // DOM element, so .contains() correctly detects touches inside it.
    //
    // Cleanup: The listener only attaches when isMobile AND isHovering are both true.
    // It's automatically removed when either condition becomes false or on unmount.
    // This minimizes document-level listener churn since popovers open/close frequently.
    useEffect(() => {
      if (!isMobile || !isHovering) return;

      const handleOutsideTouch = (e: TouchEvent) => {
        // Don't dismiss popover while an image overlay is open - user expects to return
        // to the popover after closing the zoomed image. Uses ref to avoid stale closure.
        if (isAnyOverlayOpenRef.current) {
          return;
        }

        // Type guard for touch event target
        const target = e.target;
        if (!(target instanceof Node)) {
          return;
        }

        // Check if touch is inside the trigger element
        if (triggerRef.current?.contains(target)) {
          return;
        }

        // Check if touch is inside the popover content (works with portaled content)
        if (popoverContentRef.current?.contains(target)) {
          return;
        }

        // Touch is outside both - dismiss the popover
        closePopover();
      };

      // Use touchstart with capture phase to detect touches before they're handled
      // by other handlers (like handleTouchStart on the citation trigger itself).
      // passive: true — handler never calls preventDefault(), so allow scroll immediately.
      document.addEventListener("touchstart", handleOutsideTouch, {
        capture: true,
        passive: true,
      });

      return () => {
        document.removeEventListener("touchstart", handleOutsideTouch, {
          capture: true,
        });
      };
    }, [isMobile, isHovering, closePopover]);

    // Desktop click-outside dismiss handler
    //
    // On desktop, clicking outside the citation trigger or popover should dismiss the popover.
    // This is separate from the mouse-leave handler because clicks should always be
    // respected immediately, even during hover close delays.
    //
    // Why separate from mobile handler:
    // - Desktop uses mousedown (not touchstart) for better UX consistency with other web apps
    // - Mobile has its own touch handler above with different timing characteristics
    //
    // Note: We still check isAnyOverlayOpenRef to keep the popover open when image overlay is shown.
    useEffect(() => {
      if (isMobile || !isHovering) return;

      const handleOutsideClick = (e: MouseEvent) => {
        // Don't dismiss popover while an image overlay is open - user expects to return
        // to the popover after closing the zoomed image. Uses ref to avoid stale closure.
        if (isAnyOverlayOpenRef.current) {
          return;
        }

        // Type guard for mouse event target
        const target = e.target;
        if (!(target instanceof Node)) {
          return;
        }

        // Check if click is inside the trigger element
        if (triggerRef.current?.contains(target)) {
          return;
        }

        // Check if click is inside the popover content (works with portaled content)
        if (popoverContentRef.current?.contains(target)) {
          return;
        }

        // Click is outside both - dismiss the popover
        closePopover();
      };

      // Use mousedown with capture phase to detect clicks before they bubble
      document.addEventListener("mousedown", handleOutsideClick, {
        capture: true,
      });

      return () => {
        document.removeEventListener("mousedown", handleOutsideClick, {
          capture: true,
        });
      };
    }, [isMobile, isHovering, closePopover]);

    // Touch start handler for mobile - captures popover state before touch ends.
    // Reads isHoveringRef.current (which is kept in sync with isHovering state above)
    // to avoid stale closure issues without recreating the callback on every hover change.
    const handleTouchStart = useCallback(
      (e: React.TouchEvent<HTMLSpanElement>) => {
        if (isMobile) {
          // Capture whether popover was already open before this tap.
          // This determines first vs second tap behavior in handleTouchEnd.
          wasPopoverOpenBeforeTap.current = isHoveringRef.current;

          // Call user-provided touch start handler (for analytics, etc.)
          eventHandlers?.onTouchStart?.(citation, citationKey, e);
        }
      },
      [isMobile, eventHandlers, citation, citationKey],
    );

    // Touch handler for mobile - handles tap-to-show-popover and tap-to-close.
    // On second tap, closes the popover.
    const handleTouchEnd = useCallback(
      (e: React.TouchEvent<HTMLSpanElement>) => {
        if (isMobile) {
          e.preventDefault();
          e.stopPropagation();

          // Record touch time for click debouncing
          lastTouchTimeRef.current = Date.now();

          eventHandlers?.onTouchEnd?.(citation, citationKey, e);

          // Determine if this is the first tap (popover was closed) or second tap (popover was open)
          if (!wasPopoverOpenBeforeTap.current) {
            handleTapAction(e, "showPopover");
          } else {
            handleTapAction(e, "hidePopover");
          }
        }
      },
      [isMobile, eventHandlers, citation, citationKey, handleTapAction],
    );

    // Inline variants (text, linter) inherit text color from their parent element.
    // This allows citations to blend seamlessly into styled text (e.g., colored headers).
    // Self-contained variants (chip, badge, brackets) set their own text color.
    // Superscript is excluded: its anchor text inherits naturally, and its <sup> element
    // is a distinct UI element (footnote reference) that keeps its own styling.
    const isInlineVariant = variant === "text" || variant === "linter";

    // Early return for miss with fallback display (only when showing anchorText)
    // Inline variants inherit color (dimmed via opacity), others use explicit gray.
    if (fallbackDisplay !== null && fallbackDisplay !== undefined && resolvedContent === "anchorText" && isMiss) {
      const fallbackClasses = isInlineVariant ? "opacity-50" : "text-gray-400 dark:text-gray-500";
      return <span className={cn(fallbackClasses, className)}>{fallbackDisplay}</span>;
    }

    const statusClasses = cn(
      // Found status (text color) - verified or partial match, for brackets variant
      (isVerified || isPartialMatch) &&
        variant === "brackets" &&
        "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline",
      // Miss state: opacity dims the inherited/explicit color
      isMiss && "opacity-70",
      // Explicit gray only for non-inline variants (inline variants inherit from parent)
      isMiss && !isInlineVariant && "text-gray-700 dark:text-gray-200",
      // Pending/spinner: muted color for non-inline variants only.
      // Inline variants inherit color; the spinner icon signals loading.
      // (Linter handles pending color in its own inline styles.)
      shouldShowSpinner && !isInlineVariant && "text-gray-500 dark:text-gray-400",
    );

    // Build props for the extracted CitationStatusIndicator component
    const indicatorProps: CitationStatusIndicatorProps = {
      renderIndicator,
      status,
      showIndicator,
      indicatorVariant,
      shouldShowSpinner,
      isVerified,
      isPartialMatch,
      isMiss,
      spinnerStage,
    };

    // Build the citation content element using the extracted module-level components
    const citationContentNode = (
      <CitationContentDisplay
        renderContent={renderContent}
        citation={citation}
        status={status}
        citationKey={citationKey}
        displayText={displayText}
        resolvedContent={resolvedContent}
        variant={variant}
        statusClasses={statusClasses}
        isVerified={isVerified}
        isPartialMatch={isPartialMatch}
        isMiss={isMiss}
        shouldShowSpinner={shouldShowSpinner}
        showIndicator={showIndicator}
        faviconUrl={faviconUrl}
        additionalCount={additionalCount}
        indicatorProps={indicatorProps}
      />
    );

    // Popover visibility
    const isPopoverHidden = popoverPosition === "hidden";
    // Show popover for:
    // 1. Verification with image or snippet (verified cases)
    // 2. Loading/pending states (informative searching message)
    // 3. Miss states (show what was searched)
    const shouldShowPopover =
      !isPopoverHidden &&
      // Has verification with image or snippet
      ((verification && (resolvedImageSrc || verification.verifiedMatchSnippet)) ||
        // Loading/pending state
        shouldShowSpinner ||
        isPending ||
        isLoading ||
        // Miss state (show what was searched)
        isMiss);

    // Shared trigger element props
    // All variants use status-aware hover colors (green/amber/red/gray)
    // Cursor is always pointer since click toggles popover/details
    const cursorClass = "cursor-pointer";

    // Generate unique IDs for ARIA attributes
    const popoverId = `citation-popover-${citationInstanceId}`;
    const statusDescId = `citation-status-${citationInstanceId}`;
    const statusDescription = shouldShowSpinner ? "Verifying..." : getStatusLabel(status);

    // Variants with their own hover styles don't need parent hover (would extend beyond bounds)
    const variantHasOwnHover = VARIANTS_WITH_OWN_HOVER.has(variant);

    const triggerProps = {
      "data-citation-id": citationKey,
      "data-citation-instance": citationInstanceId,
      className: cn(
        "relative inline-flex items-baseline",
        "px-0.5 -mx-0.5 rounded-sm",
        "transition-all duration-[50ms]",
        cursorClass,
        // Improved touch target size on mobile (minimum 44px recommended)
        // Using py-1.5 for better touch accessibility without breaking layout
        isMobile && "py-1.5 touch-manipulation",
        // Status-aware hover for variants that don't handle their own hover styling (10% opacity)
        ...(variantHasOwnHover ? [] : getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner, 10)),
        // Focus styles for keyboard accessibility
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
        className,
      ),
      // ARIA attributes for accessibility
      role: "button" as const,
      tabIndex: 0,
      "aria-expanded": isHovering,
      "aria-controls": shouldShowPopover ? popoverId : undefined,
      "aria-label": displayText ? `Citation: ${displayText}` : "Citation",
      "aria-describedby": statusDescription ? statusDescId : undefined,
      // Event handlers
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      onTouchStart: isMobile ? handleTouchStart : undefined,
      onTouchEndCapture: isMobile ? handleTouchEnd : undefined,
    };

    // Render with Radix Popover
    if (shouldShowPopover) {
      const popoverContentElement = (
        <PopoverContentRenderer
          renderPopoverContent={renderPopoverContent}
          citation={citation}
          verification={verification ?? null}
          status={status}
          isLoading={isLoading || shouldShowSpinner}
          isVisible={isHovering}
          sourceLabel={sourceLabel}
          indicatorVariant={indicatorVariant}
          viewState={popoverViewState}
          onViewStateChange={setPopoverViewState}
          expandedImageSrcOverride={customExpandedSrc}
          onExpandedWidthChange={setExpandedImageWidth}
          prevBeforeExpandedPageRef={prevBeforeExpandedPageRef}
        />
      );

      // Image prefetching is handled imperatively inside DefaultPopoverContent
      // via `new Image().src` (see DefaultPopoverContent.tsx).
      //
      // Previous approaches that caused React 19 crashes:
      // 1. Rendering a hidden DefaultPopoverContent (prefetchElement) alongside
      //    the visible one — simultaneous unmount + mount corrupted the fiber
      //    effect linked list ("Cannot read properties of undefined ('destroy')").
      // 2. Wrapping portal content in DeferredMount (two-phase mount via
      //    useLayoutEffect) — the deferred fiber creation during portal mount
      //    caused hook-order violations when React tried to reconcile the
      //    portal's fiber tree across renders.

      return (
        <>
          {children}
          {/* Visually hidden live region for screen reader status announcements */}
          {statusDescription && (
            <span id={statusDescId} className="sr-only" aria-live="polite">
              {statusDescription}
            </span>
          )}
          <Popover
            open={isHovering}
            onOpenChange={open => {
              // Only handle close (Escape key) - don't interfere with our custom hover logic
              if (!open && !isAnyOverlayOpenRef.current) {
                closePopover();
              }
            }}
          >
            <PopoverTrigger asChild>
              <span ref={setTriggerRef} {...triggerProps}>
                {citationContentNode}
              </span>
            </PopoverTrigger>
            <PopoverContent
              ref={setPopoverContentRef}
              id={popoverId}
              side={
                popoverViewState === "expanded-page"
                  ? "bottom" // Always bottom for expanded — sideOffset positions it
                  : popoverPosition === "bottom"
                    ? "bottom"
                    : "top"
              }
              sideOffset={expandedPageSideOffset}
              onPointerDownOutside={(e: Event) => e.preventDefault()}
              onInteractOutside={(e: Event) => e.preventDefault()}
              onEscapeKeyDown={e => {
                // Only intercept Escape for expanded-page (full-screen) back-navigation.
                // summary and expanded-evidence let Radix close the popover directly.
                if (popoverViewState !== "expanded-page") return;
                e.preventDefault();
                const prev = prevBeforeExpandedPageRef.current;
                setPopoverViewState(prev);
                if (prev === "summary") setCustomExpandedSrc(null);
              }}
              style={
                popoverViewState === "expanded-page"
                  ? {
                      maxWidth: "calc(100dvw - 2rem)",
                      width:
                        expandedImageWidth !== null
                          ? `max(${POPOVER_WIDTH}, min(${expandedImageWidth + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem)))`
                          : "calc(100dvw - 2rem)",
                      // Explicit height gives the flex chain a definite reference size
                      // so flex-1 min-h-0 children can grow into available space.
                      // The shift middleware repositions the popover within viewport bounds.
                      height: "calc(100dvh - 2rem)",
                      maxHeight: "calc(100dvh - 2rem)",
                      // The inner InlineExpandedImage handles its own scrolling (with hidden
                      // scrollbars). Override PopoverContent's default overflow-y-auto to
                      // prevent a redundant outer scrollbar from appearing.
                      overflowY: "hidden" as const,
                    }
                  : popoverViewState === "expanded-evidence"
                    ? {
                        maxWidth: "calc(100dvw - 2rem)",
                        width:
                          expandedImageWidth !== null
                            ? `max(${POPOVER_WIDTH}, min(${expandedImageWidth + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem)))`
                            : "calc(100dvw - 2rem)",
                      }
                    : undefined
              }
              onClick={(e: React.MouseEvent) => {
                // Clicking directly on the popover backdrop (not on inner content) dismisses it.
                // e.target === e.currentTarget means the click hit the dialog's own element,
                // not a child element — so this only fires when clicking the outer wrapper area.
                if (e.target === e.currentTarget) closePopover();
              }}
            >
              {popoverContentElement}
            </PopoverContent>
          </Popover>
        </>
      );
    }

    // Render without popover
    return (
      <>
        {children}
        {/* Visually hidden live region for screen reader status announcements */}
        {statusDescription && (
          <span id={statusDescId} className="sr-only" aria-live="polite">
            {statusDescription}
          </span>
        )}
        <span ref={setTriggerRef} {...triggerProps}>
          {citationContentNode}
        </span>
      </>
    );
  },
);

CitationComponent.displayName = "CitationComponent";

export const MemoizedCitationComponent = memo(CitationComponent);
