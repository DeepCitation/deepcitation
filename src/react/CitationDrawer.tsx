import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { SearchAttempt, SearchMethod, SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import type {
  CitationDrawerItem,
  CitationDrawerItemProps,
  CitationDrawerProps,
  SourceCitationGroup,
} from "./CitationDrawer.types.js";
import {
  computeStatusSummary,
  extractDomain,
  getItemStatusCategory,
  getStatusInfo,
  STATUS_DISPLAY_MAP,
  sortGroupsByWorstStatus,
} from "./CitationDrawer.utils.js";
import {
  getPortalContainer,
  isValidProofImageSrc,
  Z_INDEX_BACKDROP_DEFAULT,
  Z_INDEX_DRAWER_BACKDROP_VAR,
  Z_INDEX_DRAWER_VAR,
  Z_INDEX_OVERLAY_DEFAULT,
} from "./constants.js";
import { formatCaptureDate } from "./dateUtils.js";
import { HighlightedPhrase } from "./HighlightedPhrase.js";
import { CheckIcon, ExternalLinkIcon, MissIcon } from "./icons.js";
import { flattenCitations, StackedStatusIcons } from "./CitationDrawerTrigger.js";
import { buildSearchSummary } from "./searchSummaryUtils.js";
import { isValidProofUrl, sanitizeUrl } from "./urlUtils.js";
import { cn } from "./utils.js";
import { FaviconImage, PagePill } from "./VerificationLog.js";

// =========
// Drawer-adapted method display names (subset of VerificationLog's METHOD_DISPLAY_NAMES)
// =========

const DRAWER_METHOD_NAMES: Record<SearchMethod, string> = {
  exact_line_match: "Exact location",
  line_with_buffer: "Nearby lines",
  expanded_line_buffer: "Extended nearby",
  current_page: "Expected page",
  anchor_text_fallback: "Anchor text",
  adjacent_pages: "Nearby pages",
  expanded_window: "Wider area",
  regex_search: "Full document",
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

// =========
// DrawerVerificationSummary — flat verification display shown directly on expand
// =========

/** Get a human-readable match type from a successful attempt or status. */
function getMatchType(status: SearchStatus | null | undefined, searchAttempts: SearchAttempt[]): string {
  if (!status || status === "not_found") {
    const count = searchAttempts.length;
    return `${count} ${count === 1 ? "search" : "searches"} tried`;
  }

  const successfulAttempt = searchAttempts.find(a => a.success);
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

/** Max phrase length in drawer context */
const DRAWER_MAX_PHRASE_LENGTH = 50;

/**
 * Compact verification summary for the drawer.
 * Shown directly when an item is expanded — no nested collapse/expand.
 *
 * Found/partial: single card with match info + method + location.
 * Not_found: compact list of unique methods tried.
 */
function DrawerVerificationSummary({
  searchAttempts,
  status,
}: {
  searchAttempts: SearchAttempt[];
  status: SearchStatus | null | undefined;
}) {
  if (searchAttempts.length === 0) return null;

  const isMiss = status === "not_found";
  const matchType = getMatchType(status, searchAttempts);
  const successfulAttempt = searchAttempts.find(a => a.success);

  // For found/partial: show a compact match card
  if (!isMiss && successfulAttempt) {
    const phrase = successfulAttempt.searchPhrase ?? "";
    const displayPhrase =
      phrase.length > DRAWER_MAX_PHRASE_LENGTH ? `${phrase.slice(0, DRAWER_MAX_PHRASE_LENGTH)}...` : phrase;
    const methodName = DRAWER_METHOD_NAMES[successfulAttempt.method] ?? "Search";
    const foundPage = successfulAttempt.foundLocation?.page ?? successfulAttempt.pageSearched;
    const locationText = foundPage != null ? `Page ${foundPage}` : "";

    return (
      <div className="px-4 py-2.5">
        <div className="p-2.5 bg-white dark:bg-gray-900/50 rounded-md border border-gray-100 dark:border-gray-800">
          <div className="flex items-start gap-2">
            <span className="size-3.5 mt-0.5 shrink-0 text-green-600 dark:text-green-400">
              <CheckIcon />
            </span>
            <span className="text-xs text-gray-700 dark:text-gray-200 break-all border-l-2 border-gray-300 dark:border-gray-600 pl-1.5">
              {displayPhrase || matchType}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-400 dark:text-gray-500 pl-[22px]">
            <span>
              {matchType} · {methodName}
            </span>
            {locationText && <span>{locationText}</span>}
          </div>
        </div>
      </div>
    );
  }

  // For not_found: show unique methods tried as a compact list
  const uniqueMethods: string[] = [];
  const seen = new Set<string>();
  for (const attempt of searchAttempts) {
    const name = DRAWER_METHOD_NAMES[attempt.method] ?? attempt.method;
    if (!seen.has(name)) {
      seen.add(name);
      uniqueMethods.push(name);
    }
  }

  return (
    <div className="px-4 py-2.5">
      <div className="p-2.5 bg-white dark:bg-gray-900/50 rounded-md border border-gray-100 dark:border-gray-800">
        <div className="flex items-start gap-2">
          <span className="size-3.5 mt-0.5 shrink-0 text-red-500 dark:text-red-400">
            <MissIcon />
          </span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{matchType}</span>
        </div>
        <div className="mt-1.5 pl-[22px] text-[11px] text-gray-400 dark:text-gray-500">
          Searched: {uniqueMethods.join(", ")}
        </div>
      </div>
    </div>
  );
}

// =========
// Utilities: sourceLabelMap lookup
// =========

/**
 * Look up a friendly display label from the sourceLabelMap for a citation.
 * Tries citation.attachmentId first, then citation.url.
 */
function lookupSourceLabel(
  citation: { attachmentId?: string; url?: string } | undefined,
  sourceLabelMap: Record<string, string> | undefined,
): string | undefined {
  if (!sourceLabelMap || !citation) return undefined;
  if (citation.attachmentId && sourceLabelMap[citation.attachmentId]) {
    return sourceLabelMap[citation.attachmentId];
  }
  if (citation.url && sourceLabelMap[citation.url]) {
    return sourceLabelMap[citation.url];
  }
  return undefined;
}

/**
 * Count words in a string (splits on whitespace).
 */
function wordCount(str: string): number {
  return str.trim().split(/\s+/).length;
}

// HighlightedPhrase — imported from ./HighlightedPhrase.js (canonical location)

// =========
// SourceGroupHeader
// =========

/**
 * Source group header displayed in the drawer.
 * Shows favicon (or letter avatar for documents), source name,
 * external link for URL sources, and citation count.
 */
function SourceGroupHeader({
  group,
  sourceLabelMap,
}: {
  group: SourceCitationGroup;
  sourceLabelMap?: Record<string, string>;
}) {
  const firstCitation = group.citations[0]?.citation;
  const labelOverride = lookupSourceLabel(firstCitation, sourceLabelMap);
  const sourceName = labelOverride || group.sourceName || "Source";
  const citationCount = group.citations.length;
  const isUrlSource = !!group.sourceDomain;

  // For URL sources, get a link to visit
  const sourceUrl = isUrlSource && firstCitation?.type === "url" ? firstCitation.url : undefined;
  const safeSourceUrl = sourceUrl ? sanitizeUrl(sourceUrl) : null;

  return (
    <div
      className="w-full px-4 py-2.5 flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700"
      role="heading"
      aria-level={3}
      aria-label={`Source: ${sourceName}${isUrlSource && group.sourceDomain && group.sourceDomain !== sourceName ? ` (${group.sourceDomain})` : ""}${citationCount > 1 ? `, ${citationCount} citations` : ""}`}
    >
      {/* Favicon for URL sources, letter avatar for documents */}
      <div className="shrink-0">
        {isUrlSource ? (
          <FaviconImage faviconUrl={group.sourceFavicon || null} domain={group.sourceDomain || null} alt={sourceName} />
        ) : (
          <div className="w-4 h-4 rounded-sm bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400">
              {sourceName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Source name and domain (for URL sources, show domain in muted text) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 text-left truncate">{sourceName}</span>
        {isUrlSource && group.sourceDomain && group.sourceDomain !== sourceName && (
          <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{group.sourceDomain}</span>
        )}
      </div>

      {/* External link for URL sources */}
      {safeSourceUrl && (
        <a
          href={safeSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
          aria-label={`Open ${sourceName} in new tab`}
          onClick={e => e.stopPropagation()}
        >
          <span className="size-3.5 block">
            <ExternalLinkIcon />
          </span>
        </a>
      )}

      {/* Citation count badge — only shown when > 1 (single item is self-evident) */}
      {citationCount > 1 && (
        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{citationCount} citations</span>
      )}
    </div>
  );
}

// =========
// Utilities
// =========

/**
 * Format a verification date for display.
 * Recent dates show relative time; older dates show short absolute format.
 */
function formatCheckedDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;

  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) return null; // future date

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// =========
// NotFoundCallout — enhanced not-found display aligned with popover
// =========

function NotFoundCallout({
  searchAttempts,
  verification,
  proofImage,
}: {
  searchAttempts: SearchAttempt[];
  verification?: Verification | null;
  proofImage?: string | null;
}) {
  const summary = buildSearchSummary(searchAttempts, verification);

  let searchDescription: string;
  if (summary.includesFullDocScan) {
    searchDescription = "Searched the full document.";
  } else if (summary.pageRange) {
    searchDescription = `Searched ${summary.pageRange}.`;
  } else {
    searchDescription = `Ran ${summary.totalAttempts} ${summary.totalAttempts === 1 ? "search" : "searches"}.`;
  }

  if (summary.closestMatch) {
    const truncated =
      summary.closestMatch.text.length > 60
        ? `${summary.closestMatch.text.slice(0, 60)}...`
        : summary.closestMatch.text;
    searchDescription += ` Closest match: "${truncated}"`;
    if (summary.closestMatch.page) {
      searchDescription += ` on page ${summary.closestMatch.page}`;
    }
    searchDescription += ".";
  }

  return (
    <div className="px-4 py-2.5">
      <div className="p-2.5 rounded-md border border-dashed border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30">
        <div className="flex items-start gap-2">
          <span className="size-3.5 mt-0.5 shrink-0 text-red-500 dark:text-red-400">
            <MissIcon />
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-red-700 dark:text-red-300">Citation not found</span>
            <div className="mt-1 text-[11px] text-red-500/80 dark:text-red-400/70">{searchDescription}</div>
          </div>
        </div>

        {/* Proof image thumbnail for context */}
        {proofImage && (
          <img
            src={proofImage}
            alt="Searched page"
            className="mt-2 w-full rounded border border-red-200 dark:border-red-800/50"
            loading="lazy"
          />
        )}
      </div>
    </div>
  );
}

// =========
// CitationDrawerItemComponent
// =========

/**
 * Individual citation item displayed in the drawer.
 * Shows status + anchor text summary, expands to show compact verification details.
 */
export const CitationDrawerItemComponent = React.memo(function CitationDrawerItemComponent({
  item,
  isLast = false,
  onClick,
  onReadMore,
  className,
  indicatorVariant = "icon",
  hideSourceName = false,
  defaultExpanded = false,
  style,
  sourceLabelMap,
}: CitationDrawerItemProps) {
  const { citation, verification } = item;
  const statusInfo = useMemo(() => getStatusInfo(verification, indicatorVariant), [verification, indicatorVariant]);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [wasAutoExpanded, setWasAutoExpanded] = useState(defaultExpanded);

  // Sync expanded state when defaultExpanded changes from false → true
  // (useState initializer only runs on mount; this handles async autoExpandKeys updates)
  useEffect(() => {
    if (defaultExpanded) {
      setIsExpanded(true);
      setWasAutoExpanded(true);
    }
  }, [defaultExpanded]);

  // Get display values with fallbacks
  const sourceName =
    citation.type === "url"
      ? citation.siteName || citation.domain || extractDomain(citation.url) || "Source"
      : lookupSourceLabel(citation, sourceLabelMap) || verification?.label || "Document";
  const articleTitle =
    (citation.type === "url" ? citation.title : undefined) || citation.anchorText || citation.fullPhrase;
  const snippet =
    (citation.type === "url" ? citation.description : undefined) ||
    citation.fullPhrase ||
    verification?.url?.actualContentSnippet ||
    verification?.verifiedMatchSnippet;
  const _faviconUrl = citation.type === "url" ? citation.faviconUrl : undefined;

  // Merge anchor text + fullPhrase when anchor is a substring of fullPhrase
  // and fullPhrase has 2+ more words. Avoids stuttered display of near-duplicates.
  const anchorText = citation.anchorText?.toString();
  const fullPhrase = citation.fullPhrase;
  const shouldMergePhrase =
    anchorText &&
    fullPhrase &&
    anchorText !== fullPhrase &&
    fullPhrase.includes(anchorText) &&
    wordCount(fullPhrase) - wordCount(anchorText) >= 2;

  // Suppress redundant snippet when it duplicates the title+anchor display
  const isSnippetRedundant =
    snippet === fullPhrase && articleTitle === anchorText && !!anchorText && fullPhrase?.includes(anchorText);
  // Suppress source name when it matches the article title (already visible)
  const isSourceRedundant = hideSourceName || !sourceName || sourceName === articleTitle;

  // Page number for document citations
  const pageNumber =
    (citation.type !== "url" ? citation.pageNumber : undefined) ?? verification?.document?.verifiedPageNumber;

  // Proof image (only shown in expanded view)
  const rawProofImage = verification?.document?.verificationImageSrc;
  const proofImage = isValidProofImageSrc(rawProofImage) ? rawProofImage : null;

  // Status category (uses canonical logic from getItemStatusCategory)
  const statusCategory = getItemStatusCategory(item);
  const isPending = statusCategory === "pending";
  const isNotFound = statusCategory === "notFound";
  const isVerified = statusCategory === "verified";

  // Border color from STATUS_DISPLAY_MAP — single source of truth for status styling
  const statusBorderColor = STATUS_DISPLAY_MAP[statusCategory].borderColor;

  // Verification date
  const checkedDate = formatCheckedDate(verification?.verifiedAt ?? verification?.url?.crawledAt);

  // Crawl date for URL citations (absolute format for audit precision)
  const isDocument = citation.type === "document" || (!citation.type && citation.attachmentId);
  const formattedCrawlDate =
    !isDocument && verification?.url?.crawledAt ? formatCaptureDate(verification.url.crawledAt) : null;

  // Search attempts for verification summary
  const searchAttempts = verification?.searchAttempts ?? [];

  // Proof URL for document citations (manual verification link)
  const proofUrl = verification?.proof?.proofUrl ? isValidProofUrl(verification.proof.proofUrl) : null;

  const handleClick = useCallback(() => {
    setIsExpanded(prev => !prev);
    onClick?.(item);
  }, [item, onClick]);

  const handleReadMore = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onReadMore?.(item);
    },
    [item, onReadMore],
  );

  // Source URL for "open page" link (URL citations only)
  const sourceUrl = citation.type === "url" && citation.url ? sanitizeUrl(citation.url) : null;

  return (
    <div
      className={cn(
        "cursor-pointer transition-colors border-l-[3px] animate-in fade-in-0 slide-in-from-bottom-1 duration-200 fill-mode-backwards",
        !isLast && "border-b border-gray-200 dark:border-gray-700",
        isExpanded ? statusBorderColor : "border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50",
        // Mute verified items to draw attention to problems
        isVerified && !isExpanded && "opacity-75",
        className,
      )}
      style={style}
    >
      {/* Clickable summary row */}
      <div
        className={cn(
          "group px-4 py-3",
          // Blue-tinted highlight when expanded so the summary stands out from the detail area
          isExpanded && "bg-blue-50/60 dark:bg-blue-950/30",
        )}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <div className="flex items-start gap-3">
          {/* Status indicator */}
          <div className="shrink-0 mt-0.5" data-testid="status-indicator">
            <span
              className={cn(
                "inline-flex w-5 h-5 items-center justify-center",
                statusInfo.color,
                isPending && indicatorVariant !== "dot" && "animate-spin",
              )}
              title={statusInfo.label}
            >
              {statusInfo.icon}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Source name — hidden when inside a group or redundant with title */}
            {!isSourceRedundant && <div className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">{sourceName}</div>}
            {/* Title/phrase row with page number and timestamp */}
            <div className="flex items-center gap-1.5">
              {shouldMergePhrase ? (
                <div className="text-sm text-gray-900 dark:text-gray-100 truncate" title={fullPhrase}>
                  <HighlightedPhrase fullPhrase={fullPhrase} anchorText={anchorText} />
                </div>
              ) : (
                articleTitle && (
                  <h4
                    className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2"
                    title={articleTitle}
                  >
                    {articleTitle}
                  </h4>
                )
              )}
              {pageNumber != null && pageNumber > 0 && (
                <PagePill
                  pageNumber={pageNumber}
                  colorScheme={
                    statusCategory === "verified"
                      ? "green"
                      : statusCategory === "partial"
                        ? "amber"
                        : statusCategory === "notFound"
                          ? "red"
                          : "gray"
                  }
                />
              )}
              {checkedDate && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0 ml-auto">{checkedDate}</span>
              )}
            </div>
            {/* Snippet/description — skip when merged, redundant, or matches title */}
            {!shouldMergePhrase && !isSnippetRedundant && snippet && snippet !== articleTitle && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{snippet}</div>
            )}
            {/* Capture date for URL citations (absolute timestamp for audit precision) */}
            {formattedCrawlDate && (
              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500" title={formattedCrawlDate.tooltip}>
                Retrieved {formattedCrawlDate.display}
              </p>
            )}
          </div>

          {/* Expand/collapse chevron */}
          <svg
            aria-hidden="true"
            className={cn(
              "w-4 h-4 shrink-0 mt-1 transition-transform duration-200",
              isExpanded ? "rotate-180 text-gray-500 dark:text-gray-400" : "text-gray-400 dark:text-gray-500",
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded detail view — CSS grid animation for smooth height transition */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden" style={{ minHeight: 0 }}>
          <div
            className={cn(
              "border-t border-gray-100 dark:border-gray-800",
              isNotFound ? "bg-red-50/50 dark:bg-red-950/20" : "bg-gray-50 dark:bg-gray-800/50",
              wasAutoExpanded && isNotFound && "animate-[dc-pulse-once_1.2s_ease-out]",
            )}
            onAnimationEnd={() => setWasAutoExpanded(false)}
          >
            {/* Proof image — static display at full width (not-found uses NotFoundCallout below) */}
            {!isNotFound && proofImage && (
              <div className="px-4 py-2">
                <img
                  src={proofImage}
                  alt="Verification proof"
                  className="w-full rounded border border-gray-200 dark:border-gray-700"
                  loading="lazy"
                />
              </div>
            )}

            {/* Enhanced not-found callout with search analysis */}
            {isNotFound && searchAttempts.length > 0 && (
              <NotFoundCallout
                searchAttempts={searchAttempts}
                verification={verification}
                proofImage={proofImage}
              />
            )}

            {/* Verification summary — shown for non-not-found statuses */}
            {!isNotFound && searchAttempts.length > 0 && (
              <DrawerVerificationSummary searchAttempts={searchAttempts} status={verification?.status} />
            )}

            {/* Snippet fallback when no search attempts (shows full phrase context) */}
            {searchAttempts.length === 0 && snippet && snippet !== articleTitle && (
              <div className="px-4 py-2">
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-4">
                  {snippet}
                  {onReadMore && snippet.length > 100 && (
                    <button
                      type="button"
                      onClick={handleReadMore}
                      className="ml-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Read more
                    </button>
                  )}
                </p>
              </div>
            )}

            {/* Open page — consistent action for all expanded URL citations */}
            {sourceUrl && (
              <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  Open source page
                  <span className="size-3 block">
                    <ExternalLinkIcon />
                  </span>
                </a>
              </div>
            )}

            {/* Proof URL link for document citations */}
            {!sourceUrl && proofUrl && (
              <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  View proof page
                  <span className="size-3 block">
                    <ExternalLinkIcon />
                  </span>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inline keyframe for not-found pulse highlight — scoped, no global CSS needed */}
      {wasAutoExpanded && isNotFound && (
        <style>{`
          @keyframes dc-pulse-once {
            0% { background-color: transparent; }
            30% { background-color: rgba(239, 68, 68, 0.08); }
            100% { background-color: transparent; }
          }
          @media (prefers-reduced-motion: reduce) {
            .animate-\\[dc-pulse-once_1\\.2s_ease-out\\] { animation: none !important; }
          }
        `}</style>
      )}
    </div>
  );
});

// =========
// CompactSingleCitationRow — merged header+item for single-citation groups
// =========

/**
 * Compact row for groups with exactly 1 citation.
 * Merges group header and citation item into one line:
 * [favicon/letter] Source Name · status-icon · "anchor text" · p.N
 */
function CompactSingleCitationRow({
  group,
  sourceLabelMap,
  isLast = false,
  onClick,
  indicatorVariant = "icon",
}: {
  group: SourceCitationGroup;
  sourceLabelMap?: Record<string, string>;
  isLast?: boolean;
  onClick?: (item: CitationDrawerItem) => void;
  indicatorVariant?: "icon" | "dot";
}) {
  const item = group.citations[0];
  const { citation, verification } = item;
  const statusInfo = getStatusInfo(verification, indicatorVariant);
  const isPending = !verification?.status || verification.status === "pending" || verification.status === "loading";

  const labelOverride = lookupSourceLabel(citation, sourceLabelMap);
  const sourceName = labelOverride || group.sourceName || "Source";
  const isUrlSource = !!group.sourceDomain;

  const anchorText = citation.anchorText?.toString() || citation.fullPhrase;
  const displayText = anchorText || null;

  const pageNumber =
    (citation.type !== "url" ? citation.pageNumber : undefined) ?? verification?.document?.verifiedPageNumber;

  const handleClick = useCallback(() => onClick?.(item), [item, onClick]);

  return (
    <div
      className={cn(
        "px-4 py-2.5 flex items-center gap-2.5 cursor-pointer transition-colors",
        "hover:bg-gray-50 dark:hover:bg-gray-800/50",
        !isLast && "border-b border-gray-200 dark:border-gray-700",
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Favicon or letter avatar */}
      <div className="shrink-0">
        {isUrlSource ? (
          <FaviconImage faviconUrl={group.sourceFavicon || null} domain={group.sourceDomain || null} alt={sourceName} />
        ) : (
          <div className="w-4 h-4 rounded-sm bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400">
              {sourceName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Source name */}
      <span className="text-sm text-gray-600 dark:text-gray-400 truncate flex-1 min-w-0" title={sourceName}>
        {sourceName}
      </span>

      {/* Status indicator */}
      <span
        className={cn(
          "inline-flex w-4 h-4 items-center justify-center shrink-0",
          statusInfo.color,
          isPending && indicatorVariant !== "dot" && "animate-spin",
        )}
        title={statusInfo.label}
      >
        {statusInfo.icon}
      </span>

      {/* Anchor text */}
      {displayText && (
        <span className="text-sm text-gray-900 dark:text-gray-100 truncate flex-1 min-w-0" title={displayText}>
          {displayText}
        </span>
      )}

      {/* Page number */}
      {pageNumber != null && pageNumber > 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">p.{pageNumber}</span>
      )}
    </div>
  );
}

// =========
// CitationDrawer
// =========

/**
 * CitationDrawer displays a collection of citations in a drawer/bottom sheet.
 * Citations are grouped by source with always-expanded sections. No collapse/expand toggle —
 * the full list is scrollable.
 *
 * @example Basic usage
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 * const citationGroups = groupCitationsBySource(citations);
 *
 * <CitationDrawer
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   citationGroups={citationGroups}
 * />
 * ```
 */
export function CitationDrawer({
  isOpen,
  onClose,
  citationGroups,
  title = "Citations",
  // showMoreSection and maxVisibleItems are deprecated — accepted but ignored
  showMoreSection: _showMoreSection,
  maxVisibleItems: _maxVisibleItems,
  onCitationClick,
  onReadMore,
  className,
  position = "bottom",
  renderCitationItem,
  indicatorVariant = "icon",
  sourceLabelMap,
}: CitationDrawerProps): React.ReactNode {
  // Status summary for header and progress bar
  const summary = useMemo(() => computeStatusSummary(citationGroups), [citationGroups]);

  // Sorted groups for display
  const sortedGroups = useMemo(() => sortGroupsByWorstStatus(citationGroups), [citationGroups]);

  // Flatten all citations for total count and header icons
  const totalCitations = summary.total;
  const flatCitations = useMemo(() => flattenCitations(citationGroups), [citationGroups]);

  // Handle escape key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Don't render if closed
  if (!isOpen) return null;

  // Track stagger index across groups for entrance animation
  let staggerIndex = 0;

  const renderGroup = (group: SourceCitationGroup, groupIndex: number, isLastGroup: boolean) => {
    const key = `${group.sourceDomain ?? group.sourceName}-${groupIndex}`;

    // Single-citation groups: render as one compact row (no header + item split)
    if (group.citations.length === 1 && !renderCitationItem) {
      staggerIndex++;
      return (
        <CompactSingleCitationRow
          key={key}
          group={group}
          isLast={isLastGroup}
          onClick={onCitationClick}
          indicatorVariant={indicatorVariant}
          sourceLabelMap={sourceLabelMap}
        />
      );
    }

    // Multi-citation groups: header + items
    return (
      <div key={key}>
        <SourceGroupHeader group={group} sourceLabelMap={sourceLabelMap} />
        <div>
          {group.citations.map((item, index) => {
            const delay = staggerIndex * 35;
            staggerIndex++;
            return renderCitationItem ? (
              <React.Fragment key={item.citationKey}>{renderCitationItem(item)}</React.Fragment>
            ) : (
              <CitationDrawerItemComponent
                key={item.citationKey}
                item={item}
                isLast={isLastGroup && index === group.citations.length - 1}
                onClick={onCitationClick}
                onReadMore={onReadMore}
                indicatorVariant={indicatorVariant}
                hideSourceName
                sourceLabelMap={sourceLabelMap}

                style={{ animationDelay: `${delay}ms` }}
              />
            );
          })}
        </div>
      </div>
    );
  };

  const drawerContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm animate-in fade-in-0 duration-150"
        style={{ zIndex: `var(${Z_INDEX_DRAWER_BACKDROP_VAR}, ${Z_INDEX_BACKDROP_DEFAULT})` } as React.CSSProperties}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed bg-white dark:bg-gray-900 flex flex-col",
          "animate-in duration-200",
          position === "bottom" && "inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl slide-in-from-bottom-4",
          position === "right" && "inset-y-0 right-0 w-full max-w-md slide-in-from-right-4",
          className,
        )}
        style={{ zIndex: `var(${Z_INDEX_DRAWER_VAR}, ${Z_INDEX_OVERLAY_DEFAULT})` } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Handle bar (mobile) */}
        {position === "bottom" && (
          <div className="flex justify-center pt-2 pb-0.5 shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        )}

        {/* Header with summary, progress bar, and view toggle */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
              {totalCitations > 0 && (
                <div className="mt-0.5">
                  <StackedStatusIcons
                    flatCitations={flatCitations}
                    isHovered={false}
                    maxIcons={5}
                    hoveredIndex={null}
                    onIconHover={() => {}}
                    onIconLeave={() => {}}
                    showProofThumbnails={false}
                    indicatorVariant={indicatorVariant}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5 text-gray-500 dark:text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Citation list */}
        <div className="flex-1 overflow-y-auto">
          {totalCitations === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No citations to display</div>
          ) : (
            sortedGroups.map((group, groupIndex) =>
              renderGroup(group, groupIndex, groupIndex === sortedGroups.length - 1),
            )
          )}
        </div>
      </div>
    </>
  );

  // Render via portal (SSR-safe: skip if document.body unavailable)
  const portalContainer = getPortalContainer();
  if (!portalContainer) return null;
  return createPortal(drawerContent, portalContainer);
}
