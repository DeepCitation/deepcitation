import React, { useState, useMemo } from "react";
import type { SearchAttempt, SearchStatus, SearchMethod } from "../types/search.js";
import { CheckIcon, CloseIcon, WarningIcon } from "./icons.js";
import { cn } from "./utils.js";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum length for matched text display before truncation */
const MAX_MATCHED_TEXT_LENGTH = 40;

/** Maximum length for quote box phrase display */
const MAX_QUOTE_BOX_LENGTH = 150;

/** Maximum length for anchor text preview in headers */
const MAX_ANCHOR_TEXT_PREVIEW_LENGTH = 50;

/** User-friendly method names for display (Issue #10: simplified from technical jargon) */
const METHOD_DISPLAY_NAMES: Record<SearchMethod, string> = {
  exact_line_match: "Exact location",
  line_with_buffer: "Nearby lines",
  current_page: "Expected page",
  anchor_text_fallback: "Key phrase",
  adjacent_pages: "Nearby pages",
  expanded_window: "Wider area",
  regex_search: "Entire document",
  first_word_fallback: "First word",
};

// =============================================================================
// TYPES
// =============================================================================

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
  /** Anchor text to display in the header (for combined layout) */
  anchorText?: string;
  /** Full phrase for quote box (when using combined layout) */
  fullPhrase?: string;
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
 */
function getStatusHeaderText(status?: SearchStatus | null): string {
  if (!status) return "Verifying...";

  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return "Verified";
    case "found_on_other_page":
      return "Found on different page";
    case "found_on_other_line":
      return "Found on different line";
    case "partial_text_found":
    case "first_word_found":
      return "Partial match";
    case "not_found":
      return "Not found";
    case "pending":
    case "loading":
      return "Verifying...";
    default:
      return "Unknown";
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
      const truncated = attempt.matchedText.length > MAX_MATCHED_TEXT_LENGTH
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
 * - Page badge uses arrow format for location differences (Pg 5 → 7)
 */
export function StatusHeader({ status, foundPage, expectedPage, compact = false, anchorText, fullPhrase }: StatusHeaderProps) {
  const colorScheme = getStatusColorScheme(status);
  const headerText = getStatusHeaderText(status);

  // Icon colors - only the icon is colored, keeping headers neutral
  const iconColorClasses = {
    green: "text-green-600 dark:text-green-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-500 dark:text-red-400",
    gray: "text-gray-400 dark:text-gray-500",
  };

  // Select appropriate icon based on status
  const IconComponent = colorScheme === "green" ? CheckIcon
    : colorScheme === "red" ? CloseIcon
    : WarningIcon;

  // Determine if location differs (for page badge)
  const locationDiffers = expectedPage != null && expectedPage > 0 && foundPage != null && foundPage > 0 && expectedPage !== foundPage;

  // Combined layout: status + anchor text + quote in one header section
  const hasCombinedContent = anchorText || fullPhrase;

  // Render page badge with proper format
  const renderPageBadge = () => {
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
    const pageToShow = (foundPage != null && foundPage > 0) ? foundPage : expectedPage;
    if (pageToShow != null && pageToShow > 0) {
      return (
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
          Pg {pageToShow}
        </span>
      );
    }
    return null;
  };

  if (hasCombinedContent) {
    const displayAnchorText = anchorText || fullPhrase?.slice(0, MAX_ANCHOR_TEXT_PREVIEW_LENGTH) || "";
    const displayPhrase = fullPhrase || anchorText || "";

    return (
      <div className="border-b border-gray-200 dark:border-gray-700">
        {/* Status row - clean neutral background */}
        <div className={cn(
          "flex items-center justify-between gap-2 text-sm",
          compact ? "px-3 py-2" : "px-4 py-2.5"
        )}>
          <div className="flex items-center gap-2">
            <span className={cn("size-4 flex-shrink-0", iconColorClasses[colorScheme])}>
              <IconComponent />
            </span>
            <span className="font-medium text-gray-800 dark:text-gray-100">{headerText}</span>
          </div>
          {renderPageBadge()}
        </div>

        {/* Anchor text and quote */}
        <div className="px-4 pb-3 pt-1">
          <div className="text-[15px] font-semibold text-gray-800 dark:text-gray-100 mb-2">
            "{displayAnchorText}"
          </div>
          {displayPhrase && displayPhrase !== displayAnchorText && (
            <QuoteBox phrase={displayPhrase} />
          )}
        </div>
      </div>
    );
  }

  // Simple header (no anchor text/quote)
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 text-sm",
        compact ? "px-3 py-2" : "px-4 py-2.5"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("size-4 flex-shrink-0", iconColorClasses[colorScheme])}>
          <IconComponent />
        </span>
        <span className="font-medium text-gray-800 dark:text-gray-100">{headerText}</span>
      </div>
      {renderPageBadge()}
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
  const displayPhrase = phrase.length > maxLength
    ? phrase.slice(0, maxLength) + "..."
    : phrase;

  return (
    <blockquote className="text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md border-l-[3px] border-gray-300 dark:border-gray-600 leading-relaxed text-sm">
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
function VerificationLogSummary({
  status,
  searchAttempts,
  expectedPage,
  expectedLine,
  foundPage,
  foundLine,
  isExpanded,
  onToggle,
}: VerificationLogSummaryProps) {
  const totalCount = searchAttempts.length;

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
          className={cn(
            "size-3 transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
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
          ({totalCount} {totalCount === 1 ? "search" : "searches"})
        </span>
      </div>
    </button>
  );
}

// =============================================================================
// VERIFICATION LOG ATTEMPT
// =============================================================================

interface VerificationLogAttemptProps {
  attempt: SearchAttempt;
  index: number;
  expectedPage?: number;
  expectedLine?: number;
}

/**
 * Single attempt row in the verification log timeline.
 * Issue #9: Monochrome badges - only icon carries status color.
 * Issue #12: Visual hierarchy - successful matches more prominent.
 */
function VerificationLogAttempt({ attempt, index, expectedPage, expectedLine }: VerificationLogAttemptProps) {
  const isSuccess = attempt.success;
  const methodName = getMethodDisplayName(attempt.method);
  const scopeBadge = formatScopeBadge(attempt);
  const resultText = getAttemptResultText(attempt);

  // Determine if this is the expected location
  const isExpectedLocation =
    attempt.pageSearched === expectedPage &&
    (expectedLine == null || attempt.lineSearched === expectedLine);

  // Icon component and color - only icon is colored
  const IconComponent = isSuccess ? CheckIcon : CloseIcon;
  const iconColorClass = isSuccess
    ? "text-green-600 dark:text-green-400"
    : "text-gray-500 dark:text-gray-400";

  return (
    <div className={cn(
      "flex gap-2.5 py-2",
      index > 0 && "border-t border-gray-100 dark:border-gray-800"
    )}>
      {/* Status icon */}
      <div className="flex-shrink-0 pt-0.5">
        <span className={cn("size-3 block", iconColorClass)}>
          <IconComponent />
        </span>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 text-xs">
        {/* Header: method name + scope badge (monochrome) */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={cn(
            "font-medium",
            isSuccess ? "text-gray-800 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"
          )}>
            {methodName}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {scopeBadge}
          </span>
        </div>

        {/* Result text - subtle */}
        <p className={cn(
          "text-[11px]",
          isSuccess
            ? "text-green-600 dark:text-green-400"
            : "text-gray-500 dark:text-gray-400"
        )}>
          {resultText}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// VERIFICATION LOG TIMELINE
// =============================================================================

interface VerificationLogTimelineProps {
  searchAttempts: SearchAttempt[];
  expectedPage?: number;
  expectedLine?: number;
}

/**
 * Scrollable timeline showing all search attempts.
 */
function VerificationLogTimeline({ searchAttempts, expectedPage, expectedLine }: VerificationLogTimelineProps) {
  return (
    <div
      id="verification-log-timeline"
      className="px-4 pb-3 max-h-[200px] overflow-y-auto"
    >
      {searchAttempts.map((attempt, index) => {
        // Generate a stable key from attempt properties
        const lineKey = Array.isArray(attempt.lineSearched)
          ? attempt.lineSearched.join("-")
          : attempt.lineSearched ?? "none";
        const key = `${attempt.method}-${attempt.pageSearched ?? "doc"}-${lineKey}-${index}`;
        return (
          <VerificationLogAttempt
            key={key}
            attempt={attempt}
            index={index}
            expectedPage={expectedPage}
            expectedLine={expectedLine}
          />
        );
      })}
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
  const successfulAttempt = useMemo(
    () => searchAttempts.find(a => a.success),
    [searchAttempts]
  );

  // Don't render if no attempts
  if (!searchAttempts || searchAttempts.length === 0) {
    return null;
  }

  // Derive found location from successful attempt if not provided
  const derivedFoundPage = foundPage ?? successfulAttempt?.foundLocation?.page ?? successfulAttempt?.pageSearched;
  const derivedFoundLine = foundLine ?? successfulAttempt?.foundLocation?.line;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
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
          expectedPage={expectedPage}
          expectedLine={expectedLine}
        />
      )}
    </div>
  );
}

// =============================================================================
// ATTEMPTING TO VERIFY SECTION
// =============================================================================

export interface AttemptingToVerifyProps {
  /** The anchor text or key phrase being verified */
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
      <div className="text-[15px] font-semibold text-gray-800 dark:text-gray-100">
        "{displayAnchorText}"
      </div>
      {displayPhrase && displayPhrase !== displayAnchorText && (
        <QuoteBox phrase={displayPhrase} />
      )}
    </div>
  );
}
