import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { type CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { CheckIcon, WarningIcon } from "./icons.js";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover.js";
import type {
  BaseCitationProps,
  CitationBehaviorActions,
  CitationBehaviorConfig,
  CitationBehaviorContext,
  CitationEventHandlers,
  CitationRenderProps,
  CitationVariant,
} from "./types.js";
import {
  generateCitationInstanceId,
  generateCitationKey,
  getCitationDisplayText,
} from "./utils.js";
import { useSmartDiff } from "./useSmartDiff.js";

// Re-export CitationVariant for convenience
export type { CitationVariant } from "./types.js";

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
   * Display variant for the citation.
   * - `brackets`: [keySpan✓] with styling (default)
   * - `text`: keySpan✓ inherits parent styling
   * - `minimal`: text with indicator, no brackets
   * - `indicator`: only the status indicator
   */
  variant?: CitationVariant;
  /** Hide square brackets (only for brackets variant) */
  hideBrackets?: boolean;
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
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

function getStatusLabel(status: CitationStatus): string {
  if (status.isVerified && !status.isPartialMatch) return "Verified";
  if (status.isPartialMatch) return "Partial Match";
  if (status.isMiss) return "Not Found";
  if (status.isPending) return "Verifying...";
  return "";
}

/**
 * Derive citation status from a Verification object.
 * The status comes from verification.status.
 */
function getStatusFromVerification(verification: Verification | null | undefined): CitationStatus {
  const status = verification?.status;

  // No verification or no status = pending
  if (!verification || !status) {
    return { isVerified: false, isMiss: false, isPartialMatch: false, isPending: true };
  }

  const isMiss = status === "not_found";
  const isPending = status === "pending" || status === "loading";

  const isPartialMatch =
    status === "partial_text_found" ||
    status === "found_on_other_page" ||
    status === "found_on_other_line" ||
    status === "first_word_found";

  const isVerified =
    status === "found" ||
    status === "found_key_span_only" ||
    status === "found_phrase_missed_value" ||
    isPartialMatch;

  return { isVerified, isMiss, isPartialMatch, isPending };
}

// =============================================================================
// IMAGE OVERLAY COMPONENT
// =============================================================================

interface ImageOverlayProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * Full-screen image overlay for zoomed verification images.
 * Click anywhere or press Escape to close.
 */
function ImageOverlay({ src, alt, onClose }: ImageOverlayProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in-0"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Full size verification image"
    >
      <div className="relative max-w-[95vw] max-h-[95vh] cursor-zoom-out">
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[95vh] object-contain rounded-lg shadow-2xl"
          draggable={false}
        />
      </div>
    </div>,
    document.body
  );
}

// =============================================================================
// INDICATOR COMPONENTS
// =============================================================================
//
// Status indicators show the verification state visually:
//
// | Status        | Indicator          | Color  | searchState.status values                    |
// |---------------|--------------------| -------|----------------------------------------------|
// | Pending       | Spinner            | Gray   | "pending", "loading", null/undefined         |
// | Verified      | Checkmark (✓)      | Green  | "found", "found_key_span_only", etc.         |
// | Partial Match | Checkmark (✓)      | Amber  | "found_on_other_page", "partial_text_found"  |
// | Not Found     | Warning triangle   | Red    | "not_found"                                  |
//
// Use `renderIndicator` prop to customize. Use `variant="indicator"` to show only the icon.
// =============================================================================

/** Spinner component for loading/pending state */
const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={cn("animate-spin", className)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    width="12"
    height="12"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

/** Verified indicator - green checkmark for exact matches */
const VerifiedIndicator = () => (
  <span className="inline-flex relative ml-0.5 text-green-600 dark:text-green-500" aria-hidden="true">
    <CheckIcon />
  </span>
);

/** Partial match indicator - amber checkmark for partial/relocated matches */
const PartialIndicator = () => (
  <span className="inline-flex relative ml-0.5 text-amber-600 dark:text-amber-500" aria-hidden="true">
    <CheckIcon />
  </span>
);

/** Pending indicator - spinner for loading state */
const PendingIndicator = () => (
  <span className="inline-flex ml-1 text-gray-400 dark:text-gray-500" aria-hidden="true">
    <Spinner />
  </span>
);

/** Miss indicator - red warning triangle for not found */
const MissIndicator = () => (
  <span className="inline-flex relative ml-0.5 text-red-500 dark:text-red-400" aria-hidden="true">
    <WarningIcon />
  </span>
);

// =============================================================================
// POPOVER CONTENT COMPONENT
// =============================================================================

interface PopoverContentProps {
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  status: CitationStatus;
  onImageClick?: () => void;
}

function DefaultPopoverContent({
  citation,
  verification,
  status,
  onImageClick,
}: PopoverContentProps) {
  const hasImage = verification?.verificationImageBase64;
  const { isMiss, isPartialMatch } = status;

  // Image view
  if (hasImage) {
    return (
      <div className="p-1">
        <button
          type="button"
          className="block cursor-zoom-in"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onImageClick?.();
          }}
          aria-label="Click to view full size"
        >
          <img
            src={verification.verificationImageBase64 as string}
            alt="Citation verification"
            className="max-w-[700px] max-h-[500px] w-auto h-auto object-contain rounded bg-gray-50 dark:bg-gray-800"
            loading="lazy"
          />
        </button>
        {(isMiss || isPartialMatch) && (
          <DiffDetails citation={citation} verification={verification} status={status} />
        )}
      </div>
    );
  }

  // Text-only view
  const statusLabel = getStatusLabel(status);
  const hasSnippet = verification?.verifiedMatchSnippet;
  const pageNumber = verification?.verifiedPageNumber;

  if (!hasSnippet && !statusLabel) return null;

  return (
    <div className="p-3 flex flex-col gap-2 min-w-[200px] max-w-[400px]">
      {statusLabel && (
        <span
          className={cn(
            "text-xs font-medium",
            status.isVerified && !status.isPartialMatch && "text-green-600 dark:text-green-500",
            status.isPartialMatch && "text-amber-600 dark:text-amber-500",
            status.isMiss && "text-red-600 dark:text-red-500",
            status.isPending && "text-gray-500 dark:text-gray-400"
          )}
        >
          {statusLabel}
        </span>
      )}
      {hasSnippet && (
        <span className="text-sm text-gray-700 dark:text-gray-300 italic">
          "{verification.verifiedMatchSnippet}"
        </span>
      )}
      {pageNumber && pageNumber > 0 && (
        <span className="text-xs text-gray-500 dark:text-gray-400">Page {pageNumber}</span>
      )}
      {(isMiss || isPartialMatch) && (
        <DiffDetails citation={citation} verification={verification} status={status} />
      )}
    </div>
  );
}

// =============================================================================
// DIFF DETAILS COMPONENT
// =============================================================================

/**
 * Renders diff highlighting between expected citation text and actual found text.
 * Uses the `diff` library via useSmartDiff hook for word-level highlighting.
 */
function DiffDetails({
  citation,
  verification,
  status,
}: {
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  status: CitationStatus;
}) {
  const { isMiss, isPartialMatch } = status;

  const expectedText = citation.fullPhrase || citation.keySpan?.toString() || "";
  const actualText = verification?.verifiedMatchSnippet || "";

  // Use the diff library for smart word-level diffing
  const { diffResult, hasDiff, isHighVariance } = useSmartDiff(expectedText, actualText);

  if (!isMiss && !isPartialMatch) return null;

  const expectedLineIds = citation.lineIds;
  const actualLineIds = verification?.verifiedLineIds;
  const lineIdDiffers =
    expectedLineIds &&
    actualLineIds &&
    JSON.stringify(expectedLineIds) !== JSON.stringify(actualLineIds);

  const expectedPage = citation.pageNumber;
  const actualPage = verification?.verifiedPageNumber;
  const pageDiffers = expectedPage != null && actualPage != null && expectedPage !== actualPage;

  // For "not_found" status, show expected text and "Not found" message
  if (isMiss) {
    return (
      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs space-y-2">
        {expectedText && (
          <div>
            <span className="text-gray-500 dark:text-gray-400 font-medium uppercase text-[10px]">Expected</span>
            <p className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-[11px] break-words text-red-600 dark:text-red-400 line-through opacity-70">
              {expectedText.length > 100 ? expectedText.slice(0, 100) + "…" : expectedText}
            </p>
          </div>
        )}
        <div>
          <span className="text-gray-500 dark:text-gray-400 font-medium uppercase text-[10px]">Found</span>
          <p className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-[11px] text-amber-600 dark:text-amber-500 italic">
            Not found in source
          </p>
        </div>
      </div>
    );
  }

  // For partial matches, show word-level diff
  return (
    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs space-y-2">
      {expectedText && actualText && hasDiff ? (
        <div>
          <span className="text-gray-500 dark:text-gray-400 font-medium uppercase text-[10px]">Diff</span>
          <div className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-[11px] break-words text-gray-700 dark:text-gray-300">
            {/* If high variance, show side-by-side instead of inline diff */}
            {isHighVariance ? (
              <div className="space-y-2">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 text-[10px]">Expected: </span>
                  <span className="text-red-600 dark:text-red-400 line-through opacity-70">
                    {expectedText.length > 100 ? expectedText.slice(0, 100) + "…" : expectedText}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 text-[10px]">Found: </span>
                  <span className="text-green-600 dark:text-green-400">
                    {actualText.length > 100 ? actualText.slice(0, 100) + "…" : actualText}
                  </span>
                </div>
              </div>
            ) : (
              // Inline word-level diff
              diffResult.map((block, blockIndex) => (
                <span key={`block-${blockIndex}`}>
                  {block.parts.map((part, partIndex) => {
                    const key = `p-${blockIndex}-${partIndex}`;
                    if (part.removed) {
                      return (
                        <span
                          key={key}
                          className="bg-red-200 dark:bg-red-900/50 text-red-700 dark:text-red-300 line-through"
                          title="Expected text"
                        >
                          {part.value}
                        </span>
                      );
                    }
                    if (part.added) {
                      return (
                        <span
                          key={key}
                          className="bg-green-200 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                          title="Actual text found"
                        >
                          {part.value}
                        </span>
                      );
                    }
                    // Unchanged text
                    return <span key={key}>{part.value}</span>;
                  })}
                </span>
              ))
            )}
          </div>
        </div>
      ) : expectedText && !hasDiff ? (
        // Text matches exactly (partial match is due to location difference)
        <div>
          <span className="text-gray-500 dark:text-gray-400 font-medium uppercase text-[10px]">Text</span>
          <p className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-[11px] break-words text-gray-700 dark:text-gray-300">
            {expectedText.length > 100 ? expectedText.slice(0, 100) + "…" : expectedText}
          </p>
        </div>
      ) : null}
      {pageDiffers && (
        <div>
          <span className="text-gray-500 dark:text-gray-400 font-medium uppercase text-[10px]">Page</span>
          <p className="mt-1 font-mono text-[11px] text-gray-700 dark:text-gray-300">
            <span className="text-red-600 dark:text-red-400 line-through opacity-70">{expectedPage}</span>
            {" → "}
            {actualPage}
          </p>
        </div>
      )}
      {lineIdDiffers && (
        <div>
          <span className="text-gray-500 dark:text-gray-400 font-medium uppercase text-[10px]">Line</span>
          <p className="mt-1 font-mono text-[11px] text-gray-700 dark:text-gray-300">
            <span className="text-red-600 dark:text-red-400 line-through opacity-70">{expectedLineIds?.join(", ")}</span>
            {" → "}
            {actualLineIds?.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * CitationComponent displays a citation with verification status.
 *
 * ## Interaction Pattern
 *
 * - **Hover**: Shows popover with verification image or details
 * - **Click**: Opens full-size image overlay (if image available)
 * - **Escape / Click overlay**: Closes the image overlay
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
      hideKeySpan = false,
      hideBrackets = false,
      fallbackDisplay,
      verification,
      variant = "brackets",
      eventHandlers,
      behaviorConfig,
      isMobile = false,
      renderIndicator,
      renderContent,
      popoverPosition = "top",
      renderPopoverContent,
    },
    ref
  ) => {
    const [isHovering, setIsHovering] = useState(false);
    const [expandedImageSrc, setExpandedImageSrc] = useState<string | null>(null);

    const citationKey = useMemo(() => generateCitationKey(citation), [citation]);
    const citationInstanceId = useMemo(
      () => generateCitationInstanceId(citationKey),
      [citationKey]
    );

    // Derive status from verification object
    const status = useMemo(() => getStatusFromVerification(verification), [verification]);
    const { isMiss, isPartialMatch, isVerified, isPending } = status;

    const displayText = useMemo(() => {
      return getCitationDisplayText(citation, {
        hideKeySpan: variant !== "text" && variant !== "minimal" && hideKeySpan,
        fallbackDisplay,
      });
    }, [citation, variant, hideKeySpan, fallbackDisplay]);

    // Behavior context for custom handlers
    const getBehaviorContext = useCallback(
      (): CitationBehaviorContext => ({
        citation,
        citationKey,
        verification: verification ?? null,
        isTooltipExpanded: isHovering,
        isImageExpanded: !!expandedImageSrc,
        hasImage: !!verification?.verificationImageBase64,
      }),
      [citation, citationKey, verification, isHovering, expandedImageSrc]
    );

    // Apply behavior actions from custom handler
    const applyBehaviorActions = useCallback(
      (actions: CitationBehaviorActions) => {
        if (actions.setImageExpanded !== undefined) {
          if (typeof actions.setImageExpanded === "string") {
            setExpandedImageSrc(actions.setImageExpanded);
          } else if (actions.setImageExpanded === true && verification?.verificationImageBase64) {
            setExpandedImageSrc(verification.verificationImageBase64);
          } else if (actions.setImageExpanded === false) {
            setExpandedImageSrc(null);
          }
        }
      },
      [verification?.verificationImageBase64]
    );

    // Click handler
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();

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

        // Default: click opens image if available
        if (verification?.verificationImageBase64) {
          setExpandedImageSrc(verification.verificationImageBase64);
        }
      },
      [
        behaviorConfig,
        eventHandlers,
        citation,
        citationKey,
        verification?.verificationImageBase64,
        getBehaviorContext,
        applyBehaviorActions,
      ]
    );

    // Hover handlers
    const handleMouseEnter = useCallback(() => {
      setIsHovering(true);
      if (behaviorConfig?.onHover?.onEnter) {
        behaviorConfig.onHover.onEnter(getBehaviorContext());
      }
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, behaviorConfig, citation, citationKey, getBehaviorContext]);

    const handleMouseLeave = useCallback(() => {
      setIsHovering(false);
      if (behaviorConfig?.onHover?.onLeave) {
        behaviorConfig.onHover.onLeave(getBehaviorContext());
      }
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, behaviorConfig, citation, citationKey, getBehaviorContext]);

    // Touch handler for mobile
    const handleTouchEnd = useCallback(
      (e: React.TouchEvent<HTMLSpanElement>) => {
        if (isMobile) {
          e.preventDefault();
          e.stopPropagation();
          eventHandlers?.onTouchEnd?.(citation, citationKey, e);
        }
      },
      [eventHandlers, citation, citationKey, isMobile]
    );

    // Early return for miss with fallback display
    if (fallbackDisplay !== null && fallbackDisplay !== undefined && !hideKeySpan && isMiss) {
      return (
        <span className={cn("text-gray-400 dark:text-gray-500", className)}>
          {fallbackDisplay}
        </span>
      );
    }

    // Status classes for text styling
    const statusClasses = cn(
      // Found status (text color) - verified or partial match
      (isVerified || isPartialMatch) && variant === "brackets" && "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline",
      isMiss && "opacity-70 line-through text-gray-400 dark:text-gray-500",
      isPending && "text-gray-500 dark:text-gray-400"
    );

    // Render indicator based on status priority:
    // 1. Custom renderIndicator (if provided)
    // 2. Pending → Spinner
    // 3. Miss → Warning triangle
    // 4. Partial match → Amber checkmark
    // 5. Verified → Green checkmark
    const renderStatusIndicator = () => {
      if (renderIndicator) return renderIndicator(status);
      if (isPending) return <PendingIndicator />;
      if (isMiss) return <MissIndicator />;
      if (isPartialMatch) return <PartialIndicator />;
      if (isVerified) return <VerifiedIndicator />;
      return null;
    };

    // Render citation content
    const renderCitationContent = () => {
      if (renderContent) {
        return renderContent({
          citation,
          status,
          citationKey,
          displayText,
          isMergedDisplay: variant === "text" || variant === "brackets" || !hideKeySpan,
        });
      }

      if (variant === "indicator") {
        return <span>{renderStatusIndicator()}</span>;
      }

      if (variant === "text") {
        return (
          <span className={statusClasses}>
            {displayText}
            {renderStatusIndicator()}
          </span>
        );
      }

      if (variant === "minimal") {
        return (
          <span className={cn("max-w-80 overflow-hidden text-ellipsis", statusClasses)}>
            {displayText}
            {renderStatusIndicator()}
          </span>
        );
      }

      // brackets variant (default)
      return (
        <span
          className={cn(
            "inline-flex items-baseline gap-0.5 whitespace-nowrap",
            "font-mono text-xs leading-tight",
            "text-gray-500 dark:text-gray-400",
            "transition-colors"
          )}
          aria-hidden="true"
        >
          {!hideBrackets && "["}
          <span className={cn("max-w-80 overflow-hidden text-ellipsis", statusClasses)}>
            {displayText}
            {renderStatusIndicator()}
          </span>
          {!hideBrackets && "]"}
        </span>
      );
    };

    // Popover visibility
    const isPopoverHidden = popoverPosition === "hidden";
    const shouldShowPopover =
      !isPopoverHidden &&
      verification &&
      (verification.verificationImageBase64 || verification.verifiedMatchSnippet);

    const hasImage = !!verification?.verificationImageBase64;

    // Image overlay
    const imageOverlay = expandedImageSrc ? (
      <ImageOverlay
        src={expandedImageSrc}
        alt="Citation verification - full size"
        onClose={() => setExpandedImageSrc(null)}
      />
    ) : null;

    // Shared trigger element props
    const triggerProps = {
      "data-citation-id": citationKey,
      "data-citation-instance": citationInstanceId,
      className: cn(
        "relative inline-flex items-baseline cursor-pointer",
        "px-0.5 -mx-0.5 rounded-sm",
        "transition-all duration-150",
        "hover:bg-blue-500/10 dark:hover:bg-blue-400/10",
        hasImage && "hover:cursor-zoom-in",
        className
      ),
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
      onTouchEndCapture: isMobile ? handleTouchEnd : undefined,
      "aria-label": displayText ? `[${displayText}]` : undefined,
    };

    // Render with Radix Popover
    if (shouldShowPopover) {
      const popoverContentElement = renderPopoverContent ? (
        renderPopoverContent({
          citation,
          verification: verification ?? null,
          status,
        })
      ) : (
        <DefaultPopoverContent
          citation={citation}
          verification={verification ?? null}
          status={status}
          onImageClick={() => {
            if (verification?.verificationImageBase64) {
              setExpandedImageSrc(verification.verificationImageBase64);
            }
          }}
        />
      );

      return (
        <>
          {children}
          <Popover open={isHovering}>
            <PopoverTrigger asChild>
              <span ref={ref} {...triggerProps}>
                {renderCitationContent()}
              </span>
            </PopoverTrigger>
            <PopoverContent
              side={popoverPosition === "bottom" ? "bottom" : "top"}
              onPointerDownOutside={(e: Event) => e.preventDefault()}
              onInteractOutside={(e: Event) => e.preventDefault()}
            >
              {popoverContentElement}
            </PopoverContent>
          </Popover>
          {imageOverlay}
        </>
      );
    }

    // Render without popover
    return (
      <>
        {children}
        <span ref={ref} {...triggerProps}>
          {renderCitationContent()}
        </span>
        {imageOverlay}
      </>
    );
  }
);

CitationComponent.displayName = "CitationComponent";

export const MemoizedCitationComponent = memo(CitationComponent);
