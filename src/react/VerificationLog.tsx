import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Citation } from "../types/citation.js";
import type { SearchAttempt, SearchMethod, SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { COPY_FEEDBACK_DURATION_MS, DOT_COLORS } from "./constants.js";
import {
  CheckIcon,
  CopyIcon,
  DocumentIcon,
  ExternalLinkIcon,
  GlobeIcon,
  MissIcon,
  SpinnerIcon,
  XCircleIcon,
} from "./icons.js";
import type { UrlFetchStatus } from "./types.js";
import { UrlCitationComponent } from "./UrlCitationComponent.js";
import { sanitizeUrl } from "./urlUtils.js";
import { cn, isUrlCitation } from "./utils.js";
import { getVariationLabel } from "./variationLabels.js";

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
const MAX_TIMELINE_HEIGHT = "280px";

/** Maximum length for phrase display in search attempt rows */
const MAX_PHRASE_DISPLAY_LENGTH = 60;

/** Maximum length for URL display in popover header */
const MAX_URL_DISPLAY_LENGTH = 45;

/** Icon color classes by status - defined outside component to avoid recreation on every render */
const ICON_COLOR_CLASSES = {
  green: "text-green-600 dark:text-green-400",
  amber: "text-amber-500 dark:text-amber-400",
  red: "text-red-500 dark:text-red-400",
  gray: "text-gray-400 dark:text-gray-500",
} as const;

/** User-friendly method names for display (Issue #10: simplified from technical jargon) */
const METHOD_DISPLAY_NAMES: Record<SearchMethod, string> = {
  exact_line_match: "Exact location",
  line_with_buffer: "Nearby lines",
  expanded_line_buffer: "Extended nearby lines",
  current_page: "Expected page",
  anchor_text_fallback: "Anchor text",
  adjacent_pages: "Nearby pages",
  expanded_window: "Wider area",
  regex_search: "Entire document",
  first_word_fallback: "First word",
  first_half_fallback: "First half",
  last_half_fallback: "Last half",
  first_quarter_fallback: "First quarter",
  second_quarter_fallback: "Second quarter",
  third_quarter_fallback: "Third quarter",
  fourth_quarter_fallback: "Fourth quarter",
  longest_word_fallback: "Longest word",
  custom_phrase_fallback: "Custom search",
  keyspan_fallback: "Anchor text",
};

// =============================================================================
// URL ANCHOR TEXT ROW (with copy button)
// =============================================================================

/**
 * Row showing quoted anchor text with copy button for URL citations.
 * Matches the style of StatusHeader's copy button for document citations.
 */
function UrlAnchorTextRow({ anchorText, displayAnchorText }: { anchorText: string; displayAnchorText: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  // Auto-reset copy state after feedback duration
  useEffect(() => {
    if (copyState === "idle") return;
    const timeoutId = setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [copyState]);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!anchorText) return;

      try {
        await navigator.clipboard.writeText(anchorText);
        setCopyState("copied");
      } catch (err) {
        console.error("Failed to copy text:", err);
        setCopyState("error");
      }
    },
    [anchorText],
  );

  return (
    <div className="mt-1 pl-6 flex items-center gap-1.5">
      <QuotedText className="text-xs text-gray-500 dark:text-gray-400 truncate">{displayAnchorText}</QuotedText>
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "shrink-0 p-0.5 rounded transition-colors cursor-pointer",
          copyState === "copied"
            ? "text-green-600 dark:text-green-400"
            : copyState === "error"
              ? "text-red-500 dark:text-red-400"
              : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
        )}
        aria-label={copyState === "copied" ? "Copied!" : "Copy quoted text"}
        title={copyState === "copied" ? "Copied!" : "Copy quote"}
      >
        <span className="size-3.5 block">{copyState === "copied" ? <CheckIcon /> : <CopyIcon />}</span>
      </button>
    </div>
  );
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
const _MAX_SOURCE_DISPLAY_NAME_LENGTH = 60;

/** Maximum length for anchor text display in miss headers */
const _MAX_MISS_ANCHOR_TEXT_LENGTH = 60;

/**
 * Maps document verification SearchStatus to UrlFetchStatus for display in UrlCitationComponent.
 */
export function mapSearchStatusToUrlFetchStatus(status: SearchStatus | null | undefined): UrlFetchStatus {
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
      <span className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500">
        <GlobeIcon />
      </span>
    );
  }

  return (
    <img
      src={effectiveFaviconUrl}
      alt={alt?.trim() || "Source"}
      className="w-4 h-4 shrink-0 rounded-sm"
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
    // URL citation: show status + favicon + URL on first row, quoted text on second row
    const faviconUrl = verification?.verifiedFaviconUrl || citation.faviconUrl;
    const domain = verification?.verifiedDomain || citation.domain;
    const url = citation.url || "";
    const safeUrl = sanitizeUrl(url);

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

    // Get the anchor text to display (found text or searched-for text)
    const anchorText = verification?.verifiedAnchorText || citation.anchorText;
    const displayAnchorText = anchorText
      ? anchorText.length > MAX_MATCHED_TEXT_LENGTH
        ? `${anchorText.slice(0, MAX_MATCHED_TEXT_LENGTH)}...`
        : anchorText
      : null;

    // Show second line only when resolved (status icon already conveys outcome)
    const isResolved = status && status !== "pending" && status !== "loading";

    return (
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
        {/* Row 1: Status icon + favicon + URL + external link */}
        <div className="flex items-center gap-2">
          <span className={cn("size-4 shrink-0", ICON_COLOR_CLASSES[colorScheme])}>
            <IconComponent />
          </span>
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
          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 p-1 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
              aria-label="Open URL in new tab"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLinkIcon />
            </a>
          )}
        </div>
        {/* Row 2: Quoted text we searched for with copy button (only when resolved) */}
        {isResolved && displayAnchorText && (
          <UrlAnchorTextRow anchorText={anchorText || ""} displayAnchorText={displayAnchorText} />
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
    <div className="flex items-center justify-between gap-2 px-4 py-1.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500">
          <DocumentIcon />
        </span>
        {displayName && (
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate max-w-[280px]">
            {displayName}
          </span>
        )}
      </div>
      {pageLineText && (
        <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0 uppercase tracking-wide">
          {pageLineText}
        </span>
      )}
    </div>
  );
}

/**
 * Formats page and line info for display in headers.
 * Returns "Page X" or "Page X, Line Y" or null if no info available.
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
  return `p.${pageNumber}`;
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
  /** Whether to show copy button next to anchor text */
  showCopyButton?: boolean;
  /**
   * Visual style for status indicators.
   * - `"icon"`: Icon-based indicators (default)
   * - `"dot"`: Subtle colored dots
   * @default "icon"
   */
  indicatorVariant?: "icon" | "dot";
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
function _getMethodDisplayName(method: SearchMethod): string {
  return METHOD_DISPLAY_NAMES[method] || method;
}

/**
 * Format a scope badge string from search attempt.
 */
function _formatScopeBadge(attempt: SearchAttempt): string {
  const page = attempt.pageSearched;
  const line = attempt.lineSearched;
  const scope = attempt.searchScope;

  if (scope === "document") return "Entire document";

  if (page != null) {
    if (line != null) {
      const lineStr = Array.isArray(line) ? line.join("-") : line.toString();
      return `Page ${page}, line ${lineStr}`;
    }
    return `Page ${page}, all lines`;
  }

  return "Unknown";
}

/**
 * Get result text for a search attempt.
 */
function _getAttemptResultText(attempt: SearchAttempt): string {
  if (attempt.success) {
    if (attempt.matchedText) {
      const truncated =
        attempt.matchedText.length > MAX_MATCHED_TEXT_LENGTH
          ? `${attempt.matchedText.slice(0, MAX_MATCHED_TEXT_LENGTH)}...`
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
function _getAttemptDetailText(attempt: SearchAttempt): string {
  const page = attempt.pageSearched;
  const line = attempt.lineSearched;
  const scope = attempt.searchScope;

  // For successful matches, show where it was found
  if (attempt.success) {
    if (attempt.foundLocation) {
      const { page: foundPage, line: foundLine } = attempt.foundLocation;
      if (foundLine != null) {
        return `Found on page ${foundPage}, line ${foundLine}`;
      }
      return `Found on page ${foundPage}`;
    }
    if (page != null) {
      if (line != null) {
        const lineStr = Array.isArray(line) ? `${line[0]}-${line[line.length - 1]}` : line.toString();
        return `Page ${page}, line ${lineStr}`;
      }
      return `Page ${page}`;
    }
  }

  // For failed searches, show where we searched
  if (scope === "document") return "Full document search";

  if (page != null) {
    if (line != null) {
      const lineStr = Array.isArray(line) ? `lines ${line[0]}-${line[line.length - 1]}` : `line ${line}`;
      return `Page ${page}, ${lineStr}`;
    }
    return `Page ${page}, all lines`;
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
 * Shows arrow format (Page 5 → 7) when location differs from expected.
 *
 * Note: Pages are 1-indexed for user display. Page 0 is treated as invalid/unset
 * since documents start at "Page 1" in user-facing contexts.
 */
function PageBadge({ expectedPage, foundPage }: PageBadgeProps) {
  // Pages are 1-indexed for display; page 0 indicates unset/invalid
  const hasExpected = expectedPage != null && expectedPage > 0;
  const hasFound = foundPage != null && foundPage > 0;
  const locationDiffers = hasExpected && hasFound && expectedPage !== foundPage;

  // Show arrow format when location differs (e.g., "p.5 → 7")
  if (locationDiffers) {
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
        <span className="text-gray-400 dark:text-gray-500">p.{expectedPage}</span>
        <span className="text-gray-400 dark:text-gray-500">→</span>
        <span className="text-gray-700 dark:text-gray-300">{foundPage}</span>
      </span>
    );
  }

  // Show found page or expected page
  const pageToShow = hasFound ? foundPage : expectedPage;
  if (pageToShow != null && pageToShow > 0) {
    return <span className="text-xs text-gray-500 dark:text-gray-400">p.{pageToShow}</span>;
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
    displayNote = `${lastSpace > 150 ? truncated.slice(0, lastSpace) : truncated}...`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800"
    >
      <div className="flex items-start gap-2">
        <svg
          className="size-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5"
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
  showCopyButton = true,
  indicatorVariant = "icon",
}: StatusHeaderProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const colorScheme = getStatusColorScheme(status);
  const headerText = getStatusHeaderText(status);

  // Auto-reset copy state after feedback duration
  useEffect(() => {
    if (copyState === "idle") return;
    const timeoutId = setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [copyState]);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!anchorText) return;

      try {
        await navigator.clipboard.writeText(anchorText);
        setCopyState("copied");
      } catch (err) {
        console.error("Failed to copy text:", err);
        setCopyState("error");
      }
    },
    [anchorText],
  );

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

  // Consistent single-row layout: icon + text + copy button + page badge
  // Display priority: headerText (status description) > anchorText (quoted phrase)
  const displayText = headerText || anchorText || null;
  const shouldShowAsQuoted = !headerText && !!anchorText; // Show with quote styling when displaying anchorText
  // Show copy button whenever we have anchor text - users may want to copy even when headerText is displayed
  const shouldShowCopyButton = showCopyButton && anchorText;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 text-sm",
        compact ? "px-3 py-1.5" : "px-4 py-2",
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {indicatorVariant === "dot" ? (
          <span className={cn("size-2.5 rounded-full shrink-0", DOT_COLORS[colorScheme], colorScheme === "gray" && "animate-pulse")} aria-hidden="true" />
        ) : (
          <span className={cn("size-4 max-w-4 max-h-4 shrink-0", ICON_COLOR_CLASSES[colorScheme])}>
            <IconComponent />
          </span>
        )}
        {displayText &&
          (shouldShowAsQuoted ? (
            <QuotedText className={cn("font-medium truncate text-gray-600 dark:text-gray-300")}>
              {displayText}
            </QuotedText>
          ) : (
            <span className="font-medium truncate text-gray-800 dark:text-gray-100">{displayText}</span>
          ))}
        {/* Copy button - icon only, shown next to anchor text */}
        {shouldShowCopyButton && (
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "shrink-0 p-0.5 rounded transition-colors cursor-pointer",
              copyState === "copied"
                ? "text-green-600 dark:text-green-400"
                : copyState === "error"
                  ? "text-red-500 dark:text-red-400"
                  : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
            )}
            aria-label={copyState === "copied" ? "Copied!" : "Copy quoted text"}
            title={copyState === "copied" ? "Copied!" : "Copy quote"}
          >
            <span className="size-3.5 block">{copyState === "copied" ? <CheckIcon /> : <CopyIcon />}</span>
          </button>
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
 * No literal quotes - the styling indicates quoted text for copy/paste friendliness.
 */
export function QuoteBox({ phrase, maxLength = MAX_QUOTE_BOX_LENGTH }: QuoteBoxProps) {
  const displayPhrase = phrase.length > maxLength ? `${phrase.slice(0, maxLength)}...` : phrase;

  return (
    <blockquote className="text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-3 border-l-[3px] border-gray-300 dark:border-gray-600 leading-relaxed text-sm">
      {displayPhrase}
    </blockquote>
  );
}

// =============================================================================
// QUOTED TEXT COMPONENT
// =============================================================================

export interface QuotedTextProps {
  /** The text to display as quoted */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Whether to use monospace font (default: false) */
  mono?: boolean;
}

/**
 * Inline quoted text component that uses left border + indent instead of literal quote characters.
 * This makes copy/paste cleaner - users get the actual text without surrounding quotes.
 *
 * Uses 2px border (vs 3px for QuoteBox) for subtler inline styling.
 * For block-level quotes, use QuoteBox instead.
 */
export function QuotedText({ children, className, mono = false }: QuotedTextProps) {
  // Return null for empty/whitespace-only children
  if (!children || (typeof children === "string" && !children.trim())) {
    return null;
  }

  return (
    <q
      className={cn("border-l-2 border-gray-300 dark:border-gray-600 pl-1.5 ml-0.5", mono && "font-mono", className)}
      style={{ quotes: "none" }}
    >
      {children}
    </q>
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
 * Get a human-readable outcome summary for the collapsed state.
 * Shows what kind of match was found (or that nothing was found).
 */
function getOutcomeSummary(status: SearchStatus | null | undefined, searchAttempts: SearchAttempt[]): string {
  // Early return for not_found - no need to search for successful attempt
  if (!status || status === "not_found") {
    const totalCount = searchAttempts.length;
    return `${totalCount} ${totalCount === 1 ? "search" : "searches"} tried`;
  }

  // Only search for successful attempt when we know something was found
  const successfulAttempt = searchAttempts.find(a => a.success);

  // For found states, describe the match type
  if (successfulAttempt?.matchedVariation) {
    switch (successfulAttempt.matchedVariation) {
      case "exact_full_phrase":
        return "Exact match";
      case "normalized_full_phrase":
        return "Normalized match";
      case "exact_anchor_text":
      case "normalized_anchor_text":
        return "Anchor text match";
      case "partial_full_phrase":
      case "partial_anchor_text":
        return "Partial match";
      case "first_word_only":
        return "First word match";
      default:
        return "Match found";
    }
  }

  // Fallback based on status
  switch (status) {
    case "found":
    case "found_phrase_missed_anchor_text":
      return "Exact match";
    case "found_anchor_text_only":
      return "Anchor text match";
    case "found_on_other_page":
    case "found_on_other_line":
      return "Found at different location";
    case "partial_text_found":
      return "Partial match";
    case "first_word_found":
      return "First word match";
    default:
      return "Match found";
  }
}

/**
 * Clickable summary header with status-aware language.
 * - For found/partial: "How we verified this · Exact match"
 * - For not_found: "Search attempts · 0/8 searches tried"
 */
function VerificationLogSummary({ status, searchAttempts, isExpanded, onToggle }: VerificationLogSummaryProps) {
  const isMiss = status === "not_found";
  const outcomeSummary = getOutcomeSummary(status, searchAttempts);

  // Use different headers based on verification outcome
  const headerText = isMiss ? "Search attempts" : "How we verified this";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls="verification-log-timeline"
      className="w-full px-4 py-2 flex items-center justify-between text-xs hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer"
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
        <span>{headerText}</span>
        <span className="text-gray-400 dark:text-gray-500">· {outcomeSummary}</span>
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
  /** Verification status (determines display mode) */
  status?: SearchStatus | null;
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
        ? `${phrase.slice(0, MAX_PHRASE_DISPLAY_LENGTH)}...`
        : phrase;

  // Format location
  const locationText =
    attempt.searchScope === "document"
      ? "Entire document"
      : attempt.pageSearched != null
        ? `Page ${attempt.pageSearched}`
        : "";

  // Get method display name with safe fallback
  const methodName = METHOD_DISPLAY_NAMES[attempt.method] ?? attempt.method ?? "Search";

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
        className="text-[10px] text-gray-400 dark:text-gray-500 font-mono shrink-0 tabular-nums"
        style={{ minWidth: `${indexWidth + 1}ch` }}
      >
        {index}.
      </span>

      {/* Status icon */}
      <span
        className={cn(
          "size-3 max-w-3 max-h-3 mt-0.5 shrink-0",
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
          <QuotedText mono className="text-xs text-gray-700 dark:text-gray-200 break-all">
            {displayPhrase}
          </QuotedText>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 whitespace-nowrap">
            {methodName}
            {locationText && ` · ${locationText}`}
          </span>
        </div>
        {/* Show search variations if present */}
        {variations.length > 0 && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            {variationTypeLabel ?? "Also tried"}:{" "}
            {variations.slice(0, 3).map((v, i) => (
              <React.Fragment key={i}>
                {i > 0 && ", "}
                <QuotedText mono>{v}</QuotedText>
              </React.Fragment>
            ))}
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
          <div key={match.text} className="text-xs text-gray-600 dark:text-gray-300">
            <QuotedText mono>{match.text}</QuotedText>
            {match.count != null && ` (${match.count} occurrences)`}
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
      {hasAnchorText && (
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1 border-l-2 border-gray-300 dark:border-gray-600 pl-2">
          {anchorText}
        </div>
      )}
      {hasFullPhrase && (
        <div className="text-xs text-gray-600 dark:text-gray-300 font-mono break-all bg-gray-50 dark:bg-gray-800/50 p-2 rounded border-l-2 border-gray-300 dark:border-gray-600">
          {fullPhrase}
        </div>
      )}
    </div>
  );
}

/**
 * Audit-focused search display.
 * - For found/partial: Shows only the successful match details
 * - For not_found: Shows all search attempts to help debug
 */
function AuditSearchDisplay({ searchAttempts, fullPhrase, anchorText, status }: AuditSearchDisplayProps) {
  const isMiss = status === "not_found";
  const successfulAttempt = useMemo(() => searchAttempts.find(a => a.success), [searchAttempts]);

  // Collect rejected matches (found but not accepted) - only relevant for misses
  const rejectedMatches = useMemo(() => {
    if (!isMiss) return [];
    const seen = new Set<string>();
    const matches: Array<{ text: string; count?: number }> = [];
    for (const attempt of searchAttempts) {
      if (!attempt.success && attempt.matchedText && !seen.has(attempt.matchedText)) {
        seen.add(attempt.matchedText);
        matches.push({ text: attempt.matchedText });
      }
    }
    return matches;
  }, [searchAttempts, isMiss]);

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
                <span className="size-3 max-w-3 max-h-3 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0">
                  <MissIcon />
                </span>
                <QuotedText mono className="text-xs text-gray-700 dark:text-gray-200 break-all">
                  {phrase}
                </QuotedText>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // For found/partial states: show only the successful match details
  if (!isMiss && successfulAttempt) {
    const phrase = successfulAttempt.searchPhrase ?? "";
    const displayPhrase =
      phrase.length === 0
        ? "(empty)"
        : phrase.length > MAX_PHRASE_DISPLAY_LENGTH
          ? `${phrase.slice(0, MAX_PHRASE_DISPLAY_LENGTH)}...`
          : phrase;

    const methodName = METHOD_DISPLAY_NAMES[successfulAttempt.method] ?? successfulAttempt.method ?? "Search";
    const locationText = successfulAttempt.foundLocation
      ? `Page ${successfulAttempt.foundLocation.page}${successfulAttempt.foundLocation.line ? `, line ${successfulAttempt.foundLocation.line}` : ""}`
      : successfulAttempt.pageSearched != null
        ? `Page ${successfulAttempt.pageSearched}`
        : "";

    return (
      <div className="px-4 py-3 space-y-3 text-sm">
        <div>
          <div className="p-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-md space-y-2">
            {/* What was matched */}
            <div className="flex items-start gap-2">
              <span className="size-3.5 max-w-3.5 max-h-3.5 mt-0.5 text-green-600 dark:text-green-400 shrink-0">
                <CheckIcon />
              </span>
              <QuotedText mono className="text-xs text-gray-700 dark:text-gray-200 break-all">
                {displayPhrase}
              </QuotedText>
            </div>
            {/* Where it was found */}
            <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
              <span>{methodName}</span>
              {locationText && <span>{locationText}</span>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // For not_found: show all search attempts
  return (
    <div className="px-4 py-3 space-y-4 text-sm">
      {/* Search attempts timeline - shows what was searched and where */}
      <div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          {searchAttempts.length} {searchAttempts.length === 1 ? "search" : "searches"} tried
        </div>
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
  status?: SearchStatus | null;
}

/**
 * Scrollable timeline showing search attempts.
 * - For found/partial: Shows only the successful match details
 * - For not_found: Shows all search attempts with clear count
 */
function VerificationLogTimeline({ searchAttempts, fullPhrase, anchorText, status }: VerificationLogTimelineProps) {
  return (
    <div id="verification-log-timeline" style={{ maxHeight: MAX_TIMELINE_HEIGHT }} className="overflow-y-auto">
      <AuditSearchDisplay
        searchAttempts={searchAttempts}
        fullPhrase={fullPhrase}
        anchorText={anchorText}
        status={status}
      />
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
          status={status}
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
      <div className="text-[15px] font-semibold text-gray-800 dark:text-gray-100 border-l-2 border-gray-300 dark:border-gray-600 pl-2">
        {displayAnchorText}
      </div>
      {displayPhrase && displayPhrase !== displayAnchorText && <QuoteBox phrase={displayPhrase} />}
    </div>
  );
}
