import React, { useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { CitationDrawerItemProps, CitationDrawerProps, SourceCitationGroup } from "./CitationDrawer.types.js";
import { extractDomain, getStatusInfo } from "./CitationDrawer.utils.js";
import { ZoomInIcon } from "./icons.js";
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
 * Individual citation item displayed in the drawer.
 * Shows source name, status, article title, snippet, page number, proof image, and click affordance.
 * Miss items (not_found) have a red left border accent for instant visual scanning.
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
  const isMiss = verification?.status === "not_found";

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
        "group py-3 cursor-pointer transition-colors",
        // Red left border accent for misses — instantly scannable
        isMiss
          ? "border-l-2 border-l-red-400 dark:border-l-red-500 pl-3.5 pr-4 hover:bg-red-50 dark:hover:bg-red-900/10"
          : "px-4 hover:bg-gray-50 dark:hover:bg-gray-800/50",
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

          {/* Proof image thumbnail with hover overlay */}
          {proofImage && (
            <div className="mt-2 relative group/proof inline-block">
              <img
                src={proofImage}
                alt="Verification proof"
                className="rounded border border-gray-200 dark:border-gray-700 max-h-16 w-auto object-cover"
                loading="lazy"
              />
              {/* Hover overlay with zoom icon */}
              <div className="absolute inset-0 rounded bg-black/0 group-hover/proof:bg-black/10 dark:group-hover/proof:bg-white/10 flex items-center justify-center opacity-0 group-hover/proof:opacity-100 transition-opacity pointer-events-none">
                <span className="w-4 h-4 text-white drop-shadow-md">
                  <ZoomInIcon />
                </span>
              </div>
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
 * Citations are grouped by source with always-expanded sections. No collapse/expand toggle —
 * the full list is scrollable. Miss items have red left border accents for instant scanning.
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
