import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CitationStatus } from "../types/citation.js";
import type {
  CitationDrawerItem,
  CitationDrawerItemProps,
  CitationDrawerProps,
  SourceCitationGroup,
} from "./CitationDrawer.types.js";
import {
  computeStatusSummary,
  flattenCitations,
  getItemStatusCategory,
  getStatusInfo,
  STATUS_DISPLAY_MAP,
  sortGroupsByWorstStatus,
} from "./CitationDrawer.utils.js";
import { StackedStatusIcons } from "./CitationDrawerTrigger.js";
import { EvidenceTray, InlineExpandedImage } from "./CitationComponent.js";
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
import { ExternalLinkIcon } from "./icons.js";
import { sanitizeUrl } from "./urlUtils.js";
import { cn } from "./utils.js";
import { FaviconImage, PagePill } from "./VerificationLog.js";

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

// HighlightedPhrase — imported from ./HighlightedPhrase.js (canonical location)
// EvidenceTray, InlineExpandedImage — imported from ./CitationComponent.js (canonical location)

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
// CitationDrawerItemComponent
// =========

/**
 * Individual citation item displayed in the drawer.
 *
 * Header (collapsed): fullPhrase with anchorText highlighted via HighlightedPhrase.
 * Expanded: EvidenceTray (keyhole image for found; page thumbnail + search analysis for miss),
 * matching the citation popover's evidence UX exactly. Keyhole click or tray click opens
 * InlineExpandedImage for drag-to-pan full-page view.
 */
export const CitationDrawerItemComponent = React.memo(function CitationDrawerItemComponent({
  item,
  isLast = false,
  onClick,
  onReadMore: _onReadMore, // kept in signature for backward compat; not rendered
  className,
  indicatorVariant = "icon",
  hideSourceName: _hideSourceName, // no longer used — header is always fullPhrase
  defaultExpanded = false,
  style,
  sourceLabelMap: _sourceLabelMap, // no longer used in summary row
}: CitationDrawerItemProps) {
  const { citation, verification } = item;
  const statusInfo = useMemo(() => getStatusInfo(verification, indicatorVariant), [verification, indicatorVariant]);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [wasAutoExpanded, setWasAutoExpanded] = useState(defaultExpanded);
  // Tracks the src shown in InlineExpandedImage (null = show EvidenceTray)
  const [inlineExpandedSrc, setInlineExpandedSrc] = useState<string | null>(null);

  // Sync expanded state when defaultExpanded changes from false → true
  useEffect(() => {
    if (defaultExpanded) {
      setIsExpanded(true);
      setWasAutoExpanded(true);
    }
  }, [defaultExpanded]);

  const anchorText = citation.anchorText?.toString();
  const fullPhrase = citation.fullPhrase;

  // Page number for document citations
  const pageNumber =
    (citation.type !== "url" ? citation.pageNumber : undefined) ?? verification?.document?.verifiedPageNumber;

  // Proof image — evidence source for EvidenceTray and InlineExpandedImage
  const rawProofImageDoc = verification?.document?.verificationImageSrc;
  const rawUrlScreenshot = verification?.url?.webPageScreenshotBase64;
  const rawProofImage =
    rawProofImageDoc ??
    (rawUrlScreenshot
      ? rawUrlScreenshot.startsWith("data:")
        ? rawUrlScreenshot
        : `data:image/jpeg;base64,${rawUrlScreenshot}`
      : undefined);
  const proofImage = isValidProofImageSrc(rawProofImage) ? rawProofImage : null;

  // Status
  const statusCategory = getItemStatusCategory(item);
  const isPending = statusCategory === "pending";
  const isNotFound = statusCategory === "notFound";
  const isVerified = statusCategory === "verified";
  const statusBorderColor = STATUS_DISPLAY_MAP[statusCategory].borderColor;

  // CitationStatus shape required by EvidenceTray
  const citationStatus: CitationStatus = useMemo(
    () => ({
      isVerified: statusCategory === "verified" || statusCategory === "partial",
      isMiss: statusCategory === "notFound",
      isPartialMatch: statusCategory === "partial",
      isPending: statusCategory === "pending",
    }),
    [statusCategory],
  );

  // Verification date
  const checkedDate = formatCheckedDate(verification?.verifiedAt ?? verification?.url?.crawledAt);

  // Crawl date for URL citations
  const isDocument = citation.type === "document" || (!citation.type && citation.attachmentId);
  const formattedCrawlDate =
    !isDocument && verification?.url?.crawledAt ? formatCaptureDate(verification.url.crawledAt) : null;

  // Source URL for "open page" link (URL citations only)
  const sourceUrl = citation.type === "url" && citation.url ? sanitizeUrl(citation.url) : null;

  const handleClick = useCallback(() => {
    setIsExpanded(prev => {
      if (prev) setInlineExpandedSrc(null); // reset inline expansion when collapsing
      return !prev;
    });
    onClick?.(item);
  }, [item, onClick]);

  // Opens InlineExpandedImage with the proof image (used by both keyhole click and tray click)
  const handleExpand = useCallback(() => {
    if (proofImage) setInlineExpandedSrc(proofImage);
  }, [proofImage]);

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

          {/* Header: fullPhrase with anchorText highlighted */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1.5 flex-wrap">
              <div
                className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2 flex-1 min-w-0"
                title={fullPhrase || anchorText}
              >
                <HighlightedPhrase
                  fullPhrase={fullPhrase || anchorText || ""}
                  anchorText={anchorText}
                  isMiss={isNotFound}
                />
              </div>
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
                <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">{checkedDate}</span>
              )}
            </div>
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
              wasAutoExpanded && isNotFound && "animate-[dc-pulse-once_1.2s_ease-out]",
            )}
            onAnimationEnd={() => setWasAutoExpanded(false)}
          >
            {/* Evidence area: popover-identical UX — keyhole for found, thumbnail+analysis for miss */}
            {!inlineExpandedSrc ? (
              <EvidenceTray
                verification={verification ?? null}
                status={citationStatus}
                onImageClick={proofImage ? handleExpand : undefined}
                onExpand={proofImage ? handleExpand : undefined}
                proofImageSrc={proofImage ?? undefined}
              />
            ) : (
              <InlineExpandedImage src={inlineExpandedSrc} onCollapse={() => setInlineExpandedSrc(null)} />
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

// =============================================================================
// DrawerSourceGroup — extracted from inline renderGroup()
// =============================================================================

interface DrawerSourceGroupProps {
  group: SourceCitationGroup;
  groupIndex: number;
  isLastGroup: boolean;
  staggerOffset: number;
  onCitationClick?: (item: CitationDrawerItem) => void;
  onReadMore?: (item: CitationDrawerItem) => void;
  indicatorVariant: "icon" | "dot";
  sourceLabelMap?: Record<string, string>;
  renderCitationItem?: (item: CitationDrawerItem) => React.ReactNode;
}

function DrawerSourceGroup({
  group,
  groupIndex,
  isLastGroup,
  staggerOffset,
  onCitationClick,
  onReadMore,
  indicatorVariant,
  sourceLabelMap,
  renderCitationItem,
}: DrawerSourceGroupProps) {
  const key = `${group.sourceDomain ?? group.sourceName}-${groupIndex}`;

  // Single-citation groups: render as one compact row (no header + item split)
  if (group.citations.length === 1 && !renderCitationItem) {
    return (
      <CompactSingleCitationRow
        key={key}
        group={group}
        isLast={isLastGroup}
        onClick={onCitationClick}
        indicatorVariant={indicatorVariant}
      />
    );
  }

  // Multi-citation groups: header + items
  return (
    <div key={key}>
      <SourceGroupHeader group={group} sourceLabelMap={sourceLabelMap} />
      <div>
        {group.citations.map((item, index) => {
          const delay = (staggerOffset + index) * 35;
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
}

// =========
// DrawerSourceHeading — favicon + name label for the drawer header
// =========

/**
 * Replaces the generic title text in the drawer header with the same source
 * identification as CitationDrawerTrigger's label: favicon (or letter avatar)
 * + source name, with "+N" overflow for multiple sources.
 */
function DrawerSourceHeading({
  citationGroups,
  sourceLabelMap,
  fallbackTitle,
}: {
  citationGroups: SourceCitationGroup[];
  sourceLabelMap?: Record<string, string>;
  fallbackTitle: string;
}) {
  if (citationGroups.length === 0) {
    return <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{fallbackTitle}</h2>;
  }

  const firstGroup = citationGroups[0];
  const firstCitation = firstGroup.citations[0]?.citation;
  const labelOverride = lookupSourceLabel(firstCitation, sourceLabelMap);
  const primaryName = labelOverride || firstGroup.sourceName || fallbackTitle;
  const isUrlSource = !!firstGroup.sourceDomain;
  const overflowCount = citationGroups.length - 1;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Favicon for URL sources, letter avatar for documents */}
      <div className="shrink-0">
        {isUrlSource ? (
          <FaviconImage
            faviconUrl={firstGroup.sourceFavicon || null}
            domain={firstGroup.sourceDomain || null}
            alt={primaryName}
          />
        ) : (
          <div className="w-4 h-4 rounded-sm bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400">
              {primaryName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Source name with overflow count */}
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
        {primaryName}
        {overflowCount > 0 && (
          <span className="ml-1 text-gray-400 dark:text-gray-500 font-normal text-sm">+{overflowCount}</span>
        )}
      </h2>
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

  // Pre-compute stagger offsets for each group (cumulative citation count)
  const staggerOffsets = sortedGroups.reduce<number[]>((acc, _group, idx) => {
    if (idx === 0) {
      acc.push(0);
    } else {
      const prevGroup = sortedGroups[idx - 1];
      acc.push(
        acc[idx - 1] + (prevGroup.citations.length === 1 && !renderCitationItem ? 1 : prevGroup.citations.length),
      );
    }
    return acc;
  }, []);

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
              <DrawerSourceHeading
                citationGroups={citationGroups}
                sourceLabelMap={sourceLabelMap}
                fallbackTitle={title}
              />
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
            sortedGroups.map((group, groupIndex) => (
              <DrawerSourceGroup
                key={`${group.sourceDomain ?? group.sourceName}-${groupIndex}`}
                group={group}
                groupIndex={groupIndex}
                isLastGroup={groupIndex === sortedGroups.length - 1}
                staggerOffset={staggerOffsets[groupIndex] ?? 0}
                onCitationClick={onCitationClick}
                onReadMore={onReadMore}
                indicatorVariant={indicatorVariant}
                sourceLabelMap={sourceLabelMap}
                renderCitationItem={renderCitationItem}
              />
            ))
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
