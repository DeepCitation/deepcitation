import React, { useState, useMemo } from "react";
import type { SearchAttempt, SearchStatus, SearchMethod } from "../types/search.js";
import { CheckIcon, MissIcon, SpinnerIcon } from "./icons.js";
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

/** Maximum height for the scrollable timeline */
const MAX_TIMELINE_HEIGHT = "200px";

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
  /** Full phrase from citation (for audit display) */
  fullPhrase?: string;
  /** Anchor text from citation (for audit display) */
  anchorText?: string;
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
 */
function PageBadge({ expectedPage, foundPage }: PageBadgeProps) {
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
    return (
      <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
        Pg {pageToShow}
      </span>
    );
  }

  return null;
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

  // Select appropriate icon based on status
  // - Green (verified): CheckIcon
  // - Amber (partial): CheckIcon (de-emphasized, not aggressive warning)
  // - Red (not found): MissIcon (dash)
  // - Gray (pending): SpinnerIcon (not aggressive warning)
  const IconComponent = colorScheme === "green" ? CheckIcon
    : colorScheme === "amber" ? CheckIcon
    : colorScheme === "red" ? MissIcon
    : SpinnerIcon;

  // Combined layout: status + anchor text + quote in one header section
  const hasCombinedContent = anchorText || fullPhrase;

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
            <span className={cn("size-4 max-w-4 max-h-4 flex-shrink-0", ICON_COLOR_CLASSES[colorScheme])}>
              <IconComponent />
            </span>
            <span className="font-medium text-gray-800 dark:text-gray-100">{headerText}</span>
          </div>
          <PageBadge expectedPage={expectedPage} foundPage={foundPage} />
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
        <span className={cn("size-4 max-w-4 max-h-4 flex-shrink-0", ICON_COLOR_CLASSES[colorScheme])}>
          <IconComponent />
        </span>
        <span className="font-medium text-gray-800 dark:text-gray-100">{headerText}</span>
      </div>
      <PageBadge expectedPage={expectedPage} foundPage={foundPage} />
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
function VerificationLogSummary({
  searchAttempts,
  isExpanded,
  onToggle,
}: VerificationLogSummaryProps) {
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

/**
 * Extract unique searched phrases from attempts for audit display.
 * Shows what was actually searched, not the methods used.
 */
function getUniqueSearchedPhrases(attempts: SearchAttempt[]): string[] {
  const phrases = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.searchPhrase) {
      phrases.add(attempt.searchPhrase);
    }
    if (attempt.searchVariations) {
      for (const variation of attempt.searchVariations) {
        phrases.add(variation);
      }
    }
  }
  return Array.from(phrases);
}

/**
 * Extract partial matches (text found but not accepted) from attempts.
 */
function getPartialMatches(attempts: SearchAttempt[]): Array<{ text: string; count?: number }> {
  const matches: Array<{ text: string; count?: number }> = [];
  for (const attempt of attempts) {
    if (!attempt.success && attempt.matchedText) {
      // Found text but didn't accept it as a match
      matches.push({ text: attempt.matchedText });
    }
  }
  return matches;
}

/**
 * Audit-focused search display.
 * Shows WHAT was searched (phrases) not HOW (methods).
 * Answers: "What did you search for?" and "Why wasn't X accepted?"
 */
function AuditSearchDisplay({ searchAttempts, fullPhrase, anchorText }: AuditSearchDisplayProps) {
  const searchedPhrases = getUniqueSearchedPhrases(searchAttempts);
  const partialMatches = getPartialMatches(searchAttempts);

  // If no searchPhrase data, fall back to citation data
  const displayPhrases = searchedPhrases.length > 0
    ? searchedPhrases
    : [fullPhrase, anchorText].filter(Boolean) as string[];

  if (displayPhrases.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-3 space-y-3 text-sm">
      {/* What was searched */}
      <div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          Searched for
        </div>
        <div className="space-y-1">
          {displayPhrases.map((phrase, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="size-3 max-w-3 max-h-3 mt-0.5 text-gray-400 dark:text-gray-500 flex-shrink-0">
                <MissIcon />
              </span>
              <span className="text-xs text-gray-700 dark:text-gray-200 font-mono break-all">
                "{phrase}"
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* What was found but rejected (if any) */}
      {partialMatches.length > 0 && (
        <div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            Found in document
          </div>
          <div className="space-y-1">
            {partialMatches.map((match, i) => (
              <div key={i} className="text-xs text-gray-600 dark:text-gray-300 font-mono">
                "{match.text}"{match.count && ` (${match.count} occurrences)`}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 italic">
            Phrase context did not match
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// LEGACY VERIFICATION LOG ATTEMPT (kept for success states)
// =============================================================================

interface VerificationLogAttemptProps {
  attempt: SearchAttempt;
  expectedPage?: number;
}

/**
 * Single attempt row - simplified, only shows meaningful info.
 * For success: shows where found (if different from expected).
 */
function VerificationLogAttempt({ attempt, expectedPage }: VerificationLogAttemptProps) {
  const isSuccess = attempt.success;
  const methodName = getMethodDisplayName(attempt.method);

  // Only show location detail if found on different page than expected
  const foundPage = attempt.foundLocation?.page;
  const showLocationDetail = isSuccess && foundPage && expectedPage && foundPage !== expectedPage;

  // Icon component and color
  const IconComponent = isSuccess ? CheckIcon : MissIcon;
  const iconColorClass = isSuccess
    ? "text-green-600 dark:text-green-400"
    : "text-gray-400 dark:text-gray-500";

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* Leading icon */}
      <span className={cn("size-3.5 max-w-3.5 max-h-3.5 flex-shrink-0", iconColorClass)}>
        <IconComponent />
      </span>
      {/* Method name */}
      <span className="flex-1 text-xs text-gray-700 dark:text-gray-300">
        {methodName}
      </span>
      {/* Location detail - only when found on different page */}
      {showLocationDetail && (
        <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0">
          → Pg {foundPage}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// VERIFICATION LOG TIMELINE
// =============================================================================

interface VerificationLogTimelineProps {
  searchAttempts: SearchAttempt[];
  expectedPage?: number;
  /** For miss states: show audit-focused phrase display instead of method list */
  showAuditDisplay?: boolean;
  fullPhrase?: string;
  anchorText?: string;
}

/**
 * Scrollable timeline showing search attempts.
 * For miss states: shows audit-focused phrase display (what was searched).
 * For success/partial states: shows simplified method list with location info.
 */
function VerificationLogTimeline({ searchAttempts, expectedPage, showAuditDisplay, fullPhrase, anchorText }: VerificationLogTimelineProps) {
  // For miss states, show audit-focused display
  if (showAuditDisplay) {
    return (
      <div id="verification-log-timeline" style={{ maxHeight: MAX_TIMELINE_HEIGHT }} className="overflow-y-auto">
        <AuditSearchDisplay
          searchAttempts={searchAttempts}
          fullPhrase={fullPhrase}
          anchorText={anchorText}
        />
      </div>
    );
  }

  // For success/partial states, show simplified method list
  return (
    <div
      id="verification-log-timeline"
      className="px-4 pb-3 overflow-y-auto"
      style={{ maxHeight: MAX_TIMELINE_HEIGHT }}
    >
      {searchAttempts.map((attempt, index) => {
        const lineKey = Array.isArray(attempt.lineSearched)
          ? attempt.lineSearched.join("-")
          : attempt.lineSearched ?? "none";
        const key = `${attempt.method}-${attempt.pageSearched ?? "doc"}-${lineKey}-${index}`;
        return (
          <VerificationLogAttempt
            key={key}
            attempt={attempt}
            expectedPage={expectedPage}
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
  fullPhrase,
  anchorText,
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
          showAuditDisplay={status === "not_found"}
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
