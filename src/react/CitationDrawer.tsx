import React, { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CitationDrawerItemProps, CitationDrawerProps, SourceCitationGroup } from "./CitationDrawer.types.js";
import { extractDomain, getStatusInfo } from "./CitationDrawer.utils.js";
import { SourceContextHeader } from "./VerificationLog.js";
import { cn, isUrlCitation } from "./utils.js";

/**
 * Module-level handler for hiding broken favicon images.
 * Performance fix: avoids creating new function references on every render.
 */
const handleFaviconError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.display = "none";
};

/** Safe raster image data URI prefixes (no SVG — can contain scripts). */
const SAFE_DATA_IMAGE_PREFIXES = ["data:image/png", "data:image/jpeg", "data:image/jpg", "data:image/webp", "data:image/avif", "data:image/gif"] as const;

/** Trusted CDN hostnames for proof images. */
const TRUSTED_IMAGE_HOSTS = ["api.deepcitation.com", "cdn.deepcitation.com"] as const;

/**
 * Validate that a proof image source is a trusted URL or safe data URI.
 * Blocks SVG data URIs (can contain script), case-insensitive, trims whitespace.
 */
function isValidProofImageSrc(src: unknown): src is string {
  if (typeof src !== "string") return false;
  const trimmed = src.trim();
  if (trimmed.length === 0) return false;

  // Data URI: allow only safe raster formats (no SVG)
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("data:")) {
    return SAFE_DATA_IMAGE_PREFIXES.some(prefix => lower.startsWith(prefix));
  }

  // HTTPS URL: validate via URL constructor, check against trusted hosts
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && (TRUSTED_IMAGE_HOSTS as readonly string[]).includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Source group header displayed in the drawer.
 * Shows favicon, source name, and citation count. Always expanded (no collapse toggle).
 */
function SourceGroupHeader({
  group,
}: {
  group: SourceCitationGroup;
}) {
  const sourceName = group.sourceName || "Source";
  const citationCount = group.citations.length;

  return (
    <div
      className="w-full px-4 py-2.5 flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700"
      role="heading"
      aria-level={3}
    >
      {/* Favicon */}
      <div className="flex-shrink-0">
        {group.sourceFavicon ? (
          <img
            src={group.sourceFavicon}
            alt=""
            className="w-4 h-4 rounded-sm object-contain"
            loading="lazy"
            onError={handleFaviconError}
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

      {/* Citation count badge */}
      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
        {citationCount} citation{citationCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

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

/**
 * Individual citation item displayed in the drawer.
 * Shows status indicator, source name, article title, snippet, and expandable detail view.
 */
export const CitationDrawerItemComponent = React.memo(function CitationDrawerItemComponent({
  item,
  isLast = false,
  onClick,
  onReadMore,
  className,
}: CitationDrawerItemProps) {
  const { citation, verification } = item;
  const statusInfo = useMemo(() => getStatusInfo(verification), [verification]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Get display values with fallbacks
  const isDocument = citation.type === "document" || (!citation.type && citation.attachmentId);
  const isUrl = isUrlCitation(citation);
  const sourceName = isDocument
    ? (verification?.label || "Document")
    : (citation.siteName || citation.domain || extractDomain(citation.url) || "Source");
  const articleTitle = citation.anchorText || citation.title;
  const snippet = citation.fullPhrase || citation.description || verification?.actualContentSnippet || verification?.verifiedMatchSnippet;

  // Page number for document citations
  const pageNumber = citation.pageNumber ?? verification?.verifiedPageNumber;

  // Proof image (only shown in expanded view)
  const rawProofImage = verification?.verificationImageBase64;
  const proofImage = isValidProofImageSrc(rawProofImage) ? rawProofImage : null;

  // Pending state
  const isPending = !verification?.status || verification.status === "pending" || verification.status === "loading";

  // Verification date
  const checkedDate = formatCheckedDate(verification?.verifiedAt ?? verification?.crawledAt);

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

  return (
    <div
      className={cn(
        "group hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors",
        !isLast && "border-b border-gray-200 dark:border-gray-700",
        className,
      )}
    >
      {/* Clickable summary row */}
      <div
        className="px-4 py-3"
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
          <div className="flex-shrink-0 mt-0.5" data-testid="status-indicator">
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
            {/* Source name with page number and timestamp */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{sourceName}</span>
              {pageNumber != null && pageNumber > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                  p.{pageNumber}
                </span>
              )}
              {checkedDate && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 ml-auto">
                  Checked {checkedDate}
                </span>
              )}
            </div>

            {/* Article title */}
            {articleTitle && (
              <h4 className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{articleTitle}</h4>
            )}

            {/* Snippet */}
            {snippet && snippet !== articleTitle && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
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
            )}
          </div>

          {/* Expand/collapse chevron (decorative — parent has aria-expanded) */}
          <svg
            aria-hidden="true"
            className={cn(
              "w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-1 transition-transform duration-200",
              isExpanded && "rotate-90",
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* Expanded detail view */}
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          {/* Reuse popover header — shows clickable URL/favicon for URLs, document icon/label for docs */}
          <SourceContextHeader
            citation={citation}
            verification={verification}
            status={verification?.status}
            sourceLabel={isDocument ? (verification?.label || undefined) : undefined}
          />

          {/* Proof image */}
          {proofImage && (
            <div className="px-4 py-2">
              <img
                src={proofImage}
                alt="Verification proof"
                className="rounded border border-gray-200 dark:border-gray-700 max-h-32 w-auto object-contain"
                loading="lazy"
              />
            </div>
          )}

          {/* URL link for inspection */}
          {isUrl && citation.url && (
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800">
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 inline-flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                Open source
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

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
    const showGroupHeader = citationGroups.length > 1;

    return (
      <div key={`${group.sourceDomain ?? group.sourceName}-${groupIndex}`}>
        {showGroupHeader && (
          <SourceGroupHeader group={group} />
        )}
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
        className="fixed inset-0 bg-black/40 z-[9998] animate-in fade-in-0 duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed z-[9999] bg-white dark:bg-gray-900 flex flex-col",
          "animate-in duration-200",
          position === "bottom" && "inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl slide-in-from-bottom-4",
          position === "right" && "inset-y-0 right-0 w-full max-w-md slide-in-from-right-4",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Handle bar (mobile) — reduced padding */}
        {position === "bottom" && (
          <div className="flex justify-center pt-2 pb-0.5 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        )}

        {/* Header — reduced padding */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
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

  // Render via portal
  return createPortal(drawerContent, document.body);
}
