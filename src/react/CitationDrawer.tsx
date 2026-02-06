import React, { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CitationDrawerItemProps, CitationDrawerProps } from "./CitationDrawer.types.js";
import { extractDomain, getStatusInfo } from "./CitationDrawer.utils.js";
import { cn } from "./utils.js";

/**
 * Module-level handler for hiding broken favicon images.
 * Performance fix: avoids creating new function references on every render.
 */
const handleFaviconError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.display = "none";
};

/**
 * Individual citation item displayed in the drawer.
 * Shows favicon, source name, article title, and snippet.
 */
export function CitationDrawerItemComponent({
  item,
  isLast = false,
  onClick,
  onReadMore,
  className,
}: CitationDrawerItemProps) {
  const { citation, verification } = item;
  const statusInfo = getStatusInfo(verification);

  // Get display values with fallbacks (using main's field names)
  const sourceName = citation.siteName || citation.domain || extractDomain(citation.url) || "Source";
  const articleTitle = citation.title || citation.anchorText || citation.fullPhrase;
  const snippet = citation.description || verification?.actualContentSnippet || verification?.verifiedMatchSnippet;
  const faviconUrl = citation.faviconUrl;

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
        "px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors",
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
              // Performance fix: use module-level handler to avoid re-render overhead
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
          {/* Source name with status indicator */}
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
          </div>

          {/* Article title */}
          {articleTitle && (
            <h4 className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{articleTitle}</h4>
          )}

          {/* Snippet */}
          {snippet && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {snippet}
              {onReadMore && snippet.length > 100 && (
                <button
                  onClick={handleReadMore}
                  className="ml-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Read more
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * CitationDrawer displays a collection of citations in a drawer/bottom sheet.
 * Similar to ChatGPT's citation drawer UI.
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
 *   onCitationClick={(item) => window.open(item.citation.sourceUrl, '_blank')}
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

  // Flatten all citations from groups
  const allCitations = useMemo(() => {
    return citationGroups.flatMap(group => group.citations);
  }, [citationGroups]);

  // Split into visible and "more" sections
  const visibleCitations = useMemo(() => {
    if (!showMoreSection || showMore) return allCitations;
    return allCitations.slice(0, maxVisibleItems);
  }, [allCitations, showMoreSection, showMore, maxVisibleItems]);

  const moreCitations = useMemo(() => {
    if (!showMoreSection || showMore) return [];
    return allCitations.slice(maxVisibleItems);
  }, [allCitations, showMoreSection, showMore, maxVisibleItems]);

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
          "fixed z-[9999] bg-white dark:bg-gray-900 shadow-xl",
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
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        )}

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
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
        <div className="overflow-y-auto max-h-[calc(80vh-100px)]">
          {visibleCitations.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No citations to display</div>
          ) : (
            <>
              {visibleCitations.map((item, index) =>
                renderCitationItem ? (
                  <React.Fragment key={item.citationKey}>{renderCitationItem(item)}</React.Fragment>
                ) : (
                  <CitationDrawerItemComponent
                    key={item.citationKey}
                    item={item}
                    isLast={index === visibleCitations.length - 1 && moreCitations.length === 0}
                    onClick={onCitationClick}
                    onReadMore={onReadMore}
                  />
                ),
              )}

              {/* More section */}
              {moreCitations.length > 0 && !showMore && (
                <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setShowMore(true)}
                    className="text-sm font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    More ({moreCitations.length})
                  </button>
                </div>
              )}

              {/* Expanded "more" citations */}
              {showMore &&
                moreCitations.map((item, index) =>
                  renderCitationItem ? (
                    <React.Fragment key={item.citationKey}>{renderCitationItem(item)}</React.Fragment>
                  ) : (
                    <CitationDrawerItemComponent
                      key={item.citationKey}
                      item={item}
                      isLast={index === moreCitations.length - 1}
                      onClick={onCitationClick}
                      onReadMore={onReadMore}
                    />
                  ),
                )}
            </>
          )}
        </div>
      </div>
    </>
  );

  // Render via portal
  return createPortal(drawerContent, document.body);
}
