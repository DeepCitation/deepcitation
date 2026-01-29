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

/** Human-readable method names for display */
const METHOD_DISPLAY_NAMES: Record<SearchMethod, string> = {
  exact_line_match: "Exact Line Match",
  line_with_buffer: "Line Buffer Search",
  current_page: "Page Scan",
  anchor_text_fallback: "Key Phrase Search",
  adjacent_pages: "Nearby Pages",
  expanded_window: "Wider Search",
  regex_search: "Full Document Search",
  first_word_fallback: "First Word Search",
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
 */
function getStatusHeaderText(status?: SearchStatus | null): string {
  if (!status) return "Verifying...";

  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return "Verified Match";
    case "found_on_other_page":
    case "found_on_other_line":
      return "Citation Found (Unexpected Location)";
    case "partial_text_found":
    case "first_word_found":
      return "Partial Match Found";
    case "not_found":
      return "Citation Unverified";
    case "pending":
    case "loading":
      return "Verifying...";
    default:
      return "Unknown Status";
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
 * Green for success, amber for partial, red for failure.
 * Can optionally include anchor text and quote for a combined layout.
 */
export function StatusHeader({ status, foundPage, compact = false, anchorText, fullPhrase }: StatusHeaderProps) {
  const colorScheme = getStatusColorScheme(status);
  const headerText = getStatusHeaderText(status);

  const colorClasses = {
    green: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300",
    amber: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300",
    red: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300",
    gray: "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-400",
  };

  const IconComponent = colorScheme === "green" ? CheckIcon : WarningIcon;

  // Combined layout: status + anchor text + quote in one header section
  const hasCombinedContent = anchorText || fullPhrase;

  if (hasCombinedContent) {
    const displayAnchorText = anchorText || fullPhrase?.slice(0, MAX_ANCHOR_TEXT_PREVIEW_LENGTH) || "";
    const displayPhrase = fullPhrase || anchorText || "";

    return (
      <div className={cn("border-b", colorClasses[colorScheme])}>
        {/* Status row */}
        <div className={cn(
          "flex items-center justify-between gap-2 font-semibold text-sm",
          compact ? "px-3 py-2" : "px-4 py-2.5"
        )}>
          <div className="flex items-center gap-2">
            <span className="size-4">
              <IconComponent />
            </span>
            <span>{headerText}</span>
          </div>
          {foundPage != null && foundPage > 0 && (
            <span className={cn(
              "text-xs font-mono px-1.5 py-0.5 rounded",
              colorScheme === "green" && "bg-green-100 dark:bg-green-800/30",
              colorScheme === "amber" && "bg-amber-100 dark:bg-amber-800/30",
              colorScheme === "red" && "bg-red-100 dark:bg-red-800/30",
              colorScheme === "gray" && "bg-gray-100 dark:bg-gray-700/30"
            )}>
              PG {foundPage}
            </span>
          )}
        </div>

        {/* Anchor text and quote */}
        <div className="px-4 pb-3 pt-1 bg-white dark:bg-gray-900">
          <div className="text-[15px] font-semibold text-gray-800 dark:text-gray-200 mb-2">
            {displayAnchorText}
          </div>
          {displayPhrase && (
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
        "flex items-center justify-between gap-2 border-b font-semibold text-sm",
        compact ? "px-3 py-2" : "px-4 py-2.5",
        colorClasses[colorScheme]
      )}
    >
      <div className="flex items-center gap-2">
        <span className="size-4">
          <IconComponent />
        </span>
        <span>{headerText}</span>
      </div>
      {foundPage != null && foundPage > 0 && (
        <span className={cn(
          "text-xs font-mono px-1.5 py-0.5 rounded",
          colorScheme === "green" && "bg-green-100 dark:bg-green-800/30",
          colorScheme === "amber" && "bg-amber-100 dark:bg-amber-800/30",
          colorScheme === "red" && "bg-red-100 dark:bg-red-800/30",
          colorScheme === "gray" && "bg-gray-100 dark:bg-gray-700/30"
        )}>
          PG {foundPage}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// QUOTE BOX COMPONENT
// =============================================================================

/**
 * Styled quote box for displaying the phrase being verified.
 */
export function QuoteBox({ phrase, maxLength = MAX_QUOTE_BOX_LENGTH }: QuoteBoxProps) {
  const displayPhrase = phrase.length > maxLength
    ? phrase.slice(0, maxLength) + "..."
    : phrase;

  return (
    <blockquote className="font-serif italic text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md border-l-[3px] border-gray-300 dark:border-gray-600 leading-relaxed text-sm">
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
 * Clickable summary header showing the result and attempt count.
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
  const colorScheme = getStatusColorScheme(status);
  const successCount = useMemo(() => searchAttempts.filter(a => a.success).length, [searchAttempts]);
  const totalCount = searchAttempts.length;

  // Determine the summary text based on status
  let summaryText = "";
  let subText = "";

  if (status === "not_found") {
    summaryText = "No matches found";
    subText = `(${successCount}/${totalCount} attempts)`;
  } else if (status === "found_on_other_line" && foundLine != null && expectedLine != null) {
    summaryText = `Found on Line ${foundLine}`;
    subText = `(Expected Line ${expectedLine})`;
  } else if (status === "found_on_other_page" && foundPage != null && expectedPage != null) {
    summaryText = `Found on Page ${foundPage}`;
    subText = `(Expected Page ${expectedPage})`;
  } else if (status === "partial_text_found" || status === "first_word_found") {
    summaryText = "Partial match";
    subText = `(${successCount}/${totalCount} attempts)`;
  } else {
    summaryText = "Match found";
    subText = `(${successCount}/${totalCount} attempts)`;
  }

  // Icon based on status
  const IconComponent = colorScheme === "red" ? CloseIcon : colorScheme === "amber" ? WarningIcon : CheckIcon;
  const iconColorClass = {
    green: "text-green-500 dark:text-green-400",
    amber: "text-amber-500 dark:text-amber-400",
    red: "text-red-500 dark:text-red-400",
    gray: "text-gray-400 dark:text-gray-500",
  }[colorScheme];

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls="verification-log-timeline"
      className="w-full px-4 py-3 flex items-center justify-between text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    >
      <div className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300">
        <span className={cn("size-3.5", iconColorClass)}>
          <IconComponent />
        </span>
        <span>{summaryText}</span>
        <span className="font-normal text-gray-500 dark:text-gray-400">
          {subText}
        </span>
      </div>
      <svg
        className={cn(
          "size-3.5 text-gray-400 dark:text-gray-500 transition-transform duration-200",
          isExpanded && "rotate-180"
        )}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
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
 */
function VerificationLogAttempt({ attempt, index, expectedPage, expectedLine }: VerificationLogAttemptProps) {
  const isSuccess = attempt.success;
  const methodName = getMethodDisplayName(attempt.method);
  const scopeBadge = formatScopeBadge(attempt);
  const resultText = getAttemptResultText(attempt);

  // Determine if this is the expected location (for highlighting)
  const isExpectedLocation =
    attempt.pageSearched === expectedPage &&
    (expectedLine == null || attempt.lineSearched === expectedLine);

  // Badge color class
  const badgeColorClass = isSuccess
    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
    : isExpectedLocation
    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
    : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400";

  // Icon component and color
  const IconComponent = isSuccess ? CheckIcon : CloseIcon;
  const iconColorClass = isSuccess
    ? "text-green-500 dark:text-green-400"
    : "text-gray-400 dark:text-gray-500";

  // For amber success (partial/displaced), use amber icon
  const isPartialSuccess = isSuccess && !isExpectedLocation;
  const finalIconColorClass = isPartialSuccess
    ? "text-amber-500 dark:text-amber-400"
    : iconColorClass;

  return (
    <div className={cn(
      "flex gap-2.5 py-2.5",
      index > 0 && "border-t border-dashed border-gray-200 dark:border-gray-700"
    )}>
      {/* Status icon */}
      <div className="flex-shrink-0 pt-0.5">
        <span className={cn("size-3.5 block", finalIconColorClass)}>
          <IconComponent />
        </span>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 text-xs">
        {/* Header: method name + scope badge */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={cn(
            "font-semibold",
            isSuccess ? "text-gray-700 dark:text-gray-300" : "text-gray-600 dark:text-gray-400"
          )}>
            {methodName}
          </span>
          <span className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold",
            badgeColorClass
          )}>
            {scopeBadge}
          </span>
        </div>

        {/* Result text */}
        <p className={cn(
          "text-[11px]",
          isSuccess
            ? isPartialSuccess
              ? "text-amber-600 dark:text-amber-400"
              : "text-green-600 dark:text-green-400"
            : "text-red-500 dark:text-red-400"
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
      className="px-4 pb-3 max-h-[200px] overflow-y-auto border-t border-gray-100 dark:border-gray-800"
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
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
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
 * Displays "ATTEMPTING TO VERIFY:" label with the anchor text and quote box.
 */
export function AttemptingToVerify({ anchorText, fullPhrase }: AttemptingToVerifyProps) {
  const displayAnchorText = anchorText || fullPhrase?.slice(0, MAX_ANCHOR_TEXT_PREVIEW_LENGTH) || "Citation";
  const displayPhrase = fullPhrase || anchorText || "";

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wide">
        Attempting to verify:
      </div>
      <div className="text-[15px] font-semibold text-gray-800 dark:text-gray-200">
        {displayAnchorText}
      </div>
      {displayPhrase && (
        <QuoteBox phrase={displayPhrase} />
      )}
    </div>
  );
}
