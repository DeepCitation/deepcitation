import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { type CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { CheckIcon, WarningIcon } from "./icons.js";
import type {
  BaseCitationProps,
  CitationEventHandlers,
  CitationRenderProps,
  CitationVariant,
} from "./types.js";
import {
  classNames,
  generateCitationInstanceId,
  generateCitationKey,
  getCitationDisplayText,
} from "./utils.js";
import { getCitationStatus } from "../parsing/parseCitation.js";
import "./styles.css";

const TWO_DOTS_THINKING_CONTENT = "..";

// Re-export CitationVariant for convenience
export type { CitationVariant } from "./types.js";

/**
 * Props for the CitationComponent.
 *
 * @example Brackets variant (default) - shows value/number in brackets with blue styling
 * ```tsx
 * <CitationComponent
 *   citation={{ citationNumber: 1, fullPhrase: "Revenue grew by 25%" }}
 *   foundCitation={verificationResult}
 * />
 * // Renders: [1✓] with blue text
 * ```
 *
 * @example Numeric variant - shows just the citation number with indicator
 * ```tsx
 * <CitationComponent
 *   citation={{ citationNumber: 1, value: "25% growth" }}
 *   foundCitation={verificationResult}
 *   variant="numeric"
 * />
 * // Renders: 1✓
 * ```
 *
 * @example Text variant - shows the value without styling
 * ```tsx
 * <CitationComponent
 *   citation={{ citationNumber: 1, value: "25% growth" }}
 *   foundCitation={verificationResult}
 *   variant="text"
 * />
 * // Renders: 25% growth✓
 * ```
 *
 * @example Minimal variant - no brackets, just text and indicator
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   foundCitation={verificationResult}
 *   variant="minimal"
 * />
 * // Renders: Revenue grew...✓
 * ```
 *
 * @example Indicator-only variant
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   foundCitation={verificationResult}
 *   variant="indicator"
 * />
 * // Renders: ✓
 * ```
 *
 * @example Hidden popover
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   foundCitation={verificationResult}
 *   popoverPosition="hidden"
 * />
 * ```
 */
export interface CitationComponentProps extends BaseCitationProps {
  /**
   * Verification result from the DeepCitation API.
   * Contains match snippet, page number, and verification image.
   */
  foundCitation?: Verification | null;

  /**
   * Display variant for the citation.
   * - `brackets`: Shows value/number in brackets, blue text styling (default)
   * - `numeric`: Shows citation number with indicator, no brackets
   * - `text`: Shows the value, no text styling, no truncate, shows indicator
   * - `minimal`: No brackets, just display text with indicator
   * - `indicator`: Only the status indicator (checkmark/warning), no text
   */
  variant?: CitationVariant;

  /**
   * Event handlers for citation interactions.
   */
  eventHandlers?: CitationEventHandlers;

  /**
   * Enable mobile touch handlers.
   * @default false
   */
  isMobile?: boolean;

  /**
   * Custom render function for the status indicator.
   * Receives the citation status and should return a ReactNode.
   */
  renderIndicator?: (status: CitationStatus) => ReactNode;

  /**
   * Custom render function for the entire citation content.
   * When provided, takes full control of rendering (ignores format, showBrackets).
   */
  renderContent?: (props: CitationRenderProps) => ReactNode;

  /**
   * Position of the verification popover.
   * Use "hidden" to disable the popover entirely.
   * @default "top"
   */
  popoverPosition?: "top" | "bottom" | "hidden";

  /**
   * Custom render function for popover content.
   */
  renderPopoverContent?: (props: {
    citation: BaseCitationProps["citation"];
    foundCitation: Verification | null;
    status: CitationStatus;
  }) => ReactNode;
}

// =============================================================================
// INDICATORS
// =============================================================================

/**
 * Default indicator for verified citations (exact match).
 * Shows a green checkmark.
 */
const DefaultVerifiedIndicator = () => (
  <span className="dc-indicator dc-indicator--verified" aria-hidden="true">
    <CheckIcon />
  </span>
);

/**
 * Default indicator for partial match citations.
 * Shows an orange/warning checkmark.
 */
const DefaultPartialIndicator = () => (
  <span className="dc-indicator dc-indicator--partial" aria-hidden="true">
    <CheckIcon />
  </span>
);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get status label for display in popover.
 */
function getStatusLabel(status: CitationStatus): string {
  if (status.isVerified && !status.isPartialMatch) return "Verified";
  if (status.isPartialMatch) return "Partial Match";
  if (status.isMiss) return "Not Found";
  if (status.isPending) return "Verifying...";
  return "";
}

/**
 * Get popover status CSS class.
 */
function getPopoverStatusClass(status: CitationStatus): string {
  if (status.isVerified && !status.isPartialMatch)
    return "dc-popover-status--verified";
  if (status.isPartialMatch) return "dc-popover-status--partial";
  if (status.isMiss) return "dc-popover-status--miss";
  if (status.isPending) return "dc-popover-status--pending";
  return "";
}

/**
 * Get the "found status" class for text styling.
 * This determines if the text appears as found (blue) or not found (gray).
 *
 * Key insight: Partial matches ARE found - they just don't match exactly.
 * So partial matches get "verified" text styling (blue) but with a different indicator.
 */
function getFoundStatusClass(status: CitationStatus): string {
  // Both verified AND partial are "found" - they get the same text styling
  if (status.isVerified || status.isPartialMatch)
    return "dc-citation--verified";
  if (status.isMiss) return "dc-citation--miss";
  if (status.isPending) return "dc-citation--pending";
  return "";
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * Status tooltip content for miss/partial states.
 * Shows explanation when hovering over citations with issues.
 */
const StatusTooltipContent = ({
  citation,
  status,
  foundCitation,
  isExpanded,
  onToggleExpand,
}: {
  citation: BaseCitationProps["citation"];
  status: CitationStatus;
  foundCitation: Verification | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) => {
  const { isMiss, isPartialMatch } = status;

  if (!isMiss && !isPartialMatch) return null;

  // Get search attempts from foundCitation
  const searchAttempts = foundCitation?.searchState?.searchAttempts;
  const failedAttempts = searchAttempts?.filter((a) => !a.success) || [];

  // Collect all unique phrases tried
  const allPhrases: string[] = [];
  const seenPhrases = new Set<string>();
  for (const attempt of failedAttempts) {
    for (const phrase of attempt.searchPhrases || []) {
      if (!seenPhrases.has(phrase)) {
        seenPhrases.add(phrase);
        allPhrases.push(phrase);
      }
    }
  }

  // Fallback to citation text if no phrases recorded
  if (allPhrases.length === 0) {
    const searchedText = citation.fullPhrase || citation.value || "";
    if (searchedText) {
      allPhrases.push(searchedText);
    }
  }

  if (isMiss) {
    const hiddenCount = allPhrases.length - 1;

    return (
      <span className="dc-status-tooltip" role="tooltip">
        <span className="dc-status-header dc-status-header--miss">
          <WarningIcon />
          <span>Not found in source</span>
        </span>
        {allPhrases.length > 0 && (
          <span className="dc-search-phrases">
            <span className="dc-search-phrases-header">
              {hiddenCount > 0 && (
                <button
                  type="button"
                  className="dc-search-phrases-toggle"
                  onClick={onToggleExpand}
                >
                  {isExpanded ? "collapse" : `+${hiddenCount} more`}
                </button>
              )}
              <span className="dc-status-label">
                Searched {allPhrases.length} phrase
                {allPhrases.length > 1 ? "s" : ""}
              </span>
            </span>
            <span className="dc-search-phrases-list">
              {(isExpanded ? allPhrases : allPhrases.slice(0, 1)).map(
                (phrase, idx) => (
                  <span key={idx} className="dc-search-phrase-item">
                    "{phrase.length > 80 ? phrase.slice(0, 80) + "…" : phrase}"
                  </span>
                )
              )}
            </span>
          </span>
        )}
      </span>
    );
  }

  if (isPartialMatch) {
    const expectedText = citation.fullPhrase || citation.value || "";
    const actualText = foundCitation?.matchSnippet || "";
    const truncatedExpected =
      expectedText.length > 100
        ? expectedText.slice(0, 100) + "…"
        : expectedText;
    const truncatedActual =
      actualText.length > 100 ? actualText.slice(0, 100) + "…" : actualText;

    return (
      <span className="dc-status-tooltip" role="tooltip">
        <span className="dc-status-header dc-status-header--partial">
          <WarningIcon />
          <span>Partial match</span>
        </span>
        <span className="dc-status-description">
          Text differs from citation.
        </span>
        {truncatedExpected && (
          <span className="dc-status-searched">
            <span className="dc-status-label">Expected</span>
            <span className="dc-status-text">{truncatedExpected}</span>
          </span>
        )}
        {truncatedActual && (
          <span className="dc-status-searched">
            <span className="dc-status-label">Found</span>
            <span className="dc-status-text">{truncatedActual}</span>
          </span>
        )}
      </span>
    );
  }

  return null;
};

/**
 * Full-size image overlay component.
 * Uses portal to render at document body level.
 */
const ImageOverlay = ({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) => {
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Use portal to render at body level, avoiding any parent positioning issues
  return createPortal(
    <div
      className="dc-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Full size verification image"
    >
      <div className="dc-overlay-content" onClick={onClose}>
        <img
          src={src}
          alt={alt}
          className="dc-overlay-image"
          draggable={false}
        />
      </div>
    </div>,
    document.body
  );
};

/**
 * Default popover content component.
 * Shows verification image if available, otherwise shows text info.
 */
const DefaultPopoverContent = ({
  foundCitation,
  status,
  onImageClick,
}: {
  citation: BaseCitationProps["citation"];
  foundCitation: Verification | null;
  status: CitationStatus;
  onImageClick?: (imageSrc: string) => void;
}) => {
  const hasImage = foundCitation?.verificationImageBase64;

  const handleImageClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (hasImage && onImageClick) {
        onImageClick(foundCitation.verificationImageBase64 as string);
      }
    },
    [hasImage, foundCitation?.verificationImageBase64, onImageClick]
  );

  // If we have a verification image, show only the image
  if (hasImage) {
    return (
      <button
        type="button"
        className="dc-popover-image-button"
        onClick={handleImageClick}
        aria-label="Click to view full size"
      >
        <img
          src={foundCitation.verificationImageBase64 as string}
          alt="Citation verification"
          className="dc-popover-image"
          loading="lazy"
        />
      </button>
    );
  }

  // No image - show text info
  const statusLabel = getStatusLabel(status);
  const statusClass = getPopoverStatusClass(status);
  const hasSnippet = foundCitation?.matchSnippet;
  const pageNumber = foundCitation?.pageNumber;

  if (!hasSnippet && !statusLabel) {
    return null;
  }

  return (
    <>
      {statusLabel && (
        <span className={classNames("dc-popover-status", statusClass)}>
          {statusLabel}
        </span>
      )}
      {hasSnippet && (
        <span className="dc-popover-snippet">
          "{foundCitation.matchSnippet}"
        </span>
      )}
      {pageNumber && pageNumber > 0 && (
        <span className="dc-popover-page">Page {pageNumber}</span>
      )}
    </>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * CitationComponent displays a citation with verification status.
 *
 * The component separates two concepts:
 * 1. **Found status** (text styling) - whether the citation was found in the document
 *    - Verified & Partial both use "found" styling (blue text)
 *    - Miss uses "not found" styling (gray/strikethrough)
 *
 * 2. **Match quality** (indicator styling) - how well the citation matched
 *    - Exact match: green checkmark
 *    - Partial match: orange checkmark
 *    - Miss: no indicator
 *
 * This means partial matches have blue text (because they were found) but
 * an orange indicator (because they didn't match exactly).
 */
export const CitationComponent = forwardRef<
  HTMLSpanElement,
  CitationComponentProps
>(
  (
    {
      citation,
      children,
      className,
      displayCitationValue = false,
      fallbackDisplay,
      foundCitation,
      variant = "brackets",
      eventHandlers,
      isMobile = false,
      renderIndicator,
      renderContent,
      popoverPosition = "top",
      renderPopoverContent,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLSpanElement>(null);
    const wrapperRef = useRef<HTMLSpanElement>(null);
    const [expandedImageSrc, setExpandedImageSrc] = useState<string | null>(
      null
    );
    const [isTooltipExpanded, setIsTooltipExpanded] = useState(false);
    const [isPhrasesExpanded, setIsPhrasesExpanded] = useState(false);

    const handleImageClick = useCallback((imageSrc: string) => {
      setExpandedImageSrc(imageSrc);
    }, []);

    const handleCloseOverlay = useCallback(() => {
      setExpandedImageSrc(null);
    }, []);

    const handleTogglePhrases = useCallback((e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      setIsPhrasesExpanded((prev) => !prev);
    }, []);

    // Handle click outside to close expanded tooltip
    useEffect(() => {
      if (!isTooltipExpanded) return;

      const handleClickOutside = (event: MouseEvent) => {
        if (
          wrapperRef.current &&
          !wrapperRef.current.contains(event.target as Node)
        ) {
          setIsTooltipExpanded(false);
        }
      };

      // Use capture phase to handle clicks before they bubble
      document.addEventListener("mousedown", handleClickOutside, true);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside, true);
      };
    }, [isTooltipExpanded]);

    // Handle escape key to close expanded tooltip
    useEffect(() => {
      if (!isTooltipExpanded) return;

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setIsTooltipExpanded(false);
        }
      };

      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }, [isTooltipExpanded]);

    const citationKey = useMemo(
      () => generateCitationKey(citation),
      [citation]
    );
    const citationInstanceId = useMemo(
      () => generateCitationInstanceId(citationKey),
      [citationKey]
    );

    const handleToggleTooltip = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();

        // If we have a verification image
        if (foundCitation?.verificationImageBase64) {
          if (expandedImageSrc) {
            // Image is open - close it and unpin
            setExpandedImageSrc(null);
            setIsTooltipExpanded(false);
          } else if (isTooltipExpanded) {
            // Already pinned - second click expands image
            setExpandedImageSrc(foundCitation.verificationImageBase64);
          } else {
            // First click - just pin the popover open
            setIsTooltipExpanded(true);
          }
        } else {
          // No image - toggle phrases expansion for miss/partial tooltips
          setIsTooltipExpanded((prev) => !prev);
          setIsPhrasesExpanded((prev) => !prev);
        }

        eventHandlers?.onClick?.(citation, citationKey, e);
      },
      [
        eventHandlers,
        citation,
        citationKey,
        foundCitation?.verificationImageBase64,
        expandedImageSrc,
        isTooltipExpanded,
      ]
    );

    const status = getCitationStatus(foundCitation ?? null);
    // const { isVerified, isPending } = status;
    const { isMiss, isPartialMatch, isVerified, isPending } = status;

    const displayText = useMemo(() => {
      // For numeric variant, always show the citation number
      if (variant === "numeric") {
        return citation.citationNumber?.toString() ?? "";
      }
      // For text/minimal/brackets, show the value or fullPhrase
      return getCitationDisplayText(citation, {
        displayCitationValue:
          variant === "text" ||
          variant === "minimal" ||
          variant === "brackets" ||
          displayCitationValue,
        fallbackDisplay,
      });
    }, [citation, variant, displayCitationValue, fallbackDisplay]);

    // Found status class for text styling (blue for found, gray for miss)
    const foundStatusClass = useMemo(
      () => getFoundStatusClass(status),
      [status]
    );

    // Event handlers
    const handleMouseEnter = useCallback(() => {
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    const handleMouseLeave = useCallback(() => {
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

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
    if (
      fallbackDisplay !== null &&
      fallbackDisplay !== undefined &&
      displayCitationValue &&
      isMiss
    ) {
      return (
        <span className={classNames("dc-citation-fallback", className)}>
          {fallbackDisplay}
        </span>
      );
    }

    // Render the appropriate indicator based on match quality
    const renderStatusIndicator = () => {
      if (renderIndicator) {
        return renderIndicator(status);
      }

      if (isVerified) {
        return <DefaultVerifiedIndicator />;
      } else if (isPartialMatch) {
        return <DefaultPartialIndicator />;
      } else if (isPending) {
        return (
          <span
            className="dc-indicator dc-indicator--pending"
            aria-hidden="true"
          >
            {TWO_DOTS_THINKING_CONTENT}
          </span>
        );
      } else if (isMiss) {
        return null;
      }
      return null;
    };

    // Render the citation content based on variant
    const renderCitationContent = () => {
      // Custom render function takes full control
      if (renderContent) {
        return renderContent({
          citation,
          status,
          citationKey,
          displayText,
          isMergedDisplay:
            variant === "text" ||
            variant === "brackets" ||
            displayCitationValue,
        });
      }

      // Indicator-only variant - just the checkmark/warning
      if (variant === "indicator") {
        return (
          <span className="dc-citation-text">{renderStatusIndicator()}</span>
        );
      }

      // Text variant - no special styling, shows value with indicator
      if (variant === "text") {
        return (
          <span className="dc-citation-text dc-citation-text--plain">
            {displayText}
            {renderStatusIndicator()}
          </span>
        );
      }

      // Minimal variant - no brackets, just text with indicator
      if (variant === "minimal") {
        return (
          <span className="dc-citation-text">
            {displayText}
            {renderStatusIndicator()}
          </span>
        );
      }

      // Numeric variant - shows citation number with indicator, no brackets
      if (variant === "numeric") {
        return (
          <span className="dc-citation-text">
            {displayText}
            {renderStatusIndicator()}
          </span>
        );
      }

      // Brackets variant (default) - value/number in brackets with styling
      return (
        <span
          className="dc-citation-bracket"
          aria-hidden="true"
          role="presentation"
        >
          [
          <span className="dc-citation-text">
            {displayText}
            {renderStatusIndicator()}
          </span>
          ]
        </span>
      );
    };

    // Determine if popover should be shown
    const isPopoverHidden = popoverPosition === "hidden";
    const shouldShowPopover =
      !isPopoverHidden &&
      foundCitation &&
      (foundCitation.verificationImageBase64 || foundCitation.matchSnippet);
    // Determine if status tooltip should be shown (miss/partial without full verification)
    const shouldShowStatusTooltip =
      !isPopoverHidden && (isMiss || isPartialMatch) && !shouldShowPopover;

    // Popover content - determine position class (only "top" or "bottom" add classes)
    const popoverPositionClass =
      popoverPosition === "bottom" ? "dc-popover--bottom" : "";
    const popoverContent = shouldShowPopover ? (
      <span className={classNames("dc-popover", popoverPositionClass)}>
        {renderPopoverContent ? (
          renderPopoverContent({
            citation,
            foundCitation: foundCitation ?? null,
            status,
          })
        ) : (
          <DefaultPopoverContent
            citation={citation}
            foundCitation={foundCitation ?? null}
            status={status}
            onImageClick={handleImageClick}
          />
        )}
      </span>
    ) : null;

    // Status tooltip for miss/partial explanations
    const statusTooltipContent = shouldShowStatusTooltip ? (
      <StatusTooltipContent
        citation={citation}
        status={status}
        foundCitation={foundCitation ?? null}
        isExpanded={isPhrasesExpanded}
        onToggleExpand={handleTogglePhrases}
      />
    ) : null;

    const citationTrigger = (
      <span
        ref={(node) => {
          (containerRef as React.RefObject<HTMLSpanElement | null>).current =
            node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        data-citation-id={citationKey}
        data-citation-instance={citationInstanceId}
        data-tooltip-expanded={isTooltipExpanded}
        data-has-image={!!foundCitation?.verificationImageBase64}
        className={classNames(
          "dc-citation",
          `dc-citation--${variant}`,
          foundStatusClass,
          className
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleToggleTooltip}
        onTouchEndCapture={isMobile ? handleTouchEnd : undefined}
        aria-label={displayText ? `[${displayText}]` : undefined}
        aria-expanded={isTooltipExpanded}
      >
        {renderCitationContent()}
      </span>
    );

    // Image overlay for full-size view
    const imageOverlay = expandedImageSrc ? (
      <ImageOverlay
        src={expandedImageSrc}
        alt="Citation verification - full size"
        onClose={handleCloseOverlay}
      />
    ) : null;

    // Wrap with popover or status tooltip if needed
    if (shouldShowPopover || shouldShowStatusTooltip) {
      return (
        <>
          {children}
          <span
            className="dc-popover-wrapper"
            ref={wrapperRef}
            data-expanded={isTooltipExpanded}
          >
            {citationTrigger}
            {popoverContent}
            {statusTooltipContent}
          </span>
          {imageOverlay}
        </>
      );
    }

    return (
      <>
        {children}
        {citationTrigger}
        {imageOverlay}
      </>
    );
  }
);

CitationComponent.displayName = "CitationComponent";

export const MemoizedCitationComponent = memo(CitationComponent);
