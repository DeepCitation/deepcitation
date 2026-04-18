import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { analyzeVerification } from "../analysis/searchAnalysis.js";
import { type CitationStatus, isUrlCitation } from "../types/citation.js";
import type { PageImage, Verification } from "../types/verification.js";
import type {
  CitationDrawerItem,
  CitationDrawerItemProps,
  CitationDrawerProps,
  SourceCitationGroup,
} from "./CitationDrawer.types.js";
import {
  computeStatusSummary,
  dedupeGroupCitations,
  flattenCitations,
  generateDefaultLabel,
  getItemStatusCategory,
  getStatusInfo,
  resolveGroupLabels,
  STATUS_DISPLAY_MAP,
  sortGroupsByWorstStatus,
} from "./CitationDrawer.utils.js";
import { StackedStatusIcons } from "./CitationDrawerTrigger.js";
import { CitationErrorBoundary } from "./CitationErrorBoundary.js";
import {
  BLINK_ROW_FAST_ENTER_STEP_MS,
  BLINK_ROW_FAST_ENTER_TOTAL_MS,
  BLINK_ROW_FAST_EXIT_TOTAL_MS,
  DRAWER_STAGGER_DELAY_MS,
  DRAWER_STAGGER_MAX_MS,
  EASE_COLLAPSE,
  getPortalContainer,
  HIDE_SCROLLBAR_STYLE,
  Z_INDEX_BACKDROP_DEFAULT,
  Z_INDEX_DRAWER_BACKDROP_VAR,
  Z_INDEX_DRAWER_VAR,
  Z_INDEX_OVERLAY_DEFAULT,
} from "./constants.js";
import { EvidenceTray, InlineExpandedImage, resolveEvidenceSrc, resolveExpandedImageForPage } from "./EvidenceTray.js";
import { HighlightedSourceContext } from "./HighlightedSourceContext.js";
import { useBlinkMotionStage } from "./hooks/useBlinkMotionStage.js";
import { useDrawerDragToClose } from "./hooks/useDrawerDragToClose.js";
import { useDrawerNavigation } from "./hooks/useDrawerNavigation.js";
import { type TranslateFunction, tPlural, useTranslation } from "./i18n.js";
import { DocumentIcon } from "./icons.js";
import { getBlinkRowMotionStyle } from "./motion/blinkAnimation.js";
import { SnippetZone } from "./SnippetZone.js";
import { acquireScrollLock, releaseScrollLock } from "./scrollLock.js";
import type { IndicatorVariant } from "./types.js";
import { UrlAccessExplanationSection } from "./UrlAccessExplanationSection.js";
import {
  getUrlAccessExplanation,
  mapSearchStatusToFetchStatus,
  mapUrlAccessStatusToFetchStatus,
} from "./urlAccessExplanation.js";
import { cn } from "./utils.js";
import { FaviconImage, PagePill } from "./VerificationLog.js";

/** Scroll a citation item into view on the next frame. */
function scrollToCitationItem(citationKey: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-dc-item="${CSS.escape(citationKey)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

/**
 * Exponential-approach stagger delay: starts at ~DELAY gap, decelerates toward MAX (always monotonic).
 * Preferred over linear (index * DELAY capped at MAX) because the exponential curve avoids
 * an abrupt "cliff" where all items beyond the cap appear simultaneously.
 */
function computeStaggerDelay(itemIndex: number): number {
  return Math.round(
    DRAWER_STAGGER_MAX_MS * (1 - Math.exp((-itemIndex * DRAWER_STAGGER_DELAY_MS) / DRAWER_STAGGER_MAX_MS)),
  );
}

// =========
// Internal escape-navigation context — NOT exported
// =========

interface DrawerEscapeCtx {
  /** The currently expanded item's citation key (accordion) */
  expandedCitationKey: string | null;
  /** Toggle expansion for a citation key (same key = collapse, different = switch) */
  onItemExpand: (key: string | null) => void;
  /** Push a full-page image into the header panel */
  onInlineExpand: (
    key: string,
    src: string,
    verification?: Verification | null,
    renderScale?: { x: number; y: number } | null,
    pageNumber?: number | null,
  ) => void;
  /** Whether the drawer is in full-page mode (bottom sheet with inline image open) */
  isFullPage: boolean;
}

const DrawerEscapeContext = React.createContext<DrawerEscapeCtx | null>(null);

// =========
// Page-number helpers for drawer header
// =========

/** Coerce an unknown page value to a positive finite number, or null. */
function normalizePageNumber(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Resolve page images from the attachment-level lookup. */
function resolvePageImages(
  verification: Verification | null | undefined,
  pageImagesByAttachmentId: Record<string, PageImage[]> | undefined,
): PageImage[] | undefined {
  const key = verification?.attachmentId ?? verification?.label;
  return key ? pageImagesByAttachmentId?.[key] : undefined;
}

/** Collect page numbers from successful search attempts. */
function collectSearchAttemptPages(verification: Verification | null | undefined): number[] {
  const pages: number[] = [];
  for (const attempt of verification?.searchAttempts ?? []) {
    if (!attempt.success) continue;
    const page = normalizePageNumber(attempt.foundLocation?.page);
    if (page !== null) pages.push(page);
  }
  return pages;
}

function computeUniquePageNumbers(
  groups: SourceCitationGroup[],
  pageImagesByAttachmentId?: Record<string, PageImage[]>,
): number[] {
  const pages = new Set<number>();
  for (const group of groups) {
    for (const { citation, verification } of group.citations) {
      const page = normalizePageNumber(
        (citation.type !== "url" ? citation.pageNumber : undefined) ?? verification?.document?.verifiedPageNumber,
      );
      if (page !== null) pages.add(page);
      for (const candidate of resolvePageImages(verification, pageImagesByAttachmentId) ?? []) {
        const candidatePage = normalizePageNumber(candidate.pageNumber);
        if (candidatePage !== null) pages.add(candidatePage);
      }
      for (const p of collectSearchAttemptPages(verification)) pages.add(p);
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
 * The strip can overflow horizontally on narrow viewports so all pages remain accessible.
 * Note: the scrollbar is hidden for visual cleanliness. Keyboard users can Tab
 * through all pills (focus auto-scrolls the strip), but mouse/touch users on
 * very narrow screens have no visual affordance that more pills exist off-screen.
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

function buildSourceGroupAriaLabel(
  t: TranslateFunction,
  sourceName: string,
  sourceDomain: string | undefined,
  citationCount: number,
): string {
  const shouldAppendDomain = !!sourceDomain && sourceDomain !== sourceName;
  if (citationCount > 1) {
    if (shouldAppendDomain) {
      return tPlural(t, "aria.sourceGroupWithDomainAndCount", citationCount, {
        sourceName,
        sourceDomain,
        count: citationCount,
      });
    }
    return tPlural(t, "aria.sourceGroupWithCount", citationCount, {
      sourceName,
      count: citationCount,
    });
  }

  if (shouldAppendDomain) {
    return t("aria.sourceGroupWithDomain", { sourceName, sourceDomain });
  }
  return t("aria.sourceGroup", { sourceName });
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
  pages,
  activePage,
  onPageClick,
  onPageDeactivate,
}: {
  group: SourceCitationGroup;
  pages?: number[];
  activePage?: number | null;
  onPageClick?: (page: number) => void;
  onPageDeactivate?: () => void;
}) {
  const t = useTranslation();
  const sourceName = group.sourceName || t("drawer.source");
  const citationCount = group.citations.length;
  const isUrlSource = !!group.sourceDomain;
  const sourceAriaLabel = buildSourceGroupAriaLabel(t, sourceName, group.sourceDomain, citationCount);

  return (
    <div
      className="w-full px-4 py-2 flex items-center gap-2.5 bg-dc-muted border-b border-dc-border"
      role="heading"
      aria-level={3}
      aria-label={sourceAriaLabel}
    >
      {/* Favicon for URL sources, document icon for documents */}
      <div className="shrink-0">
        {isUrlSource ? (
          <FaviconImage faviconUrl={group.sourceFavicon || null} domain={group.sourceDomain || null} alt={sourceName} />
        ) : (
          <span className="w-4 h-4 shrink-0 text-dc-pending">
            <DocumentIcon />
          </span>
        )}
      </div>

      {/* Source name and domain (for URL sources, show domain in muted text) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <span className="text-sm font-medium text-dc-foreground text-left truncate">{sourceName}</span>
        {isUrlSource && group.sourceDomain && group.sourceDomain !== sourceName && (
          <span className="text-[11px] text-dc-subtle-foreground truncate">{group.sourceDomain}</span>
        )}
      </div>

      {/* Citation count badge — only shown when > 1 (single item is self-evident) */}
      {citationCount > 1 && (
        <span className="text-xs text-dc-subtle-foreground shrink-0">
          {tPlural(t, "drawer.citationCount", citationCount, { count: citationCount })}
        </span>
      )}

      {/* Per-group page badges — shown inline with the file header */}
      {pages && pages.length > 0 && onPageClick && onPageDeactivate && (
        <div
          className="dc-drawer-page-strip max-w-[min(40vw,14rem)] overflow-x-auto overflow-y-hidden shrink-0"
          style={HIDE_SCROLLBAR_STYLE}
        >
          <div className="flex items-center gap-1 min-w-max">
            <DrawerPageBadges
              pages={pages}
              activePage={activePage ?? null}
              onPageClick={onPageClick}
              onPageDeactivate={onPageDeactivate}
            />
          </div>
        </div>
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
 * Header (collapsed): sourceContext with sourceMatch highlighted via HighlightedSourceContext.
 * Expanded: EvidenceTray (keyhole image for found; page thumbnail + search analysis for miss),
 * matching the citation popover's evidence UX exactly. Keyhole click or tray click opens
 * InlineExpandedImage for drag-to-pan full-page view.
 */
export const CitationDrawerItemComponent = React.memo(function CitationDrawerItemComponent({
  item,
  pageImages,
  isLast = false,
  onClick,
  className,
  indicatorVariant = "icon",
  defaultExpanded = false,
  animationDelay: _animationDelay,
}: CitationDrawerItemProps) {
  const t = useTranslation();
  const { citation, verification } = item;
  const statusInfo = useMemo(
    () => getStatusInfo(verification, indicatorVariant, t),
    [verification, indicatorVariant, t],
  );

  // Escape navigation context — null when rendered outside CitationDrawer
  const escCtx = React.useContext(DrawerEscapeContext);

  // Local fallback state for standalone usage (outside DrawerEscapeContext)
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const citationKey = item.citationKey;

  // Accordion: derive isExpanded from context when available, otherwise local state
  const isExpanded = escCtx ? escCtx.expandedCitationKey === citationKey : localExpanded;

  const [wasAutoExpanded, setWasAutoExpanded] = useState(defaultExpanded);

  // Sync expanded state when defaultExpanded changes from false → true.
  // Uses setState-during-render to avoid cascading renders from useEffect.
  const [prevDefaultExpanded, setPrevDefaultExpanded] = useState(defaultExpanded);
  if (defaultExpanded && !prevDefaultExpanded) {
    setPrevDefaultExpanded(true);
    if (escCtx) {
      escCtx.onItemExpand(citationKey);
    } else {
      setLocalExpanded(true);
    }
    setWasAutoExpanded(true);
  } else if (!defaultExpanded && prevDefaultExpanded) {
    setPrevDefaultExpanded(false);
  }

  const {
    mounted: isDetailMounted,
    stage: detailStage,
    prefersReducedMotion,
  } = useBlinkMotionStage(isExpanded, "row", "fast");

  const sourceMatch = citation.sourceMatch?.toString();
  const sourceContext = citation.sourceContext;

  const itemPageNumber = useMemo(
    () =>
      normalizePageNumber(
        (citation.type !== "url" ? citation.pageNumber : undefined) ?? verification?.document?.verifiedPageNumber,
      ),
    [citation, verification],
  );

  // Full-page image — resolve against this citation's page number first.
  const expandedPageImage = useMemo(
    () => resolveExpandedImageForPage(verification, itemPageNumber, pageImages),
    [verification, itemPageNumber, pageImages],
  );
  const pageImageSrc = expandedPageImage?.src ?? null;

  // Evidence image — the verification crop (keyhole source), separate from the full page.
  const evidenceSrc = useMemo(() => resolveEvidenceSrc(verification), [verification]);
  // Inline keyhole-expanded state (inside the drawer item body, not header panel).
  const [inlineKeyholeSrc, setInlineKeyholeSrc] = useState<string | null>(null);
  const [inlineKeyholeInitialScroll, setInlineKeyholeInitialScroll] = useState<{ left: number; top: number } | null>(
    null,
  );

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

  const isApproximate = useMemo(
    () => !!item.claimText && !!sourceMatch && item.claimText !== sourceMatch,
    [item.claimText, sourceMatch],
  );

  // URL access explanation — colored banner for blocked/error states
  const urlAccessExplanation = useMemo(() => {
    if (!isUrlCitation(citation)) return null;
    const urlAccessStatus = verification?.url?.urlAccessStatus;
    const errorMsg = verification?.url?.urlVerificationError;
    const fetchStatus = urlAccessStatus
      ? mapUrlAccessStatusToFetchStatus(urlAccessStatus, errorMsg)
      : mapSearchStatusToFetchStatus(verification?.status);
    return getUrlAccessExplanation(fetchStatus, errorMsg, t);
  }, [citation, verification, t]);

  // Closest-match snippets for partial/miss states
  const intentSnippets = useMemo(() => {
    if (isUrlCitation(citation)) return [];
    const summary = analyzeVerification(verification ?? null).intent;
    return summary?.outcome === "related_found" ? summary.snippets : [];
  }, [citation, verification]);

  // Derive effective keyhole state: when collapsed, always null (prevents stale
  // keyhole from re-showing on external collapse like Escape key). When expanded
  // again via handleClick, the state is already cleared by the click handler.
  const effectiveKeyholeSrc = isExpanded ? inlineKeyholeSrc : null;
  const effectiveKeyholeScroll = isExpanded ? inlineKeyholeInitialScroll : null;

  const handleClick = useCallback(() => {
    // Also reset inline keyhole state eagerly on click (before the state
    // update propagates) so collapse via click is visually immediate.
    setInlineKeyholeSrc(null);
    setInlineKeyholeInitialScroll(null);
    if (escCtx) {
      escCtx.onItemExpand(isExpanded ? null : citationKey);
    } else {
      setLocalExpanded(prev => !prev);
    }
    onClick?.(item);
    if (!isExpanded) scrollToCitationItem(citationKey);
  }, [item, onClick, escCtx, isExpanded, citationKey]);

  // Keyhole click expands inline inside the citation row.
  const handleExpandKeyholeInline = useCallback(() => {
    const source = evidenceSrc ?? pageImageSrc;
    if (!source) return;
    setInlineKeyholeSrc(source);
  }, [evidenceSrc, pageImageSrc]);

  // Footer CTA ("View page N") opens the full page in the drawer header panel.
  const handleExpandToPage = useCallback(() => {
    if (pageImageSrc)
      escCtx?.onInlineExpand(citationKey, pageImageSrc, verification, expandedPageImage?.renderScale, itemPageNumber);
  }, [pageImageSrc, citationKey, verification, expandedPageImage, escCtx, itemPageNumber]);

  return (
    <div
      data-dc-item={citationKey}
      className={cn(
        "cursor-pointer transition-colors",
        !isLast && "border-b border-dc-border",
        !isExpanded && "hover:bg-dc-muted/60",
        className,
      )}
    >
      {/* Clickable summary row */}
      <div
        className={cn("group px-4 py-3", isExpanded && "bg-zinc-100 dark:bg-zinc-800/40")}
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
        <div className="flex items-center gap-3">
          {/* Status indicator — shows status icon; on hover converts to collapse caret */}
          {indicatorVariant !== "none" && (
            <div className="shrink-0" data-testid="status-indicator">
              {isExpanded ? (
                <>
                  {/* Caret shown on hover */}
                  <svg
                    aria-hidden="true"
                    className="w-5 h-5 text-dc-subtle-foreground hidden group-hover:block group-focus-within:block"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                  {/* Status icon shown by default */}
                  <span
                    className={cn(
                      "inline-flex w-5 h-5 items-center justify-center group-hover:hidden group-focus-within:hidden",
                      statusInfo.color,
                    )}
                    title={statusInfo.label}
                  >
                    {statusInfo.icon}
                  </span>
                </>
              ) : (
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
              )}
            </div>
          )}

          {/* Header: sourceContext with sourceMatch highlighted — always visible */}
          <div className="flex-1 min-w-0">
            <div className="text-sm text-dc-foreground line-clamp-2" title={sourceContext || sourceMatch}>
              <HighlightedSourceContext
                sourceContext={sourceContext || sourceMatch || ""}
                sourceMatch={sourceMatch}
                isMiss={isNotFound}
                isApproximate={isApproximate}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Expanded detail view — Blink inset settle (instant reveal + subtle settle). */}
      {isDetailMounted ? (
        <div
          style={getBlinkRowMotionStyle(detailStage, prefersReducedMotion, {
            enterStepMs: BLINK_ROW_FAST_ENTER_STEP_MS,
            enterTotalMs: BLINK_ROW_FAST_ENTER_TOTAL_MS,
            exitMs: BLINK_ROW_FAST_EXIT_TOTAL_MS,
          })}
        >
          <div className="overflow-hidden" style={{ minHeight: 0 }}>
            <div
              className={cn(
                "ml-[calc(1rem+10px)] border-l-2 border-t border-dc-border",
                statusBorderColor,
                wasAutoExpanded && isNotFound && "animate-[dc-pulse-once_800ms_ease-out]",
              )}
              onAnimationEnd={() => setWasAutoExpanded(false)}
            >
              {/* URL access failure banner */}
              {urlAccessExplanation && <UrlAccessExplanationSection explanation={urlAccessExplanation} />}
              {/* Closest-match snippets for partial/miss states */}
              {(isNotFound || citationStatus.isPartialMatch) && !urlAccessExplanation && intentSnippets.length > 0 && (
                <SnippetZone snippets={intentSnippets} />
              )}
              {/* Evidence area — always-render both slots to keep hook tree stable (React 19 fiber safety) */}
              {/* Slot A: EvidenceTray — hidden when keyhole is expanded */}
              <div style={effectiveKeyholeSrc ? { display: "none" } : undefined}>
                <EvidenceTray
                  verification={verification ?? null}
                  status={citationStatus}
                  onImageClick={evidenceSrc || pageImageSrc ? handleExpandKeyholeInline : undefined}
                  onExpand={pageImageSrc ? handleExpandToPage : undefined}
                  pageImageSrc={pageImageSrc ?? undefined}
                  pageNumberForCta={itemPageNumber}
                  onScrollCapture={(left, top) => setInlineKeyholeInitialScroll({ left, top })}
                />
              </div>
              {/* Slot B: InlineExpandedImage — hidden when keyhole is collapsed */}
              {evidenceSrc && (
                <div style={!effectiveKeyholeSrc ? { display: "none" } : undefined}>
                  <InlineExpandedImage
                    src={effectiveKeyholeSrc || evidenceSrc}
                    onCollapse={() => {
                      setInlineKeyholeSrc(null);
                      setInlineKeyholeInitialScroll(null);
                    }}
                    onExpand={pageImageSrc ? handleExpandToPage : undefined}
                    verification={verification ?? undefined}
                    initialScroll={effectiveKeyholeScroll ?? undefined}
                    pageNumberForCta={itemPageNumber}
                  />
                </div>
              )}
              {item.claimText && sourceMatch && isApproximate && (
                <div className="px-4 py-2 text-xs text-dc-subtle-foreground border-t border-dc-border">
                  <span aria-hidden="true" className="mr-0.5">
                    ≈
                  </span>
                  {t("popover.claimedAs", { label: item.claimText })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Inline keyframe for not-found pulse highlight — scoped, no global CSS needed */}
      {wasAutoExpanded && isNotFound && (
        <style>{`
          @keyframes dc-pulse-once {
            0% { background-color: transparent; }
            15% { background-color: rgba(239, 68, 68, 0.12); }
            100% { background-color: transparent; }
          }
          @media (prefers-reduced-motion: reduce) {
            .animate-\\[dc-pulse-once_800ms_ease-out\\] { animation: none !important; }
          }
        `}</style>
      )}
    </div>
  );
});

// =============================================================================
// DrawerSourceGroup — extracted from inline renderGroup()
// =============================================================================

interface DrawerSourceGroupProps {
  group: SourceCitationGroup;
  groupIndex: number;
  isLastGroup: boolean;
  staggerOffset: number;
  onCitationClick?: (item: CitationDrawerItem) => void;
  indicatorVariant: IndicatorVariant;
  renderCitationItem?: (item: CitationDrawerItem) => React.ReactNode;
  pageImagesByAttachmentId?: Record<string, PageImage[]>;
  /** When true, the drawer header already identifies the source — omit group headers and source names */
  isSingleGroup?: boolean;
  /** Per-group page numbers (multi-group only) */
  groupPages?: number[];
  activePage?: number | null;
  onPageClick?: (page: number) => void;
  onPageDeactivate?: () => void;
}

function RenderCitationDrawerItem({
  item,
  renderCitationItem,
}: {
  item: CitationDrawerItem;
  renderCitationItem: (item: CitationDrawerItem) => React.ReactNode;
}) {
  return <>{renderCitationItem(item)}</>;
}

function DrawerSourceGroup({
  group,
  groupIndex,
  isLastGroup,
  staggerOffset,
  onCitationClick,
  indicatorVariant,
  renderCitationItem,
  pageImagesByAttachmentId,
  isSingleGroup = false,
  groupPages,
  activePage,
  onPageClick,
  onPageDeactivate,
}: DrawerSourceGroupProps) {
  const key = `${group.sourceDomain ?? group.sourceName}-${groupIndex}`;
  const getPageImages = useCallback(
    (item: CitationDrawerItem) => resolvePageImages(item.verification, pageImagesByAttachmentId),
    [pageImagesByAttachmentId],
  );

  // Single-group drawer: header already identifies the source, render items directly
  if (isSingleGroup) {
    if (group.citations.length === 1 && !renderCitationItem) {
      // Single citation: expandable item without source identity in the row
      const item = group.citations[0];
      return (
        <CitationDrawerItemComponent
          key={key}
          item={item}
          pageImages={getPageImages(item)}
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
          if (renderCitationItem) {
            return (
              <RenderCitationDrawerItem key={item.citationKey} item={item} renderCitationItem={renderCitationItem} />
            );
          }

          const itemIndex = staggerOffset + index;
          const delay = computeStaggerDelay(itemIndex);
          return (
            <CitationDrawerItemComponent
              key={item.citationKey}
              item={item}
              pageImages={getPageImages(item)}
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

  // Multi-source drawer: single-citation groups use header + expandable item (same as multi-citation)
  // so users can always access evidence and verification proof.
  if (group.citations.length === 1 && !renderCitationItem) {
    const item = group.citations[0];
    return (
      <div key={key}>
        <SourceGroupHeader
          group={group}
          pages={groupPages}
          activePage={activePage}
          onPageClick={onPageClick}
          onPageDeactivate={onPageDeactivate}
        />
        <CitationDrawerItemComponent
          item={item}
          pageImages={getPageImages(item)}
          isLast={isLastGroup}
          onClick={onCitationClick}
          indicatorVariant={indicatorVariant}
        />
      </div>
    );
  }

  // Multi-citation groups: header + items
  return (
    <div key={key}>
      <SourceGroupHeader
        group={group}
        pages={groupPages}
        activePage={activePage}
        onPageClick={onPageClick}
        onPageDeactivate={onPageDeactivate}
      />
      <div>
        {group.citations.map((item, index) => {
          if (renderCitationItem) {
            return (
              <RenderCitationDrawerItem key={item.citationKey} item={item} renderCitationItem={renderCitationItem} />
            );
          }

          const itemIndex = staggerOffset + index;
          const delay = computeStaggerDelay(itemIndex);
          return (
            <CitationDrawerItemComponent
              key={item.citationKey}
              item={item}
              pageImages={getPageImages(item)}
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
/** Duration of the drawer enter animation in ms. */
const DRAWER_ENTER_MS = 180;
/** Duration of the drawer exit animation in ms. */
const DRAWER_EXIT_MS = 120;
/** Buffer beyond exit animation before unmounting (ms). */
const DRAWER_EXIT_DURATION_MS = DRAWER_EXIT_MS + 30;

export function CitationDrawer({ isOpen, ...props }: CitationDrawerProps): React.ReactNode {
  // Keep the drawer mounted during exit animation.
  // Initial value matches isOpen so SSR/initial-render is unaffected.
  const [shouldRender, setShouldRender] = useState(isOpen);

  // isClosing is derived, not separate state: drawer renders but isOpen is false.
  const isClosing = shouldRender && !isOpen;

  // Handle both transitions with deferred setState — no synchronous setState in effect body
  // (which the React Compiler flags), and no setState-during-render.
  // Mount: one rAF delay (~16ms) is imperceptible given the enter animation.
  // Unmount: waits for the exit animation to complete.
  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => setShouldRender(true));
      return () => cancelAnimationFrame(id);
    }
    const timer = setTimeout(() => setShouldRender(false), DRAWER_EXIT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!shouldRender) return null;
  return <OpenCitationDrawer {...props} isClosing={isClosing} />;
}

function OpenCitationDrawer({
  onClose,
  citationGroups,
  title,
  label,
  onCitationClick,
  className,
  position = "bottom",
  renderCitationItem,
  indicatorVariant = "icon",
  sourceLabelMap,
  pageImagesByAttachmentId,
  isClosing = false,
}: Omit<CitationDrawerProps, "isOpen"> & { isClosing?: boolean }): React.ReactNode {
  const t = useTranslation();
  const resolvedTitle = title ?? t("drawer.citations");

  // Enter animation: mount at opacity 0 + translated, then transition to visible
  // after one rAF so the browser paints the start state first.
  const [hasEntered, setHasEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const isVisible = hasEntered && !isClosing;

  // Lock body scroll while the drawer is mounted — removes the page scrollbar so the
  // drawer spans the full viewport width and prevents double-scrollbar.
  useEffect(() => {
    acquireScrollLock();
    return () => releaseScrollLock();
  }, []);

  // Stable ref bridges onManualExpand from the nav hook (declared later) to the drag hook
  const onManualExpandRef = useRef<() => void>(() => {});

  // Drag-to-close (down) and drag-to-expand (up) on the handle bar
  const isBottomSheet = position === "bottom";
  const { handleRef, drawerRef, dragOffset, isDragging, dragDirection } = useDrawerDragToClose({
    onClose,
    onExpand: useCallback(() => onManualExpandRef.current(), []),
    enabled: isBottomSheet,
  });

  // Resolve source labels once at the top — all downstream components read group.sourceName directly
  const resolvedGroups = useMemo(
    () => dedupeGroupCitations(resolveGroupLabels(citationGroups, sourceLabelMap)),
    [citationGroups, sourceLabelMap],
  );

  // Status summary for header and progress bar
  const summary = useMemo(() => computeStatusSummary(resolvedGroups), [resolvedGroups]);

  // Sorted groups for display
  const sortedGroups = useMemo(() => sortGroupsByWorstStatus(resolvedGroups), [resolvedGroups]);

  // Flatten all citations for total count and header icons
  const totalCitations = summary.total;
  const flatCitations = useMemo(() => flattenCitations(resolvedGroups, t), [resolvedGroups, t]);

  // Page numbers for header — computed from all groups, shown top-right as clickable badges
  const drawerPages = useMemo(
    () => computeUniquePageNumbers(sortedGroups, pageImagesByAttachmentId),
    [sortedGroups, pageImagesByAttachmentId],
  );

  const groupPageNumbers = useMemo(() => {
    if (sortedGroups.length <= 1) return new Map<number, number[]>();
    const map = new Map<number, number[]>();
    for (let i = 0; i < sortedGroups.length; i++) {
      map.set(i, computeUniquePageNumbers([sortedGroups[i]], pageImagesByAttachmentId));
    }
    return map;
  }, [sortedGroups, pageImagesByAttachmentId]);

  // Bidirectional page↔key lookup maps — O(1) instead of linear scans per interaction
  // pageToItems groups all citations by page for the header panel indicator row.
  // pageToAnyItem includes pages from pageImages so "extra" pages are still clickable.
  const { keyToPage, pageToItems, pageToAnyItem } = useMemo(() => {
    const k2p = new Map<string, number>();
    const p2i = new Map<number, CitationDrawerItem[]>();
    const p2any = new Map<number, CitationDrawerItem>();
    for (const group of sortedGroups) {
      for (const item of group.citations) {
        const { citationKey, citation, verification } = item;
        const page = normalizePageNumber(
          (citation.type !== "url" ? citation.pageNumber : undefined) ?? verification?.document?.verifiedPageNumber,
        );
        if (page !== null) {
          k2p.set(citationKey, page);
          const existingItems = p2i.get(page);
          if (existingItems) {
            existingItems.push(item);
          } else {
            p2i.set(page, [item]);
          }
          if (!p2any.has(page)) p2any.set(page, item);
        }
        for (const candidate of resolvePageImages(verification, pageImagesByAttachmentId) ?? []) {
          const candidatePage = normalizePageNumber(candidate.pageNumber);
          if (candidatePage !== null && !p2any.has(candidatePage)) {
            p2any.set(candidatePage, item);
          }
        }
        for (const foundPage of collectSearchAttemptPages(verification)) {
          if (!p2any.has(foundPage)) p2any.set(foundPage, item);
        }
      }
    }
    return { keyToPage: k2p, pageToItems: p2i, pageToAnyItem: p2any };
  }, [sortedGroups, pageImagesByAttachmentId]);

  const {
    headerInline,
    activeIndicatorKey,
    isFullPage,
    activePage,
    toggleActiveIndicator,
    toggleItem,
    onInlineExpand: handleInlineExpand,
    closeInline,
    onManualExpand,
    handlePageDeactivate,
    navCtxValue,
  } = useDrawerNavigation({ isBottomSheet, keyToPage, onClose });

  // Sync ref so the drag hook (declared before this hook) can call onManualExpand
  onManualExpandRef.current = onManualExpand;

  // Click handler for header indicator icons — expand the citation, scroll it into view,
  // and toggle the overlay highlight when a page is shown in the header panel.
  const handleIndicatorClick = useCallback(
    (index: number) => {
      const flat = flatCitations[index];
      if (!flat) return;
      const key = flat.item.citationKey;

      toggleItem(key);
      scrollToCitationItem(key);

      // Only toggle the overlay when a page is open in the header panel
      if (headerInline !== null) {
        toggleActiveIndicator(key);
      }
    },
    [flatCitations, headerInline, toggleItem, toggleActiveIndicator],
  );

  // ARIA announcement for page badge navigation (screen readers)
  const [pageAnnouncement, setPageAnnouncement] = useState("");

  // Handler for clicking a page badge — opens the header panel (Level 3) for the
  // first citation on that page WITHOUT expanding the accordion (Level 2).
  // This keeps the Escape cascade clean: Escape closes header → closes drawer.
  const handlePageBadgeClick = useCallback(
    (page: number) => {
      const first = pageToItems.get(page)?.[0] ?? pageToAnyItem.get(page);
      if (first) {
        const pageImages = resolvePageImages(first.verification, pageImagesByAttachmentId);
        const expanded = resolveExpandedImageForPage(first.verification, page, pageImages);
        if (expanded) {
          handleInlineExpand(first.citationKey, expanded.src, first.verification, expanded.renderScale, page);
        }
        scrollToCitationItem(first.citationKey);
      }
      setPageAnnouncement(`Navigated to page ${page}`);
    },
    [pageToItems, pageToAnyItem, handleInlineExpand, pageImagesByAttachmentId],
  );

  // Citations on the active page with sourceContextDeepItem — used for the indicator row
  const citationsOnActivePage = useMemo(
    () =>
      (pageToItems.get(activePage ?? -1) ?? []).filter(
        item => item.verification?.document?.sourceContextDeepItem != null,
      ),
    [pageToItems, activePage],
  );

  // Indices into flatCitations that are on the active page — used to grey out off-page icons
  const onPageIndices = useMemo(() => {
    if (activePage == null) return null;
    const keysOnPage = new Set((pageToItems.get(activePage) ?? []).map(item => item.citationKey));
    const indices = new Set<number>();
    for (let i = 0; i < flatCitations.length; i++) {
      if (keysOnPage.has(flatCitations[i].item.citationKey)) indices.add(i);
    }
    return indices;
  }, [activePage, pageToItems, flatCitations]);

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

  // Render via portal (SSR-safe: skip if document.body unavailable)
  const portalContainer = getPortalContainer();
  if (!portalContainer) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        // backdrop-blur-sm removed intentionally: on low-end mobile devices the blur
        // filter causes visible jank during the drawer slide-in animation (composited
        // layer promotion + GPU shader cost). The semi-transparent overlay alone provides
        // sufficient visual separation without the performance hit.
        className="fixed inset-0 bg-black/30"
        style={
          {
            zIndex: `var(${Z_INDEX_DRAWER_BACKDROP_VAR}, ${Z_INDEX_BACKDROP_DEFAULT})`,
            opacity: isVisible ? 1 : 0,
            transition: hasEntered
              ? `opacity ${isClosing ? DRAWER_EXIT_MS : DRAWER_ENTER_MS}ms ${EASE_COLLAPSE}`
              : "none",
          } as React.CSSProperties
        }
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed bg-dc-background flex flex-col font-dc text-dc-foreground",
          position === "bottom" && "inset-x-0 bottom-0",
          position === "bottom" && (isFullPage ? "max-h-[100dvh]" : "max-h-[80dvh] rounded-t-2xl"),
          position === "right" && "inset-y-0 right-0 w-full max-w-md",
          className,
        )}
        style={
          {
            zIndex: `var(${Z_INDEX_DRAWER_VAR}, ${Z_INDEX_OVERLAY_DEFAULT})`,
            // Enter/exit animation via CSS transitions (replaces non-functional
            // tailwindcss-animate classes which don't exist in Tailwind v4).
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : position === "bottom" ? "translateY(1rem)" : "translateX(1rem)",
            transition: hasEntered
              ? [
                  `opacity ${isClosing ? DRAWER_EXIT_MS : DRAWER_ENTER_MS}ms ${EASE_COLLAPSE}`,
                  `transform ${isClosing ? DRAWER_EXIT_MS : DRAWER_ENTER_MS}ms ${EASE_COLLAPSE}`,
                  // max-height + border-radius transitions for the drag-to-expand gesture
                  ...(position === "bottom"
                    ? [
                        `max-height ${DRAWER_ENTER_MS}ms ${EASE_COLLAPSE}`,
                        `border-radius ${DRAWER_ENTER_MS}ms ${EASE_COLLAPSE}`,
                      ]
                    : []),
                ].join(", ")
              : "none",
            // Dragging down: translate the sheet downward (close gesture)
            ...(dragDirection === "down" &&
              dragOffset > 0 && {
                transform: `translateY(${dragOffset}px)`,
                // Snap-back uses settle easing (no overshoot) — the drawer should return
                // to rest without bouncing past its origin position.
                transition: isDragging ? "none" : `transform 120ms ${EASE_COLLAPSE}`,
              }),
            // Dragging up: grow the sheet taller (expand gesture) — no gap at bottom
            ...(dragDirection === "up" &&
              dragOffset < 0 && {
                maxHeight: `calc(80dvh + ${Math.abs(dragOffset)}px)`,
                transition: isDragging ? "none" : `max-height 120ms ${EASE_COLLAPSE}`,
              }),
          } as React.CSSProperties
        }
        role="dialog"
        aria-modal="true"
        aria-label={resolvedTitle}
      >
        {/* Handle bar (mobile) — drag-to-close target */}
        {position === "bottom" && (
          <div
            ref={handleRef}
            className="flex justify-center pt-3 pb-1 shrink-0 touch-none cursor-grab active:cursor-grabbing"
          >
            {/* BRANDING: rounded-full exception — drawer drag handle, universally recognized affordance */}
            <div className="w-10 h-1 rounded-full bg-dc-border" />
          </div>
        )}

        {/* Header — single flat flex row: favicon, title, page badges, status icons */}
        <div className={cn("px-4 py-2.5 shrink-0", !headerInline && "border-b border-dc-border")}>
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Favicon / document icon */}
            {resolvedGroups.length > 0 && (
              <div className="shrink-0">
                {resolvedGroups[0].sourceDomain ? (
                  <FaviconImage
                    faviconUrl={resolvedGroups[0].sourceFavicon || null}
                    domain={resolvedGroups[0].sourceDomain || null}
                    alt={label?.trim() || generateDefaultLabel(resolvedGroups, t)}
                  />
                ) : (
                  <span className="w-4 h-4 shrink-0 text-dc-pending">
                    <DocumentIcon />
                  </span>
                )}
              </div>
            )}

            {/* Title — truncates, takes available space */}
            <h2 className="text-sm font-semibold text-dc-foreground truncate min-w-0 flex-1">
              {resolvedGroups.length > 0 ? label?.trim() || generateDefaultLabel(resolvedGroups, t) : resolvedTitle}
            </h2>

            {/* Page badges — left of status icons for single-group drawers */}
            {isSingleGroup && drawerPages.length > 0 && (
              <div
                className="dc-drawer-page-strip max-w-[min(52vw,18rem)] overflow-x-auto overflow-y-hidden shrink-0"
                style={HIDE_SCROLLBAR_STYLE}
              >
                <div className="flex items-center gap-1 min-w-max">
                  <DrawerPageBadges
                    pages={drawerPages}
                    activePage={activePage}
                    onPageClick={handlePageBadgeClick}
                    onPageDeactivate={handlePageDeactivate}
                  />
                </div>
              </div>
            )}

            {/* Status overview icons */}
            {totalCitations > 0 && indicatorVariant !== "none" && (
              <div className="shrink-0">
                <StackedStatusIcons
                  flatCitations={flatCitations}
                  isHovered={false}
                  maxIcons={5}
                  hoveredIndex={null}
                  onIconHover={() => {}}
                  onIconLeave={() => {}}
                  onIconClick={handleIndicatorClick}
                  showProofThumbnails={false}
                  indicatorVariant={indicatorVariant}
                  activeIndex={
                    activeIndicatorKey != null
                      ? flatCitations.findIndex(f => f.item.citationKey === activeIndicatorKey)
                      : null
                  }
                  iconSize={20}
                  iconGap="0.125rem"
                  onPageIndices={onPageIndices}
                />
              </div>
            )}
            {/* Per-page citation indicator dots — only when inline page image is open */}
            {headerInline && citationsOnActivePage.length > 0 && (
              <div className="shrink-0 flex items-center gap-0.5" data-testid="drawer-header-indicators">
                {citationsOnActivePage.map(item => {
                  const isIndicatorActive = activeIndicatorKey === item.citationKey;
                  const anyActive = activeIndicatorKey != null;
                  return (
                    <button
                      key={item.citationKey}
                      type="button"
                      aria-pressed={isIndicatorActive}
                      onClick={() => toggleActiveIndicator(item.citationKey)}
                      className={cn(
                        "p-1 rounded-full transition-colors",
                        isIndicatorActive ? "bg-dc-primary/15" : "hover:bg-dc-muted",
                      )}
                      aria-label={item.citation.sourceMatch ?? item.citationKey}
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full block transition-opacity",
                          isIndicatorActive
                            ? "bg-dc-primary"
                            : anyActive
                              ? "bg-current opacity-30"
                              : "bg-current opacity-70",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <style>{`.dc-drawer-page-strip::-webkit-scrollbar { display: none; }`}</style>

        {/* ARIA live region for page badge navigation announcements */}
        <div role="status" aria-live="polite" className="sr-only">
          {pageAnnouncement}
        </div>

        {/* Header inline panel — full-page proof image triggered by page badge or item row */}
        {headerInline && (
          <div className="shrink-0 border-b border-dc-border overflow-hidden">
            <CitationErrorBoundary>
              <InlineExpandedImage
                src={headerInline.src}
                onCollapse={closeInline}
                verification={headerInline.verification ?? undefined}
                renderScale={headerInline.renderScale}
                initialOverlayHidden
                showOverlay={activeIndicatorKey !== null}
                highlightItem={
                  activeIndicatorKey
                    ? (citationsOnActivePage.find(c => c.citationKey === activeIndicatorKey)?.verification?.document
                        ?.sourceContextDeepItem ?? undefined)
                    : undefined
                }
                fill={isFullPage}
              />
            </CitationErrorBoundary>
          </div>
        )}

        {/* Citation list */}
        <DrawerEscapeContext.Provider value={navCtxValue}>
          <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ overscrollBehavior: "contain" }}>
            {totalCitations === 0 ? (
              <div className="px-4 py-8 text-center text-dc-subtle-foreground">{t("drawer.noCitationsToDisplay")}</div>
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
                  pageImagesByAttachmentId={pageImagesByAttachmentId}
                  isSingleGroup={isSingleGroup}
                  groupPages={!isSingleGroup ? groupPageNumbers.get(groupIndex) : undefined}
                  activePage={activePage}
                  onPageClick={handlePageBadgeClick}
                  onPageDeactivate={handlePageDeactivate}
                />
              ))
            )}
          </div>
        </DrawerEscapeContext.Provider>
      </div>
    </>,
    portalContainer,
  );
}
