import React, { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ).Activity ?? (({ children }: { mode: "visible" | "hidden"; children: React.ReactNode }) => <>{children}</>);

import type { SourcePage } from "../types/boxes.js";
import type { CitationStatus } from "../types/citation.js";
import type { MatchedVariation, SearchAttempt, SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { useCitationOverlay } from "./CitationOverlayContext.js";
import {
  ANCHOR_HIGHLIGHT_STYLE,
  DOT_COLORS,
  DOT_INDICATOR_SIZE_STYLE,
  ERROR_COLOR_STYLE,
  getPortalContainer,
  INDICATOR_SIZE_STYLE,
  MIN_WORD_DIFFERENCE,
  MISS_WAVY_UNDERLINE_STYLE,
  PARTIAL_COLOR_STYLE,
  PENDING_COLOR_STYLE,
  POPOVER_CONTAINER_BASE_CLASSES,
  VERIFIED_COLOR_STYLE,
  Z_INDEX_IMAGE_OVERLAY_VAR,
  Z_INDEX_OVERLAY_DEFAULT,
} from "./constants.js";
import { CheckIcon, SpinnerIcon, WarningIcon, XIcon } from "./icons.js";
import { PopoverContent } from "./Popover.js";
import { Popover, PopoverTrigger } from "./PopoverPrimitives.js";
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
import { cn, generateCitationInstanceId, generateCitationKey, isUrlCitation } from "./utils.js";
import { QuotedText, SourceContextHeader, StatusHeader, VerificationLog } from "./VerificationLog.js";

// Re-export types for convenience
export type {
  CitationContent,
  CitationInteractionMode,
  CitationVariant,
  IndicatorVariant,
} from "./types.js";

/**
 * Module-level handler for hiding broken images.
 * Performance fix: avoids creating new function references on every render.
 */
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.display = "none";
};

/** Tracks which deprecation warnings have already been emitted (dev-mode only). */
const deprecationWarned = new Set<string>();

/** Auto-hide spinner after this duration if verification is still pending. */
const SPINNER_TIMEOUT_MS = 5000;

/** Delay in ms before closing popover on mouse leave (allows moving to popover content). */
const HOVER_CLOSE_DELAY_MS = 150;

/** Popover container width. Customizable via CSS custom property `--dc-popover-width`. */
const POPOVER_WIDTH = "var(--dc-popover-width, 384px)";

/** Popover container max width (viewport-relative, with safe margin to prevent scrollbar) */
const POPOVER_MAX_WIDTH = "calc(100vw - 32px)";

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
  const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
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

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/** Variants that handle their own hover styling (don't need parent hover) */
const VARIANTS_WITH_OWN_HOVER = new Set<CitationVariant>(["chip", "badge", "linter", "superscript"]);

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
  opacity: 10 | 15 = 15,
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
    isMiss && !shouldShowSpinner && `hover:bg-red-500${opacitySuffix} dark:hover:bg-red-400${opacitySuffix}`,
    (shouldShowSpinner || (!isVerified && !isMiss && !isPartialMatch)) && "hover:bg-gray-200 dark:hover:bg-gray-700",
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
  fallbackDisplay?: string | null,
): string {
  if (content === "indicator") {
    return "";
  }

  if (content === "anchorText") {
    const raw = citation.anchorText?.toString() || citation.citationNumber?.toString() || fallbackDisplay || "1";
    return stripBrackets(raw);
  }

  if (content === "source") {
    // Source content: show siteName or domain (URL citations only)
    if (isUrlCitation(citation)) {
      return citation.siteName || citation.domain || citation.anchorText?.toString() || "Source";
    }
    return citation.anchorText?.toString() || "Source";
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
  /**
   * Visual style for status indicators.
   * - `"icon"`: Checkmarks, spinner, X icons (default)
   * - `"dot"`: Subtle colored dots (like GitHub status dots / shadcn badge dots)
   * @default "icon"
   */
  indicatorVariant?: IndicatorVariant;
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
function getTrustLevel(matchedVariation?: MatchedVariation): "high" | "medium" | "low" {
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
function _getMethodLabel(method: string): string {
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
function _formatPageList(pages: number[]): string {
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
      ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
      rangeStart = sorted[i];
      rangeEnd = sorted[i];
    }
  }
  ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);

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
function _groupSearchAttempts(attempts: SearchAttempt[]): GroupedSearchAttempt[] {
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
        if (variation !== phrase && !group.variationsTried.includes(variation)) {
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
function getStatusFromVerification(verification: Verification | null | undefined): CitationStatus {
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
    verification.searchAttempts?.some(a => a.success && isLowTrustMatch(a.matchedVariation)) ?? false;

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
  const backdropRef = useRef<HTMLDivElement>(null);

  // Register this overlay as open globally (blocks hover on other citations)
  useEffect(() => {
    registerOverlay();
    return () => {
      // Delay unregister so click-outside handlers still see overlay as open
      // during the current event loop tick
      setTimeout(() => unregisterOverlay(), 0);
    };
  }, [registerOverlay, unregisterOverlay]);

  // Auto-focus the backdrop when the overlay opens for keyboard accessibility.
  // Uses rAF to ensure the portal has been painted before focusing.
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      backdropRef.current?.focus();
    });
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // SSR-safe: skip portal if document.body unavailable
  const portalContainer = getPortalContainer();
  if (!portalContainer) return null;

  return createPortal(
    <div
      ref={backdropRef}
      tabIndex={-1}
      className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in-0 duration-[50ms] outline-none"
      style={{ zIndex: `var(${Z_INDEX_IMAGE_OVERLAY_VAR}, ${Z_INDEX_OVERLAY_DEFAULT})` } as React.CSSProperties}
      onClick={e => {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }}
      onKeyDown={e => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Full size verification image"
    >
      <div className="relative max-w-[95vw] max-h-[95vh] cursor-zoom-out animate-in zoom-in-95 duration-[50ms]">
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[95vh] object-contain rounded-lg shadow-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          draggable={false}
          tabIndex={0}
          role="button"
          aria-label="Click to close full size image"
          onClick={e => {
            e.stopPropagation();
            onClose();
          }}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
        />
      </div>
    </div>,
    portalContainer,
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

/** Verified indicator - green checkmark for exact matches (subscript-positioned)
 * Vertical offset (top-[0.1em]) changed from 0.15em to better align with the larger 0.85em icon size.
 * Uses [text-decoration:none] to prevent inheriting line-through from parent.
 * Dynamic sizing via em units for font-proportional scaling.
 */
const VerifiedIndicator = () => (
  <span
    className="inline-flex relative ml-0.5 top-[0.1em] [text-decoration:none]"
    style={{ ...INDICATOR_SIZE_STYLE, ...VERIFIED_COLOR_STYLE }}
    data-dc-indicator="verified"
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
);

/** Partial match indicator - amber checkmark for partial/relocated matches (subscript-positioned)
 * Color customizable via `--dc-partial-color` CSS custom property.
 * Uses [text-decoration:none] to prevent inheriting line-through from parent.
 * Dynamic sizing via em units for font-proportional scaling.
 */
const PartialIndicator = () => (
  <span
    className="inline-flex relative ml-0.5 top-[0.1em] [text-decoration:none]"
    style={{ ...INDICATOR_SIZE_STYLE, ...PARTIAL_COLOR_STYLE }}
    data-dc-indicator="partial"
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
);

/** Pending indicator - spinner for loading state (subscript-positioned)
 * Color customizable via `--dc-pending-color` CSS custom property.
 * Uses [text-decoration:none] to prevent inheriting line-through from parent.
 * Dynamic sizing via em units for font-proportional scaling.
 */
const PendingIndicator = () => (
  <span
    className="inline-flex relative ml-1 top-[0.1em] animate-spin [text-decoration:none]"
    style={{ ...INDICATOR_SIZE_STYLE, ...PENDING_COLOR_STYLE }}
    data-dc-indicator="pending"
    aria-hidden="true"
  >
    <SpinnerIcon />
  </span>
);

/** Miss indicator - red X for not found (centered, not subscript)
 * Color customizable via `--dc-error-color` CSS custom property.
 * Uses simple XIcon for better visibility at all sizes.
 * The circle in XCircleIcon becomes hard to see at small font sizes.
 * Centered vertically (not subscript) to make the "not found" status more prominent.
 * aria-hidden="true" because parent component already conveys verification status.
 * Uses [text-decoration:none] to prevent inheriting line-through from parent.
 * Dynamic sizing via em units for font-proportional scaling.
 */
const MissIndicator = () => (
  <span
    className="inline-flex items-center ml-0.5 [text-decoration:none]"
    style={{ ...INDICATOR_SIZE_STYLE, ...ERROR_COLOR_STYLE }}
    data-dc-indicator="error"
    aria-hidden="true"
  >
    <XIcon />
  </span>
);

// =============================================================================
// DOT INDICATOR COMPONENT (subtle colored dot, like GitHub/shadcn status dots)
// =============================================================================
// Smaller than icon indicators (ml-0.5 vs ml-1) because the dots are roughly
// half the size and need less visual separation from adjacent text.
// DOT_COLORS is imported from ./constants.js for consistency across components.

/** Unified dot indicator — color + optional pulse animation. */
const DotIndicator = ({
  color,
  pulse = false,
  label,
}: {
  color: keyof typeof DOT_COLORS;
  pulse?: boolean;
  label: string;
}) => (
  <span
    className={cn(
      "inline-block ml-0.5 rounded-full [text-decoration:none] align-middle",
      DOT_COLORS[color],
      pulse && "animate-pulse",
    )}
    style={DOT_INDICATOR_SIZE_STYLE}
    data-dc-indicator={
      color === "red" ? "error" : color === "gray" ? "pending" : color === "amber" ? "partial" : "verified"
    }
    role="img"
    aria-label={label}
  />
);

const VerifiedDot = () => <DotIndicator color="green" label="Verified" />;
const PartialDot = () => <DotIndicator color="amber" label="Partial match" />;
const PendingDot = () => <DotIndicator color="gray" pulse label="Verifying" />;
const MissDot = () => <DotIndicator color="red" label="Not found" />;

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
  page?: SourcePage | null;
  /** Optional callback for "View page" button. Called with the page when clicked. */
  onViewPageClick?: (page: SourcePage) => void;
  maxWidth?: string;
  maxHeight?: string;
}) {
  // Show "View page" button only when we have page data with a source URL
  const showViewPageButton = page?.source && onViewPageClick;

  return (
    <div className="relative">
      {/* Image container - clickable to zoom, with hover overlay */}
      <div className="relative group">
        <button
          type="button"
          className="block relative w-full"
          style={{ cursor: "zoom-in" }}
          onClick={e => {
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
              src={verification.document?.verificationImageBase64 as string}
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
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none rounded-t-md" />
      </div>

      {/* Action bar - only shown when View page button is available */}
      {showViewPageButton && (
        <div className="flex items-center justify-end px-2 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-b-md border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onViewPageClick(page);
            }}
            className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
            aria-label="View full page"
          >
            <span>View page</span>
          </button>
        </div>
      )}
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
  foundPage?: number,
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
      return "We couldn't find this phrase in the document.";
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
// HIGHLIGHTED PHRASE DISPLAY
// =============================================================================

/**
 * Renders fullPhrase with the anchorText substring highlighted using the same
 * amber highlight style used in the API-side proof images.
 * Only highlights when fullPhrase has enough additional context beyond anchorText.
 * When isMiss is true, renders the phrase without highlighting (since the text wasn't found).
 */
function HighlightedPhrase({
  fullPhrase,
  anchorText,
  isMiss,
}: {
  fullPhrase: string;
  anchorText?: string;
  isMiss?: boolean;
}) {
  // Don't highlight when citation is "not found" - misleading to highlight text that wasn't found
  if (isMiss || !anchorText || !fullPhrase.includes(anchorText)) {
    return <span className="italic text-gray-600 dark:text-gray-300">&ldquo;{fullPhrase}&rdquo;</span>;
  }
  const wc = (s: string) => {
    const trimmed = s.trim();
    return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  };
  if (wc(fullPhrase) - wc(anchorText) < MIN_WORD_DIFFERENCE) {
    return <span className="italic text-gray-600 dark:text-gray-300">&ldquo;{fullPhrase}&rdquo;</span>;
  }
  const idx = fullPhrase.indexOf(anchorText);
  return (
    <span className="italic text-gray-600 dark:text-gray-300">
      &ldquo;{fullPhrase.slice(0, idx)}
      <span style={ANCHOR_HIGHLIGHT_STYLE}>{anchorText}</span>
      {fullPhrase.slice(idx + anchorText.length)}&rdquo;
    </span>
  );
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
  /**
   * Visual style for status indicators inside the popover.
   * @default "icon"
   */
  indicatorVariant?: "icon" | "dot";
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
  indicatorVariant = "icon",
}: PopoverContentProps) {
  const hasImage = verification?.document?.verificationImageBase64;
  const { isMiss, isPartialMatch, isPending, isVerified } = status;
  const searchStatus = verification?.status;

  // Determine if we should show the verification log (for non-success states)
  const showVerificationLog = isMiss || isPartialMatch;

  // Determine if this is a "clean" success (no log needed)
  const isCleanSuccess = isVerified && !isPartialMatch && !isMiss;

  // Get page/line info for the log (document citations only)
  const expectedPage = !isUrlCitation(citation) ? citation.pageNumber : undefined;
  const expectedLine = !isUrlCitation(citation) ? citation.lineIds?.[0] : undefined;
  const foundPage = verification?.document?.verifiedPageNumber ?? undefined;
  const foundLine = verification?.document?.verifiedLineIds?.[0];

  // Get humanizing message for partial/not-found states
  const anchorText = citation.anchorText?.toString();
  const fullPhrase = citation.fullPhrase;
  const humanizingMessage = useMemo(
    () => getHumanizingMessage(searchStatus, anchorText, expectedPage ?? undefined, foundPage),
    [searchStatus, anchorText, expectedPage, foundPage],
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
        <div className="p-2 flex flex-col gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
            <span className="inline-block relative top-[0.1em] mr-1.5 size-2 animate-spin">
              <SpinnerIcon />
            </span>
            Searching...
          </span>
          {searchingPhrase && (
            <p className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded font-mono text-[11px] break-words text-gray-700 dark:text-gray-300">
              "{searchingPhrase.length > 80 ? `${searchingPhrase.slice(0, 80)}…` : searchingPhrase}"
            </p>
          )}
          {!isUrlCitation(citation) && citation.pageNumber && citation.pageNumber > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Looking on p.{citation.pageNumber}</span>
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
        <div className={POPOVER_CONTAINER_BASE_CLASSES} style={{ width: POPOVER_WIDTH, maxWidth: POPOVER_MAX_WIDTH }}>
          {/* Source context header */}
          <SourceContextHeader
            citation={citation}
            verification={verification}
            status={searchStatus}
            sourceLabel={sourceLabel}
          />
          {/* Status header - skip for URL citations since SourceContextHeader already shows status icon + URL */}
          {!isUrlCitation(citation) && (
            <StatusHeader
              status={searchStatus}
              foundPage={foundPage}
              expectedPage={expectedPage ?? undefined}
              hidePageBadge
              anchorText={anchorText}
              indicatorVariant={indicatorVariant}
            />
          )}

          {/* Full phrase with highlighted anchor text */}
          {fullPhrase && (
            <div className="px-3 py-2 text-sm leading-relaxed border-b border-gray-100 dark:border-gray-800">
              <HighlightedPhrase fullPhrase={fullPhrase} anchorText={anchorText} isMiss={isMiss} />
            </div>
          )}

          {/* Verification image */}
          <div className="p-2">
            <AnchorTextFocusedImage verification={verification} onImageClick={onImageClick} />
          </div>

          {/* Expandable search details for verified matches */}
          {verification.searchAttempts && verification.searchAttempts.length > 0 && (
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
              verifiedAt={verification.verifiedAt}
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
        <div className={POPOVER_CONTAINER_BASE_CLASSES} style={{ width: POPOVER_WIDTH, maxWidth: POPOVER_MAX_WIDTH }}>
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
                  indicatorVariant={indicatorVariant}
                />
              )}
              {/* Humanizing message for partial matches with images */}
              {humanizingMessage && (
                <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border-b border-gray-100 dark:border-gray-800">
                  {humanizingMessage}
                </div>
              )}
              {/* Full phrase with highlighted anchor text */}
              {fullPhrase && (
                <div className="px-3 py-2 text-sm leading-relaxed border-b border-gray-100 dark:border-gray-800">
                  <HighlightedPhrase fullPhrase={fullPhrase} anchorText={anchorText} isMiss={isMiss} />
                </div>
              )}
              <div className="p-2">
                <AnchorTextFocusedImage verification={verification} onImageClick={onImageClick} />
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
                  indicatorVariant={indicatorVariant}
                />
              )}
              {/* Humanizing message provides additional context below the header */}
              {humanizingMessage && (
                <div className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{humanizingMessage}</div>
              )}
              {/* Full phrase with highlighted anchor text */}
              {fullPhrase && (
                <div className="px-3 py-2 text-sm leading-relaxed border-b border-gray-100 dark:border-gray-800">
                  <HighlightedPhrase fullPhrase={fullPhrase} anchorText={anchorText} isMiss={isMiss} />
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
              verifiedAt={verification.verifiedAt}
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
  const pageNumber = verification?.document?.verifiedPageNumber;

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
              status.isVerified && !status.isPartialMatch && "text-green-600 dark:text-green-400",
              status.isPartialMatch && "text-amber-500 dark:text-amber-400",
              status.isMiss && "text-red-500 dark:text-red-400",
              status.isPending && "text-gray-500 dark:text-gray-400",
            )}
          >
            {statusLabel}
          </span>
        )}
        {hasSnippet && (
          <QuotedText className="text-sm text-gray-700 dark:text-gray-200">
            {verification.verifiedMatchSnippet}
          </QuotedText>
        )}
        {pageNumber && pageNumber > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Page {pageNumber}</span>
        )}
      </div>
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
    const [expandedImageSrc, setExpandedImageSrc] = useState<string | null>(null);
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

    // Ref to track isAnyOverlayOpen for the mobile outside-touch effect (avoids stale closure).
    // When an image overlay is open, we don't want outside taps to close the popover.
    const isAnyOverlayOpenRef = useRef(isAnyOverlayOpen);
    isAnyOverlayOpenRef.current = isAnyOverlayOpen;

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
      [ref],
    );

    const citationKey = useMemo(() => generateCitationKey(citation), [citation]);
    const citationInstanceId = useMemo(() => generateCitationInstanceId(citationKey), [citationKey]);

    // Derive status from verification object
    const status = useMemo(() => getStatusFromVerification(verification), [verification]);
    const { isMiss, isPartialMatch, isVerified, isPending } = status;

    // Spinner timeout: auto-hide after SPINNER_TIMEOUT_MS if still pending
    const [spinnerTimedOut, setSpinnerTimedOut] = useState(false);
    const spinnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Determine if we should show spinner:
    // - explicit isLoading prop OR isPending status
    // - BUT NOT if we have a verification image or definitive status
    // - AND NOT if spinner has timed out
    const hasDefinitiveResult =
      verification?.document?.verificationImageBase64 ||
      verification?.status === "found" ||
      verification?.status === "found_anchor_text_only" ||
      verification?.status === "found_phrase_missed_anchor_text" ||
      verification?.status === "not_found" ||
      verification?.status === "partial_text_found" ||
      verification?.status === "found_on_other_page" ||
      verification?.status === "found_on_other_line" ||
      verification?.status === "first_word_found";

    const shouldShowSpinner = (isLoading || isPending) && !hasDefinitiveResult && !spinnerTimedOut;

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
        hasImage: !!verification?.document?.verificationImageBase64,
      }),
      [citation, citationKey, verification, isHovering, expandedImageSrc],
    );

    // Apply behavior actions from custom handler
    const applyBehaviorActions = useCallback(
      (actions: CitationBehaviorActions) => {
        if (actions.setImageExpanded !== undefined) {
          if (typeof actions.setImageExpanded === "string") {
            setExpandedImageSrc(actions.setImageExpanded);
          } else if (actions.setImageExpanded === true && verification?.document?.verificationImageBase64) {
            setExpandedImageSrc(verification.document.verificationImageBase64);
          } else if (actions.setImageExpanded === false) {
            setExpandedImageSrc(null);
          }
        }
      },
      [verification?.document?.verificationImageBase64],
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
        action: "showPopover" | "hidePopover" | "toggleDetails" | "expandImage",
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
            setIsPhrasesExpanded(prev => !prev);
            break;
          case "expandImage":
            if (verification?.document?.verificationImageBase64) {
              setExpandedImageSrc(verification.document.verificationImageBase64);
            }
            break;
        }
      },
      [
        behaviorConfig,
        eventHandlers,
        citation,
        citationKey,
        verification?.document?.verificationImageBase64,
        getBehaviorContext,
        applyBehaviorActions,
      ],
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
      [isMobile, isHovering, handleTapAction],
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
      [isHovering, handleTapAction],
    );

    // Hover handlers with delay for popover accessibility
    // Use a timeout to allow user to move mouse from trigger to popover
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
      // Don't close the popover if an image overlay is open - user expects to return to popover
      // after closing the zoomed image
      if (isAnyOverlayOpen) return;
      // Delay closing to allow mouse to move to popover
      cancelHoverCloseTimeout();
      hoverCloseTimeoutRef.current = setTimeout(() => {
        // Re-check overlay state at timeout execution time (via ref) to handle edge case where
        // user opens overlay during the delay period
        if (!isOverPopoverRef.current && !isAnyOverlayOpenRef.current) {
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
      isAnyOverlayOpen,
    ]);

    // Popover content hover handlers
    const handlePopoverMouseEnter = useCallback(() => {
      cancelHoverCloseTimeout();
      isOverPopoverRef.current = true;
    }, [cancelHoverCloseTimeout]);

    const handlePopoverMouseLeave = useCallback(() => {
      isOverPopoverRef.current = false;
      // Don't close the popover if an image overlay is open - user expects to return to popover
      // after closing the zoomed image
      if (isAnyOverlayOpen) return;
      // Delay closing to allow mouse to move back to trigger
      cancelHoverCloseTimeout();
      hoverCloseTimeoutRef.current = setTimeout(() => {
        // Re-check overlay state at timeout execution time (via ref) to handle edge case where
        // user opens overlay during the delay period
        if (!isAnyOverlayOpenRef.current) {
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
      isAnyOverlayOpen,
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
    }, [isMobile, isHovering]);

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
      [isMobile, eventHandlers, citation, citationKey, handleTapAction],
    );

    // Early return for miss with fallback display (only when showing anchorText)
    if (fallbackDisplay !== null && fallbackDisplay !== undefined && resolvedContent === "anchorText" && isMiss) {
      return <span className={cn("text-gray-400 dark:text-gray-500", className)}>{fallbackDisplay}</span>;
    }

    // Status classes for text styling
    // Variants that display inline text (text, superscript, linter) need
    // a default text color that works in both light and dark modes
    const needsDefaultTextColor = variant === "text" || variant === "superscript" || variant === "linter";

    const statusClasses = cn(
      // Default text color for inline variants (ensures dark mode compatibility)
      needsDefaultTextColor && !isMiss && !shouldShowSpinner && "text-gray-900 dark:text-gray-100",
      // Found status (text color) - verified or partial match, for brackets variant
      (isVerified || isPartialMatch) &&
        variant === "brackets" &&
        "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline",
      isMiss && "opacity-70 text-gray-700 dark:text-gray-200",
      shouldShowSpinner && "text-gray-500 dark:text-gray-400",
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

      if (indicatorVariant === "dot") {
        if (shouldShowSpinner) return <PendingDot />;
        if (isVerified && !isPartialMatch) return <VerifiedDot />;
        if (isPartialMatch) return <PartialDot />;
        if (isMiss) return <MissDot />;
        return null;
      }

      // Default: icon variant
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
              ...getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner),
            )}
          >
            <span
              className={cn(
                "max-w-60 overflow-hidden text-ellipsis whitespace-nowrap",
                // Miss state: reduce opacity only (no wavy underline for chip - indicator conveys status)
                isMiss && !shouldShowSpinner && "opacity-70",
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
          shouldShowSpinner && "text-gray-500 dark:text-gray-400",
        );
        return (
          <>
            {/* Anchor text displayed inline - font-normal prevents bold inheritance like other variants */}
            {anchorTextDisplay && <span className="font-normal">{anchorTextDisplay}</span>}
            {/* Superscript citation number with indicator - no wavy underline or opacity change */}
            <sup
              className={cn(
                "text-xs font-medium transition-colors inline-flex items-baseline px-0.5 rounded",
                supStatusClasses,
                // Status-aware hover styling (contained within the superscript)
                ...getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner),
              )}
            >
              [<span>{citationNumber}</span>
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
        const faviconSrc = faviconUrl || (isUrlCitation(citation) ? citation.faviconUrl : undefined);
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium",
              "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
              "transition-colors cursor-pointer",
              // Status-aware hover styling (10% opacity for all states)
              isVerified && !isPartialMatch && !shouldShowSpinner && "hover:bg-green-600/10 dark:hover:bg-green-500/10",
              isPartialMatch && !shouldShowSpinner && "hover:bg-amber-500/10 dark:hover:bg-amber-500/10",
              isMiss && !shouldShowSpinner && "hover:bg-red-500/10 dark:hover:bg-red-400/10",
              (shouldShowSpinner || (!isVerified && !isMiss && !isPartialMatch)) &&
                "hover:bg-gray-200 dark:hover:bg-gray-700",
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
                isMiss && !shouldShowSpinner && "opacity-70",
              )}
              style={isMiss && !shouldShowSpinner ? MISS_WAVY_UNDERLINE_STYLE : undefined}
            >
              {displayText}
            </span>
            {additionalCount !== undefined && additionalCount > 0 && (
              <span className="text-gray-500 dark:text-gray-400">+{additionalCount}</span>
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
        const isVerifiedState = isVerified && !isPartialMatch && !shouldShowSpinner;
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
          linterStyles.textDecorationColor = "var(--dc-linter-warning, #f59e0b)"; // amber-500
        } else if (isVerifiedState) {
          linterStyles.textDecorationStyle = "solid";
          linterStyles.textDecorationColor = "var(--dc-linter-success, #16a34a)"; // green-600
        } else {
          // Pending or unknown state
          linterStyles.textDecorationStyle = "dotted";
          linterStyles.textDecorationColor = "var(--dc-linter-pending, #9ca3af)"; // gray-400
        }

        const linterClasses = cn(
          "cursor-pointer font-normal",
          // Text color: let the underline convey status, keep text readable
          // Miss state uses same color as verified/partial - wavy red underline is the signal
          (isVerifiedState || isPartialState || isMissState) && "text-gray-700 dark:text-gray-200",
          // Only pending is slightly muted
          isPendingState && "text-gray-500 dark:text-gray-400",
          // Verified: subtle green background wash on hover only (10% opacity)
          isVerifiedState && "hover:bg-green-600/10 dark:hover:bg-green-500/10",
          // Partial: subtle amber background on hover (using amber-500 to match component)
          isPartialState && "hover:bg-amber-500/10 dark:hover:bg-amber-500/10",
          // Miss: subtle red background on hover (using red-500 to match component)
          isMissState && "hover:bg-red-500/10 dark:hover:bg-red-400/10",
          // Pending: subtle gray background
          isPendingState && "bg-gray-500/[0.05] hover:bg-gray-500/10 dark:bg-gray-400/[0.05] dark:hover:bg-gray-400/10",
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
            "transition-colors",
          )}
          aria-hidden="true"
        >
          [
          <span className={cn("max-w-80 overflow-hidden text-ellipsis", statusClasses)}>
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
      ((verification && (verification.document?.verificationImageBase64 || verification.verifiedMatchSnippet)) ||
        // Loading/pending state
        shouldShowSpinner ||
        isPending ||
        isLoading ||
        // Miss state (show what was searched)
        isMiss);

    const hasImage = !!verification?.document?.verificationImageBase64;

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
            indicatorVariant={indicatorVariant}
            onImageClick={() => {
              if (verification?.document?.verificationImageBase64) {
                setExpandedImageSrc(verification.document.verificationImageBase64);
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
              indicatorVariant={indicatorVariant}
              onImageClick={() => {}}
            />
          </CitationErrorBoundary>
        ) : null;

      return (
        <>
          {children}
          {/* Visually hidden live region for screen reader status announcements */}
          {statusDescription && (
            <span id={statusDescId} className="sr-only" aria-live="polite">
              {statusDescription}
            </span>
          )}
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
        {/* Visually hidden live region for screen reader status announcements */}
        {statusDescription && (
          <span id={statusDescId} className="sr-only" aria-live="polite">
            {statusDescription}
          </span>
        )}
        <span ref={setTriggerRef} {...triggerProps}>
          {renderCitationContent()}
        </span>
        {imageOverlay}
      </>
    );
  },
);

CitationComponent.displayName = "CitationComponent";

export const MemoizedCitationComponent = memo(CitationComponent);
