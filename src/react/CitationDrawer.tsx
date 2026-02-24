import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  generateDefaultLabel,
  getItemStatusCategory,
  getStatusInfo,
  resolveGroupLabels,
  STATUS_DISPLAY_MAP,
  sortGroupsByWorstStatus,
} from "./CitationDrawer.utils.js";
import { StackedStatusIcons } from "./CitationDrawerTrigger.js";
import {
  EASE_COLLAPSE,
  EASE_EXPAND,
  getPortalContainer,
  Z_INDEX_BACKDROP_DEFAULT,
  Z_INDEX_DRAWER_BACKDROP_VAR,
  Z_INDEX_DRAWER_VAR,
  Z_INDEX_OVERLAY_DEFAULT,
} from "./constants.js";
import { EvidenceTray, InlineExpandedImage, resolveEvidenceSrc, resolveExpandedImage } from "./EvidenceTray.js";
import { HighlightedPhrase } from "./HighlightedPhrase.js";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { cn } from "./utils.js";
import { FaviconImage, PagePill } from "./VerificationLog.js";

// HighlightedPhrase — imported from ./HighlightedPhrase.js (canonical location)
// EvidenceTray, InlineExpandedImage — imported from ./EvidenceTray.js (canonical location)

// =========
// Internal escape-navigation context — NOT exported
// =========

interface DrawerEscapeCtx {
  /** Increment signals all items to collapse their inline (full-page) image */
  collapseInlineSignal: number;
  /** Items call this whenever their expanded/inline state changes */
  onSubstateChange: (key: string, isExpanded: boolean, hasInline: boolean) => void;
  /** The currently expanded item's citation key (accordion) */
  expandedCitationKey: string | null;
  /** Toggle expansion for a citation key (same key = collapse, different = switch) */
  onItemExpand: (key: string | null) => void;
  /** Signal to auto-open InlineExpandedImage for this citation key (one-shot) */
  pendingInlineExpand: string | null;
  /** Clear the pending inline expand signal after consuming it */
  clearPendingInlineExpand: () => void;
}

const DrawerEscapeContext = React.createContext<DrawerEscapeCtx | null>(null);

// =========
// Page-number helpers for drawer header
// =========

function computeUniquePageNumbers(groups: SourceCitationGroup[]): number[] {
  const pages = new Set<number>();
  for (const group of groups) {
    for (const { citation, verification } of group.citations) {
      const page =
        (citation.type !== "url" ? citation.pageNumber : undefined) ?? verification?.document?.verifiedPageNumber;
      if (page != null && page > 0) pages.add(page);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

/** Single page pill — extracted for proper React reconciliation (avoids inline render functions). */
function DrawerPagePill({
  page,
  activePage,
  onPageClick,
  onPageDeactivate,
}: {
  page: number;
  activePage: number | null;
  onPageClick: (page: number) => void;
  onPageDeactivate: () => void;
}) {
  const isActive = page === activePage;
  return (
    <PagePill
      pageNumber={page}
      colorScheme="gray"
      onClick={isActive ? undefined : () => onPageClick(page)}
      onClose={isActive ? onPageDeactivate : undefined}
    />
  );
}

/**
 * Renders page number pills in the drawer header.
 * Reuses PagePill from the popover for consistent styling and hit targets.
 * Active page shows blue pill with X; others show gray pill with chevron.
 * Shows up to 3 individual pills; 4+ shows first, ellipsis, last.
 */
function DrawerPageBadges({
  pages,
  activePage,
  onPageClick,
  onPageDeactivate,
}: {
  pages: number[];
  activePage: number | null;
  onPageClick: (page: number) => void;
  onPageDeactivate: () => void;
}) {
  if (pages.length === 0) return null;

  if (pages.length <= 3) {
    return (
      <>
        {pages.map(page => (
          <DrawerPagePill
            key={page}
            page={page}
            activePage={activePage}
            onPageClick={onPageClick}
            onPageDeactivate={onPageDeactivate}
          />
        ))}
      </>
    );
  }

  // 4+ pages: first + ellipsis + last
  return (
    <>
      <DrawerPagePill
        page={pages[0]}
        activePage={activePage}
        onPageClick={onPageClick}
        onPageDeactivate={onPageDeactivate}
      />
      <span className="text-xs text-gray-400 dark:text-gray-500">…</span>
      <DrawerPagePill
        page={pages[pages.length - 1]}
        activePage={activePage}
        onPageClick={onPageClick}
        onPageDeactivate={onPageDeactivate}
      />
    </>
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
function SourceGroupHeader({ group }: { group: SourceCitationGroup }) {
  const sourceName = group.sourceName || "Source";
  const citationCount = group.citations.length;
  const isUrlSource = !!group.sourceDomain;

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

      {/* Citation count badge — only shown when > 1 (single item is self-evident) */}
      {citationCount > 1 && (
        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{citationCount} citations</span>
      )}
    </div>
  );
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
  className,
  indicatorVariant = "icon",
  defaultExpanded = false,
  animationDelay,
}: CitationDrawerItemProps) {
  const { citation, verification } = item;
  const statusInfo = useMemo(() => getStatusInfo(verification, indicatorVariant), [verification, indicatorVariant]);

  // Escape navigation context — null when rendered outside CitationDrawer
  const escCtx = React.useContext(DrawerEscapeContext);

  // Local fallback state for standalone usage (outside DrawerEscapeContext)
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const citationKey = item.citationKey;

  // Accordion: derive isExpanded from context when available, otherwise local state
  const isExpanded = escCtx ? escCtx.expandedCitationKey === citationKey : localExpanded;

  const [wasAutoExpanded, setWasAutoExpanded] = useState(defaultExpanded);
  // Tracks the src shown in InlineExpandedImage (null = show EvidenceTray)
  const [inlineExpandedSrc, setInlineExpandedSrc] = useState<string | null>(null);

  const collapseInlineSignal = escCtx?.collapseInlineSignal ?? 0;
  const onSubstateChange = escCtx?.onSubstateChange;

  // Track which collapseInlineSignal we have already acted on to avoid false-triggers on mount
  const seenInlineSignalRef = useRef(0);

  // Clear inline expansion: when collapsed, or when parent sends collapse signal (Escape)
  useEffect(() => {
    if (!isExpanded) {
      setInlineExpandedSrc(null);
      seenInlineSignalRef.current = collapseInlineSignal;
      return;
    }
    if (collapseInlineSignal > seenInlineSignalRef.current) {
      seenInlineSignalRef.current = collapseInlineSignal;
      setInlineExpandedSrc(null);
    }
  }, [isExpanded, collapseInlineSignal]);

  // Report substate to parent so the escape handler knows what to collapse next
  useEffect(() => {
    onSubstateChange?.(citationKey, isExpanded, !!inlineExpandedSrc);
  }, [isExpanded, inlineExpandedSrc, citationKey, onSubstateChange]);

  // Sync expanded state when defaultExpanded changes from false → true
  useEffect(() => {
    if (defaultExpanded) {
      if (escCtx) {
        escCtx.onItemExpand(citationKey);
      } else {
        setLocalExpanded(true);
      }
      setWasAutoExpanded(true);
    }
  }, [defaultExpanded, escCtx, citationKey]);

  const prefersReducedMotion = usePrefersReducedMotion();

  const anchorText = citation.anchorText?.toString();
  const fullPhrase = citation.fullPhrase;

  // Proof image — unified resolution via resolveExpandedImage (same as popover),
  // which includes pages[0].source fallback so not_found citations get thumbnails.
  const expandedImage = useMemo(() => resolveExpandedImage(verification), [verification]);
  const proofImage = expandedImage?.src ?? null;

  // Evidence image — the verification crop (keyhole source), separate from the full page.
  const evidenceSrc = useMemo(() => resolveEvidenceSrc(verification), [verification]);

  // Status
  const statusCategory = getItemStatusCategory(item);
  const isPending = statusCategory === "pending";
  const isNotFound = statusCategory === "notFound";
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

  const handleClick = useCallback(() => {
    if (escCtx) {
      escCtx.onItemExpand(isExpanded ? null : citationKey);
    } else {
      setLocalExpanded(prev => {
        if (prev) setInlineExpandedSrc(null);
        return !prev;
      });
    }
    onClick?.(item);
  }, [item, onClick, escCtx, isExpanded, citationKey]);

  // Opens InlineExpandedImage with the full page image (tray click / onExpand)
  const handleExpand = useCallback(() => {
    if (proofImage) setInlineExpandedSrc(proofImage);
  }, [proofImage]);

  // Opens InlineExpandedImage with the evidence crop (keyhole click / onImageClick)
  const handleExpandEvidence = useCallback(() => {
    if (evidenceSrc) setInlineExpandedSrc(evidenceSrc);
  }, [evidenceSrc]);

  // Auto-open InlineExpandedImage when pendingInlineExpand matches this item (page badge click)
  const itemRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (escCtx?.pendingInlineExpand === citationKey && proofImage) {
      setInlineExpandedSrc(proofImage);
      escCtx.clearPendingInlineExpand();
      // Scroll the item into view after expansion
      requestAnimationFrame(() => {
        itemRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "nearest",
        });
      });
    }
  }, [escCtx?.pendingInlineExpand, citationKey, proofImage, escCtx, prefersReducedMotion]);

  return (
    <div
      ref={itemRef}
      data-dc-item={citationKey}
      className={cn(
        "cursor-pointer transition-colors border-l-[3px] animate-in fade-in-0 slide-in-from-bottom-1 duration-200 fill-mode-backwards",
        !isLast && "border-b border-gray-200 dark:border-gray-700",
        isExpanded ? statusBorderColor : "border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50",
        className,
      )}
      style={animationDelay ? { animationDelay: `${animationDelay}ms` } : undefined}
    >
      {/* Clickable summary row */}
      <div
        className={cn("group px-4 py-3", isExpanded && "bg-blue-50/60 dark:bg-blue-950/30")}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        data-citation-key={citationKey}
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
            <div className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2" title={fullPhrase || anchorText}>
              <HighlightedPhrase
                fullPhrase={fullPhrase || anchorText || ""}
                anchorText={anchorText}
                isMiss={isNotFound}
              />
            </div>
          </div>

          {/* Expand/collapse chevron */}
          <svg
            aria-hidden="true"
            className={cn(
              "w-4 h-4 shrink-0 mt-1 transition-transform duration-150",
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
        className="grid transition-[grid-template-rows] duration-150"
        style={{
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          ...(prefersReducedMotion
            ? { transitionDuration: "0ms" }
            : { transitionTimingFunction: isExpanded ? EASE_EXPAND : EASE_COLLAPSE }),
        }}
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
                onImageClick={evidenceSrc ? handleExpandEvidence : undefined}
                onExpand={proofImage ? handleExpand : undefined}
                proofImageSrc={proofImage ?? undefined}
              />
            ) : (
              <InlineExpandedImage
                src={inlineExpandedSrc}
                onCollapse={() => setInlineExpandedSrc(null)}
                verification={verification ?? undefined}
                renderScale={expandedImage?.renderScale}
              />
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
 * Compact row for groups with exactly 1 citation (multi-source drawers only).
 * Merges group header and citation item into one line:
 * [favicon/letter] Source Name · status-icon · "anchor text"
 */
function CompactSingleCitationRow({
  group,
  isLast = false,
  onClick,
  indicatorVariant = "icon",
}: {
  group: SourceCitationGroup;
  isLast?: boolean;
  onClick?: (item: CitationDrawerItem) => void;
  indicatorVariant?: "icon" | "dot";
}) {
  const item = group.citations[0];
  const { citation, verification } = item;
  const statusInfo = getStatusInfo(verification, indicatorVariant);
  const isPending = !verification?.status || verification.status === "pending" || verification.status === "loading";

  const sourceName = group.sourceName || "Source";
  const isUrlSource = !!group.sourceDomain;

  const anchorText = citation.anchorText?.toString() || citation.fullPhrase;
  const displayText = anchorText || null;

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
  indicatorVariant: "icon" | "dot";
  renderCitationItem?: (item: CitationDrawerItem) => React.ReactNode;
  /** When true, the drawer header already identifies the source — omit group headers and source names */
  isSingleGroup?: boolean;
}

function DrawerSourceGroup({
  group,
  groupIndex,
  isLastGroup,
  staggerOffset,
  onCitationClick,
  indicatorVariant,
  renderCitationItem,
  isSingleGroup = false,
}: DrawerSourceGroupProps) {
  const key = `${group.sourceDomain ?? group.sourceName}-${groupIndex}`;

  // Single-group drawer: header already identifies the source, render items directly
  if (isSingleGroup) {
    if (group.citations.length === 1 && !renderCitationItem) {
      // Single citation: expandable item without source identity in the row
      const item = group.citations[0];
      return (
        <CitationDrawerItemComponent
          key={key}
          item={item}
          isLast={isLastGroup}
          onClick={onCitationClick}
          indicatorVariant={indicatorVariant}
        />
      );
    }

    // Multiple citations: flat expandable list, no group header
    return (
      <div key={key}>
        {group.citations.map((item, index) => {
          const delay = Math.min((staggerOffset + index) * 35, 200);
          return renderCitationItem ? (
            <React.Fragment key={item.citationKey}>{renderCitationItem(item)}</React.Fragment>
          ) : (
            <CitationDrawerItemComponent
              key={item.citationKey}
              item={item}
              isLast={isLastGroup && index === group.citations.length - 1}
              onClick={onCitationClick}
              indicatorVariant={indicatorVariant}
              animationDelay={delay}
            />
          );
        })}
      </div>
    );
  }

  // Multi-source drawer: single-citation groups as compact merged row (no header+item split)
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
      <SourceGroupHeader group={group} />
      <div>
        {group.citations.map((item, index) => {
          const delay = Math.min((staggerOffset + index) * 35, 200);
          return renderCitationItem ? (
            <React.Fragment key={item.citationKey}>{renderCitationItem(item)}</React.Fragment>
          ) : (
            <CitationDrawerItemComponent
              key={item.citationKey}
              item={item}
              isLast={isLastGroup && index === group.citations.length - 1}
              onClick={onCitationClick}
              indicatorVariant={indicatorVariant}
              animationDelay={delay}
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
 * Drawer header source label — renders the same text as CitationDrawerTrigger
 * (favicon/letter avatar + generateDefaultLabel output) so heading and trigger
 * always agree regardless of how sourceName is set.
 */
function DrawerSourceHeading({
  citationGroups,
  label,
  fallbackTitle,
}: {
  citationGroups: SourceCitationGroup[];
  /** Explicit label override — same as CitationDrawerTrigger's `label` prop */
  label?: string;
  fallbackTitle: string;
}) {
  if (citationGroups.length === 0) {
    return <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{fallbackTitle}</h2>;
  }

  const firstGroup = citationGroups[0];
  // Use the exact same label as CitationDrawerTrigger — generateDefaultLabel handles
  // truncation and "+N" overflow in one place, ensuring heading and trigger always match.
  const displayLabel = label?.trim() || generateDefaultLabel(citationGroups);
  const isUrlSource = !!firstGroup.sourceDomain;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Favicon for URL sources, letter avatar for documents */}
      <div className="shrink-0">
        {isUrlSource ? (
          <FaviconImage
            faviconUrl={firstGroup.sourceFavicon || null}
            domain={firstGroup.sourceDomain || null}
            alt={displayLabel}
          />
        ) : (
          <div className="w-4 h-4 rounded-sm bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400">
              {displayLabel.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Source label — identical text to CitationDrawerTrigger */}
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{displayLabel}</h2>
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
  label,
  // showMoreSection and maxVisibleItems are deprecated — accepted but ignored
  showMoreSection: _showMoreSection,
  maxVisibleItems: _maxVisibleItems,
  onCitationClick,
  onReadMore: _onReadMore,
  className,
  position = "bottom",
  renderCitationItem,
  indicatorVariant = "icon",
  sourceLabelMap,
}: CitationDrawerProps): React.ReactNode {
  // Resolve source labels once at the top — all downstream components read group.sourceName directly
  const resolvedGroups = useMemo(
    () => resolveGroupLabels(citationGroups, sourceLabelMap),
    [citationGroups, sourceLabelMap],
  );

  // Status summary for header and progress bar
  const summary = useMemo(() => computeStatusSummary(resolvedGroups), [resolvedGroups]);

  // Sorted groups for display
  const sortedGroups = useMemo(() => sortGroupsByWorstStatus(resolvedGroups), [resolvedGroups]);

  // Flatten all citations for total count and header icons
  const totalCitations = summary.total;
  const flatCitations = useMemo(() => flattenCitations(resolvedGroups), [resolvedGroups]);

  // Page numbers for header — computed from all groups, shown top-right as clickable badges
  const drawerPages = useMemo(() => computeUniquePageNumbers(sortedGroups), [sortedGroups]);

  // Bidirectional page↔key lookup maps — O(1) instead of linear scans per interaction
  const { pageToKey, keyToPage } = useMemo(() => {
    const p2k = new Map<number, string>();
    const k2p = new Map<string, number>();
    for (const group of sortedGroups) {
      for (const { citationKey, citation, verification } of group.citations) {
        const page =
          (citation.type !== "url" ? citation.pageNumber : undefined) ?? verification?.document?.verifiedPageNumber;
        if (page != null && page > 0) {
          if (!p2k.has(page)) p2k.set(page, citationKey); // first citation per page
          k2p.set(citationKey, page);
        }
      }
    }
    return { pageToKey: p2k, keyToPage: k2p };
  }, [sortedGroups]);

  // Accordion state — only one item expanded at a time
  const [expandedCitationKey, setExpandedCitationKey] = useState<string | null>(null);
  const [pendingInlineExpand, setPendingInlineExpand] = useState<string | null>(null);

  const onItemExpand = useCallback((key: string | null) => {
    setExpandedCitationKey(key);
  }, []);

  const clearPendingInlineExpand = useCallback(() => {
    setPendingInlineExpand(null);
  }, []);

  // ARIA announcement for page badge navigation (screen readers)
  const [pageAnnouncement, setPageAnnouncement] = useState("");

  // Handler for clicking a page badge — expands the first citation on that page + auto-opens image
  const handlePageBadgeClick = useCallback(
    (page: number) => {
      const key = pageToKey.get(page);
      if (key) {
        setExpandedCitationKey(key);
        setPendingInlineExpand(key);
        setPageAnnouncement(`Navigated to page ${page}`);
      }
    },
    [pageToKey],
  );

  // State mirror of inlineKeysRef so page pill reactivity works (refs don't trigger re-renders)
  const [hasInlineOpen, setHasInlineOpen] = useState(false);

  // Active page pill — only lit when the inline full-page image is visible
  const activePage = expandedCitationKey && hasInlineOpen ? (keyToPage.get(expandedCitationKey) ?? null) : null;

  const handlePageDeactivate = useCallback(() => {
    setExpandedCitationKey(null);
  }, []);

  // Escape navigation — tracks substate (expanded items, inline images) to step back
  const [collapseInlineSignal, setCollapseInlineSignal] = useState(0);
  const expandedKeysRef = useRef(new Set<string>());
  const inlineKeysRef = useRef(new Set<string>());

  const onSubstateChange = useCallback((key: string, isExpanded: boolean, hasInline: boolean) => {
    if (isExpanded) expandedKeysRef.current.add(key);
    else expandedKeysRef.current.delete(key);
    if (hasInline) inlineKeysRef.current.add(key);
    else inlineKeysRef.current.delete(key);
    setHasInlineOpen(inlineKeysRef.current.size > 0);
  }, []);

  const escCtxValue = useMemo<DrawerEscapeCtx>(
    () => ({
      collapseInlineSignal,
      onSubstateChange,
      expandedCitationKey,
      onItemExpand,
      pendingInlineExpand,
      clearPendingInlineExpand,
    }),
    [
      collapseInlineSignal,
      onSubstateChange,
      expandedCitationKey,
      onItemExpand,
      pendingInlineExpand,
      clearPendingInlineExpand,
    ],
  );

  // Ref mirrors expandedCitationKey so the escape handler reads the latest value
  // without re-registering the listener on every accordion toggle.
  // Synced in useLayoutEffect to avoid React Compiler bailout.
  const expandedKeyRef = useRef(expandedCitationKey);
  useLayoutEffect(() => {
    expandedKeyRef.current = expandedCitationKey;
  }, [expandedCitationKey]);

  // Escape key: step back through navigation levels instead of always closing.
  // Uses refs for mutable state so the listener is registered once per open/close cycle.
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (inlineKeysRef.current.size > 0) {
          // Level 3 → Level 2: collapse inline full-page images
          setCollapseInlineSignal(s => s + 1);
          inlineKeysRef.current.clear();
          setHasInlineOpen(false);
        } else if (expandedKeyRef.current !== null) {
          // Level 2 → Level 1: collapse the accordion
          setExpandedCitationKey(null);
          expandedKeysRef.current.clear();
        } else {
          // Level 1 → closed: close the drawer
          onClose();
        }
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

  const isSingleGroup = sortedGroups.length === 1;

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
              <DrawerSourceHeading citationGroups={resolvedGroups} label={label} fallbackTitle={title} />
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
              {drawerPages.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <DrawerPageBadges
                    pages={drawerPages}
                    activePage={activePage}
                    onPageClick={handlePageBadgeClick}
                    onPageDeactivate={handlePageDeactivate}
                  />
                </div>
              )}
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

        {/* ARIA live region for page badge navigation announcements */}
        <div role="status" aria-live="polite" className="sr-only">
          {pageAnnouncement}
        </div>

        {/* Citation list */}
        <DrawerEscapeContext.Provider value={escCtxValue}>
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
                  indicatorVariant={indicatorVariant}
                  renderCitationItem={renderCitationItem}
                  isSingleGroup={isSingleGroup}
                />
              ))
            )}
          </div>
        </DrawerEscapeContext.Provider>
      </div>
    </>
  );

  // Render via portal (SSR-safe: skip if document.body unavailable)
  const portalContainer = getPortalContainer();
  if (!portalContainer) return null;
  return createPortal(drawerContent, portalContainer);
}
