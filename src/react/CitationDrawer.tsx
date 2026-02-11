import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { SearchAttempt, SearchMethod, SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import type { CitationDrawerItemProps, CitationDrawerProps, SourceCitationGroup } from "./CitationDrawer.types.js";
import { getStatusInfo } from "./CitationDrawer.utils.js";
import {
  COPY_FEEDBACK_DURATION_MS,
  getPortalContainer,
  isValidProofImageSrc,
  Z_INDEX_BACKDROP_DEFAULT,
  Z_INDEX_DRAWER_BACKDROP_VAR,
  Z_INDEX_DRAWER_VAR,
  Z_INDEX_OVERLAY_DEFAULT,
} from "./constants.js";
import { formatCaptureDate } from "./dateUtils.js";
import { CheckIcon, CopyIcon, ExternalLinkIcon, MissIcon, ZoomInIcon } from "./icons.js";
import { FaviconImage } from "./VerificationLog.js";
import { cn } from "./utils.js";
import { sanitizeUrl } from "./urlUtils.js";

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
      case "exact_full_phrase": return "Exact match";
      case "normalized_full_phrase": return "Normalized match";
      case "exact_anchor_text":
      case "normalized_anchor_text": return "Anchor text match";
      case "partial_full_phrase":
      case "partial_anchor_text": return "Partial match";
      case "first_word_only": return "First word match";
      default: return "Match found";
    }
  }

  switch (status) {
    case "found":
    case "found_phrase_missed_anchor_text": return "Exact match";
    case "found_anchor_text_only": return "Anchor text match";
    case "found_on_other_page":
    case "found_on_other_line": return "Found at different location";
    case "partial_text_found": return "Partial match";
    case "first_word_found": return "First word match";
    default: return "Match found";
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
    const displayPhrase = phrase.length > DRAWER_MAX_PHRASE_LENGTH
      ? `${phrase.slice(0, DRAWER_MAX_PHRASE_LENGTH)}...`
      : phrase;
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
            <span>{matchType} · {methodName}</span>
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
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
            {matchType}
          </span>
        </div>
        <div className="mt-1.5 pl-[22px] text-[11px] text-gray-400 dark:text-gray-500">
          Searched: {uniqueMethods.join(", ")}
        </div>
      </div>
    </div>
  );
}

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
}: {
  group: SourceCitationGroup;
}) {
  const sourceName = group.sourceName || "Source";
  const citationCount = group.citations.length;
  const isUrlSource = !!group.sourceDomain;

  // For URL sources, get a link to visit
  const sourceUrl = isUrlSource ? group.citations[0]?.citation.url : undefined;
  const safeSourceUrl = sourceUrl ? sanitizeUrl(sourceUrl) : null;

  return (
    <div
      className="w-full px-4 py-2.5 flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700"
      role="heading"
      aria-level={3}
    >
      {/* Favicon for URL sources, letter avatar for documents */}
      <div className="shrink-0">
        {isUrlSource ? (
          <FaviconImage
            faviconUrl={group.sourceFavicon || null}
            domain={group.sourceDomain || null}
            alt={sourceName}
          />
        ) : (
          <div className="w-4 h-4 rounded-sm bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400">
              {sourceName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Source name */}
      <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200 text-left truncate">
        {sourceName}
      </span>

      {/* External link for URL sources */}
      {safeSourceUrl && (
        <a
          href={safeSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
          aria-label={`Open ${sourceName} in new tab`}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="size-3.5 block"><ExternalLinkIcon /></span>
        </a>
      )}

      {/* Citation count badge */}
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
        {citationCount} citation{citationCount !== 1 ? "s" : ""}
      </span>
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
}: CitationDrawerItemProps) {
  const { citation, verification } = item;
  const statusInfo = useMemo(() => getStatusInfo(verification, indicatorVariant), [verification, indicatorVariant]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  // Auto-reset copy state
  useEffect(() => {
    if (copyState === "idle") return;
    const id = setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_DURATION_MS);
    return () => clearTimeout(id);
  }, [copyState]);

  // Get display values with fallbacks
  const sourceName = citation.siteName;
  const articleTitle = citation.title || citation.anchorText;
  const snippet = citation.description || citation.fullPhrase || verification?.actualContentSnippet || verification?.verifiedMatchSnippet;

  // Page number for document citations
  const pageNumber = citation.pageNumber ?? verification?.verifiedPageNumber;

  // Proof image (only shown in expanded view)
  const rawProofImage = verification?.verificationImageBase64;
  const proofImage = isValidProofImageSrc(rawProofImage) ? rawProofImage : null;

  // Pending state
  const isPending = !verification?.status || verification.status === "pending" || verification.status === "loading";

  // Verification date
  const checkedDate = formatCheckedDate(verification?.verifiedAt ?? verification?.crawledAt);

  // Crawl date for URL citations (absolute format for audit precision)
  const isDocument = citation.type === "document" || (!citation.type && citation.attachmentId);
  const formattedCrawlDate = !isDocument && verification?.crawledAt
    ? formatCaptureDate(verification.crawledAt)
    : null;

  // Search attempts for verification summary
  const searchAttempts = verification?.searchAttempts ?? [];

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

  const handleCopyAnchor = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const text = citation.anchorText?.toString() || articleTitle;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setCopyState("copied");
      } catch {
        setCopyState("error");
      }
    },
    [citation.anchorText, articleTitle],
  );

  return (
    <div
      className={cn(
        "cursor-pointer transition-colors",
        !isLast && "border-b border-gray-200 dark:border-gray-700",
        // Expanded: left accent border for visual distinction
        isExpanded
          ? "border-l-2 border-l-blue-400 dark:border-l-blue-500"
          : "border-l-2 border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50",
        className,
      )}
    >
      {/* Clickable summary row */}
      <div
        className={cn(
          "group px-4 py-3",
          // Subtle highlight when expanded so the summary stands out from the detail area
          isExpanded && "bg-gray-50/50 dark:bg-gray-800/30",
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
                isPending && "animate-spin",
              )}
              title={statusInfo.label}
            >
              {statusInfo.icon}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Source name (for URL citations) */}
            {sourceName && (
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-0.5">{sourceName}</div>
            )}
            {/* Anchor text with page number, copy button, and timestamp */}
            <div className="flex items-center gap-1.5">
              {articleTitle && (
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{articleTitle}</h4>
              )}
              {/* Copy anchor text button — always in DOM, opacity on hover (no layout shift) */}
              {articleTitle && (
                <button
                  type="button"
                  onClick={handleCopyAnchor}
                  className={cn(
                    "shrink-0 p-0.5 rounded transition-opacity cursor-pointer",
                    copyState === "copied"
                      ? "opacity-100 text-green-600 dark:text-green-400"
                      : "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
                  )}
                  aria-label={copyState === "copied" ? "Copied!" : "Copy anchor text"}
                  title={copyState === "copied" ? "Copied!" : "Copy"}
                >
                  <span className="size-3.5 block">{copyState === "copied" ? <CheckIcon /> : <CopyIcon />}</span>
                </button>
              )}
              {pageNumber != null && pageNumber > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                  p.{pageNumber}
                </span>
              )}
              {checkedDate && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0 ml-auto">
                  {checkedDate}
                </span>
              )}
            </div>
            {/* Snippet/description */}
            {snippet && snippet !== articleTitle && (
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
              isExpanded
                ? "rotate-180 text-gray-500 dark:text-gray-400"
                : "text-gray-400 dark:text-gray-500",
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

      {/* Expanded detail view */}
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          {/* Proof image — click to expand/collapse */}
          {proofImage && (
            <div className="px-4 py-2">
              <button
                type="button"
                className={cn(
                  "relative group/img block rounded border border-gray-200 dark:border-gray-700 overflow-hidden transition-all",
                  imageExpanded ? "cursor-zoom-out" : "cursor-zoom-in",
                )}
                onClick={(e) => { e.stopPropagation(); setImageExpanded(prev => !prev); }}
                aria-label={imageExpanded ? "Collapse proof image" : "Expand proof image"}
              >
                <img
                  src={proofImage}
                  alt="Verification proof"
                  className={cn(
                    "w-auto object-contain transition-[max-height] duration-200",
                    imageExpanded ? "max-h-[600px]" : "max-h-40",
                  )}
                  loading="lazy"
                />
                {/* Hover overlay with zoom hint (only when collapsed) */}
                {!imageExpanded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/img:bg-black/10 transition-colors">
                    <span className="opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-1 text-xs text-white bg-black/60 rounded px-2 py-1">
                      <span className="size-3.5"><ZoomInIcon /></span>
                      Expand
                    </span>
                  </div>
                )}
              </button>
            </div>
          )}

          {/* Verification summary — shown directly, no nested collapse */}
          {searchAttempts.length > 0 && (
            <DrawerVerificationSummary
              searchAttempts={searchAttempts}
              status={verification?.status}
            />
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

        </div>
      )}
    </div>
  );
});

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
}: CitationDrawerProps) {
  // Flatten all citations for total count
  const totalCitations = useMemo(() => {
    return citationGroups.reduce((sum, g) => sum + g.citations.length, 0);
  }, [citationGroups]);

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

  const renderGroup = (group: SourceCitationGroup, groupIndex: number, isLastGroup: boolean) => {
    return (
      <div key={`${group.sourceDomain ?? group.sourceName}-${groupIndex}`}>
        {/* Always show group header — it's the only source identity */}
        <SourceGroupHeader group={group} />
        <div>
          {group.citations.map((item, index) =>
            renderCitationItem ? (
              <React.Fragment key={item.citationKey}>{renderCitationItem(item)}</React.Fragment>
            ) : (
              <CitationDrawerItemComponent
                key={item.citationKey}
                item={item}
                isLast={isLastGroup && index === group.citations.length - 1}
                onClick={onCitationClick}
                onReadMore={onReadMore}
                indicatorVariant={indicatorVariant}
              />
            ),
          )}
        </div>
      </div>
    );
  };

  const drawerContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 animate-in fade-in-0 duration-150"
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
        {/* Handle bar (mobile) — reduced padding */}
        {position === "bottom" && (
          <div className="flex justify-center pt-2 pb-0.5 shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        )}

        {/* Header — reduced padding */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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

        {/* Citation list — always fully expanded and scrollable */}
        <div className="flex-1 overflow-y-auto">
          {totalCitations === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No citations to display</div>
          ) : (
            citationGroups.map((group, groupIndex) =>
              renderGroup(group, groupIndex, groupIndex === citationGroups.length - 1),
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
