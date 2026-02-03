import React, { useState, useMemo } from "react";
import type { SearchAttempt, SearchStatus, SearchMethod, VariationType } from "../types/search.js";
import type { Citation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { CheckIcon, MissIcon, SpinnerIcon, DocumentIcon, GlobeIcon, XCircleIcon } from "./icons.js";
import { cn, isUrlCitation } from "./utils.js";
import type { UrlFetchStatus } from "./types.js";
import { UrlCitationComponent } from "./UrlCitationComponent.js";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum length for matched text display before truncation */
const MAX_MATCHED_TEXT_LENGTH = 40;

/** Maximum length for quote box phrase display */
const MAX_QUOTE_BOX_LENGTH = 150;

/** Maximum length for anchor text preview in headers */
const MAX_ANCHOR_TEXT_PREVIEW_LENGTH = 50;

/** Maximum height for the scrollable timeline */
const MAX_TIMELINE_HEIGHT = "200px";

/** Maximum length for phrase display in search attempt rows */
const MAX_PHRASE_DISPLAY_LENGTH = 60;

/** Maximum length for URL display in popover header */
const MAX_URL_DISPLAY_LENGTH = 35;

/** Icon color classes by status - defined outside component to avoid recreation on every render */
const ICON_COLOR_CLASSES = {
  green: "text-green-600 dark:text-green-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-red-500 dark:text-red-400",
  gray: "text-gray-400 dark:text-gray-500",
} as const;

/** User-friendly method names for display (Issue #10: simplified from technical jargon) */
const METHOD_DISPLAY_NAMES: Record<SearchMethod, string> = {
  exact_line_match: "Exact location",
  line_with_buffer: "Nearby lines",
  current_page: "Expected page",
  anchor_text_fallback: "Anchor text",
  adjacent_pages: "Nearby pages",
  expanded_window: "Wider area",
  regex_search: "Entire document",
  first_word_fallback: "First word",
  keyspan_fallback: "Anchor text",
};

/**
 * User-friendly labels for variation types shown in search attempts.
 * Maps technical variation type keys to human-readable labels.
 * @example getVariationLabel("currency") -> "Price formats"
 */
const VARIATION_TYPE_LABELS: Record<VariationType, string> = {
  exact: "Exact match",
  normalized: "Normalized",
  currency: "Price formats",
  date: "Date formats",
  numeric: "Number formats",
  symbol: "Symbol variants",
  accent: "Accent variants",
};

/**
 * Get the user-friendly label for a variation type.
 * Returns null for undefined types (caller should fall back to "Also tried").
 */
export function getVariationLabel(variationType: VariationType | undefined): string | null {
  if (!variationType) return null;
  return VARIATION_TYPE_LABELS[variationType];
}

// =============================================================================
// SOURCE CONTEXT HEADER COMPONENT
// =============================================================================

export interface SourceContextHeaderProps {
  /** The citation being displayed */
  citation: Citation;
  /** Verification data (optional, provides favicon for URL citations) */
  verification?: Verification | null;
  /** Search status (used to derive URL fetch status for URL citations) */
  status?: SearchStatus | null;
  /**
   * Override label for the source display.
   *
   * For document citations, this overrides the filename/label shown
   * (e.g., "Annual Report 2024" instead of "document.pdf").
   *
   * For URL citations, this overrides the URL display text
   * (e.g., "Company Blog" instead of "example.com/blog/post").
   */
  sourceLabel?: string;
}

/** Maximum length for display name truncation in source headers */
const MAX_SOURCE_DISPLAY_NAME_LENGTH = 60;

/** Maximum length for anchor text display in miss headers */
const MAX_MISS_ANCHOR_TEXT_LENGTH = 60;

/**
 * Maps document verification SearchStatus to UrlFetchStatus for display in UrlCitationComponent.
 */
function mapSearchStatusToUrlFetchStatus(status: SearchStatus | null | undefined): UrlFetchStatus {
  if (!status) return "pending";
  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return "verified";
    case "found_on_other_page":
    case "found_on_other_line":
    case "partial_text_found":
    case "first_word_found":
      return "partial";
    case "not_found":
      return "error_not_found";
    case "loading":
    case "pending":
    case "timestamp_wip":
    case "skipped":
      return "pending";
    default: {
      // Exhaustiveness check: TypeScript will error if a new SearchStatus value is added
      // but not handled above. The 'never' type ensures all cases are covered.
      const _exhaustiveCheck: never = status;
      return _exhaustiveCheck;
    }
  }
}

/**
 * FaviconImage subcomponent with fallback handling.
 * Shows favicon from verification or citation, with Google Favicon fallback,
 * and falls back to GlobeIcon on error.
 *
 * Privacy Note: When no favicon URL is provided, this component uses
 * Google's Favicon Service (google.com/s2/favicons) as a fallback.
 * This makes an external request to Google with the domain being cited,
 * which may have privacy implications for sensitive use cases.
 */
export function FaviconImage({
  faviconUrl,
  domain,
  alt,
}: {
  faviconUrl: string | null | undefined;
  domain: string | null | undefined;
  alt: string;
}) {
  const [hasError, setHasError] = useState(false);

  // Build fallback chain for favicon URL (simple computation, no useMemo needed)
  // Privacy: Google Favicon Service is used as fallback, which sends domain to Google
  let effectiveFaviconUrl: string | null = null;
  if (faviconUrl) {
    effectiveFaviconUrl = faviconUrl;
  } else if (domain) {
    effectiveFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
  }

  // Show GlobeIcon if no URL or if image failed to load
  if (!effectiveFaviconUrl || hasError) {
    return (
      <span className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-500">
        <GlobeIcon />
      </span>
    );
  }

  return (
    <img
      src={effectiveFaviconUrl}
      alt={alt?.trim() || "Source"}
      className="w-4 h-4 flex-shrink-0 rounded-sm"
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
}

/**
 * SourceContextHeader displays source information (favicon + source info) for citations.
 * Shown at the top of popovers to give auditors immediate visibility into citation sources.
 *
 * For URL citations: Shows status icon + UrlCitationComponent badge + page/line info (all in one row)
 * For Document citations: Shows document icon + label/attachmentId + page/line info
 *
 * The `sourceLabel` prop allows overriding the displayed source name for both types.
 */
export function SourceContextHeader({ citation, verification, status, sourceLabel }: SourceContextHeaderProps) {
  const isUrl = isUrlCitation(citation);

  if (isUrl) {
    // URL citation: show favicon + URL on first row, status + phrase on second row
    const faviconUrl = verification?.verifiedFaviconUrl || citation.faviconUrl;
    const domain = verification?.verifiedDomain || citation.domain;
    const url = citation.url || "";
    const pageNumber = verification?.verifiedPageNumber ?? citation.pageNumber;
    const lineIds = verification?.verifiedLineIds ?? citation.lineIds;

    // Map the search status to URL fetch status for display
    const urlFetchStatus = mapSearchStatusToUrlFetchStatus(status);

    // Get status color and icon
    const colorScheme = getStatusColorScheme(status);
    const IconComponent =
      colorScheme === "green"
        ? CheckIcon
        : colorScheme === "amber"
          ? CheckIcon
          : colorScheme === "red"
            ? XCircleIcon
            : SpinnerIcon;

    // Format page/line text
    const pageLineText = formatPageLineText(pageNumber, lineIds);

    // Get the anchor text to display (found text or searched-for text)
    const anchorText = verification?.verifiedAnchorText || citation.anchorText;
    const displayAnchorText = anchorText
      ? (anchorText.length > MAX_MISS_ANCHOR_TEXT_LENGTH
          ? anchorText.slice(0, MAX_MISS_ANCHOR_TEXT_LENGTH) + "..."
          : anchorText)
      : null;

    // Determine if we need to show the second line (status + phrase)
    // Show for all resolved states, or if status indicates a miss
    const isMiss = status === "not_found";
    const isResolved = status && status !== "pending" && status !== "loading";
    const showSecondLine = isResolved || isMiss;

    return (
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
        {/* First row: URL citation (no border variant for header) */}
        <div className="flex items-center gap-2">
          {/* URL citation component - inline chip style without border */}
          <div className="flex-1 min-w-0">
            <UrlCitationComponent
              urlMeta={{
                url,
                domain,
                // When sourceLabel is provided, use it as the title override for display
                title: sourceLabel,
                faviconUrl,
                fetchStatus: urlFetchStatus,
              }}
              variant="chip"
              maxDisplayLength={MAX_URL_DISPLAY_LENGTH}
              preventTooltips={true}
              showStatusIndicator={false}
              // When sourceLabel is provided, prefer showing the title (custom label)
              showTitle={!!sourceLabel}
              className="!bg-transparent !px-0 !py-0 hover:!bg-transparent"
            />
          </div>
          {/* Page/line info */}
          {pageLineText && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0 uppercase tracking-wide">
              {pageLineText}
            </span>
          )}
        </div>
        {/* Second row: Status icon + phrase (like document citations) */}
        {showSecondLine && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className={cn("size-4 max-w-4 max-h-4 flex-shrink-0", ICON_COLOR_CLASSES[colorScheme])}>
              <IconComponent />
            </span>
            {displayAnchorText && (
              <span className="text-sm text-gray-700 dark:text-gray-200 truncate">
                "{displayAnchorText}"
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Document citation: show document icon + label + page/line info (right-aligned)
  // Note: attachmentId should never be shown to users - only show the label if available
  // sourceLabel takes precedence over verification.label
  const label = sourceLabel || verification?.label;
  const pageNumber = verification?.verifiedPageNumber ?? citation.pageNumber;
  const lineIds = verification?.verifiedLineIds ?? citation.lineIds;

  // Display text: only use label (never show attachmentId to users)
  const displayName = label || null;

  // Only show if we have something meaningful to display
  if (!displayName && !pageNumber) {
    return null;
  }

  // Format page/line text
  const pageLineText = formatPageLineText(pageNumber, lineIds);

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-500">
          <DocumentIcon />
        </span>
        {displayName && (
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate max-w-[280px]">{displayName}</span>
        )}
      </div>
      {pageLineText && (
        <span className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0 uppercase tracking-wide">
          {pageLineText}
        </span>
      )}
    </div>
  );
}

/**
 * Formats page and line info for display in headers.
 * Returns "Pg X" or "Pg X, Ln Y" or null if no info available.
 *
 * Note: Line numbers are intentionally not shown by default since document
 * columns can cause sync issues with expected line IDs. Line numbers are
 * only useful when there's a difference from expected.
 */
function formatPageLineText(
  pageNumber: number | null | undefined,
  _lineIds: number[] | null | undefined,
): string | null {
  if (!pageNumber || pageNumber <= 0) return null;
  // Don't show line numbers in the header - they can be unreliable due to column layouts
  // Line differences are shown separately in the verification log when relevant
  return `Pg ${pageNumber}`;
}

// =============================================================================
// TYPES
// =============================================================================

/** Ambiguity information for when text appears multiple times */
export interface AmbiguityInfo {
  /** Total number of occurrences found in the document */
  totalOccurrences: number;
  /** Number of occurrences on the expected page */
  occurrencesOnExpectedPage: number;
  /** Confidence level in the matched occurrence */
  confidence: "high" | "medium" | "low";
  /** Human-readable note about the ambiguity */
  note: string;
}

export interface VerificationLogProps {
  /** Array of search attempts from verification */
  searchAttempts: SearchAttempt[];
  /** Overall verification status */
  status?: SearchStatus | null;
  /** Expected page number from citation */
  expectedPage?: number;
  /** Expected line number from citation */
  expectedLine?: number;
  /** Page where match was found */
  foundPage?: number;
  /** Line where match was found */
  foundLine?: number;
  /** Whether the log is expanded (controlled) */
  isExpanded?: boolean;
  /** Callback when expansion state changes */
  onExpandChange?: (expanded: boolean) => void;
  /** Full phrase from citation (for audit display) */
  fullPhrase?: string;
  /** Anchor text from citation (for audit display) */
  anchorText?: string;
  /** Ambiguity information when multiple occurrences exist */
  ambiguity?: AmbiguityInfo | null;
}

export interface StatusHeaderProps {
  /** Verification status */
  status?: SearchStatus | null;
  /** Page where match was found */
  foundPage?: number;
  /** Expected page from citation */
  expectedPage?: number;
  /** Whether this is a compact header (for success states) */
  compact?: boolean;
  /** Anchor text to display inline when status text is empty */
  anchorText?: string;
  /** Whether to hide the page badge (to avoid duplication when SourceContextHeader shows it) */
  hidePageBadge?: boolean;
}

export interface QuoteBoxProps {
  /** The phrase to display */
  phrase: string;
  /** Maximum length before truncation */
  maxLength?: number;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get the color scheme based on status.
 */
function getStatusColorScheme(status?: SearchStatus | null): "green" | "amber" | "red" | "gray" {
  if (!status) return "gray";

  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return "green";
    case "found_on_other_page":
    case "found_on_other_line":
    case "partial_text_found":
    case "first_word_found":
      return "amber";
    case "not_found":
      return "red";
    case "pending":
    case "loading":
    default:
      return "gray";
  }
}

/**
 * Get the header text based on status.
 * Issue #3: Made more concise - anchor text will be integrated separately.
 * Note: For "found" states, we return empty string since the icon is self-explanatory.
 * The status text is only useful for states that need clarification (location differences, partial matches).
 */
function getStatusHeaderText(status?: SearchStatus | null): string {
  if (!status) return "Verifying...";

  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      // Icon (checkmark) is self-explanatory - no text needed
      return "";
    case "found_on_other_page":
      return "Found on different page";
    case "found_on_other_line":
      return "Found on different line";
    case "partial_text_found":
    case "first_word_found":
      return "Partial match";
    case "not_found":
      // Icon (X) is self-explanatory - no text needed
      return "";
    case "pending":
    case "loading":
      return "Verifying...";
    default:
      return "";
  }
}

/**
 * Get human-readable method name.
 */
function getMethodDisplayName(method: SearchMethod): string {
  return METHOD_DISPLAY_NAMES[method] || method;
}

/**
 * Format a scope badge string from search attempt.
 */
function formatScopeBadge(attempt: SearchAttempt): string {
  const page = attempt.pageSearched;
  const line = attempt.lineSearched;
  const scope = attempt.searchScope;

  if (scope === "document") return "Entire Doc";

  if (page != null) {
    if (line != null) {
      const lineStr = Array.isArray(line) ? line.join("-") : line.toString();
      return `Pg ${page} : Line ${lineStr}`;
    }
    return `Pg ${page} : All Lines`;
  }

  return "Unknown";
}

/**
 * Get result text for a search attempt.
 */
function getAttemptResultText(attempt: SearchAttempt): string {
  if (attempt.success) {
    if (attempt.matchedText) {
      const truncated =
        attempt.matchedText.length > MAX_MATCHED_TEXT_LENGTH
          ? attempt.matchedText.slice(0, MAX_MATCHED_TEXT_LENGTH) + "..."
          : attempt.matchedText;
      return `Found: "${truncated}"`;
    }
    return "Match found";
  }

  // Failed attempt
  if (attempt.note) return attempt.note;

  return "Text does not match";
}

/**
 * Get deemphasized detail text for GitHub CI/CD style display.
 * Shows location info in a clean, subtle format.
 */
function getAttemptDetailText(attempt: SearchAttempt): string {
  const page = attempt.pageSearched;
  const line = attempt.lineSearched;
  const scope = attempt.searchScope;

  // For successful matches, show where it was found
  if (attempt.success) {
    if (attempt.foundLocation) {
      const { page: foundPage, line: foundLine } = attempt.foundLocation;
      if (foundLine != null) {
        return `Found on Pg ${foundPage}, Line ${foundLine}`;
      }
      return `Found on Pg ${foundPage}`;
    }
    if (page != null) {
      if (line != null) {
        const lineStr = Array.isArray(line) ? `${line[0]}-${line[line.length - 1]}` : line.toString();
        return `Pg ${page}, Line ${lineStr}`;
      }
      return `Pg ${page}`;
    }
  }

  // For failed searches, show where we searched
  if (scope === "document") return "Full document search";

  if (page != null) {
    if (line != null) {
      const lineStr = Array.isArray(line) ? `Lines ${line[0]}-${line[line.length - 1]}` : `Line ${line}`;
      return `Pg ${page}, ${lineStr}`;
    }
    return `Pg ${page}, all lines`;
  }

  return "";
}

// =============================================================================
// PAGE BADGE COMPONENT
// =============================================================================

interface PageBadgeProps {
  /** Expected page from citation */
  expectedPage?: number;
  /** Page where match was found */
  foundPage?: number;
}

/**
 * Displays page location information.
 * Shows arrow format (Pg 5 → 7) when location differs from expected.
 *
 * Note: Pages are 1-indexed for user display. Page 0 is treated as invalid/unset
 * since documents start at "Page 1" in user-facing contexts.
 */
function PageBadge({ expectedPage, foundPage }: PageBadgeProps) {
  // Pages are 1-indexed for display; page 0 indicates unset/invalid
  const hasExpected = expectedPage != null && expectedPage > 0;
  const hasFound = foundPage != null && foundPage > 0;
  const locationDiffers = hasExpected && hasFound && expectedPage !== foundPage;

  // Show arrow format when location differs (Issue #8: Pg 5 → 7)
  if (locationDiffers) {
    return (
      <span className="text-xs font-mono text-gray-500 dark:text-gray-400 flex items-center gap-1">
        <span className="text-gray-400 dark:text-gray-500">Pg {expectedPage}</span>
        <span className="text-gray-400 dark:text-gray-500">→</span>
        <span className="text-gray-700 dark:text-gray-300">{foundPage}</span>
      </span>
    );
  }

  // Show found page or expected page
  const pageToShow = hasFound ? foundPage : expectedPage;
  if (pageToShow != null && pageToShow > 0) {
    return <span className="text-xs font-mono text-gray-500 dark:text-gray-400">Pg {pageToShow}</span>;
  }

  return null;
}

// =============================================================================
// AMBIGUITY WARNING COMPONENT
// =============================================================================

interface AmbiguityWarningProps {
  ambiguity: AmbiguityInfo;
}

/**
 * Warning banner shown when text appears multiple times in the document.
 * Helps auditors understand potential matching ambiguity.
 */
export function AmbiguityWarning({ ambiguity }: AmbiguityWarningProps) {
  if (ambiguity.totalOccurrences <= 1) return null;

  // Truncate very long notes at word boundary to prevent layout issues
  let displayNote = ambiguity.note;
  if (displayNote && displayNote.length > 200) {
    const truncated = displayNote.slice(0, 200);
    const lastSpace = truncated.lastIndexOf(" ");
    displayNote = (lastSpace > 150 ? truncated.slice(0, lastSpace) : truncated) + "...";
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800"
    >
      <div className="flex items-start gap-2">
        <svg
          className="size-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          role="img"
          aria-label="Warning"
        >
          <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-xs text-amber-800 dark:text-amber-200">
          <span className="font-medium">Found {ambiguity.totalOccurrences.toLocaleString()} occurrences</span>
          {ambiguity.occurrencesOnExpectedPage > 0 && (
            <span className="text-amber-700 dark:text-amber-300">
              {" "}
              ({ambiguity.occurrencesOnExpectedPage.toLocaleString()} on expected page)
            </span>
          )}
          {displayNote && <p className="mt-0.5 text-amber-700 dark:text-amber-300 max-w-prose">{displayNote}</p>}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// STATUS HEADER COMPONENT
// =============================================================================

/**
 * Header bar showing verification status with icon and text.
 *
 * shadcn HoverCard style:
 * - Clean white/dark background (no colored header backgrounds)
 * - Colored icon only indicates status
 * - Subtle ring border for elevation
 * - Page badge is only shown if hidePageBadge is false (to avoid duplication with SourceContextHeader)
 */
export function StatusHeader({
  status,
  foundPage,
  expectedPage,
  compact = false,
  anchorText,
  hidePageBadge = false,
}: StatusHeaderProps) {
  const colorScheme = getStatusColorScheme(status);
  const headerText = getStatusHeaderText(status);

  // Select appropriate icon based on status
  // - Green (verified): CheckIcon
  // - Amber (partial): CheckIcon (de-emphasized, not aggressive warning)
  // - Red (not found): XCircleIcon (X in circle for clear "not found" indication)
  // - Gray (pending): SpinnerIcon (not aggressive warning)
  const IconComponent =
    colorScheme === "green"
      ? CheckIcon
      : colorScheme === "amber"
        ? CheckIcon
        : colorScheme === "red"
          ? XCircleIcon
          : SpinnerIcon;

  // Consistent single-row layout: icon + text + page badge
  // Display priority: headerText (status description) > anchorText (quoted phrase)
  const displayText = headerText || (anchorText ? `"${anchorText}"` : null);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 text-sm",
        compact ? "px-3 py-2" : "px-4 py-2.5",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("size-4 max-w-4 max-h-4 flex-shrink-0", ICON_COLOR_CLASSES[colorScheme])}>
          <IconComponent />
        </span>
        {displayText && (
          <span
            className={cn(
              "font-medium truncate",
              headerText ? "text-gray-800 dark:text-gray-100" : "text-gray-600 dark:text-gray-300",
            )}
          >
            {displayText}
          </span>
        )}
      </div>
      {!hidePageBadge && <PageBadge expectedPage={expectedPage} foundPage={foundPage} />}
    </div>
  );
}

// =============================================================================
// QUOTE BOX COMPONENT
// =============================================================================

/**
 * Styled quote box for displaying the phrase being verified.
 * Issue #7: Removed serif/italic for modern UI consistency.
 * Uses left border accent (which aligns with shadcn patterns).
 */
export function QuoteBox({ phrase, maxLength = MAX_QUOTE_BOX_LENGTH }: QuoteBoxProps) {
  const displayPhrase = phrase.length > maxLength ? phrase.slice(0, maxLength) + "..." : phrase;

  return (
    <blockquote className="text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-3 border-l-[3px] border-gray-300 dark:border-gray-600 leading-relaxed text-sm">
      "{displayPhrase}"
    </blockquote>
  );
}

// =============================================================================
// VERIFICATION LOG SUMMARY
// =============================================================================

interface VerificationLogSummaryProps {
  status?: SearchStatus | null;
  searchAttempts: SearchAttempt[];
  expectedPage?: number;
  expectedLine?: number;
  foundPage?: number;
  foundLine?: number;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Clickable summary header - GitHub-style with just chevron + count.
 * Issue #6 & #11: Simplified to avoid redundant info (header already shows status).
 */
function VerificationLogSummary({ searchAttempts, isExpanded, onToggle }: VerificationLogSummaryProps) {
  const totalCount = searchAttempts.length;
  const successCount = searchAttempts.filter(a => a.success).length;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls="verification-log-timeline"
      className="w-full px-4 py-2.5 flex items-center justify-between text-xs hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
    >
      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
        <svg
          className={cn("size-3 transition-transform duration-200", isExpanded && "rotate-90")}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span>Details</span>
        <span className="text-gray-400 dark:text-gray-500">
          ({successCount} / {totalCount} {totalCount === 1 ? "search" : "searches"})
        </span>
      </div>
    </button>
  );
}

// =============================================================================
// AUDIT-FOCUSED SEARCH DISPLAY
// =============================================================================

interface AuditSearchDisplayProps {
  searchAttempts: SearchAttempt[];
  /** Citation's full phrase (for display) */
  fullPhrase?: string;
  /** Citation's anchor text (for display) */
  anchorText?: string;
}

interface SearchAttemptRowProps {
  attempt: SearchAttempt;
  index: number;
  totalCount: number;
}

/**
 * Single row showing one search attempt with its phrase, method, and location.
 * Displays as: "1. "phrase..."   Method · Pg X"
 * Also shows search variations if present.
 */
function SearchAttemptRow({ attempt, index, totalCount }: SearchAttemptRowProps) {
  // Format the phrase for display (truncate if too long), with null safety
  const phrase = attempt.searchPhrase ?? "";
  const displayPhrase =
    phrase.length === 0
      ? "(empty)"
      : phrase.length > MAX_PHRASE_DISPLAY_LENGTH
        ? phrase.slice(0, MAX_PHRASE_DISPLAY_LENGTH) + "..."
        : phrase;

  // Format location
  const locationText =
    attempt.searchScope === "document"
      ? "Entire doc"
      : attempt.pageSearched != null
        ? `Pg ${attempt.pageSearched}`
        : "";

  // Get method display name with safe fallback
  // For first_word_fallback, show the actual word searched
  let methodName = METHOD_DISPLAY_NAMES[attempt.method] ?? attempt.method ?? "Search";
  if (attempt.method === "first_word_fallback" && phrase) {
    const trimmedPhrase = phrase.trim();
    const firstWord = trimmedPhrase.length > 0 ? trimmedPhrase.split(/\s+/)[0] : null;
    if (firstWord) {
      methodName = `First word: "${firstWord}"`;
    }
  }

  // Calculate the width needed for the index number (for alignment)
  const indexWidth = String(totalCount).length;

  // Get search variations (if any)
  const variations = attempt.searchVariations ?? [];

  // Get variation type label if present
  const variationTypeLabel = getVariationLabel(attempt.variationType);

  return (
    <div className="flex items-start gap-2 py-0.5">
      {/* Index number */}
      <span
        className="text-[10px] text-gray-400 dark:text-gray-500 font-mono flex-shrink-0 tabular-nums"
        style={{ minWidth: `${indexWidth + 1}ch` }}
      >
        {index}.
      </span>

      {/* Status icon */}
      <span
        className={cn(
          "size-3 max-w-3 max-h-3 mt-0.5 flex-shrink-0",
          attempt.success ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500",
        )}
        role="img"
        aria-label={attempt.success ? "Found" : "Not found"}
      >
        {attempt.success ? <CheckIcon /> : <MissIcon />}
      </span>

      {/* Phrase and details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-gray-700 dark:text-gray-200 font-mono break-all">"{displayPhrase}"</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 whitespace-nowrap">
            {methodName}
            {locationText && ` · ${locationText}`}
          </span>
        </div>
        {/* Show search variations if present */}
        {variations.length > 0 && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            {variationTypeLabel ?? "Also tried"}:{" "}
            {variations
              .slice(0, 3)
              .map(v => `"${v}"`)
              .join(", ")}
            {variations.length > 3 && ` +${variations.length - 3} more`}
          </div>
        )}
      </div>
    </div>
  );
}

interface RejectedMatchesSectionProps {
  rejectedMatches: Array<{ text: string; count?: number }>;
}

/**
 * Section showing text that was found but rejected.
 * Helps auditors understand why partial matches weren't accepted.
 */
function RejectedMatchesSection({ rejectedMatches }: RejectedMatchesSectionProps) {
  if (rejectedMatches.length === 0) return null;

  return (
    <div>
      <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
        Found but rejected
      </div>
      <div className="space-y-1">
        {rejectedMatches.map(match => (
          <div key={match.text} className="text-xs text-gray-600 dark:text-gray-300 font-mono">
            "{match.text}"{match.count != null && ` (${match.count} occurrences)`}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 italic">Context did not match citation</p>
    </div>
  );
}

/**
 * "Looking for" section showing original citation text being searched.
 */
export function LookingForSection({ anchorText, fullPhrase }: { anchorText?: string; fullPhrase?: string }) {
  const hasAnchorText = anchorText && anchorText.trim().length > 0;
  const hasFullPhrase = fullPhrase && fullPhrase.trim().length > 0 && fullPhrase !== anchorText;

  if (!hasAnchorText && !hasFullPhrase) return null;

  return (
    <div>
      <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Looking for</div>
      {hasAnchorText && <div className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">"{anchorText}"</div>}
      {hasFullPhrase && (
        <div className="text-xs text-gray-600 dark:text-gray-300 font-mono break-all bg-gray-50 dark:bg-gray-800/50 p-2 rounded border-l-2 border-gray-300 dark:border-gray-600">
          "{fullPhrase}"
        </div>
      )}
    </div>
  );
}

/**
 * Audit-focused search display.
 * Shows each search attempt in order with its phrase, method, and location.
 * This makes it clear what was searched at each step of the progression.
 */
function AuditSearchDisplay({ searchAttempts, fullPhrase, anchorText }: AuditSearchDisplayProps) {
  // Collect rejected matches (found but not accepted)
  const rejectedMatches = useMemo(() => {
    const seen = new Set<string>();
    const matches: Array<{ text: string; count?: number }> = [];
    for (const attempt of searchAttempts) {
      if (!attempt.success && attempt.matchedText && !seen.has(attempt.matchedText)) {
        seen.add(attempt.matchedText);
        matches.push({ text: attempt.matchedText });
      }
    }
    return matches;
  }, [searchAttempts]);

  // If no search attempts, fall back to citation data
  if (searchAttempts.length === 0) {
    const fallbackPhrases = [fullPhrase, anchorText].filter((p): p is string => Boolean(p));
    if (fallbackPhrases.length === 0) return null;

    // Display fallback as simple list
    return (
      <div className="px-4 py-3 space-y-3 text-sm">
        <div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            Searched for
          </div>
          <div className="space-y-1">
            {fallbackPhrases.map((phrase, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="size-3 max-w-3 max-h-3 mt-0.5 text-gray-400 dark:text-gray-500 flex-shrink-0">
                  <MissIcon />
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-200 font-mono break-all">"{phrase}"</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-4 text-sm">
      {/* Search attempts timeline - shows what was searched and where */}
      <div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Search attempts</div>
        <div className="space-y-0.5">
          {searchAttempts.map((attempt, i) => (
            <SearchAttemptRow key={i} attempt={attempt} index={i + 1} totalCount={searchAttempts.length} />
          ))}
        </div>
      </div>

      {/* Rejected matches section */}
      <RejectedMatchesSection rejectedMatches={rejectedMatches} />
    </div>
  );
}

// =============================================================================
// VERIFICATION LOG TIMELINE
// =============================================================================

interface VerificationLogTimelineProps {
  searchAttempts: SearchAttempt[];
  fullPhrase?: string;
  anchorText?: string;
}

/**
 * Scrollable timeline showing search attempts.
 * Uses the same AuditSearchDisplay layout for all states (found, partial, and not_found)
 * to maintain consistency and provide clear audit trail.
 */
function VerificationLogTimeline({
  searchAttempts,
  fullPhrase,
  anchorText,
}: VerificationLogTimelineProps) {
  // Use the same audit-focused display for all states (found, partial, not_found)
  // This provides a consistent layout showing what was searched and where
  return (
    <div id="verification-log-timeline" style={{ maxHeight: MAX_TIMELINE_HEIGHT }} className="overflow-y-auto">
      <AuditSearchDisplay searchAttempts={searchAttempts} fullPhrase={fullPhrase} anchorText={anchorText} />
    </div>
  );
}

// =============================================================================
// MAIN VERIFICATION LOG COMPONENT
// =============================================================================

/**
 * Collapsible verification log showing search attempt timeline.
 * Displays a summary header that can be clicked to expand the full log.
 */
export function VerificationLog({
  searchAttempts,
  status,
  expectedPage,
  expectedLine,
  foundPage,
  foundLine,
  isExpanded: controlledIsExpanded,
  onExpandChange,
  fullPhrase,
  anchorText,
  ambiguity,
}: VerificationLogProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);

  // Use controlled state if provided, otherwise internal
  const isExpanded = controlledIsExpanded ?? internalIsExpanded;
  const setIsExpanded = (expanded: boolean) => {
    if (onExpandChange) {
      onExpandChange(expanded);
    } else {
      setInternalIsExpanded(expanded);
    }
  };

  // Memoize the successful attempt lookup
  const successfulAttempt = useMemo(() => searchAttempts.find(a => a.success), [searchAttempts]);

  // Don't render if no attempts
  if (!searchAttempts || searchAttempts.length === 0) {
    return null;
  }

  // Derive found location from successful attempt if not provided
  const derivedFoundPage = foundPage ?? successfulAttempt?.foundLocation?.page ?? successfulAttempt?.pageSearched;
  const derivedFoundLine = foundLine ?? successfulAttempt?.foundLocation?.line;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      {/* Ambiguity warning when multiple occurrences exist */}
      {ambiguity && <AmbiguityWarning ambiguity={ambiguity} />}
      <VerificationLogSummary
        status={status}
        searchAttempts={searchAttempts}
        expectedPage={expectedPage}
        expectedLine={expectedLine}
        foundPage={derivedFoundPage}
        foundLine={derivedFoundLine}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
      />
      {isExpanded && (
        <VerificationLogTimeline
          searchAttempts={searchAttempts}
          fullPhrase={fullPhrase}
          anchorText={anchorText}
        />
      )}
    </div>
  );
}

// =============================================================================
// ATTEMPTING TO VERIFY SECTION
// =============================================================================

export interface AttemptingToVerifyProps {
  /** The anchor text or anchor text being verified */
  anchorText?: string;
  /** The full phrase being searched */
  fullPhrase?: string;
}

/**
 * Section showing what citation is being verified.
 * Displays the anchor text and quote box being searched.
 */
export function AttemptingToVerify({ anchorText, fullPhrase }: AttemptingToVerifyProps) {
  const displayAnchorText = anchorText || fullPhrase?.slice(0, MAX_ANCHOR_TEXT_PREVIEW_LENGTH) || "Citation";
  const displayPhrase = fullPhrase || anchorText || "";

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium tracking-wide">
        Searching for:
      </div>
      <div className="text-[15px] font-semibold text-gray-800 dark:text-gray-100">"{displayAnchorText}"</div>
      {displayPhrase && displayPhrase !== displayAnchorText && <QuoteBox phrase={displayPhrase} />}
    </div>
  );
}
