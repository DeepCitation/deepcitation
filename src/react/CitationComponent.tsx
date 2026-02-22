import type React from "react";
import { forwardRef, memo, useCallback, useMemo, useRef, useState } from "react";
import type { CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { CitationContentDisplay } from "./CitationContentDisplay.js";
import {
  getDefaultContent,
  getDisplayText,
  getStatusHoverClasses,
  VARIANTS_WITH_OWN_HOVER,
} from "./CitationContentDisplay.utils.js";
import { CitationErrorBoundary } from "./CitationErrorBoundary.js";
import { useCitationOverlay } from "./CitationOverlayContext.js";
import type { CitationStatusIndicatorProps } from "./CitationStatusIndicator.js";
import { getStatusFromVerification, getStatusLabel } from "./citationStatus.js";
import { EXPANDED_IMAGE_SHELL_PX, isValidProofImageSrc, POPOVER_WIDTH, TOUCH_CLICK_DEBOUNCE_MS } from "./constants.js";
import { DefaultPopoverContent, type PopoverViewState } from "./DefaultPopoverContent.js";
import { useCitationTelemetry } from "./hooks/useCitationTelemetry.js";
import { useIsTouchDevice } from "./hooks/useIsTouchDevice.js";
import { usePopoverDismiss } from "./hooks/usePopoverDismiss.js";
import { usePopoverPosition } from "./hooks/usePopoverPosition.js";
import { useScrollLock } from "./hooks/useScrollLock.js";
import { PopoverContent } from "./Popover.js";
import { Popover, PopoverTrigger } from "./PopoverPrimitives.js";
import { useCitationTiming } from "./timingUtils.js";
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

    // ========== Extracted Hooks ==========

    // Lock body scroll when the popover is open (ref-counted)
    useScrollLock(isHovering);

    // Dismiss the popover and reset its view state in one step.
    const closePopover = useCallback(() => {
      setIsHovering(false);
      setPopoverViewState("summary");
      setCustomExpandedSrc(null);
      setExpandedImageWidth(null);
    }, []);

    // Ref for the popover content element (for click-outside dismiss detection)
    const popoverContentRef = useRef<HTMLElement | null>(null);
    const setPopoverContentRef = useCallback((element: HTMLElement | null) => {
      popoverContentRef.current = element;
    }, []);

    // Ref for the trigger element (for click-outside dismiss detection)
    const triggerRef = useRef<HTMLSpanElement>(null);
    const setTriggerRef = useCallback(
      (element: HTMLSpanElement | null) => {
        triggerRef.current = element;
        if (typeof ref === "function") {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }
      },
      [ref],
    );

    // Popover positioning for expanded-page mode
    const { sideOffset: expandedPageSideOffset } = usePopoverPosition({
      viewState: popoverViewState,
      triggerRef,
    });

    // Click/touch outside dismiss
    usePopoverDismiss({
      isOpen: isHovering,
      triggerRef,
      contentRef: popoverContentRef,
      onDismiss: closePopover,
      isMobile,
      isAnyOverlayOpen,
    });

    const citationKey = useMemo(() => generateCitationKey(citation), [citation]);
    const citationInstanceId = useMemo(() => generateCitationInstanceId(citationKey), [citationKey]);

    // Derive status from verification object
    const status = useMemo(() => getStatusFromVerification(verification), [verification]);
    const { isMiss, isPartialMatch, isVerified, isPending } = status;

    // Resolve the image source
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

    // TtC Timing
    const { firstSeenAtRef } = useCitationTiming(citationKey, verification, onTimingEvent);

    // Popover telemetry + spinner staging (extracted hook)
    const { spinnerStage, shouldShowSpinner } = useCitationTelemetry({
      isHovering,
      citationKey,
      verificationStatus: verification?.status,
      isLoading,
      isPending,
      hasDefinitiveResult: !!hasDefinitiveResult,
      firstSeenAtRef,
      onTimingEvent,
    });

    // ========== Touch/Click Handling ==========

    // Track if popover was already open before current interaction (for mobile two-tap pattern)
    const wasPopoverOpenBeforeTap = useRef(false);
    const lastTouchTimeRef = useRef(0);

    // Ref to track isHovering for touch handlers (avoids stale closure issues)
    const isHoveringRef = useRef(isHovering);
    isHoveringRef.current = isHovering;

    // Ref to track isAnyOverlayOpen for Radix onOpenChange
    const isAnyOverlayOpenRef = useRef(isAnyOverlayOpen);
    isAnyOverlayOpenRef.current = isAnyOverlayOpen;

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
            closePopover();
          } else if (actions.setImageExpanded) {
            setIsHovering(true);
            setPopoverViewState("expanded-page");
            if (typeof actions.setImageExpanded === "string" && isValidProofImageSrc(actions.setImageExpanded)) {
              setCustomExpandedSrc(actions.setImageExpanded);
            }
          }
        }
      },
      [closePopover],
    );

    // Shared tap/click action handler
    const handleTapAction = useCallback(
      (
        e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
        action: "showPopover" | "hidePopover" | "expandImage",
      ): void => {
        const context = getBehaviorContext();

        if (behaviorConfig?.onClick) {
          const result = behaviorConfig.onClick(context, e);
          if (result && typeof result === "object") {
            applyBehaviorActions(result);
          }
          eventHandlers?.onClick?.(citation, citationKey, e);
          return;
        }

        if (eventHandlers?.onClick) {
          eventHandlers.onClick(citation, citationKey, e);
          return;
        }

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

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();

        if (isMobile && Date.now() - lastTouchTimeRef.current < TOUCH_CLICK_DEBOUNCE_MS) {
          return;
        }

        if (isMobile) {
          if (!wasPopoverOpenBeforeTap.current) {
            handleTapAction(e, "showPopover");
          } else {
            handleTapAction(e, "hidePopover");
          }
          return;
        }

        if (!isHovering) {
          handleTapAction(e, "showPopover");
        } else {
          handleTapAction(e, "hidePopover");
        }
      },
      [isMobile, isHovering, handleTapAction],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();

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
      if (isAnyOverlayOpen) return;
      if (behaviorConfig?.onHover?.onEnter) {
        behaviorConfig.onHover.onEnter(getBehaviorContext());
      }
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, behaviorConfig, citation, citationKey, getBehaviorContext, isAnyOverlayOpen]);

    const handleMouseLeave = useCallback(() => {
      if (behaviorConfig?.onHover?.onLeave) {
        behaviorConfig.onHover.onLeave(getBehaviorContext());
      }
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, behaviorConfig, citation, citationKey, getBehaviorContext]);

    const handleTouchStart = useCallback(
      (e: React.TouchEvent<HTMLSpanElement>) => {
        if (isMobile) {
          wasPopoverOpenBeforeTap.current = isHoveringRef.current;
          eventHandlers?.onTouchStart?.(citation, citationKey, e);
        }
      },
      [isMobile, eventHandlers, citation, citationKey],
    );

    const handleTouchEnd = useCallback(
      (e: React.TouchEvent<HTMLSpanElement>) => {
        if (isMobile) {
          e.preventDefault();
          e.stopPropagation();
          lastTouchTimeRef.current = Date.now();
          eventHandlers?.onTouchEnd?.(citation, citationKey, e);

          if (!wasPopoverOpenBeforeTap.current) {
            handleTapAction(e, "showPopover");
          } else {
            handleTapAction(e, "hidePopover");
          }
        }
      },
      [isMobile, eventHandlers, citation, citationKey, handleTapAction],
    );

    // ========== Rendering ==========

    const isInlineVariant = variant === "text" || variant === "linter";

    // Early return for miss with fallback display
    if (fallbackDisplay !== null && fallbackDisplay !== undefined && resolvedContent === "anchorText" && isMiss) {
      const fallbackClasses = isInlineVariant ? "opacity-50" : "text-gray-400 dark:text-gray-500";
      return <span className={cn(fallbackClasses, className)}>{fallbackDisplay}</span>;
    }

    const statusClasses = cn(
      (isVerified || isPartialMatch) &&
        variant === "brackets" &&
        "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline",
      isMiss && "opacity-70",
      isMiss && !isInlineVariant && "text-gray-700 dark:text-gray-200",
      shouldShowSpinner && !isInlineVariant && "text-gray-500 dark:text-gray-400",
    );

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

    const isPopoverHidden = popoverPosition === "hidden";
    const shouldShowPopover =
      !isPopoverHidden &&
      ((verification && (resolvedImageSrc || verification.verifiedMatchSnippet)) ||
        shouldShowSpinner ||
        isPending ||
        isLoading ||
        isMiss);

    const hasImage = !!resolvedImageSrc;

    const popoverId = `citation-popover-${citationInstanceId}`;
    const statusDescId = `citation-status-${citationInstanceId}`;
    const statusDescription = shouldShowSpinner ? "Verifying..." : getStatusLabel(status);

    const variantHasOwnHover = VARIANTS_WITH_OWN_HOVER.has(variant);

    const triggerProps = {
      "data-citation-id": citationKey,
      "data-citation-instance": citationInstanceId,
      className: cn(
        "relative inline-flex items-baseline",
        "px-0.5 -mx-0.5 rounded-sm",
        "transition-all duration-[50ms]",
        "cursor-pointer",
        isMobile && "py-1.5 touch-manipulation",
        ...(variantHasOwnHover ? [] : getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner, 10)),
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
        className,
      ),
      role: "button" as const,
      tabIndex: 0,
      "aria-expanded": isHovering,
      "aria-controls": shouldShowPopover ? popoverId : undefined,
      "aria-label": displayText ? `Citation: ${displayText}` : "Citation",
      "aria-describedby": statusDescription ? statusDescId : undefined,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      onTouchStart: isMobile ? handleTouchStart : undefined,
      onTouchEndCapture: isMobile ? handleTouchEnd : undefined,
    };

    // Render with Radix Popover
    if (shouldShowPopover) {
      const popoverContentElement = renderPopoverContent ? (
        <CitationErrorBoundary>
          {renderPopoverContent({
            citation,
            verification: verification ?? null,
            status,
          })}
        </CitationErrorBoundary>
      ) : (
        <CitationErrorBoundary>
          <DefaultPopoverContent
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
        </CitationErrorBoundary>
      );

      const prefetchElement =
        hasImage && !isHovering && !renderPopoverContent ? (
          <CitationErrorBoundary>
            <DefaultPopoverContent
              citation={citation}
              verification={verification ?? null}
              status={status}
              isLoading={false}
              isVisible={false}
              sourceLabel={sourceLabel}
              indicatorVariant={indicatorVariant}
            />
          </CitationErrorBoundary>
        ) : null;

      return (
        <>
          {children}
          {statusDescription && (
            <span id={statusDescId} className="sr-only" aria-live="polite">
              {statusDescription}
            </span>
          )}
          {prefetchElement}
          <Popover
            open={isHovering}
            onOpenChange={open => {
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
              side={popoverViewState === "expanded-page" ? "bottom" : popoverPosition === "bottom" ? "bottom" : "top"}
              sideOffset={expandedPageSideOffset}
              onPointerDownOutside={(e: Event) => e.preventDefault()}
              onInteractOutside={(e: Event) => e.preventDefault()}
              onEscapeKeyDown={e => {
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
                      height: "calc(100dvh - 2rem)",
                      maxHeight: "calc(100dvh - 2rem)",
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
