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
  (
    React as {
      Activity?: React.ComponentType<{
        mode: "visible" | "hidden";
        children: React.ReactNode;
      }>;
    }
  ).Activity ??
  (({
    children,
  }: {
    mode: "visible" | "hidden";
    children: React.ReactNode;
  }) => <>{children}</>);
import { type CitationStatus } from "../types/citation.js";
import type { Page } from "../types/boxes.js";
import type { Verification } from "../types/verification.js";
import type {
  MatchedVariation,
  SearchAttempt,
  SearchStatus,
} from "../types/search.js";
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  SpinnerIcon,
  WarningIcon,
  XCircleIcon,
  XIcon,
  ZoomInIcon,
} from "./icons.js";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover.js";
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
} from "./types.js";
import {
  cn,
  generateCitationInstanceId,
  generateCitationKey,
  isUrlCitation,
} from "./utils.js";
import { useSmartDiff } from "./useSmartDiff.js";
import { useCitationOverlay } from "./CitationOverlayContext.js";
import {
  SplitDiffDisplay,
  getContextualStatusMessage,
} from "./SplitDiffDisplay.js";
import {
  SourceContextHeader,
  StatusHeader,
  VerificationLog,
} from "./VerificationLog.js";
import { MISS_WAVY_UNDERLINE_STYLE, COPY_FEEDBACK_DURATION_MS, POPOVER_CONTAINER_BASE_CLASSES } from "./constants.js";

// Re-export types for convenience
export type {
  CitationVariant,
  CitationContent,
  CitationInteractionMode,
} from "./types.js";

/**
 * Module-level handler for hiding broken images.
 * Performance fix: avoids creating new function references on every render.
 */
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.display = "none";
};

// Constants
/** Default number of search attempt groups to show before expanding */
const DEFAULT_VISIBLE_GROUP_COUNT = 2;

/** Maximum characters to show for truncated phrases in search attempts */
const MAX_PHRASE_LENGTH = 50;

/** Popover container width */
const POPOVER_WIDTH = "384px";

/** Popover container max width (viewport-relative, with safe margin to prevent scrollbar) */
const POPOVER_MAX_WIDTH = "calc(100vw - 32px)";

/** Maximum characters to show for matched text display in search results */
const MAX_MATCHED_TEXT_LENGTH = 40;

/** Maximum number of search variations to show before collapsing */
const MAX_VISIBLE_VARIATIONS = 3;

/** Maximum characters to show for variation strings */
const MAX_VARIATION_LENGTH = 30;

/** Debounce threshold for ignoring click events after touch (ms) */
const TOUCH_CLICK_DEBOUNCE_MS = 100;

// =============================================================================
// TOUCH DEVICE DETECTION
// =============================================================================

/**
 * Detects if the device has touch capability.
 * Uses useState + useEffect for React 17+ compatibility.
 *
 * This is used to auto-detect mobile/touch devices so the component can
 * show the popover on first tap rather than immediately opening the image overlay.
 *
 * Detection uses pointer: coarse media query as primary method, which specifically
 * identifies devices where the PRIMARY input is coarse (touch), avoiding false
 * positives on Windows laptops with touchscreens but mouse as primary input.
 */
function getIsTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  // Primary check: pointer: coarse media query
  // This specifically checks if the PRIMARY pointing device is coarse (touch)
  // Windows laptops with touchscreens typically report (pointer: fine) because
  // the mouse/trackpad is the primary input device
  const hasCoarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return hasCoarsePointer;
}

function useIsTouchDevice(): boolean {
  // Initialize with current value (SSR-safe: defaults to false on server)
  const [isTouchDevice, setIsTouchDevice] = useState(() => getIsTouchDevice());

  useEffect(() => {
    // Update state with current value on mount (handles SSR hydration)
    setIsTouchDevice(getIsTouchDevice());

    // Listen for changes in pointer capability (e.g., tablet mode changes)
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(pointer: coarse)");
      const handleChange = () => setIsTouchDevice(getIsTouchDevice());

      // Use addEventListener with 'change' event (modern API)
      mediaQuery.addEventListener?.("change", handleChange);
      return () => mediaQuery.removeEventListener?.("change", handleChange);
    }
  }, []);

  return isTouchDevice;
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
class CitationErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
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

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/** Variants that handle their own hover styling (don't need parent hover) */
const VARIANTS_WITH_OWN_HOVER = new Set<CitationVariant>([
  "chip",
  "badge",
  "linter",
  "superscript",
]);

/**
 * Get status-aware hover classes for contained hover styling.
 * Used by chip, superscript, and other variants that need hover contained within their bounds.
 *
 * @param isVerified - Whether the citation is verified
 * @param isPartialMatch - Whether it's a partial match
 * @param isMiss - Whether it's not found
 * @param shouldShowSpinner - Whether to show loading spinner
 * @param opacity - Opacity level for hover backgrounds:
 *   - 15 (default): Used for contained variants (chip, superscript) where hover is
 *     applied directly to the element. Higher opacity provides better visual feedback
 *     since the element itself is the hover target.
 *   - 10: Used for the outer trigger wrapper on variants without contained hover.
 *     Lower opacity is more subtle since the wrapper may extend beyond the visual element.
 * @returns Array of Tailwind class strings for hover states
 */
function getStatusHoverClasses(
  isVerified: boolean,
  isPartialMatch: boolean,
  isMiss: boolean,
  shouldShowSpinner: boolean,
  opacity: 10 | 15 = 15
): (string | false)[] {
  const opacitySuffix = opacity === 10 ? "/10" : "/15";
  return [
    isVerified &&
      !isPartialMatch &&
      !shouldShowSpinner &&
      `hover:bg-green-600${opacitySuffix} dark:hover:bg-green-500${opacitySuffix}`,
    isPartialMatch &&
      !shouldShowSpinner &&
      `hover:bg-amber-500${opacitySuffix} dark:hover:bg-amber-500${opacitySuffix}`,
    isMiss &&
      !shouldShowSpinner &&
      `hover:bg-red-500${opacitySuffix} dark:hover:bg-red-400${opacitySuffix}`,
    (shouldShowSpinner || (!isVerified && !isMiss && !isPartialMatch)) &&
      "hover:bg-gray-200 dark:hover:bg-gray-700",
  ];
}

/**
 * Get the default content type based on variant.
 */
function getDefaultContent(variant: CitationVariant): CitationContent {
  switch (variant) {
    case "chip":
    case "text":
    case "brackets":
    case "linter":
      return "anchorText";
    case "badge":
      return "source";
    case "superscript":
    default:
      return "number";
  }
}

/**
 * Strip leading/trailing brackets from text.
 * Handles cases where LLM output includes brackets in anchorText.
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

  if (content === "anchorText") {
    const raw =
      citation.anchorText?.toString() ||
      citation.citationNumber?.toString() ||
      fallbackDisplay ||
      "1";
    return stripBrackets(raw);
  }

  if (content === "source") {
    // Source content: show siteName or domain (using main's field names)
    return (
      citation.siteName ||
      citation.domain ||
      citation.anchorText?.toString() ||
      "Source"
    );
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
}

function getStatusLabel(status: CitationStatus): string {
  if (status.isVerified && !status.isPartialMatch) return "Verified";
  if (status.isPartialMatch) return "Partial Match";
  if (status.isMiss) return "Not Found";
  if (status.isPending) return "Verifying...";
  return "";
}

// =============================================================================
// TRUST LEVEL HELPERS
// =============================================================================

/**
 * Get the trust level from a MatchedVariation.
 * Trust levels determine indicator colors:
 * - high: Green checkmark (exact or normalized full phrase)
 * - medium: Green checkmark (anchorText matches)
 * - low: Amber checkmark (partial matches)
 */
function getTrustLevel(
  matchedVariation?: MatchedVariation
): "high" | "medium" | "low" {
  if (!matchedVariation) return "medium";
  switch (matchedVariation) {
    case "exact_full_phrase":
    case "normalized_full_phrase":
      return "high";
    case "exact_anchor_text":
    case "normalized_anchor_text":
      return "medium";
    case "partial_full_phrase":
    case "partial_anchor_text":
    case "first_word_only":
      return "low";
    default:
      return "medium";
  }
}

/**
 * Check if a match has low trust (should show amber indicator).
 */
function isLowTrustMatch(matchedVariation?: MatchedVariation): boolean {
  return getTrustLevel(matchedVariation) === "low";
}

/**
 * Get the search phrase from a SearchAttempt.
 */
function getSearchPhrase(attempt: SearchAttempt): string {
  return attempt.searchPhrase || "";
}

/**
 * Get the note from a SearchAttempt.
 */
function getSearchNote(attempt: SearchAttempt): string | undefined {
  return attempt.note;
}

// =============================================================================
// GROUPED SEARCH ATTEMPTS DISPLAY
// =============================================================================

/**
 * A grouped search attempt combines multiple attempts that searched the same phrase.
 * This provides a cleaner display when the same phrase is searched on multiple pages.
 */
interface GroupedSearchAttempt {
  /** The search phrase (normalized for grouping) */
  phrase: string;
  /** Type of phrase: full_phrase or anchor_text */
  phraseType: "full_phrase" | "anchor_text" | undefined;
  /** All pages that were searched */
  pagesSearched: number[];
  /** All methods used */
  methodsUsed: Set<string>;
  /** All variations tried (from searchVariations arrays) */
  variationsTried: string[];
  /** Whether any attempt succeeded */
  anySuccess: boolean;
  /** The successful attempt if any */
  successfulAttempt?: SearchAttempt;
  /** All notes from attempts (deduplicated) */
  uniqueNotes: string[];
  /** Total number of attempts in this group */
  attemptCount: number;
}

/**
 * Get a human-readable label for search methods.
 */
function getMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    exact_line_match: "exact location",
    line_with_buffer: "nearby lines",
    current_page: "expected page",
    anchor_text_fallback: "anchor text",
    adjacent_pages: "nearby pages",
    expanded_window: "wider search",
    regex_search: "entire document",
    first_word_fallback: "first word",
  };
  return labels[method] || method;
}

/**
 * Format a list of page numbers into a readable string.
 * Combines consecutive pages into ranges for compact display.
 *
 * @param pages - Array of page numbers to format
 * @returns Formatted string like "pages 1-3, 5-7" or "page 2"
 *
 * @example
 * formatPageList([1, 2, 3, 5, 6, 7]) // "pages 1-3, 5-7"
 * formatPageList([2]) // "page 2"
 * formatPageList([]) // ""
 */
function formatPageList(pages: number[]): string {
  if (pages.length === 0) return "";
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (sorted.length === 1) return `page ${sorted[0]}`;

  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === rangeEnd + 1) {
      rangeEnd = sorted[i];
    } else {
      ranges.push(
        rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`
      );
      rangeStart = sorted[i];
      rangeEnd = sorted[i];
    }
  }
  ranges.push(
    rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`
  );

  return `pages ${ranges.join(", ")}`;
}

/**
 * Group search attempts by unique phrase for a cleaner display.
 * Attempts with the same phrase are combined into a single group showing
 * all pages searched, methods used, and variations tried.
 *
 * @param attempts - Array of search attempts from verification
 * @returns Array of grouped attempts, sorted with successful matches first
 *
 * @example
 * const grouped = groupSearchAttempts(verification.searchAttempts);
 * grouped.forEach(group => {
 *   console.log(`"${group.phrase}" - searched ${group.pagesSearched.length} pages`);
 * });
 */
function groupSearchAttempts(
  attempts: SearchAttempt[]
): GroupedSearchAttempt[] {
  const groups = new Map<string, GroupedSearchAttempt>();

  for (const attempt of attempts) {
    const phrase = getSearchPhrase(attempt);
    // Create a key that includes phrase type to differentiate fullPhrase vs anchorText searches
    const key = `${attempt.searchPhraseType || "unknown"}:${phrase}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        phrase,
        phraseType: attempt.searchPhraseType,
        pagesSearched: [],
        methodsUsed: new Set(),
        variationsTried: [],
        anySuccess: false,
        uniqueNotes: [],
        attemptCount: 0,
      };
      groups.set(key, group);
    }

    group.attemptCount++;
    if (attempt.pageSearched != null) {
      group.pagesSearched.push(attempt.pageSearched);
    }
    group.methodsUsed.add(attempt.method);

    // Collect unique variations
    if (attempt.searchVariations) {
      for (const variation of attempt.searchVariations) {
        if (
          variation !== phrase &&
          !group.variationsTried.includes(variation)
        ) {
          group.variationsTried.push(variation);
        }
      }
    }

    // Track success
    if (attempt.success) {
      group.anySuccess = true;
      group.successfulAttempt = attempt;
    }

    // Collect unique notes
    const note = getSearchNote(attempt);
    if (note && !group.uniqueNotes.includes(note)) {
      group.uniqueNotes.push(note);
    }
  }

  // Sort groups: successful first, then by phrase type (full_phrase before anchor_text)
  return Array.from(groups.values()).sort((a, b) => {
    if (a.anySuccess !== b.anySuccess) return a.anySuccess ? -1 : 1;
    if (a.phraseType !== b.phraseType) {
      if (a.phraseType === "full_phrase") return -1;
      if (b.phraseType === "full_phrase") return 1;
    }
    return 0;
  });
}

/**
 * Derive citation status from a Verification object.
 * The status comes from verification.status.
 *
 * Status classification:
 * - GREEN (isVerified only): Full phrase found at expected location
 *   - "found": Exact match
 *   - "found_phrase_missed_anchor_text": Full phrase found, anchor text highlighting failed
 *
 * - AMBER (isVerified + isPartialMatch): Something found but not ideal
 *   - "found_anchor_text_only": Only anchor text found, full phrase not matched
 *   - "found_on_other_page": Found but on different page than expected
 *   - "found_on_other_line": Found but on different line than expected
 *   - "partial_text_found": Only part of the text was found
 *   - "first_word_found": Only the first word matched (lowest confidence)
 *   - Low-trust matches from matchedVariation also show amber
 *
 * - RED (isMiss): Not found
 *   - "not_found": Text not found in document
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

  // Check if any successful search attempt has low trust
  const hasLowTrustMatch =
    verification.searchAttempts?.some(
      (a) => a.success && isLowTrustMatch(a.matchedVariation)
    ) ?? false;

  // Partial matches show amber indicator - something found but not ideal
  const isPartialMatch =
    status === "found_anchor_text_only" || // Only anchor text found, not full phrase
    status === "found_on_other_page" ||
    status === "found_on_other_line" ||
    status === "partial_text_found" ||
    status === "first_word_found" ||
    hasLowTrustMatch; // Low-trust matches also show as partial (amber)

  // Verified = we found something (either exact or partial)
  const isVerified =
    status === "found" ||
    status === "found_phrase_missed_anchor_text" || // Full phrase found, just missed anchor text highlight
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
// | Verified      | Checkmark (✓)      | Green  | "found", "found_anchor_text_only", etc.         |
// | Partial Match | Checkmark (✓)      | Amber  | "found_on_other_page", "partial_text_found"  |
// | Not Found     | X icon (✕)         | Red    | "not_found"                                  |
//
// Use `renderIndicator` prop to customize. Use `variant="indicator"` to show only the icon.
// =============================================================================

/**
 * Dynamic indicator size styles.
 * Uses em units so the indicator scales with the parent font size.
 * 0.85em provides good visibility at most text sizes while staying proportional.
 * minWidth/minHeight ensure a minimum of 10px for accessibility at very small font sizes.
 */
export const INDICATOR_SIZE_STYLE: React.CSSProperties = { width: '0.85em', height: '0.85em', minWidth: '10px', minHeight: '10px' };

/** Verified indicator - green checkmark for exact matches (subscript-positioned)
 * Vertical offset (top-[0.1em]) changed from 0.15em to better align with the larger 0.85em icon size.
 * Uses [text-decoration:none] to prevent inheriting line-through from parent.
 * Dynamic sizing via em units for font-proportional scaling.
 */
const VerifiedIndicator = () => (
  <span
    className="inline-flex relative ml-0.5 top-[0.1em] text-green-600 dark:text-green-500 [text-decoration:none]"
    style={INDICATOR_SIZE_STYLE}
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
);

/** Partial match indicator - amber checkmark for partial/relocated matches (subscript-positioned)
 * Uses [text-decoration:none] to prevent inheriting line-through from parent.
 * Dynamic sizing via em units for font-proportional scaling.
 */
const PartialIndicator = () => (
  <span
    className="inline-flex relative ml-0.5 top-[0.1em] text-amber-500 dark:text-amber-400 [text-decoration:none]"
    style={INDICATOR_SIZE_STYLE}
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
);

/** Pending indicator - spinner for loading state (subscript-positioned)
 * Uses [text-decoration:none] to prevent inheriting line-through from parent.
 * Dynamic sizing via em units for font-proportional scaling.
 */
const PendingIndicator = () => (
  <span
    className="inline-flex relative ml-1 top-[0.1em] animate-spin text-gray-400 dark:text-gray-500 [text-decoration:none]"
    style={INDICATOR_SIZE_STYLE}
    aria-hidden="true"
  >
    <SpinnerIcon />
  </span>
);

/** Miss indicator - red X for not found (centered, not subscript)
 * Uses simple XIcon for better visibility at all sizes.
 * The circle in XCircleIcon becomes hard to see at small font sizes.
 * Centered vertically (not subscript) to make the "not found" status more prominent.
 * aria-hidden="true" because parent component already conveys verification status.
 * Uses [text-decoration:none] to prevent inheriting line-through from parent.
 * Dynamic sizing via em units for font-proportional scaling.
 */
const MissIndicator = () => (
  <span
    className="inline-flex items-center ml-0.5 text-red-500 dark:text-red-400 [text-decoration:none]"
    style={INDICATOR_SIZE_STYLE}
    aria-hidden="true"
  >
    <XIcon />
  </span>
);

// =============================================================================
// VERIFICATION IMAGE COMPONENT
// =============================================================================

/**
 * Displays a verification image that fits within the container dimensions.
 * The image is scaled to fit (without distortion) and can be clicked to expand.
 * Includes an action bar with zoom button and optional "View page" button.
 *
 * Note: This component uses simple object-fit: contain for predictable sizing.
 * Previous scroll-to-anchor-text logic was removed for simplicity - users can
 * click to see the full-size image if more detail is needed.
 */
function AnchorTextFocusedImage({
  verification,
  onImageClick,
  page,
  onViewPageClick,
  maxWidth = "min(70vw, 384px)",
  maxHeight = "min(50vh, 300px)",
}: {
  verification: Verification;
  onImageClick?: () => void;
  /** Optional page data with source URL. When provided with a source, shows "View page" button. */
  page?: Page | null;
  /** Optional callback for "View page" button. Called with the page when clicked. */
  onViewPageClick?: (page: Page) => void;
  maxWidth?: string;
  maxHeight?: string;
}) {
  // Show "View page" button only when we have page data with a source URL
  const showViewPageButton = page?.source && onViewPageClick;

  return (
    <div className="relative">
      {/* Image container - clickable to zoom */}
      <button
        type="button"
        className="group block cursor-zoom-in relative w-full"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onImageClick?.();
        }}
        aria-label="Click to view full size"
      >
        <div
          className="overflow-hidden rounded-t-md"
          style={{
            maxWidth,
            maxHeight,
          }}
        >
          <img
            src={verification.verificationImageBase64 as string}
            alt="Citation verification"
            className="block w-full h-auto"
            style={{
              maxHeight,
              objectFit: "contain",
            }}
            loading="eager"
            decoding="async"
          />
        </div>
      </button>

      {/* Action bar - always visible below image */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-b-md border-t border-gray-200 dark:border-gray-700">
        {/* Zoom button on left - using text-gray-700 for WCAG AA contrast (7.0:1 ratio on gray-100) */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onImageClick?.();
          }}
          className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
          aria-label="Expand image"
        >
          <span className="size-3.5">
            <ZoomInIcon />
          </span>
          <span>Expand</span>
        </button>

        {/* View page button on right (only shown when page data with source URL is provided) */}
        {showViewPageButton && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onViewPageClick(page);
            }}
            className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
            aria-label="View full page"
          >
            <span>View page</span>
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// HUMANIZING MESSAGES (Issue #5)
// =============================================================================

/**
 * Get a conversational message for not-found or partial match states.
 * Uses the actual anchor text for context, truncating if needed.
 */
function getHumanizingMessage(
  status: SearchStatus | null | undefined,
  anchorText?: string,
  expectedPage?: number,
  foundPage?: number
): string | null {
  if (!status) return null;

  const MAX_ANCHOR_LENGTH = 30;
  // Type guard: ensure anchorText is a string before using string methods
  const safeAnchorText = typeof anchorText === "string" ? anchorText : null;
  const displayText = safeAnchorText
    ? safeAnchorText.length > MAX_ANCHOR_LENGTH
      ? `"${safeAnchorText.slice(0, MAX_ANCHOR_LENGTH)}…"`
      : `"${safeAnchorText}"`
    : "this phrase";

  switch (status) {
    case "not_found":
      return `We couldn't find ${displayText} in this document.`;
    case "found_on_other_page":
      if (expectedPage && foundPage) {
        return `Found ${displayText} on page ${foundPage} instead of page ${expectedPage}.`;
      }
      return `Found ${displayText} on a different page than expected.`;
    case "found_on_other_line":
      return `Found ${displayText} at a different position than expected.`;
    case "partial_text_found":
      return `Only part of ${displayText} was found.`;
    case "first_word_found":
      return `Only the beginning of ${displayText} was found.`;
    case "found_anchor_text_only":
      return `Found ${displayText}, but not the full surrounding context.`;
    default:
      return null;
  }
}

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
  /**
   * Override label for the source display in the popover header.
   * See BaseCitationProps.sourceLabel for details.
   */
  sourceLabel?: string;
}

/**
 * Get border color class based on search attempt success and trust level.
 * - Green: Successful match with high/medium trust
 * - Amber: Successful match with low trust
 * - Red: Failed search attempt
 */
function getSearchAttemptBorderClass(attempt: SearchAttempt): string {
  if (!attempt.success) {
    return "border-red-400 dark:border-red-500";
  }
  if (isLowTrustMatch(attempt.matchedVariation)) {
    return "border-amber-400 dark:border-amber-500";
  }
  return "border-green-400 dark:border-green-500";
}

/**
 * Component to display searched phrases from search attempts.
 * Groups similar attempts together for a cleaner display:
 * - Same phrase searched on multiple pages → shows once with page summary
 * - Shows methods used and variations tried
 * - Highlights successful vs failed attempts
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
  // Get search attempts from verification, or create fallback from citation
  const searchAttempts = useMemo(() => {
    if (
      verification?.searchAttempts &&
      verification.searchAttempts.length > 0
    ) {
      return verification.searchAttempts;
    }

    // Fallback: create synthetic attempts from citation data
    const fallbackAttempts: SearchAttempt[] = [];
    if (citation.fullPhrase) {
      fallbackAttempts.push({
        method: "current_page",
        success: false,
        searchPhrase: citation.fullPhrase,
        searchPhraseType: "full_phrase",
      });
    }
    // Also add anchorText as a separate fallback if it differs from fullPhrase
    if (citation.anchorText && citation.anchorText !== citation.fullPhrase) {
      fallbackAttempts.push({
        method: "anchor_text_fallback",
        success: false,
        searchPhrase: citation.anchorText.toString(),
        searchPhraseType: "anchor_text",
      });
    }
    return fallbackAttempts;
  }, [citation, verification]);

  // Group attempts by unique phrase for cleaner display
  const groupedAttempts = useMemo(
    () => groupSearchAttempts(searchAttempts),
    [searchAttempts]
  );

  const [internalIsExpanded, setInternalIsExpanded] = useState(false);

  // Use external state if provided, otherwise internal
  const isExpanded = externalIsExpanded ?? internalIsExpanded;
  const setIsExpanded = useCallback(
    (expanded: boolean) => {
      if (onExpandChange) {
        onExpandChange(expanded);
      } else {
        setInternalIsExpanded(expanded);
      }
    },
    [onExpandChange]
  );

  if (groupedAttempts.length === 0) return null;

  // Calculate pages searched across all attempts
  const allPagesSearched = new Set<number>();
  for (const group of groupedAttempts) {
    for (const page of group.pagesSearched) {
      if (page != null) allPagesSearched.add(page);
    }
  }
  const pagesSearchedCount = allPagesSearched.size;

  // Show first DEFAULT_VISIBLE_GROUP_COUNT groups by default (usually fullPhrase + anchorText), expand to show all
  const defaultDisplayCount = Math.min(
    DEFAULT_VISIBLE_GROUP_COUNT,
    groupedAttempts.length
  );
  const displayCount = isExpanded
    ? groupedAttempts.length
    : defaultDisplayCount;
  const hiddenGroupCount = groupedAttempts.length - defaultDisplayCount;

  return (
    <div className="mt-1">
      {/* Summary header showing what was searched */}
      <div className="text-[10px] text-gray-600 dark:text-gray-400 mb-2">
        Searched{" "}
        {pagesSearchedCount > 1
          ? `${pagesSearchedCount} pages`
          : pagesSearchedCount === 1
            ? "1 page"
            : "document"}
        {hiddenGroupCount > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {isExpanded
              ? "show less"
              : `show all ${groupedAttempts.length} phrases`}
          </button>
        )}
      </div>

      {/* Search phrase list */}
      <div className="space-y-2">
        {groupedAttempts.slice(0, displayCount).map((group, index) => (
          <SearchAttemptRow key={index} group={group} />
        ))}
      </div>
    </div>
  );
}

/**
 * Compact single-row display for a grouped search attempt.
 * Shows phrase, metadata badges, and result on one or two lines.
 * Uses cleaner, less colorful design with monochrome badges.
 */
function SearchAttemptRow({ group }: { group: GroupedSearchAttempt }) {
  // Truncate phrase for display
  const displayPhrase =
    group.phrase.length > MAX_PHRASE_LENGTH
      ? group.phrase.slice(0, MAX_PHRASE_LENGTH) + "…"
      : group.phrase;

  // Build location info string
  const validPages = group.pagesSearched.filter((p): p is number => p != null);
  const locationInfo =
    validPages.length > 0 ? formatPageList(validPages) : "entire document";

  // Status indicator - only icon is colored
  const statusIndicator = group.anySuccess ? (
    <span
      className={cn(
        "inline-flex size-3 flex-shrink-0",
        isLowTrustMatch(group.successfulAttempt?.matchedVariation)
          ? "text-amber-500 dark:text-amber-400"
          : "text-green-600 dark:text-green-400"
      )}
    >
      <CheckIcon />
    </span>
  ) : (
    <span className="inline-flex size-3 flex-shrink-0 text-gray-500 dark:text-gray-400">
      <CloseIcon />
    </span>
  );

  // Phrase type label
  const phraseTypeLabel =
    group.phraseType === "anchor_text" ? "Anchor text" : "Full phrase";

  // For failed attempts, show variations that were also searched
  const visibleVariations = group.variationsTried.slice(
    0,
    MAX_VISIBLE_VARIATIONS
  );
  const hiddenVariationsCount =
    group.variationsTried.length - MAX_VISIBLE_VARIATIONS;

  return (
    <div className="p-2 bg-gray-50 dark:bg-gray-800/40 rounded-md">
      {/* Phrase type and location - monochrome */}
      <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
        <span className="font-medium">{phraseTypeLabel}</span>
        <span>{locationInfo}</span>
      </div>

      {/* The searched phrase */}
      <div className="flex items-start gap-1.5">
        <p className="font-mono text-[11px] text-gray-700 dark:text-gray-200 break-words flex-1">
          "{displayPhrase}"
        </p>
        {statusIndicator}
      </div>

      {/* Result line for successful matches */}
      {group.anySuccess &&
        group.successfulAttempt?.matchedText &&
        group.successfulAttempt.matchedText !== group.phrase && (
          <p className="text-[10px] text-green-600 dark:text-green-400 truncate mt-1">
            Found: "
            {group.successfulAttempt.matchedText.slice(
              0,
              MAX_MATCHED_TEXT_LENGTH
            )}
            {group.successfulAttempt.matchedText.length >
            MAX_MATCHED_TEXT_LENGTH
              ? "…"
              : ""}
            "
          </p>
        )}

      {/* Detailed info for failed attempts */}
      {!group.anySuccess && (
        <>
          {/* Variations that were also searched */}
          {visibleVariations.length > 0 && (
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
              <span className="font-medium">Also tried: </span>
              {visibleVariations.map((variation, index) => {
                const truncatedVar =
                  variation.length > MAX_VARIATION_LENGTH
                    ? variation.slice(0, MAX_VARIATION_LENGTH) + "…"
                    : variation;
                return (
                  <span key={index}>
                    <span className="font-mono">"{truncatedVar}"</span>
                    {index < visibleVariations.length - 1 && ", "}
                  </span>
                );
              })}
              {hiddenVariationsCount > 0 && (
                <span className="text-gray-400 dark:text-gray-500">
                  {" "}
                  +{hiddenVariationsCount} more
                </span>
              )}
            </div>
          )}

          {/* Notes (if any, for additional context) */}
          {group.uniqueNotes.length > 0 && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              {group.uniqueNotes[0]}
            </p>
          )}
        </>
      )}
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
  sourceLabel,
}: PopoverContentProps) {
  const hasImage = verification?.verificationImageBase64;
  const { isMiss, isPartialMatch, isPending, isVerified } = status;
  const searchStatus = verification?.status;

  // Determine if we should show the verification log (for non-success states)
  const showVerificationLog = isMiss || isPartialMatch;

  // Determine if this is a "clean" success (no log needed)
  const isCleanSuccess = isVerified && !isPartialMatch && !isMiss;

  // Get page/line info for the log
  const expectedPage = citation.pageNumber;
  const expectedLine = citation.lineIds?.[0];
  const foundPage = verification?.verifiedPageNumber ?? undefined;
  const foundLine = verification?.verifiedLineIds?.[0];

  // Get humanizing message for partial/not-found states
  const anchorText = citation.anchorText?.toString();
  const fullPhrase = citation.fullPhrase;
  const humanizingMessage = useMemo(
    () =>
      getHumanizingMessage(
        searchStatus,
        anchorText,
        expectedPage ?? undefined,
        foundPage
      ),
    [searchStatus, anchorText, expectedPage, foundPage]
  );

  // Loading/pending state view
  if (isLoading || isPending) {
    const searchingPhrase = fullPhrase || anchorText;
    return (
      <div className={`${POPOVER_CONTAINER_BASE_CLASSES} min-w-[200px] max-w-[400px]`}>
        {/* Source context header */}
        <SourceContextHeader
          citation={citation}
          verification={verification}
          status={searchStatus}
          sourceLabel={sourceLabel}
        />
        <div className="p-3 flex flex-col gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
            <span className="inline-block relative top-[0.1em] mr-1.5 size-2 animate-spin">
              <SpinnerIcon />
            </span>
            Searching...
          </span>
          {searchingPhrase && (
            <p className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded font-mono text-[11px] break-words text-gray-700 dark:text-gray-300">
              "
              {searchingPhrase.length > 80
                ? searchingPhrase.slice(0, 80) + "…"
                : searchingPhrase}
              "
            </p>
          )}
          {citation.pageNumber && citation.pageNumber > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Looking on page {citation.pageNumber}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // SUCCESS STATE (Green) - Header + Image + optional expandable search details
  // ==========================================================================
  if (isCleanSuccess && hasImage && verification) {
    return (
      <Activity mode={isVisible ? "visible" : "hidden"}>
        <div
          className={POPOVER_CONTAINER_BASE_CLASSES}
          style={{ width: POPOVER_WIDTH, maxWidth: POPOVER_MAX_WIDTH }}
        >
          {/* Source context header */}
          <SourceContextHeader
            citation={citation}
            verification={verification}
            status={searchStatus}
            sourceLabel={sourceLabel}
          />
          {/* Status header with anchorText - skip for URL citations since SourceContextHeader already shows status icon + URL */}
          {!isUrlCitation(citation) && (
            <StatusHeader
              status={searchStatus}
              foundPage={foundPage}
              expectedPage={expectedPage ?? undefined}
              hidePageBadge
              anchorText={anchorText}
            />
          )}

          {/* Verification image */}
          <div className="p-2">
            <AnchorTextFocusedImage
              verification={verification}
              onImageClick={onImageClick}
            />
          </div>

          {/* Expandable search details for verified matches */}
          {verification.searchAttempts &&
            verification.searchAttempts.length > 0 && (
              <VerificationLog
                searchAttempts={verification.searchAttempts}
                status={searchStatus}
                expectedPage={expectedPage ?? undefined}
                expectedLine={expectedLine}
                foundPage={foundPage}
                foundLine={foundLine}
                isExpanded={isPhrasesExpanded}
                onExpandChange={onPhrasesExpandChange}
                fullPhrase={fullPhrase ?? undefined}
                anchorText={anchorText}
              />
            )}
        </div>
      </Activity>
    );
  }

  // ==========================================================================
  // PARTIAL/DISPLACED STATE (Amber) or NOT FOUND (Red) - Full layout
  // ==========================================================================
  if (isMiss || isPartialMatch) {
    return (
      <Activity mode={isVisible ? "visible" : "hidden"}>
        <div
          className={POPOVER_CONTAINER_BASE_CLASSES}
          style={{ width: POPOVER_WIDTH, maxWidth: POPOVER_MAX_WIDTH }}
        >
          {/* Source context header */}
          <SourceContextHeader
            citation={citation}
            verification={verification}
            status={searchStatus}
            sourceLabel={sourceLabel}
          />
          {/* Content area: Image with simple header, OR combined status header with quote */}
          {hasImage && verification ? (
            // Show simple header + image (for partial matches that have images)
            <>
              {/* Status header - skip for URL citations since SourceContextHeader already shows status */}
              {!isUrlCitation(citation) && (
                <StatusHeader
                  status={searchStatus}
                  foundPage={foundPage}
                  expectedPage={expectedPage ?? undefined}
                  hidePageBadge
                  anchorText={anchorText}
                />
              )}
              {/* Humanizing message for partial matches with images */}
              {humanizingMessage && (
                <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border-b border-gray-100 dark:border-gray-800">
                  {humanizingMessage}
                </div>
              )}
              <div className="p-2">
                <AnchorTextFocusedImage
                  verification={verification}
                  onImageClick={onImageClick}
                />
              </div>
            </>
          ) : (
            // Combined header with anchor text and quote (for not_found or partial without image)
            // For URL citations, skip StatusHeader since SourceContextHeader already shows status
            <>
              {!isUrlCitation(citation) && (
                <StatusHeader
                  status={searchStatus}
                  foundPage={foundPage}
                  expectedPage={expectedPage ?? undefined}
                  anchorText={anchorText}
                  hidePageBadge
                />
              )}
              {/* Humanizing message provides additional context below the header */}
              {humanizingMessage && (
                <div className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                  {humanizingMessage}
                </div>
              )}
            </>
          )}

          {/* Verification log (collapsible) */}
          {showVerificationLog && verification?.searchAttempts && (
            <VerificationLog
              searchAttempts={verification.searchAttempts}
              status={searchStatus}
              expectedPage={expectedPage ?? undefined}
              expectedLine={expectedLine}
              foundPage={foundPage}
              foundLine={foundLine}
              isExpanded={isPhrasesExpanded}
              onExpandChange={onPhrasesExpandChange}
              fullPhrase={fullPhrase ?? undefined}
              anchorText={anchorText}
            />
          )}
        </div>
      </Activity>
    );
  }

  // ==========================================================================
  // FALLBACK: Text-only view (verified/partial match without image)
  // ==========================================================================
  const statusLabel = getStatusLabel(status);
  const hasSnippet = verification?.verifiedMatchSnippet;
  const pageNumber = verification?.verifiedPageNumber;

  if (!hasSnippet && !statusLabel) return null;

  return (
    <div className={`${POPOVER_CONTAINER_BASE_CLASSES} min-w-[180px] max-w-full`}>
      {/* Source context header */}
      <SourceContextHeader
        citation={citation}
        verification={verification}
        status={searchStatus}
        sourceLabel={sourceLabel}
      />
      <div className="p-3 flex flex-col gap-2">
        {statusLabel && (
          <span
            className={cn(
              "text-xs font-medium",
              status.isVerified &&
                !status.isPartialMatch &&
                "text-green-600 dark:text-green-400",
              status.isPartialMatch && "text-amber-500 dark:text-amber-400",
              status.isMiss && "text-red-500 dark:text-red-400",
              status.isPending && "text-gray-500 dark:text-gray-400"
            )}
          >
            {statusLabel}
          </span>
        )}
        {hasSnippet && (
          <span className="text-sm text-gray-700 dark:text-gray-200">
            "{verification.verifiedMatchSnippet}"
          </span>
        )}
        {pageNumber && pageNumber > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Page {pageNumber}
          </span>
        )}
      </div>
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
    citation.fullPhrase || citation.anchorText?.toString() || "";
  const actualText = verification?.verifiedMatchSnippet || "";

  // Use the diff library for smart word-level diffing
  const { hasDiff, similarity } = useSmartDiff(expectedText, actualText);

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
  const statusMessage = getContextualStatusMessage(
    searchStatus,
    expectedPage,
    actualPage
  );

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
            anchorTextExpected={citation.anchorText?.toString()}
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
        <div
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded inline-flex items-center gap-1",
            "bg-amber-100 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400"
          )}
        >
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
          anchorTextExpected={citation.anchorText?.toString()}
          anchorTextFound={verification?.verifiedAnchorText ?? undefined}
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
 * - **Hover**: Style effects only (no popover)
 * - **First Click**: Shows popover with verification image and details
 * - **Second Click**: Toggles search details expansion within the popover
 * - **Click Image**: Expands verification image to full-size overlay
 * - **Click Outside / Escape**: Closes the popover
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
      variant = "linter",
      content: contentProp,
      interactionMode: _interactionMode, // Deprecated, ignored
      eventHandlers,
      behaviorConfig,
      isMobile: isMobileProp,
      renderIndicator,
      renderContent,
      popoverPosition = "top",
      renderPopoverContent,
      additionalCount,
      faviconUrl,
      showIndicator = true,
      sourceLabel,
    },
    ref
  ) => {
    // Warn about deprecated interactionMode prop in development
    if (process.env.NODE_ENV !== "production" && _interactionMode !== undefined) {
      console.warn(
        "CitationComponent: interactionMode prop is deprecated and has no effect. " +
          "The component now always uses click-to-show-popover behavior."
      );
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
    const [expandedImageSrc, setExpandedImageSrc] = useState<string | null>(
      null
    );
    const [isPhrasesExpanded, setIsPhrasesExpanded] = useState(false);

    // Track if popover was already open before current interaction (for mobile/lazy mode).
    // Lifecycle:
    // 1. Set in handleTouchStart to capture isHovering state BEFORE the touch triggers any changes
    // 2. Read in handleTouchEnd/handleClick to determine if this is a "first tap" or "second tap"
    // 3. First tap (ref=false): Opens popover
    // 4. Second tap (ref=true): Toggles search details expansion
    const wasPopoverOpenBeforeTap = useRef(false);

    // Track last touch time for touch-to-click debouncing (prevents double-firing).
    // Note: This ref is per-component-instance, so debouncing is citation-specific.
    // Tapping Citation A then quickly tapping Citation B will NOT incorrectly debounce B,
    // because each CitationComponent instance has its own lastTouchTimeRef.
    const lastTouchTimeRef = useRef(0);

    // Ref to track isHovering for touch handlers (avoids stale closure issues).
    // This ref is kept in sync with isHovering state on every render, allowing
    // handleTouchStart to read the current value without being recreated on every
    // isHovering change (which would cause unnecessary callback churn).
    // Pattern explanation: Mutating refs during render is safe here because:
    // 1. Refs are explicitly designed to hold mutable values that don't affect rendering
    // 2. This is a standard React pattern for keeping refs in sync with state/props
    // 3. The mutation has no side effects - it just mirrors the state value
    // See: https://react.dev/reference/react/useRef#referencing-a-value-with-a-ref
    const isHoveringRef = useRef(isHovering);
    isHoveringRef.current = isHovering;

    // Ref for the popover content element (for mobile click-outside dismiss detection)
    const popoverContentRef = useRef<HTMLDivElement>(null);

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
      [ref]
    );

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
    const spinnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

    // Determine if we should show spinner:
    // - explicit isLoading prop OR isPending status
    // - BUT NOT if we have a verification image or definitive status
    // - AND NOT if spinner has timed out
    const hasDefinitiveResult =
      verification?.verificationImageBase64 ||
      verification?.status === "found" ||
      verification?.status === "found_anchor_text_only" ||
      verification?.status === "found_phrase_missed_anchor_text" ||
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

    // Shared tap/click action handler - used by both click and touch handlers.
    // Extracts the common logic to avoid duplication.
    //
    // Action types:
    // - "showPopover": Show the popover (first tap/click when popover is closed)
    // - "hidePopover": Hide the popover (for lazy mode toggle behavior)
    // - "toggleDetails": Toggle search details/phrases expansion within popover
    // - "expandImage": Open the full-size image overlay
    //
    // Dependency chain explanation:
    // - getBehaviorContext: Captures current state (citation, verification, isHovering, expandedImageSrc)
    //   and is itself a useCallback that updates when those values change
    // - applyBehaviorActions: Handles setExpandedImageSrc based on custom behavior results
    // - behaviorConfig/eventHandlers: User-provided callbacks that may change
    // - citation/citationKey: Core data passed to callbacks
    // - verification?.verificationImageBase64: Used for image expansion
    // - State setters (setIsHovering, etc.): Stable references included for exhaustive-deps
    const handleTapAction = useCallback(
      (
        e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
        action: "showPopover" | "hidePopover" | "toggleDetails" | "expandImage"
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
            setIsHovering(false);
            break;
          case "toggleDetails":
            setIsPhrasesExpanded((prev) => !prev);
            break;
          case "expandImage":
            if (verification?.verificationImageBase64) {
              setExpandedImageSrc(verification.verificationImageBase64);
            }
            break;
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
        // State setters are stable (React guarantees), but included for exhaustive-deps compliance
        setIsHovering,
        setExpandedImageSrc,
        setIsPhrasesExpanded,
      ]
    );

    // Click handler
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();

        // Ignore click events that occur shortly after touch events (prevents double-firing)
        if (
          isMobile &&
          Date.now() - lastTouchTimeRef.current < TOUCH_CLICK_DEBOUNCE_MS
        ) {
          return;
        }

        // On mobile: first tap shows popover, second tap toggles search details
        // wasPopoverOpenBeforeTap is set in handleTouchStart before the click fires
        if (isMobile) {
          if (!wasPopoverOpenBeforeTap.current) {
            handleTapAction(e, "showPopover");
          } else {
            handleTapAction(e, "toggleDetails");
          }
          return;
        }

        // Click toggles popover visibility, second click toggles search details
        if (!isHovering) {
          // First click: open popover
          handleTapAction(e, "showPopover");
        } else {
          // Popover is open: toggle search details
          handleTapAction(e, "toggleDetails");
        }
      },
      [isMobile, isHovering, handleTapAction]
    );

    // Keyboard handler for accessibility - Enter/Space triggers tap action
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();

          // Toggle popover, then toggle search details
          if (!isHovering) {
            handleTapAction(e, "showPopover");
          } else {
            handleTapAction(e, "toggleDetails");
          }
        }
      },
      [isHovering, handleTapAction]
    );

    // Hover handlers with delay for popover accessibility
    // Use a timeout to allow user to move mouse from trigger to popover
    const HOVER_CLOSE_DELAY_MS = 150;
    const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
      null
    );
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
      // Don't show popover on hover - only on click (lazy mode behavior)
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

    // Mobile click-outside dismiss handler
    //
    // On mobile, tapping outside the citation trigger or popover should dismiss the popover.
    // Desktop relies on mouse leave events (handleMouseLeave) which don't exist on mobile.
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
        setIsHovering(false);
      };

      // Use touchstart with capture phase to detect touches before they're handled
      // by other handlers (like handleTouchStart on the citation trigger itself)
      document.addEventListener("touchstart", handleOutsideTouch, {
        capture: true,
      });

      return () => {
        document.removeEventListener("touchstart", handleOutsideTouch, {
          capture: true,
        });
      };
    }, [isMobile, isHovering, setIsHovering]);

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
      [isMobile, eventHandlers, citation, citationKey]
    );

    // Touch handler for mobile - handles tap-to-show-popover and tap-to-toggle-details.
    // On second tap, toggles the search details expansion.
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
            handleTapAction(e, "toggleDetails");
          }
        }
      },
      [isMobile, eventHandlers, citation, citationKey, handleTapAction]
    );

    // Early return for miss with fallback display (only when showing anchorText)
    if (
      fallbackDisplay !== null &&
      fallbackDisplay !== undefined &&
      resolvedContent === "anchorText" &&
      isMiss
    ) {
      return (
        <span className={cn("text-gray-400 dark:text-gray-500", className)}>
          {fallbackDisplay}
        </span>
      );
    }

    // Status classes for text styling
    // Variants that display inline text (text, superscript, linter) need
    // a default text color that works in both light and dark modes
    const needsDefaultTextColor =
      variant === "text" || variant === "superscript" || variant === "linter";

    const statusClasses = cn(
      // Default text color for inline variants (ensures dark mode compatibility)
      needsDefaultTextColor &&
        !isMiss &&
        !shouldShowSpinner &&
        "text-gray-900 dark:text-gray-100",
      // Found status (text color) - verified or partial match, for brackets variant
      (isVerified || isPartialMatch) &&
        variant === "brackets" &&
        "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline",
      isMiss && "opacity-70 text-gray-700 dark:text-gray-200",
      shouldShowSpinner && "text-gray-500 dark:text-gray-400"
    );

    // Render indicator based on status priority:
    // 1. If showIndicator is false, return null (unless custom renderIndicator provided)
    // 2. Custom renderIndicator (if provided)
    // 3. shouldShowSpinner → Spinner (respects timeout and definitive results)
    // 4. Verified (not partial) → Green checkmark
    // 5. Partial match → Amber checkmark
    // 6. Miss → Warning triangle
    const renderStatusIndicator = () => {
      if (renderIndicator) return renderIndicator(status);
      if (!showIndicator) return null;
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
          isMergedDisplay: resolvedContent === "anchorText",
        });
      }

      // Content type: indicator only
      if (resolvedContent === "indicator") {
        return <span>{renderStatusIndicator()}</span>;
      }

      // Variant: chip (pill/badge style with neutral gray background)
      // Status is conveyed via the indicator icon color only
      // Hover styling is applied here (not on parent) to keep hover contained within chip bounds
      // Uses minimal padding (px-1.5 py-0) to fit seamlessly into text layouts without enlarging line height
      if (variant === "chip") {
        return (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[0.9em] font-normal transition-colors",
              // Neutral gray background - status shown via icon color only
              "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
              // Status-aware hover styling (contained within the chip)
              ...getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner)
            )}
          >
            <span
              className={cn(
                "max-w-60 overflow-hidden text-ellipsis whitespace-nowrap",
                // Miss state: reduce opacity only (no wavy underline for chip - indicator conveys status)
                isMiss && !shouldShowSpinner && "opacity-70"
              )}
            >
              {displayText}
            </span>
            {renderStatusIndicator()}
          </span>
        );
      }

      // Variant: superscript (footnote style)
      // Shows anchor text as unstyled inline text, followed by superscript [number✓]
      // Hover styling is applied to the superscript part only to keep hover contained
      // Note: No wavy underline for superscript - the indicator icon conveys status
      if (variant === "superscript") {
        // Get anchor text for inline display (unstyled)
        const anchorTextDisplay = citation.anchorText?.toString() || "";
        // Get citation number for superscript
        const citationNumber = citation.citationNumber?.toString() || "1";

        const supStatusClasses = cn(
          // Default text color for dark mode compatibility
          !shouldShowSpinner && "text-gray-700 dark:text-gray-200",
          // Pending state
          shouldShowSpinner && "text-gray-500 dark:text-gray-400"
        );
        return (
          <>
            {/* Anchor text displayed inline - font-normal prevents bold inheritance like other variants */}
            {anchorTextDisplay && (
              <span className="font-normal">
                {anchorTextDisplay}
              </span>
            )}
            {/* Superscript citation number with indicator - no wavy underline or opacity change */}
            <sup
              className={cn(
                "text-xs font-medium transition-colors inline-flex items-baseline px-0.5 rounded",
                supStatusClasses,
                // Status-aware hover styling (contained within the superscript)
                ...getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner)
              )}
            >
              [
              <span>
                {citationNumber}
              </span>
              {renderStatusIndicator()}]
            </sup>
          </>
        );
      }

      // Variant: text (inherits parent styling except font-weight to avoid inheriting bold)
      if (variant === "text") {
        return (
          <span className={cn("font-normal", statusClasses)}>
            {displayText}
            {renderStatusIndicator()}
          </span>
        );
      }

      // Variant: badge (ChatGPT-style source chip with favicon + count + status indicator)
      if (variant === "badge") {
        const faviconSrc = faviconUrl || citation.faviconUrl;
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium",
              "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
              "transition-colors cursor-pointer",
              // Status-aware hover styling (10% opacity for all states)
              isVerified &&
                !isPartialMatch &&
                !shouldShowSpinner &&
                "hover:bg-green-600/10 dark:hover:bg-green-500/10",
              isPartialMatch &&
                !shouldShowSpinner &&
                "hover:bg-amber-500/10 dark:hover:bg-amber-500/10",
              isMiss &&
                !shouldShowSpinner &&
                "hover:bg-red-500/10 dark:hover:bg-red-400/10",
              (shouldShowSpinner ||
                (!isVerified && !isMiss && !isPartialMatch)) &&
                "hover:bg-gray-200 dark:hover:bg-gray-700"
            )}
          >
            {faviconSrc && (
              <img
                src={faviconSrc}
                alt=""
                className="w-4 h-4 rounded-sm object-contain"
                loading="lazy"
                // Performance fix: use module-level handler to avoid re-render overhead
                onError={handleImageError}
              />
            )}
            <span
              className={cn(
                "max-w-40 overflow-hidden text-ellipsis whitespace-nowrap",
                // Miss state: add wavy underline for visual distinction (on text only, not indicator)
                isMiss && !shouldShowSpinner && "opacity-70"
              )}
              style={isMiss && !shouldShowSpinner ? MISS_WAVY_UNDERLINE_STYLE : undefined}
            >
              {displayText}
            </span>
            {additionalCount !== undefined && additionalCount > 0 && (
              <span className="text-gray-500 dark:text-gray-400">
                +{additionalCount}
              </span>
            )}
            {renderStatusIndicator()}
          </span>
        );
      }

      // Variant: linter (semantic underlines like grammar/spell-check tools)
      // Uses text-decoration-style to differentiate verification states:
      // - Verified: solid underline with subtle green background wash
      // - Partial: dashed underline (amber)
      // - Not Found: wavy underline (red) - familiar from spell-checkers
      // - Pending: dotted underline (gray)
      //
      // The linter variant respects showIndicator prop (default true).
      // When showIndicator is true, the status indicator appears after the text.
      // The underline style also conveys status visually for additional context.
      if (variant === "linter") {
        // Compute status states once to avoid repetition
        const isVerifiedState =
          isVerified && !isPartialMatch && !shouldShowSpinner;
        const isPartialState = isPartialMatch && !shouldShowSpinner;
        const isMissState = isMiss && !shouldShowSpinner;
        const isPendingState = shouldShowSpinner;

        // Build inline styles for text-decoration since Tailwind doesn't support all decoration styles
        // Using Tailwind color values to match the rest of the component:
        // - green-600: #16a34a (verified)
        // - amber-500: #f59e0b (partial - more yellow amber)
        // - red-500: #ef4444 (miss)
        // - gray-400: #9ca3af (pending)
        //
        // Font-size is inherited from parent to avoid layout shifts
        const linterStyles: React.CSSProperties = {
          textDecoration: "underline",
          textDecorationThickness: "2px",
          textUnderlineOffset: "3px",
          borderRadius: "2px",
          // Inherit font properties to avoid size changes
          fontSize: "inherit",
          fontFamily: "inherit",
          lineHeight: "inherit",
        };

        // Apply status-specific decoration styles
        if (isMissState) {
          linterStyles.textDecorationStyle = "wavy";
          linterStyles.textDecorationColor = "var(--dc-linter-error, #ef4444)"; // red-500
        } else if (isPartialState) {
          linterStyles.textDecorationStyle = "dashed";
          linterStyles.textDecorationColor =
            "var(--dc-linter-warning, #f59e0b)"; // amber-500
        } else if (isVerifiedState) {
          linterStyles.textDecorationStyle = "solid";
          linterStyles.textDecorationColor =
            "var(--dc-linter-success, #16a34a)"; // green-600
        } else {
          // Pending or unknown state
          linterStyles.textDecorationStyle = "dotted";
          linterStyles.textDecorationColor =
            "var(--dc-linter-pending, #9ca3af)"; // gray-400
        }

        const linterClasses = cn(
          "cursor-pointer font-normal",
          // Text color: let the underline convey status, keep text readable
          // Miss state uses same color as verified/partial - wavy red underline is the signal
          (isVerifiedState || isPartialState || isMissState) &&
            "text-gray-700 dark:text-gray-200",
          // Only pending is slightly muted
          isPendingState && "text-gray-500 dark:text-gray-400",
          // Verified: subtle green background wash on hover only (10% opacity)
          isVerifiedState && "hover:bg-green-600/10 dark:hover:bg-green-500/10",
          // Partial: subtle amber background on hover (using amber-500 to match component)
          isPartialState && "hover:bg-amber-500/10 dark:hover:bg-amber-500/10",
          // Miss: subtle red background on hover (using red-500 to match component)
          isMissState && "hover:bg-red-500/10 dark:hover:bg-red-400/10",
          // Pending: subtle gray background
          isPendingState &&
            "bg-gray-500/[0.05] hover:bg-gray-500/10 dark:bg-gray-400/[0.05] dark:hover:bg-gray-400/10"
        );

        return (
          <span className={linterClasses} style={linterStyles}>
            {displayText}
            {showIndicator && renderStatusIndicator()}
          </span>
        );
      }

      // Variant: brackets (default)
      return (
        <span
          className={cn(
            "inline-flex items-baseline gap-0.5 whitespace-nowrap",
            "font-mono font-normal text-xs leading-tight",
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
      // Has verification with image or snippet
      ((verification &&
        (verification.verificationImageBase64 ||
          verification.verifiedMatchSnippet)) ||
        // Loading/pending state
        shouldShowSpinner ||
        isPending ||
        isLoading ||
        // Miss state (show what was searched)
        isMiss);

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
    // All variants use status-aware hover colors (green/amber/red/gray)
    // Cursor is always pointer since click toggles popover/details
    const cursorClass = "cursor-pointer";

    // Generate unique popover ID for ARIA attributes
    const popoverId = `citation-popover-${citationInstanceId}`;

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
        ...(variantHasOwnHover
          ? []
          : getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner, 10)),
        // Focus styles for keyboard accessibility
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
        className
      ),
      // ARIA attributes for accessibility
      role: "button" as const,
      tabIndex: 0,
      "aria-expanded": isHovering,
      "aria-controls": shouldShowPopover ? popoverId : undefined,
      "aria-label": displayText ? `Citation: ${displayText}` : "Citation",
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
            isPhrasesExpanded={isPhrasesExpanded}
            onPhrasesExpandChange={setIsPhrasesExpanded}
            isVisible={isHovering}
            sourceLabel={sourceLabel}
            onImageClick={() => {
              if (verification?.verificationImageBase64) {
                setExpandedImageSrc(verification.verificationImageBase64);
              }
            }}
          />
        </CitationErrorBoundary>
      );

      // Pre-render the image content in hidden mode when we have an image
      // but the user isn't hovering yet. This uses React 19.2's Activity
      // component to prefetch and decode the image before it's needed.
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
              onImageClick={() => {}}
            />
          </CitationErrorBoundary>
        ) : null;

      return (
        <>
          {children}
          {/* Hidden prefetch layer - pre-renders image content using Activity */}
          {prefetchElement}
          <Popover open={isHovering}>
            <PopoverTrigger asChild>
              <span ref={setTriggerRef} {...triggerProps}>
                {renderCitationContent()}
              </span>
            </PopoverTrigger>
            <PopoverContent
              ref={popoverContentRef}
              id={popoverId}
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
        <span ref={setTriggerRef} {...triggerProps}>
          {renderCitationContent()}
        </span>
        {imageOverlay}
      </>
    );
  }
);

CitationComponent.displayName = "CitationComponent";

export const MemoizedCitationComponent = memo(CitationComponent);
