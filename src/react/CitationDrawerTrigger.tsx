import type React from "react";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Verification } from "../types/verification.js";
import type { SourceCitationGroup } from "./CitationDrawer.types.js";
import type { FlatCitationItem } from "./CitationDrawer.utils.js";
import {
  dedupeGroupCitations,
  flattenCitations,
  generateDefaultLabel,
  getStatusInfo,
  getStatusPriority,
  resolveGroupLabels,
} from "./CitationDrawer.utils.js";
import {
  DOT_INDICATOR_FIXED_SIZE_STYLE,
  isValidProofImageSrc,
  TOOLTIP_HIDE_DELAY_MS,
  TTC_TEXT_STYLE,
} from "./constants.js";
import { useIsTouchDevice } from "./hooks/useIsTouchDevice.js";
import { useTranslation } from "./i18n.js";
import { handleImageErrorOpacity } from "./imageUtils.js";
import { formatTtc } from "./timingUtils.js";
import type { IndicatorVariant } from "./types.js";
import { cn } from "./utils.js";

// =========
// Types
// =========

/**
 * Summary of verification statuses across all citations.
 */
export interface CitationStatusSummary {
  verified: number;
  partial: number;
  notFound: number;
  pending: number;
  total: number;
}

/**
 * Props for the CitationDrawerTrigger component.
 */
export interface CitationDrawerTriggerProps {
  /** Citation groups to summarize (same data as CitationDrawer) */
  citationGroups: SourceCitationGroup[];
  /** Click handler — typically opens the full CitationDrawer */
  onClick?: () => void;
  /** Click handler for a specific source icon (opens drawer focused on that source) */
  onSourceClick?: (group: SourceCitationGroup) => void;
  /** Whether the drawer is currently open (controls aria-expanded) */
  isOpen?: boolean;
  /** Additional class name */
  className?: string;
  /** Label text override (default: auto-generated from status counts) */
  label?: string;
  /** Maximum status icons to display before collapsing into a +N overflow chip (default: 5) */
  maxIcons?: number;
  /** Whether to show proof image thumbnails in hover tooltips (default: true) */
  showProofThumbnails?: boolean;
  /**
   * Visual style for status indicators.
   * - `"icon"`: Checkmarks, spinner, X icons (default)
   * - `"dot"`: Subtle colored dots (like GitHub status dots)
   * - `"none"`: No status indicator rendered
   * @default "icon"
   */
  indicatorVariant?: IndicatorVariant;
  /**
   * Map of attachmentId or URL to friendly display label.
   * Used to override source names in tooltips and the default label.
   */
  sourceLabelMap?: Record<string, string>;
  /**
   * Aggregate timing metrics. When provided and citations have been reviewed,
   * shows average user review time (e.g., "avg rev 5.2s").
   */
  timingMetrics?: import("../types/timing.js").TimingMetrics;
}

// =========
// Module-level handlers (avoid re-creation on render)
// =========

/** Icon overlap when bar is expanded (rem scales with root font size) */
const ICON_MARGIN_EXPANDED = "-0.25rem";

/**
 * Build a descriptive title for a citation icon tooltip.
 * Includes truncated anchor text to disambiguate icons from the same source.
 * Format: "SourceName: anchor text preview... — Verified"
 */
function getTitleForCitation(flatItem: FlatCitationItem, t: ReturnType<typeof useTranslation>): string {
  const statusLabel = getStatusInfo(flatItem.item.verification).label;
  const sourceMatch = flatItem.item.citation.sourceMatch?.toString() || flatItem.item.citation.sourceContext || null;
  const preview = sourceMatch ? (sourceMatch.length > 40 ? `${sourceMatch.slice(0, 40)}...` : sourceMatch) : null;

  if (preview) {
    return t("aria.citationIconTitleWithPreview", { sourceName: flatItem.sourceName, preview, statusLabel });
  }
  return t("aria.citationIconTitle", { sourceName: flatItem.sourceName, statusLabel });
}

// =========
// StatusIconChip — individual per-citation status icon
// =========

function StatusIconChip({
  verification,
  title,
  size = 20,
  indicatorVariant = "icon",
}: {
  verification: Verification | null;
  title: string;
  size?: number;
  indicatorVariant?: IndicatorVariant;
}) {
  if (indicatorVariant === "none") return null;
  const statusInfo = getStatusInfo(verification, indicatorVariant);
  const isPending = !verification?.status || verification.status === "pending" || verification.status === "loading";

  return (
    <span
      className={cn("inline-flex items-center justify-center", statusInfo.color)}
      style={{ width: size, height: size }}
      title={title}
    >
      <span className={cn("w-3 h-3", isPending && indicatorVariant !== "dot" && "animate-spin")}>
        {statusInfo.icon}
      </span>
    </span>
  );
}

// =========
// CitationTooltip — popover shown when hovering individual citation icon
// =========

function CitationTooltip({
  flatItem,
  showProofThumbnail,
  onSourceClick,
  indicatorVariant = "icon",
}: {
  flatItem: FlatCitationItem;
  showProofThumbnail: boolean;
  onSourceClick?: (group: SourceCitationGroup) => void;
  indicatorVariant?: IndicatorVariant;
}) {
  const t = useTranslation();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedLeft, setAdjustedLeft] = useState<number | null>(null);
  const isTouch = useIsTouchDevice();
  const { item, sourceName, sourceFavicon, group } = flatItem;
  const statusInfo = getStatusInfo(item.verification, indicatorVariant);

  // Get anchor text for display
  const sourceMatch = item.citation.sourceMatch?.toString() || item.citation.sourceContext || null;
  const displaySourceMatch = sourceMatch
    ? sourceMatch.length > 60
      ? `${sourceMatch.slice(0, 60)}...`
      : sourceMatch
    : null;

  // Find evidence image for this specific citation, validating the source
  const rawEvidenceImage = showProofThumbnail ? item.verification?.evidence?.src : null;
  const evidenceImage = isValidProofImageSrc(rawEvidenceImage) ? rawEvidenceImage : null;

  const handleProofClick = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSourceClick?.(group);
  };

  // Clamp tooltip to viewport edges on mount and when layout changes
  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;

    const clamp = () => {
      const rect = el.getBoundingClientRect();
      const margin = 8;
      // Single setState call with computed value (avoids React Compiler bailout from
      // multiple setState calls in separate branches).
      const newLeft =
        rect.left < margin
          ? -rect.left + margin
          : rect.right > window.innerWidth - margin
            ? window.innerWidth - margin - rect.right
            : null;
      setAdjustedLeft(newLeft);
    };

    clamp();

    // Recalculate if viewport resizes while tooltip is visible
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  return (
    <div
      ref={tooltipRef}
      className={cn(
        "absolute bottom-full left-1/2 mb-2 z-50",
        "bg-dc-background border border-dc-border",
        "rounded-dc-lg min-w-[180px] max-w-[260px] max-h-[50vh] overflow-y-auto",
        "pointer-events-auto",
      )}
      style={{
        transform: `translateX(calc(-50% + ${adjustedLeft ?? 0}px))`,
      }}
      data-testid="source-tooltip"
    >
      {/* Source header: favicon + name + status */}
      <div className="flex items-center gap-2 px-3 py-2">
        {sourceFavicon ? (
          <img
            src={sourceFavicon}
            alt=""
            className="w-4 h-4 rounded-dc-sm object-contain shrink-0"
            loading="lazy"
            onError={handleImageErrorOpacity}
          />
        ) : (
          <span className="w-4 h-4 rounded-dc-sm bg-dc-muted flex items-center justify-center text-[8px] font-medium text-dc-muted-foreground shrink-0">
            {sourceName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="flex-1 text-xs font-medium text-dc-foreground truncate">{sourceName}</span>
        <span className={cn("inline-flex w-3.5 h-3.5 shrink-0", statusInfo.color)} title={statusInfo.label}>
          {statusInfo.icon}
        </span>
      </div>

      {/* Anchor text preview */}
      {displaySourceMatch && (
        <div className="px-3 pb-2 text-[11px] text-dc-subtle-foreground truncate">{displaySourceMatch}</div>
      )}

      {/* Evidence image thumbnail */}
      {evidenceImage && (
        <div className="px-2 pb-2">
          <div
            role="button"
            tabIndex={0}
            className="block w-full rounded overflow-hidden border border-dc-border hover:border-dc-border/60 transition-colors cursor-pointer"
            onClick={handleProofClick}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleProofClick(e);
              }
            }}
            aria-label={t("aria.viewProofForSource", { sourceName })}
          >
            <img
              src={evidenceImage}
              alt={t("aria.verificationProof")}
              className="w-full h-auto max-h-16 object-cover"
              loading="lazy"
            />
          </div>
          <span className="block text-[10px] text-dc-pending mt-1 text-center">
            {isTouch ? t("action.tapToViewDetails") : t("action.clickToViewDetails")}
          </span>
        </div>
      )}
    </div>
  );
}

// =========
// StackedStatusIcons — horizontally expanding icon row (per-citation)
// =========

/** Map from priority tier to dot background color class. */
const PRIORITY_DOT_BG: Record<number, string> = {
  4: "bg-dc-destructive",
  3: "bg-dc-partial",
  2: "bg-dc-pending",
  1: "bg-dc-verified",
};

/** Map from priority tier to dot text color class (for count label). */
const PRIORITY_DOT_TEXT: Record<number, string> = {
  4: "text-dc-destructive",
  3: "text-dc-partial",
  2: "text-dc-subtle-foreground",
  1: "text-dc-verified",
};

export function StackedStatusIcons({
  flatCitations,
  isHovered,
  maxIcons,
  hoveredIndex,
  onIconHover,
  onIconLeave,
  onIconClick,
  showProofThumbnails,
  onSourceClick,
  indicatorVariant = "icon",
  activeIndex,
  iconSize,
  iconGap,
  onPageIndices,
}: {
  flatCitations: FlatCitationItem[];
  isHovered: boolean;
  maxIcons: number;
  hoveredIndex: number | null;
  onIconHover: (index: number) => void;
  onIconLeave: () => void;
  onIconClick?: (index: number) => void;
  showProofThumbnails: boolean;
  onSourceClick?: (group: SourceCitationGroup) => void;
  indicatorVariant?: IndicatorVariant;
  /** Index of the currently active/selected icon (shows ring highlight). */
  activeIndex?: number | null;
  /** Override icon chip size in px (default 20). */
  iconSize?: number;
  /** Override margin-left between icons (default "-0.25rem"). Use positive values for gaps. */
  iconGap?: string;
  /** Set of indices that are "on the current page". When provided, off-page icons are greyed out. */
  onPageIndices?: ReadonlySet<number> | null;
}) {
  const t = useTranslation();
  // None variant: no indicators at all
  if (indicatorVariant === "none") return null;

  // Dot variant: one dot per status group (e.g. ●1 ●5) ordered worst-first
  if (indicatorVariant === "dot") {
    const counts = new Map<number, number>();
    for (const f of flatCitations) {
      const p = getStatusPriority(f.item.verification);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    // Sort descending by priority (worst first: 4=miss, 3=partial, 2=pending, 1=verified)
    const groups = Array.from(counts.entries()).sort((a, b) => b[0] - a[0]);
    return (
      <div className="flex items-center gap-2" role="group" aria-label={t("aria.citationVerificationStatus")}>
        {groups.map(([priority, count]) => (
          <span key={priority} className="inline-flex items-center gap-1">
            <span
              className={cn(
                "block rounded-full shrink-0",
                PRIORITY_DOT_BG[priority] ?? "bg-dc-subtle-foreground",
                priority === 2 && "animate-pulse",
              )}
              style={DOT_INDICATOR_FIXED_SIZE_STYLE}
            />
            {(count > 1 || groups.length > 1) && (
              <span className={cn("text-[10px] font-medium leading-none", PRIORITY_DOT_TEXT[priority])}>{count}</span>
            )}
          </span>
        ))}
      </div>
    );
  }

  // Icon variant: per-citation stacked icons
  const displayItems = flatCitations.slice(0, maxIcons);
  const hasOverflow = flatCitations.length > maxIcons;
  const overflowCount = flatCitations.length - maxIcons;
  const effectiveGap = iconGap ?? ICON_MARGIN_EXPANDED;
  const effectiveSize = iconSize ?? 20;

  return (
    <div className="flex items-center" role="group" aria-label={t("aria.citationVerificationStatus")}>
      {displayItems.map((flatItem, i) => {
        const isActive = activeIndex != null && activeIndex === i;
        const isOffPage = onPageIndices != null && !onPageIndices.has(i);
        return (
          <div
            key={flatItem.item.citationKey}
            className={cn(
              "relative transition-[margin-left,opacity,filter] duration-[80ms] ease-[cubic-bezier(0.2,0,0,1)]",
              onIconClick && "cursor-pointer",
              isActive && "ring-2 ring-current ring-offset-1 rounded-full",
              !isActive && isOffPage && "opacity-25 grayscale",
              !isActive && !isOffPage && activeIndex != null && "opacity-50 hover:opacity-80",
            )}
            style={{
              marginLeft: effectiveGap,
              zIndex: isActive ? 30 : Math.max(1, Math.min(20, displayItems.length - i)),
            }}
            onMouseEnter={() => onIconHover(i)}
            onMouseLeave={onIconLeave}
            onClick={onIconClick ? () => onIconClick(i) : undefined}
            onKeyDown={
              onIconClick
                ? e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onIconClick(i);
                    }
                  }
                : undefined
            }
            tabIndex={onIconClick ? 0 : undefined}
            role={onIconClick ? "button" : undefined}
            aria-pressed={onIconClick ? isActive : undefined}
            aria-label={
              onIconClick
                ? `${getTitleForCitation(flatItem, t)}${isOffPage ? ` ${t("aria.citationOffPage")}` : ""}`
                : undefined
            }
          >
            <StatusIconChip
              verification={flatItem.item.verification}
              title={getTitleForCitation(flatItem, t)}
              size={effectiveSize}
              indicatorVariant={indicatorVariant}
            />
            {/* Tooltip when this specific icon is hovered and bar is expanded */}
            {isHovered && hoveredIndex === i && (
              <CitationTooltip
                flatItem={flatItem}
                showProofThumbnail={showProofThumbnails}
                onSourceClick={onSourceClick}
                indicatorVariant={indicatorVariant}
              />
            )}
          </div>
        );
      })}
      {hasOverflow && (
        <div
          className="transition-[margin-left] duration-[80ms] ease-[cubic-bezier(0.2,0,0,1)]"
          style={{
            marginLeft: effectiveGap,
            zIndex: 0,
          }}
        >
          <span className="inline-flex items-center justify-center size-5 text-[10px] font-medium text-dc-muted-foreground">
            +{overflowCount}
          </span>
        </div>
      )}
    </div>
  );
}

// =========
// CitationDrawerTrigger
// =========

/**
 * Compact single-line summary bar for citation verification status.
 *
 * Sits at the bottom of AI-generated content and provides progressive disclosure:
 * - **Collapsed**: Per-citation status icons (check/X/spinner) + label
 * - **Hover**: Icons spread horizontally, individual icon hover shows citation tooltip with proof
 * - **Click**: Opens the full CitationDrawer
 *
 * @example
 * ```tsx
 * const { isOpen, openDrawer, closeDrawer, citationGroups } = useCitationDrawer();
 *
 * <CitationDrawerTrigger
 *   citationGroups={citationGroups}
 *   onClick={openDrawer}
 *   isOpen={isOpen}
 * />
 * <CitationDrawer isOpen={isOpen} onClose={closeDrawer} citationGroups={citationGroups} />
 * ```
 */
export const CitationDrawerTrigger = forwardRef<HTMLButtonElement, CitationDrawerTriggerProps>(
  (
    {
      citationGroups,
      onClick,
      onSourceClick,
      isOpen,
      className,
      label,
      maxIcons = 5,
      showProofThumbnails = true,
      indicatorVariant = "icon",
      sourceLabelMap,
      timingMetrics,
    },
    ref,
  ) => {
    const t = useTranslation();
    const [isHovered, setIsHovered] = useState(false);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const isTouchDevice = useIsTouchDevice();

    // Resolve source labels once — all downstream reads of group.sourceName are pre-resolved
    const resolvedGroups = useMemo(
      () => dedupeGroupCitations(resolveGroupLabels(citationGroups, sourceLabelMap)),
      [citationGroups, sourceLabelMap],
    );

    const claimText = label ?? generateDefaultLabel(resolvedGroups, t);

    // Flatten citation groups into individual items for per-citation icons
    const flatCitations = useMemo(() => flattenCitations(resolvedGroups, t), [resolvedGroups, t]);

    // On touch devices, skip the hover-spread animation — tap goes straight to drawer
    const handleMouseEnter = useCallback(() => {
      if (!isTouchDevice) setIsHovered(true);
    }, [isTouchDevice]);
    const handleMouseLeave = useCallback(() => {
      if (!isTouchDevice) {
        setIsHovered(false);
        setHoveredIndex(null);
        clearTimeout(leaveTimeoutRef.current);
      }
    }, [isTouchDevice]);
    const handleFocus = useCallback(() => {
      if (!isTouchDevice) {
        clearTimeout(leaveTimeoutRef.current);
        setIsHovered(true);
      }
    }, [isTouchDevice]);
    const handleBlur = useCallback(() => {
      if (!isTouchDevice) {
        leaveTimeoutRef.current = setTimeout(() => {
          setIsHovered(false);
          setHoveredIndex(null);
        }, TOOLTIP_HIDE_DELAY_MS);
      }
    }, [isTouchDevice]);

    const handleIconHover = useCallback(
      (index: number) => {
        if (!isTouchDevice) {
          clearTimeout(leaveTimeoutRef.current);
          setHoveredIndex(index);
        }
      },
      [isTouchDevice],
    );

    const handleIconLeave = useCallback(() => {
      if (!isTouchDevice) {
        clearTimeout(leaveTimeoutRef.current);
        leaveTimeoutRef.current = setTimeout(() => setHoveredIndex(null), TOOLTIP_HIDE_DELAY_MS);
      }
    }, [isTouchDevice]);

    // Clean up timeout on unmount
    useEffect(() => {
      return () => clearTimeout(leaveTimeoutRef.current);
    }, []);

    if (flatCitations.length === 0) return null;

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          "inline-flex items-center gap-2 px-2 py-1",
          "bg-dc-background",
          "border border-dc-border rounded-dc-md",
          "cursor-pointer transition-[background-color,border-color,box-shadow] duration-180 overflow-hidden",
          "hover:border-dc-border/60 hover:bg-dc-muted/60",
          "focus:outline-none focus:ring-2 focus:ring-dc-ring/40",
          className,
        )}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={t("aria.citationsSummary", { claimText })}
        data-testid="citation-drawer-trigger"
      >
        {/* Label */}
        <span className="text-xs text-dc-foreground truncate min-w-0 flex-1">{claimText}</span>

        {/* Per-citation status icons */}
        <StackedStatusIcons
          flatCitations={flatCitations}
          isHovered={isHovered}
          maxIcons={maxIcons}
          hoveredIndex={hoveredIndex}
          onIconHover={handleIconHover}
          onIconLeave={handleIconLeave}
          showProofThumbnails={showProofThumbnails}
          onSourceClick={onSourceClick}
          indicatorVariant={indicatorVariant}
        />

        {/* Aggregate TtC — shows average user review time when metrics are available */}
        {timingMetrics && timingMetrics.resolvedCount > 0 && (
          <span style={TTC_TEXT_STYLE}>{t("drawer.avgReviewTime", { time: formatTtc(timingMetrics.avgTtcMs) })}</span>
        )}

        {/* Chevron */}
        <svg
          className="w-3 h-3 text-dc-pending shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  },
);

CitationDrawerTrigger.displayName = "CitationDrawerTrigger";
