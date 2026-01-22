import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

// React 19.2+ Activity component for prefetching - falls back to Fragment if unavailable
const Activity =
  (React as { Activity?: React.ComponentType<{ mode: "visible" | "hidden"; children: React.ReactNode }> }).Activity ??
  (({ children }: { mode: "visible" | "hidden"; children: React.ReactNode }) => <>{children}</>);
import { type CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { CheckIcon, SpinnerIcon, WarningIcon } from "./icons.js";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover.js";
import type {
  BaseCitationProps,
  CitationBehaviorActions,
  CitationBehaviorConfig,
  CitationBehaviorContext,
  CitationContent,
  CitationEventHandlers,
  CitationRenderProps,
  CitationVariant,
} from "./types.js";
import {
  cn,
  generateCitationInstanceId,
  generateCitationKey,
  getCitationDisplayText,
} from "./utils.js";
import { useSmartDiff } from "./useSmartDiff.js";
import { useCitationOverlay } from "./CitationOverlayContext.js";
import { SplitDiffDisplay, MatchQualityBar, getContextualStatusMessage } from "./SplitDiffDisplay.js";

// Re-export types for convenience
export type { CitationVariant, CitationContent } from "./types.js";

/**
 * Get the default content type based on variant.
 */
function getDefaultContent(variant: CitationVariant): CitationContent {
  switch (variant) {
    case "chip":
    case "text":
    case "brackets":
      return "keySpan";
    case "source":
      return "source";
    case "superscript":
    case "minimal":
    default:
      return "number";
  }
}

/**
 * Strip leading/trailing brackets from text.
 * Handles cases where LLM output includes brackets in keySpan.
 */
function stripBrackets(text: string): string {
  return text.replace(/^\[+\s*/, "").replace(/\s*\]+$/, "");
}

/**
 * Get display text based on content type and citation data.
 * Returns "1" as fallback if no citation number is available.
 */
function getDisplayText(
  citation: BaseCitationProps["citation"],
  content: CitationContent,
  fallbackDisplay?: string | null
): string {
  if (content === "indicator") {
    return "";
  }

  if (content === "keySpan") {
    const raw =
      citation.keySpan?.toString() ||
      citation.citationNumber?.toString() ||
      fallbackDisplay ||
      "1";
    return stripBrackets(raw);
  }

  if (content === "source") {
    // Source content: show siteName or domain (using main's field names)
    return citation.siteName || citation.domain || citation.keySpan?.toString() || "Source";
  }

  // content === "number"
  return citation.citationNumber?.toString() || "1";
}

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
   * - `chip`: Pill/badge style with background color
   * - `brackets`: [text✓] with square brackets (default)
   * - `text`: Plain text, inherits parent styling
   * - `superscript`: Small raised text like footnotes¹
   * - `minimal`: Compact text with indicator, truncated
   * - `source`: ChatGPT-style source chip with name + count
   */
  variant?: CitationVariant;
  /**
   * What content to display in the citation.
   * - `keySpan`: Descriptive text (e.g., "Revenue Growth")
   * - `number`: Citation number (e.g., "1", "2", "3")
   * - `indicator`: Only the status icon, no text
   * - `source`: Source name (e.g., "Wikipedia")
   *
   * Defaults based on variant:
   * - `chip` → `keySpan`
   * - `brackets` → `keySpan`
   * - `text` → `keySpan`
   * - `superscript` → `number`
   * - `minimal` → `number`
   * - `source` → `source`
   */
  content?: CitationContent;
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
 *
 * Note: isPending is only true when status is explicitly "pending" or "loading".
 * Use the isLoading prop to show spinner when verification is in-flight.
 */
function getStatusFromVerification(
  verification: Verification | null | undefined
): CitationStatus {
  const status = verification?.status;

  // No verification or no status = no status flags set
  // (use isLoading prop to explicitly show loading state)
  if (!verification || !status) {
    return {
      isVerified: false,
      isMiss: false,
      isPartialMatch: false,
      isPending: false,
    };
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
  const { registerOverlay, unregisterOverlay } = useCitationOverlay();

  // Register this overlay as open globally (blocks hover on other citations)
  useEffect(() => {
    registerOverlay();
    return () => unregisterOverlay();
  }, [registerOverlay, unregisterOverlay]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in-0 duration-[50ms]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Full size verification image"
    >
      <div className="relative max-w-[95vw] max-h-[95vh] cursor-zoom-out animate-in zoom-in-95 duration-[50ms]">
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

/** Verified indicator - green checkmark for exact matches (subscript-positioned) */
const VerifiedIndicator = () => (
  <span
    className="inline-flex relative ml-0.5 top-[0.15em] size-2.5 text-green-600 dark:text-green-500"
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
);

/** Partial match indicator - amber checkmark for partial/relocated matches (subscript-positioned) */
const PartialIndicator = () => (
  <span
    className="inline-flex relative ml-0.5 top-[0.15em] size-2.5 text-amber-600 dark:text-amber-500"
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
);

/** Pending indicator - spinner for loading state (subscript-positioned) */
const PendingIndicator = () => (
  <span
    className="inline-flex relative ml-1 top-[0.15em] size-2.5 animate-spin text-gray-400 dark:text-gray-500"
    aria-hidden="true"
  >
    <SpinnerIcon />
  </span>
);

/** Miss indicator - amber warning triangle for not found (subscript-positioned) */
const MissIndicator = () => (
  <span
    className="inline-flex relative ml-0.5 top-[0.15em] size-2.5 text-amber-500 dark:text-amber-400"
    aria-hidden="true"
  >
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
  isLoading?: boolean;
  isPhrasesExpanded?: boolean;
  onPhrasesExpandChange?: (expanded: boolean) => void;
  /** Whether the popover is currently visible (used for Activity prefetching) */
  isVisible?: boolean;
}

/**
 * Component to display searched phrases from search attempts
 */
function SearchedPhrasesInfo({
  citation,
  verification,
  isExpanded: externalIsExpanded,
  onExpandChange,
}: {
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  isExpanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
}) {
  // Collect all unique searched phrases from search attempts
  const searchedPhrases = useMemo(() => {
    const phrases = new Set<string>();

    // Add phrases from search attempts
    if (verification?.searchAttempts) {
      for (const attempt of verification.searchAttempts) {
        if (attempt.searchPhrases) {
          for (const phrase of attempt.searchPhrases) {
            if (phrase) phrases.add(phrase);
          }
        }
      }
    }

    // Fallback to citation phrases if no search attempts
    if (phrases.size === 0) {
      if (citation.fullPhrase) phrases.add(citation.fullPhrase);
      if (citation.keySpan) phrases.add(citation.keySpan.toString());
    }

    return Array.from(phrases);
  }, [citation, verification]);

  const [internalIsExpanded, setInternalIsExpanded] = useState(false);

  // Use external state if provided, otherwise internal
  const isExpanded = externalIsExpanded ?? internalIsExpanded;
  const setIsExpanded = useCallback((expanded: boolean) => {
    if (onExpandChange) {
      onExpandChange(expanded);
    } else {
      setInternalIsExpanded(expanded);
    }
  }, [onExpandChange]);

  if (searchedPhrases.length === 0) return null;

  const displayCount = isExpanded ? searchedPhrases.length : 1;
  const hiddenCount = searchedPhrases.length - 1;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">
        <span>Searched {searchedPhrases.length} phrase{searchedPhrases.length !== 1 ? 's' : ''}</span>
        {hiddenCount > 0 && !isExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 lowercase"
          >
            +{hiddenCount} more
          </button>
        )}
        {isExpanded && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 lowercase"
          >
            collapse
          </button>
        )}
      </div>
      <div className="mt-1 space-y-1">
        {searchedPhrases.slice(0, displayCount).map((phrase, index) => (
          <p
            key={index}
            className="pl-2 py-1 font-mono text-[11px] break-words text-gray-700 dark:text-gray-300 border-l-2 border-red-400 dark:border-red-500"
          >
            "{phrase.length > 80 ? phrase.slice(0, 80) + '…' : phrase}"
          </p>
        ))}
      </div>
    </div>
  );
}

function DefaultPopoverContent({
  citation,
  verification,
  status,
  onImageClick,
  isLoading = false,
  isPhrasesExpanded,
  onPhrasesExpandChange,
  isVisible = true,
}: PopoverContentProps) {
  const hasImage = verification?.verificationImageBase64;
  const { isMiss, isPartialMatch, isPending } = status;

  // Image view - sized for quick preview, click to expand
  // Uses responsive sizing that adapts to actual image dimensions:
  // - Small images (e.g. document snippets): show at natural size, constrained to viewport
  // - Large images: constrain to max dimensions while preserving aspect ratio
  // - Max dimensions: 70vw width, 50vh height to leave room for positioning
  // - Min dimensions: none - small images stay small
  //
  // React 19.2 Activity component is used to pre-render the image in "hidden" mode
  // before the user hovers, eliminating the empty popover flash when first displayed.
  if (hasImage) {
    return (
      <Activity mode={isVisible ? "visible" : "hidden"}>
        <div
          className="p-2"
          style={{ maxWidth: "100%", overflow: "hidden" }}
        >
          <button
            type="button"
            className="group block cursor-zoom-in relative overflow-hidden rounded-md bg-gray-50 dark:bg-gray-800"
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
              className="block rounded-md"
              style={{
                maxWidth: "min(70vw, 384px)",
                maxHeight: "min(50vh, 300px)",
                width: "auto",
                height: "auto",
                objectFit: "contain",
              }}
              // Use eager loading for prefetching, decode async to not block main thread
              loading="eager"
              decoding="async"
            />
            {/* Bottom bar with expand hint on hover */}
            <span className="absolute left-0 right-0 bottom-0 flex items-center justify-end px-2 pb-1.5 pt-4 bg-gradient-to-t from-black/30 to-transparent rounded-b-md">
              <span className="text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                Click to expand
              </span>
            </span>
          </button>
          {(isMiss || isPartialMatch) && (
            <DiffDetails
              citation={citation}
              verification={verification}
              status={status}
            />
          )}
        </div>
      </Activity>
    );
  }

  // Loading/pending state view
  if (isLoading || isPending) {
    const searchingPhrase = citation.fullPhrase || citation.keySpan?.toString();
    return (
      <div className="p-3 flex flex-col gap-2 min-w-[200px] max-w-[400px]">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          <span className="inline-block relative top-[0.1em] mr-1.5 size-2 animate-spin">
            <SpinnerIcon />
          </span>
          Searching...
        </span>
        {searchingPhrase && (
          <p className="p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-[11px] break-words text-gray-600 dark:text-gray-400 italic">
            "{searchingPhrase.length > 80 ? searchingPhrase.slice(0, 80) + '…' : searchingPhrase}"
          </p>
        )}
        {citation.pageNumber && citation.pageNumber > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Looking on page {citation.pageNumber}
          </span>
        )}
      </div>
    );
  }

  // Miss state view (no image, but show what was searched)
  if (isMiss) {
    return (
      <div className="p-3 flex flex-col gap-2 min-w-[200px] max-w-[400px]">
        <span className="text-xs font-medium text-red-600 dark:text-red-500">
          <span className="inline-block relative top-[0.1em] mr-1.5 size-3 text-amber-500 dark:text-amber-400">
            <WarningIcon />
          </span>
          Not found: {citation.keySpan || citation.fullPhrase}
        </span>
        <SearchedPhrasesInfo
          citation={citation}
          verification={verification}
          isExpanded={isPhrasesExpanded}
          onExpandChange={onPhrasesExpandChange}
        />
      </div>
    );
  }

  // Text-only view (verified/partial match without image)
  const statusLabel = getStatusLabel(status);
  const hasSnippet = verification?.verifiedMatchSnippet;
  const pageNumber = verification?.verifiedPageNumber;

  if (!hasSnippet && !statusLabel) return null;

  return (
    <div className="p-3 flex flex-col gap-2 min-w-[180px] max-w-full">
      {statusLabel && (
        <span
          className={cn(
            "text-xs font-medium",
            status.isVerified &&
              !status.isPartialMatch &&
              "text-green-600 dark:text-green-500",
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
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Page {pageNumber}
        </span>
      )}
      {(isMiss || isPartialMatch) && (
        <DiffDetails
          citation={citation}
          verification={verification}
          status={status}
        />
      )}
    </div>
  );
}

// =============================================================================
// DIFF DETAILS COMPONENT
// =============================================================================

/**
 * Renders diff highlighting between expected citation text and actual found text.
 * Uses split view for high-variance diffs and inline diff for low-variance.
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

  const expectedText =
    citation.fullPhrase || citation.keySpan?.toString() || "";
  const actualText = verification?.verifiedMatchSnippet || "";

  // Use the diff library for smart word-level diffing
  const { hasDiff, similarity } = useSmartDiff(
    expectedText,
    actualText
  );

  if (!isMiss && !isPartialMatch) return null;

  const expectedLineIds = citation.lineIds;
  const actualLineIds = verification?.verifiedLineIds;
  const lineIdDiffers =
    expectedLineIds &&
    actualLineIds &&
    JSON.stringify(expectedLineIds) !== JSON.stringify(actualLineIds);

  const expectedPage = citation.pageNumber;
  const actualPage = verification?.verifiedPageNumber;
  const pageDiffers =
    expectedPage != null && actualPage != null && expectedPage !== actualPage;

  // Get contextual status message
  const searchStatus = verification?.status;
  const statusMessage = getContextualStatusMessage(searchStatus, expectedPage, actualPage);

  // For "not_found" status, show expected text and "Not found" message
  if (isMiss) {
    return (
      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs space-y-2">
        {expectedText && (
          <SplitDiffDisplay
            expected={expectedText}
            actual=""
            mode="split"
            showMatchQuality={false}
            maxCollapsedLength={150}
            keySpanExpected={citation.keySpan?.toString()}
            status={searchStatus}
          />
        )}
      </div>
    );
  }

  // For partial matches, show enhanced diff with split view
  return (
    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs space-y-2">
      {/* Contextual status message */}
      {statusMessage && searchStatus !== "found" && (
        <div className={cn(
          "text-[10px] font-medium px-1.5 py-0.5 rounded inline-flex items-center gap-1",
          "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
        )}>
          <span className="size-2">
            <CheckIcon />
          </span>
          {statusMessage}
        </div>
      )}

      {expectedText && actualText && hasDiff ? (
        <SplitDiffDisplay
          expected={expectedText}
          actual={actualText}
          mode="split"
          showMatchQuality={true}
          maxCollapsedLength={150}
          keySpanExpected={citation.keySpan?.toString()}
          keySpanFound={verification?.verifiedKeySpan ?? undefined}
          status={searchStatus}
          similarity={similarity}
        />
      ) : expectedText && !hasDiff ? (
        // Text matches exactly (partial match is due to location difference)
        <div>
          <div className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-500 text-[10px] font-medium mb-1">
            <span className="size-2">
              <CheckIcon />
            </span>
            <span>Text matches</span>
          </div>
          <p className="p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-[11px] break-words text-gray-700 dark:text-gray-300">
            {expectedText.length > 150
              ? expectedText.slice(0, 150) + "…"
              : expectedText}
          </p>
        </div>
      ) : null}

      {/* Location differences */}
      {(pageDiffers || lineIdDiffers) && (
        <div className="flex flex-wrap gap-3 pt-1">
          {pageDiffers && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 dark:text-gray-400 font-medium uppercase text-[10px]">
                Page:
              </span>
              <span className="font-mono text-[11px]">
                <span className="text-red-600 dark:text-red-400 line-through opacity-70">
                  {expectedPage}
                </span>
                <span className="text-gray-400 mx-1">→</span>
                <span className="text-green-600 dark:text-green-400">
                  {actualPage}
                </span>
              </span>
            </div>
          )}
          {lineIdDiffers && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 dark:text-gray-400 font-medium uppercase text-[10px]">
                Line:
              </span>
              <span className="font-mono text-[11px]">
                <span className="text-red-600 dark:text-red-400 line-through opacity-70">
                  {expectedLineIds?.join(", ")}
                </span>
                <span className="text-gray-400 mx-1">→</span>
                <span className="text-green-600 dark:text-green-400">
                  {actualLineIds?.join(", ")}
                </span>
              </span>
            </div>
          )}
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
export const CitationComponent = forwardRef<
  HTMLSpanElement,
  CitationComponentProps
>(
  (
    {
      citation,
      children,
      className,
      fallbackDisplay,
      verification,
      isLoading = false,
      variant = "brackets",
      content: contentProp,
      eventHandlers,
      behaviorConfig,
      isMobile = false,
      renderIndicator,
      renderContent,
      popoverPosition = "top",
      renderPopoverContent,
      additionalCount,
      faviconUrl,
    },
    ref
  ) => {
    // Get overlay context for blocking hover when any image overlay is open
    const { isAnyOverlayOpen } = useCitationOverlay();

    // Resolve content: explicit content prop or default for variant
    const resolvedContent: CitationContent = useMemo(() => {
      if (contentProp) return contentProp;
      return getDefaultContent(variant);
    }, [contentProp, variant]);
    const [isHovering, setIsHovering] = useState(false);
    const [expandedImageSrc, setExpandedImageSrc] = useState<string | null>(
      null
    );
    const [isPhrasesExpanded, setIsPhrasesExpanded] = useState(false);

    const citationKey = useMemo(
      () => generateCitationKey(citation),
      [citation]
    );
    const citationInstanceId = useMemo(
      () => generateCitationInstanceId(citationKey),
      [citationKey]
    );

    // Derive status from verification object
    const status = useMemo(
      () => getStatusFromVerification(verification),
      [verification]
    );
    const { isMiss, isPartialMatch, isVerified, isPending } = status;

    // Spinner timeout: auto-hide after ~5s if still pending
    const SPINNER_TIMEOUT_MS = 5000;
    const [spinnerTimedOut, setSpinnerTimedOut] = useState(false);
    const spinnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Determine if we should show spinner:
    // - explicit isLoading prop OR isPending status
    // - BUT NOT if we have a verification image or definitive status
    // - AND NOT if spinner has timed out
    const hasDefinitiveResult =
      verification?.verificationImageBase64 ||
      verification?.status === "found" ||
      verification?.status === "found_key_span_only" ||
      verification?.status === "found_phrase_missed_value" ||
      verification?.status === "not_found" ||
      verification?.status === "partial_text_found" ||
      verification?.status === "found_on_other_page" ||
      verification?.status === "found_on_other_line" ||
      verification?.status === "first_word_found";

    const shouldShowSpinner =
      (isLoading || isPending) && !hasDefinitiveResult && !spinnerTimedOut;

    // Reset spinner timeout when loading state changes
    useEffect(() => {
      // Clear any existing timeout
      if (spinnerTimeoutRef.current) {
        clearTimeout(spinnerTimeoutRef.current);
        spinnerTimeoutRef.current = null;
      }

      // If we should show spinner, start timeout
      if ((isLoading || isPending) && !hasDefinitiveResult) {
        setSpinnerTimedOut(false);
        spinnerTimeoutRef.current = setTimeout(() => {
          setSpinnerTimedOut(true);
        }, SPINNER_TIMEOUT_MS);
      } else {
        // Reset timed out state when we get a result
        setSpinnerTimedOut(false);
      }

      return () => {
        if (spinnerTimeoutRef.current) {
          clearTimeout(spinnerTimeoutRef.current);
        }
      };
    }, [isLoading, isPending, hasDefinitiveResult]);

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
          } else if (
            actions.setImageExpanded === true &&
            verification?.verificationImageBase64
          ) {
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

        // Default: click opens image if available, or toggles phrases expansion for miss state
        if (verification?.verificationImageBase64) {
          setExpandedImageSrc(verification.verificationImageBase64);
        } else if (isMiss) {
          // For miss state without image, toggle phrases expansion
          setIsPhrasesExpanded((prev) => !prev);
        }
      },
      [
        behaviorConfig,
        eventHandlers,
        citation,
        citationKey,
        verification?.verificationImageBase64,
        isMiss,
        getBehaviorContext,
        applyBehaviorActions,
      ]
    );

    // Hover handlers with delay for popover accessibility
    // Use a timeout to allow user to move mouse from trigger to popover
    const HOVER_CLOSE_DELAY_MS = 150;
    const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isOverPopoverRef = useRef(false);

    const cancelHoverCloseTimeout = useCallback(() => {
      if (hoverCloseTimeoutRef.current) {
        clearTimeout(hoverCloseTimeoutRef.current);
        hoverCloseTimeoutRef.current = null;
      }
    }, []);

    const handleMouseEnter = useCallback(() => {
      // Don't trigger hover popover if any image overlay is expanded
      if (isAnyOverlayOpen) return;

      cancelHoverCloseTimeout();
      setIsHovering(true);
      if (behaviorConfig?.onHover?.onEnter) {
        behaviorConfig.onHover.onEnter(getBehaviorContext());
      }
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [
      eventHandlers,
      behaviorConfig,
      citation,
      citationKey,
      getBehaviorContext,
      cancelHoverCloseTimeout,
      isAnyOverlayOpen,
    ]);

    const handleMouseLeave = useCallback(() => {
      // Delay closing to allow mouse to move to popover
      cancelHoverCloseTimeout();
      hoverCloseTimeoutRef.current = setTimeout(() => {
        if (!isOverPopoverRef.current) {
          setIsHovering(false);
          if (behaviorConfig?.onHover?.onLeave) {
            behaviorConfig.onHover.onLeave(getBehaviorContext());
          }
          eventHandlers?.onMouseLeave?.(citation, citationKey);
        }
      }, HOVER_CLOSE_DELAY_MS);
    }, [
      eventHandlers,
      behaviorConfig,
      citation,
      citationKey,
      getBehaviorContext,
      cancelHoverCloseTimeout,
    ]);

    // Popover content hover handlers
    const handlePopoverMouseEnter = useCallback(() => {
      cancelHoverCloseTimeout();
      isOverPopoverRef.current = true;
    }, [cancelHoverCloseTimeout]);

    const handlePopoverMouseLeave = useCallback(() => {
      isOverPopoverRef.current = false;
      // Delay closing to allow mouse to move back to trigger
      cancelHoverCloseTimeout();
      hoverCloseTimeoutRef.current = setTimeout(() => {
        setIsHovering(false);
        if (behaviorConfig?.onHover?.onLeave) {
          behaviorConfig.onHover.onLeave(getBehaviorContext());
        }
        eventHandlers?.onMouseLeave?.(citation, citationKey);
      }, HOVER_CLOSE_DELAY_MS);
    }, [
      eventHandlers,
      behaviorConfig,
      citation,
      citationKey,
      getBehaviorContext,
      cancelHoverCloseTimeout,
    ]);

    // Cleanup hover timeout on unmount
    useEffect(() => {
      return () => {
        if (hoverCloseTimeoutRef.current) {
          clearTimeout(hoverCloseTimeoutRef.current);
        }
      };
    }, []);

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

    // Early return for miss with fallback display (only when showing keySpan)
    if (
      fallbackDisplay !== null &&
      fallbackDisplay !== undefined &&
      resolvedContent === "keySpan" &&
      isMiss
    ) {
      return (
        <span className={cn("text-gray-400 dark:text-gray-500", className)}>
          {fallbackDisplay}
        </span>
      );
    }

    // Status classes for text styling
    const statusClasses = cn(
      // Found status (text color) - verified or partial match
      (isVerified || isPartialMatch) &&
        variant === "brackets" &&
        "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline",
      isMiss && "opacity-70 line-through text-gray-400 dark:text-gray-500",
      shouldShowSpinner && "text-gray-500 dark:text-gray-400"
    );

    // Render indicator based on status priority:
    // 1. Custom renderIndicator (if provided)
    // 2. shouldShowSpinner → Spinner (respects timeout and definitive results)
    // 3. Verified (not partial) → Green checkmark
    // 4. Partial match → Amber checkmark
    // 5. Miss → Warning triangle
    const renderStatusIndicator = () => {
      if (renderIndicator) return renderIndicator(status);
      if (shouldShowSpinner) return <PendingIndicator />;
      if (isVerified && !isPartialMatch) return <VerifiedIndicator />;
      if (isPartialMatch) return <PartialIndicator />;
      if (isMiss) return <MissIndicator />;
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
          isMergedDisplay: resolvedContent === "keySpan",
        });
      }

      // Content type: indicator only
      if (resolvedContent === "indicator") {
        return <span>{renderStatusIndicator()}</span>;
      }

      // Variant: chip (pill/badge style)
      if (variant === "chip") {
        const chipStatusClasses = cn(
          isVerified &&
            !isPartialMatch &&
            !shouldShowSpinner &&
            "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
          isPartialMatch &&
            !shouldShowSpinner &&
            "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
          isMiss &&
            !shouldShowSpinner &&
            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 line-through",
          shouldShowSpinner &&
            "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
          !isVerified &&
            !isMiss &&
            !shouldShowSpinner &&
            "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        );
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-medium",
              chipStatusClasses
            )}
          >
            <span className="max-w-60 overflow-hidden text-ellipsis whitespace-nowrap">
              {displayText}
            </span>
            {renderStatusIndicator()}
          </span>
        );
      }

      // Variant: superscript (footnote style)
      if (variant === "superscript") {
        const supStatusClasses = cn(
          isVerified && !isPartialMatch && !shouldShowSpinner && "text-green-600 dark:text-green-500",
          isPartialMatch && !shouldShowSpinner && "text-amber-600 dark:text-amber-500",
          isMiss && !shouldShowSpinner && "text-red-500 dark:text-red-400 line-through",
          shouldShowSpinner && "text-gray-400 dark:text-gray-500",
          !isVerified &&
            !isMiss &&
            !shouldShowSpinner &&
            "text-blue-600 dark:text-blue-400"
        );
        return (
          <sup
            className={cn(
              "text-xs font-medium transition-colors hover:underline",
              supStatusClasses
            )}
          >
            [{displayText}
            {renderStatusIndicator()}]
          </sup>
        );
      }

      // Variant: text (inherits parent styling)
      if (variant === "text") {
        return (
          <span className={statusClasses}>
            {displayText}
            {renderStatusIndicator()}
          </span>
        );
      }

      // Variant: minimal (compact with truncation)
      if (variant === "minimal") {
        return (
          <span
            className={cn(
              "max-w-80 overflow-hidden text-ellipsis",
              statusClasses
            )}
          >
            {displayText}
            {renderStatusIndicator()}
          </span>
        );
      }

      // Variant: source (ChatGPT-style source chip)
      if (variant === "source") {
        const faviconSrc = faviconUrl || citation.faviconUrl;
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium",
              "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
              "hover:bg-gray-200 dark:hover:bg-gray-700",
              "transition-colors cursor-pointer"
            )}
          >
            {faviconSrc && (
              <img
                src={faviconSrc}
                alt=""
                className="w-4 h-4 rounded-sm object-contain"
                loading="lazy"
                onError={(e) => {
                  // Hide broken favicon images
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span className="max-w-40 overflow-hidden text-ellipsis whitespace-nowrap">
              {displayText}
            </span>
            {additionalCount !== undefined && additionalCount > 0 && (
              <span className="text-gray-500 dark:text-gray-400">
                +{additionalCount}
              </span>
            )}
          </span>
        );
      }

      // Variant: brackets (default)
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
          [
          <span
            className={cn(
              "max-w-80 overflow-hidden text-ellipsis",
              statusClasses
            )}
          >
            {displayText}
            {renderStatusIndicator()}
          </span>
          ]
        </span>
      );
    };

    // Popover visibility
    const isPopoverHidden = popoverPosition === "hidden";
    // Show popover for:
    // 1. Verification with image or snippet (verified cases)
    // 2. Loading/pending states (informative searching message)
    // 3. Miss states (show what was searched)
    const shouldShowPopover =
      !isPopoverHidden &&
      (
        // Has verification with image or snippet
        (verification && (verification.verificationImageBase64 || verification.verifiedMatchSnippet)) ||
        // Loading/pending state
        shouldShowSpinner ||
        isPending ||
        isLoading ||
        // Miss state (show what was searched)
        isMiss
      );

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
        "transition-all duration-[50ms]",
        "hover:bg-blue-500/10 dark:hover:bg-blue-400/10",
        hasImage && "cursor-zoom-in",
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
          isLoading={isLoading || shouldShowSpinner}
          isPhrasesExpanded={isPhrasesExpanded}
          onPhrasesExpandChange={setIsPhrasesExpanded}
          isVisible={isHovering}
          onImageClick={() => {
            if (verification?.verificationImageBase64) {
              setExpandedImageSrc(verification.verificationImageBase64);
            }
          }}
        />
      );

      // Pre-render the image content in hidden mode when we have an image
      // but the user isn't hovering yet. This uses React 19.2's Activity
      // component to prefetch and decode the image before it's needed.
      const prefetchElement = hasImage && !isHovering && !renderPopoverContent ? (
        <DefaultPopoverContent
          citation={citation}
          verification={verification ?? null}
          status={status}
          isLoading={false}
          isVisible={false}
          onImageClick={() => {}}
        />
      ) : null;

      return (
        <>
          {children}
          {/* Hidden prefetch layer - pre-renders image content using Activity */}
          {prefetchElement}
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
              onMouseEnter={handlePopoverMouseEnter}
              onMouseLeave={handlePopoverMouseLeave}
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
