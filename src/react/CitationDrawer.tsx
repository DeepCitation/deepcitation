import React, { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CitationDrawerItemProps, CitationDrawerProps, SourceCitationGroup } from "./CitationDrawer.types.js";
import { extractDomain, getStatusInfo } from "./CitationDrawer.utils.js";
import { formatCaptureDate } from "./dateUtils.js";
import { cn } from "./utils.js";

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
 * Shows favicon, source name, citation count, and aggregate status.
 */
function SourceGroupHeader({
  group,
  isCollapsed,
  onToggle,
}: {
  group: SourceCitationGroup;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const sourceName = group.sourceName || "Source";
  const citationCount = group.citations.length;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full px-4 py-2.5 flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b border-gray-200 dark:border-gray-700"
      aria-expanded={!isCollapsed}
    >
      {/* Chevron */}
      <svg
        className={cn(
          "w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0 transition-transform duration-200",
          !isCollapsed && "rotate-90",
        )}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>

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
    </button>
  );
}

/**
 * Individual citation item displayed in the drawer.
 * Shows source name, status, article title, snippet, page number, proof image, and click affordance.
 */
export const CitationDrawerItemComponent = React.memo(function CitationDrawerItemComponent({
  item,
  isLast = false,
  onClick,
  onReadMore,
  className,
}: CitationDrawerItemProps) {
  const { citation, verification } = item;
  const statusInfo = getStatusInfo(verification);

  // Get display values with fallbacks
  const isDocument = citation.type === "document" || (!citation.type && citation.attachmentId);
  const sourceName = isDocument
    ? (verification?.label || "Document")
    : (citation.siteName || citation.domain || extractDomain(citation.url) || "Source");
  const articleTitle = citation.anchorText || citation.title || citation.fullPhrase;
  const snippet = citation.fullPhrase || citation.description || verification?.actualContentSnippet || verification?.verifiedMatchSnippet;
  const faviconUrl = citation.faviconUrl;

  // Page number for document citations
  const pageNumber = citation.pageNumber ?? verification?.verifiedPageNumber;

  // Proof image
  const rawProofImage = verification?.verificationImageBase64;
  const proofImage = isValidProofImageSrc(rawProofImage) ? rawProofImage : null;

  // Crawl date for URL citations
  const formattedCrawlDate = !isDocument && verification?.crawledAt
    ? formatCaptureDate(verification.crawledAt)
    : null;

  const handleClick = useCallback(() => {
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
        "group px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors",
        !isLast && "border-b border-gray-200 dark:border-gray-700",
        className,
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
      <div className="flex items-start gap-3">
        {/* Favicon */}
        <div className="flex-shrink-0 mt-0.5">
          {faviconUrl ? (
            <img
              src={faviconUrl}
              alt=""
              className="w-5 h-5 rounded object-contain"
              loading="lazy"
              onError={handleFaviconError}
            />
          ) : (
            <div className="w-5 h-5 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <span className="text-xs text-gray-500 dark:text-gray-400">{sourceName.charAt(0).toUpperCase()}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Source name with status indicator and page number */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{sourceName}</span>
            <span
              className={cn(
                "inline-flex w-3 h-3",
                statusInfo.color,
                verification?.status === "pending" || verification?.status === "loading" ? "animate-spin" : "",
              )}
              title={statusInfo.label}
            >
              {statusInfo.icon}
            </span>
            {pageNumber != null && pageNumber > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                p.{pageNumber}
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

          {/* Capture date for URL citations */}
          {formattedCrawlDate && (
            <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500" title={formattedCrawlDate.tooltip}>
              Retrieved {formattedCrawlDate.display}
            </p>
          )}

          {/* Proof image thumbnail */}
          {proofImage && (
            <div className="mt-2">
              <img
                src={proofImage}
                alt="Verification proof"
                className="rounded border border-gray-200 dark:border-gray-700 max-h-16 w-auto object-cover"
                loading="lazy"
              />
            </div>
          )}
        </div>

        {/* Click affordance chevron */}
        {onClick && (
          <svg
            className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
    </div>
  );
});

/**
 * CitationDrawer displays a collection of citations in a drawer/bottom sheet.
 * Citations are grouped by source with collapsible sections.
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
 *
 * @example With click handlers
 * ```tsx
 * <CitationDrawer
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   citationGroups={citationGroups}
 *   onCitationClick={(item) => safeWindowOpen(item.citation.sourceUrl)}
 *   onReadMore={(item) => console.log('Read more:', item)}
 * />
 * ```
 */
export function CitationDrawer({
  isOpen,
  onClose,
  citationGroups,
  title = "Citations",
  showMoreSection = true,
  maxVisibleItems = 3,
  onCitationClick,
  onReadMore,
  className,
  position = "bottom",
  renderCitationItem,
}: CitationDrawerProps) {
  const [showMore, setShowMore] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

  const toggleGroup = useCallback((index: number) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Flatten all citations for "More" section counting
  const totalCitations = useMemo(() => {
    return citationGroups.reduce((sum, g) => sum + g.citations.length, 0);
  }, [citationGroups]);

  // Build visible groups with per-citation limit for "More" section
  const { visibleGroups, hasMore, moreCount } = useMemo(() => {
    if (!showMoreSection || showMore) {
      return { visibleGroups: citationGroups, hasMore: false, moreCount: 0 };
    }

    // Build visible groups, slicing citations within groups if needed
    const result: SourceCitationGroup[] = [];
    let remaining = maxVisibleItems;

    for (const group of citationGroups) {
      if (remaining <= 0) break;

      if (group.citations.length <= remaining) {
        result.push(group);
        remaining -= group.citations.length;
      } else {
        // Split this group: show only `remaining` citations
        result.push({
          ...group,
          citations: group.citations.slice(0, remaining),
          additionalCount: Math.max(0, remaining - 1),
        });
        remaining = 0;
      }
    }

    const visibleCount = result.reduce((sum, g) => sum + g.citations.length, 0);
    const hiddenCount = totalCitations - visibleCount;
    return {
      visibleGroups: result,
      hasMore: hiddenCount > 0,
      moreCount: hiddenCount,
    };
  }, [citationGroups, showMoreSection, showMore, maxVisibleItems, totalCitations]);

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
    const isCollapsed = collapsedGroups.has(groupIndex);
    const showGroupHeader = citationGroups.length > 1;

    return (
      <div key={`${group.sourceDomain ?? group.sourceName}-${groupIndex}`}>
        {showGroupHeader && (
          <SourceGroupHeader
            group={group}
            isCollapsed={isCollapsed}
            onToggle={() => toggleGroup(groupIndex)}
          />
        )}
        {(!showGroupHeader || !isCollapsed) && (
          <div
            className={cn(
              "transition-all duration-200",
              showGroupHeader && !isCollapsed && "animate-in fade-in-0 duration-150",
            )}
          >
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
        )}
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
          "fixed z-[9999] bg-white dark:bg-gray-900 shadow-xl flex flex-col",
          "animate-in duration-200",
          position === "bottom" && "inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl slide-in-from-bottom-4",
          position === "right" && "inset-y-0 right-0 w-full max-w-md slide-in-from-right-4",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Handle bar (mobile) */}
        {position === "bottom" && (
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        )}

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
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

        {/* Citation list */}
        <div className="flex-1 overflow-y-auto">
          {totalCitations === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No citations to display</div>
          ) : (
            <>
              {visibleGroups.map((group, groupIndex) =>
                renderGroup(group, groupIndex, !hasMore && groupIndex === visibleGroups.length - 1),
              )}

              {/* More section */}
              {hasMore && !showMore && (
                <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setShowMore(true)}
                    className="text-sm font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    More ({moreCount})
                  </button>
                </div>
              )}

              {/* Expanded "more" groups */}
              {showMore &&
                citationGroups.slice(visibleGroups.length).map((group, i) => {
                  const groupIndex = visibleGroups.length + i;
                  return renderGroup(group, groupIndex, groupIndex === citationGroups.length - 1);
                })}
            </>
          )}
        </div>
      </div>
    </>
  );

  // Render via portal
  return createPortal(drawerContent, document.body);
}
