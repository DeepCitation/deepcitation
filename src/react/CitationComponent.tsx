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
  CitationBehaviorActions,
  CitationBehaviorConfig,
  CitationBehaviorContext,
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
 * @example Brackets variant (default) - shows keySpan in brackets with blue styling
 * ```tsx
 * <CitationComponent
 *   citation={{ citationNumber: 1, keySpan: "Revenue grew by 25%" }}
 *   verification={verificationResult}
 * />
 * // Renders: [Revenue grew by 25%✓] with blue text
 * ```
 *
 * @example Numeric only - use hideKeySpan=true with brackets variant
 * ```tsx
 * <CitationComponent
 *   citation={{ citationNumber: 1, keySpan: "25% growth" }}
 *   verification={verificationResult}
 *   hideKeySpan={true}
 * />
 * // Renders: [1✓]
 * ```
 *
 * @example Without brackets - use hideBrackets=true
 * ```tsx
 * <CitationComponent
 *   citation={{ citationNumber: 1, keySpan: "25% growth" }}
 *   verification={verificationResult}
 *   hideBrackets={true}
 * />
 * // Renders: 25% growth✓ (no brackets)
 * ```
 *
 * @example Text variant - inherits parent text styling, no truncation
 * ```tsx
 * <CitationComponent
 *   citation={{ citationNumber: 1, keySpan: "25% growth" }}
 *   verification={verificationResult}
 *   variant="text"
 * />
 * // Renders: 25% growth✓ (inherits parent styling)
 * ```
 *
 * @example Minimal variant - no brackets, just text and indicator
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   verification={verificationResult}
 *   variant="minimal"
 * />
 * // Renders: Revenue grew...✓
 * ```
 *
 * @example Indicator-only variant
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   verification={verificationResult}
 *   variant="indicator"
 * />
 * // Renders: ✓
 * ```
 *
 * @example Hidden popover
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   verification={verificationResult}
 *   popoverPosition="hidden"
 * />
 * ```
 *
 * @example Custom click behavior (replaces default)
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   verification={verificationResult}
 *   behaviorConfig={{
 *     onClick: (context, event) => {
 *       if (context.hasImage) {
 *         return { setImageExpanded: true };
 *       }
 *     }
 *   }}
 * />
 * ```
 *
 * @example Disable all click behavior
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   verification={verificationResult}
 *   behaviorConfig={{ onClick: () => false }}
 * />
 * ```
 */
export interface CitationComponentProps extends BaseCitationProps {
  /**
   * Verification result from the DeepCitation API.
   * Contains match snippet, page number, and verification image.
   */
  verification?: Verification | null;

  /**
   * Display variant for the citation.
   * - `brackets`: Shows keySpan/number in brackets, blue text styling (default)
   * - `text`: Shows the keySpan, inherits parent text styling, no truncation, shows indicator
   * - `minimal`: No brackets, just display text with indicator
   * - `indicator`: Only the status indicator (checkmark/warning), no text
   */
  variant?: CitationVariant;

  /**
   * Whether to hide square brackets around the citation.
   * Only applies to the `brackets` variant.
   * @default false
   */
  hideBrackets?: boolean;

  /**
   * Event handlers for citation interactions.
   * These are always called regardless of behaviorConfig settings.
   */
  eventHandlers?: CitationEventHandlers;

  /**
   * Configuration for customizing default click/hover behaviors.
   * Use this to disable or extend the built-in behaviors.
   *
   * Default behaviors:
   * - Hover: Shows zoom-in cursor when popover is pinned and has image
   * - Click 1: Pins the popover open (stays visible without hover)
   * - Click 2: Opens full-size image overlay (if image available)
   * - Click 3: Closes image and unpins popover
   *
   * @see CitationBehaviorConfig for all options
   */
  behaviorConfig?: CitationBehaviorConfig;

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
   * When provided, takes full control of rendering.
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
    verification: Verification | null;
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
  verification,
  isExpanded,
  onToggleExpand,
}: {
  citation: BaseCitationProps["citation"];
  status: CitationStatus;
  verification: Verification | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) => {
  const { isMiss, isPartialMatch } = status;

  if (!isMiss && !isPartialMatch) return null;

  // Get search attempts from verification
  const searchAttempts = verification?.searchAttempts;
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
    const searchedText =
      citation.fullPhrase || citation.keySpan?.toString() || "";
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
    const expectedText =
      citation.fullPhrase || citation.keySpan?.toString() || "";
    const actualText = verification?.matchSnippet || "";
    const textMatches = expectedText === actualText;
    const truncatedExpected =
      expectedText.length > 100
        ? expectedText.slice(0, 100) + "…"
        : expectedText;
    const truncatedActual =
      actualText.length > 100 ? actualText.slice(0, 100) + "…" : actualText;

    // Check for line ID and page number differences
    const expectedLineIds = citation.lineIds;
    const actualLineIds = verification?.lineIds;
    const lineIdDiffers =
      expectedLineIds &&
      actualLineIds &&
      JSON.stringify(expectedLineIds) !== JSON.stringify(actualLineIds);

    const expectedPage = citation.pageNumber;
    const actualPage = verification?.pageNumber;
    const pageDiffers =
      expectedPage != null &&
      actualPage != null &&
      expectedPage !== actualPage;

    return (
      <span className="dc-status-tooltip" role="tooltip">
        <span className="dc-status-header dc-status-header--partial">
          <WarningIcon />
          <span>Partial match</span>
        </span>
        {textMatches ? (
          <>
            <span className="dc-status-description">
              Text matches, but location differs.
            </span>
            {truncatedExpected && (
              <span className="dc-status-searched">
                <span className="dc-status-label">Text</span>
                <span className="dc-status-text">{truncatedExpected}</span>
              </span>
            )}
          </>
        ) : (
          <>
            <span className="dc-status-description">
              Text differs from citation.
            </span>
            {truncatedExpected && (
              <span className="dc-status-searched">
                <span className="dc-status-label">Expected</span>
                <span className="dc-status-text dc-status-text--expected">
                  {truncatedExpected}
                </span>
              </span>
            )}
            {truncatedActual && (
              <span className="dc-status-searched">
                <span className="dc-status-label">Found</span>
                <span className="dc-status-text">{truncatedActual}</span>
              </span>
            )}
          </>
        )}
        {pageDiffers && (
          <span className="dc-status-searched">
            <span className="dc-status-label">Page</span>
            <span className="dc-status-text">
              <span className="dc-status-text--expected">{expectedPage}</span>
              {" → "}
              {actualPage}
            </span>
          </span>
        )}
        {lineIdDiffers && (
          <span className="dc-status-searched">
            <span className="dc-status-label">Line</span>
            <span className="dc-status-text">
              <span className="dc-status-text--expected">
                {expectedLineIds?.join(", ")}
              </span>
              {" → "}
              {actualLineIds?.join(", ")}
            </span>
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
 * Diff details for partial/miss verification states.
 * Shows expected vs found text, and location differences when applicable.
 */
const DiffDetails = ({
  citation,
  verification,
  status,
}: {
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  status: CitationStatus;
}) => {
  const { isMiss, isPartialMatch } = status;

  if (!isMiss && !isPartialMatch) return null;

  const expectedText =
    citation.fullPhrase || citation.keySpan?.toString() || "";
  const actualText = verification?.matchSnippet || "";
  const textMatches = expectedText === actualText;

  const truncatedExpected =
    expectedText.length > 100 ? expectedText.slice(0, 100) + "…" : expectedText;
  const truncatedActual =
    actualText.length > 100 ? actualText.slice(0, 100) + "…" : actualText;

  // Check for line ID and page number differences
  const expectedLineIds = citation.lineIds;
  const actualLineIds = verification?.lineIds;
  const lineIdDiffers =
    expectedLineIds &&
    actualLineIds &&
    JSON.stringify(expectedLineIds) !== JSON.stringify(actualLineIds);

  const expectedPage = citation.pageNumber;
  const actualPage = verification?.pageNumber;
  const pageDiffers =
    expectedPage != null &&
    actualPage != null &&
    expectedPage !== actualPage;

  return (
    <span className="dc-diff-details">
      {isPartialMatch && textMatches ? (
        // Text matches but location differs - show text once
        truncatedExpected && (
          <span className="dc-status-searched">
            <span className="dc-status-label">Text</span>
            <span className="dc-status-text">{truncatedExpected}</span>
          </span>
        )
      ) : (
        // Text differs - show expected and found
        <>
          {truncatedExpected && (
            <span className="dc-status-searched">
              <span className="dc-status-label">Expected</span>
              <span className="dc-status-text dc-status-text--expected">
                {truncatedExpected}
              </span>
            </span>
          )}
          {isPartialMatch && truncatedActual && (
            <span className="dc-status-searched">
              <span className="dc-status-label">Found</span>
              <span className="dc-status-text">{truncatedActual}</span>
            </span>
          )}
        </>
      )}
      {isMiss && (
        <span className="dc-status-searched">
          <span className="dc-status-label">Found</span>
          <span className="dc-status-text dc-status-text--miss">
            Not found in source
          </span>
        </span>
      )}
      {pageDiffers && (
        <span className="dc-status-searched">
          <span className="dc-status-label">Page</span>
          <span className="dc-status-text">
            <span className="dc-status-text--expected">{expectedPage}</span>
            {" → "}
            {actualPage}
          </span>
        </span>
      )}
      {lineIdDiffers && (
        <span className="dc-status-searched">
          <span className="dc-status-label">Line</span>
          <span className="dc-status-text">
            <span className="dc-status-text--expected">
              {expectedLineIds?.join(", ")}
            </span>
            {" → "}
            {actualLineIds?.join(", ")}
          </span>
        </span>
      )}
    </span>
  );
};

/**
 * Default popover content component.
 * Shows verification image if available, otherwise shows text info.
 * For partial/miss states, also displays expected vs found details.
 */
const DefaultPopoverContent = ({
  citation,
  verification,
  status,
  onImageClick,
}: {
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  status: CitationStatus;
  onImageClick?: (imageSrc: string) => void;
}) => {
  const hasImage = verification?.verificationImageBase64;
  const { isMiss, isPartialMatch } = status;

  const handleImageClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (hasImage && onImageClick) {
        onImageClick(verification.verificationImageBase64 as string);
      }
    },
    [hasImage, verification?.verificationImageBase64, onImageClick]
  );

  // If we have a verification image, show image + diff details for partial/miss
  if (hasImage) {
    return (
      <>
        <button
          type="button"
          className="dc-popover-image-button"
          onClick={handleImageClick}
          aria-label="Click to view full size"
        >
          <img
            src={verification.verificationImageBase64 as string}
            alt="Citation verification"
            className="dc-popover-image"
            loading="lazy"
          />
        </button>
        {(isMiss || isPartialMatch) && (
          <DiffDetails
            citation={citation}
            verification={verification}
            status={status}
          />
        )}
      </>
    );
  }

  // No image - show text info
  const statusLabel = getStatusLabel(status);
  const statusClass = getPopoverStatusClass(status);
  const hasSnippet = verification?.matchSnippet;
  const pageNumber = verification?.pageNumber;

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
          "{verification.verifiedMatchSnippet}"
        </span>
      )}
      {pageNumber && pageNumber > 0 && (
        <span className="dc-popover-page">Page {pageNumber}</span>
      )}
      {(isMiss || isPartialMatch) && (
        <DiffDetails
          citation={citation}
          verification={verification}
          status={status}
        />
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

    // Create behavior context for custom handlers
    const getBehaviorContext = useCallback((): CitationBehaviorContext => ({
      citation,
      citationKey,
      verification: verification ?? null,
      isTooltipExpanded,
      isImageExpanded: !!expandedImageSrc,
      hasImage: !!verification?.verificationImageBase64,
    }), [citation, citationKey, verification, isTooltipExpanded, expandedImageSrc]);

    // Apply behavior actions from custom handler
    const applyBehaviorActions = useCallback((actions: CitationBehaviorActions) => {
      if (actions.setTooltipExpanded !== undefined) {
        setIsTooltipExpanded(actions.setTooltipExpanded);
      }
      if (actions.setImageExpanded !== undefined) {
        if (typeof actions.setImageExpanded === "string") {
          setExpandedImageSrc(actions.setImageExpanded);
        } else if (actions.setImageExpanded === true && verification?.verificationImageBase64) {
          setExpandedImageSrc(verification.verificationImageBase64);
        } else if (actions.setImageExpanded === false) {
          setExpandedImageSrc(null);
        }
      }
      if (actions.setPhrasesExpanded !== undefined) {
        setIsPhrasesExpanded(actions.setPhrasesExpanded);
      }
    }, [verification?.verificationImageBase64]);

    const handleToggleTooltip = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();

        const context = getBehaviorContext();

        // If custom onClick handler is provided via behaviorConfig, it REPLACES default behavior
        if (behaviorConfig?.onClick) {
          const result = behaviorConfig.onClick(context, e);

          // If custom handler returns actions, apply them
          if (result && typeof result === "object") {
            applyBehaviorActions(result);
          }
          // If returns false or void, no state changes

          // Always call eventHandlers.onClick regardless of custom behavior
          eventHandlers?.onClick?.(citation, citationKey, e);
          return;
        }

        // If eventHandlers.onClick is provided, disable default click behavior
        // (no popover pinning, no image expansion) - just call the handler
        if (eventHandlers?.onClick) {
          eventHandlers.onClick(citation, citationKey, e);
          return;
        }

        // Default click behavior (only runs when no click handlers are provided)
        if (verification?.verificationImageBase64) {
          if (expandedImageSrc) {
            // Image is open - close it and unpin
            setExpandedImageSrc(null);
            setIsTooltipExpanded(false);
          } else if (isTooltipExpanded) {
            // Already pinned - second click expands image
            setExpandedImageSrc(verification.verificationImageBase64);
          } else {
            // First click - pin the popover open
            setIsTooltipExpanded(true);
          }
        } else {
          // No image - toggle phrases expansion for miss/partial tooltips
          setIsTooltipExpanded((prev) => !prev);
          setIsPhrasesExpanded((prev) => !prev);
        }
      },
      [
        eventHandlers,
        behaviorConfig,
        citation,
        citationKey,
        verification?.verificationImageBase64,
        expandedImageSrc,
        isTooltipExpanded,
        getBehaviorContext,
        applyBehaviorActions,
      ]
    );

    const status = getCitationStatus(verification ?? null);
    // const { isVerified, isPending } = status;
    const { isMiss, isPartialMatch, isVerified, isPending } = status;

    const displayText = useMemo(() => {
      // For text/minimal variants, always show keySpan (hideKeySpan is ignored)
      // For brackets variant, show keySpan based on hideKeySpan prop
      return getCitationDisplayText(citation, {
        hideKeySpan:
          variant !== "text" &&
          variant !== "minimal" &&
          hideKeySpan,
        fallbackDisplay,
      });
    }, [citation, variant, hideKeySpan, fallbackDisplay]);

    // Found status class for text styling (blue for found, gray for miss)
    const foundStatusClass = useMemo(
      () => getFoundStatusClass(status),
      [status]
    );

    // Event handlers
    const handleMouseEnter = useCallback(() => {
      // Call custom onHover.onEnter handler (if provided)
      if (behaviorConfig?.onHover?.onEnter) {
        behaviorConfig.onHover.onEnter(getBehaviorContext());
      }
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, behaviorConfig, citation, citationKey, getBehaviorContext]);

    const handleMouseLeave = useCallback(() => {
      // Call custom onHover.onLeave handler (if provided)
      if (behaviorConfig?.onHover?.onLeave) {
        behaviorConfig.onHover.onLeave(getBehaviorContext());
      }
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, behaviorConfig, citation, citationKey, getBehaviorContext]);

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
      !hideKeySpan &&
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

      // Check partial match first since isVerified includes isPartialMatch
      if (isPartialMatch) {
        return <DefaultPartialIndicator />;
      } else if (isVerified) {
        return <DefaultVerifiedIndicator />;
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
            variant === "text" || variant === "brackets" || !hideKeySpan,
        });
      }

      // Indicator-only variant - just the checkmark/warning
      if (variant === "indicator") {
        return (
          <span className="dc-citation-text">{renderStatusIndicator()}</span>
        );
      }

      // Text variant - no special styling, shows keySpan with indicator
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

      // Brackets variant (default) - keySpan/number in brackets with styling
      return (
        <span
          className="dc-citation-bracket"
          aria-hidden="true"
          role="presentation"
        >
          {!hideBrackets && "["}
          <span className="dc-citation-text">
            {displayText}
            {renderStatusIndicator()}
          </span>
          {!hideBrackets && "]"}
        </span>
      );
    };

    // Determine if popover should be shown
    const isPopoverHidden = popoverPosition === "hidden";
    const shouldShowPopover =
      !isPopoverHidden &&
      verification &&
      (verification.verificationImageBase64 || verification.verifiedMatchSnippet);
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
            verification: verification ?? null,
            status,
          })
        ) : (
          <DefaultPopoverContent
            citation={citation}
            verification={verification ?? null}
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
        verification={verification ?? null}
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
        data-has-image={!!verification?.verificationImageBase64}
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
