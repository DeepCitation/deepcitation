import type React from "react";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Verification } from "../types/verification.js";
import type { CitationDrawerItem, SourceCitationGroup } from "./CitationDrawer.types.js";
import { extractDomain, getStatusInfo } from "./CitationDrawer.utils.js";
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
  /** Maximum status icons to display (default: 10) */
  maxIcons?: number;
  /** Whether to show proof image thumbnails in hover tooltips (default: true) */
  showProofThumbnails?: boolean;
}

// =========
// Module-level handlers (avoid re-creation on render)
// =========

const handleFaviconError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.opacity = "0";
};

/** Delay in ms before hiding tooltip on mouse leave (prevents flicker) */
const TOOLTIP_HIDE_DELAY_MS = 80;

// =========
// Internal types
// =========

/** Flattened citation item with source context for tooltip display */
interface FlatCitationItem {
  item: CitationDrawerItem;
  sourceName: string;
  sourceFavicon?: string;
  group: SourceCitationGroup;
}

// =========
// Internal utilities
// =========

function computeStatusSummary(citationGroups: SourceCitationGroup[]): CitationStatusSummary {
  const summary: CitationStatusSummary = { verified: 0, partial: 0, notFound: 0, pending: 0, total: 0 };
  for (const group of citationGroups) {
    for (const item of group.citations) {
      summary.total++;
      const status = item.verification?.status;
      if (!status || status === "pending" || status === "loading") {
        summary.pending++;
      } else if (status === "not_found") {
        summary.notFound++;
      } else if (
        status === "found_on_other_page" ||
        status === "found_on_other_line" ||
        status === "partial_text_found" ||
        status === "first_word_found"
      ) {
        summary.partial++;
      } else {
        summary.verified++;
      }
    }
  }
  return summary;
}

/**
 * Generate simplified default label — just "N sources".
 * The per-citation icons already communicate the status breakdown visually.
 */
function generateDefaultLabel(sourceCount: number): string {
  return `${sourceCount} source${sourceCount !== 1 ? "s" : ""}`;
}

/**
 * Flatten citation groups into individual citation items with source context.
 */
function flattenCitations(citationGroups: SourceCitationGroup[]): FlatCitationItem[] {
  const items: FlatCitationItem[] = [];
  for (const group of citationGroups) {
    for (const item of group.citations) {
      items.push({
        item,
        sourceName: group.sourceName?.trim() || "Source",
        sourceFavicon: group.sourceFavicon,
        group,
      });
    }
  }
  return items;
}

/**
 * Get background color class for a status icon chip.
 */
function getStatusBgColor(label: string): string {
  switch (label) {
    case "Verified":
      return "bg-green-100 dark:bg-green-900/30";
    case "Partial match":
      return "bg-amber-100 dark:bg-amber-900/30";
    case "Not found":
      return "bg-red-100 dark:bg-red-900/30";
    default:
      return "bg-gray-100 dark:bg-gray-800";
  }
}

// =========
// StatusIconChip — individual per-citation status icon
// =========

function StatusIconChip({
  verification,
  title,
  size = 20,
}: {
  verification: Verification | null;
  title: string;
  size?: number;
}) {
  const statusInfo = getStatusInfo(verification);
  const isPending =
    !verification?.status ||
    verification.status === "pending" ||
    verification.status === "loading";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full ring-2 ring-white dark:ring-gray-800",
        getStatusBgColor(statusInfo.label),
        statusInfo.color,
      )}
      style={{ width: size, height: size }}
      title={title}
    >
      <span className={cn("w-3 h-3", isPending && "animate-spin")}>{statusInfo.icon}</span>
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
}: {
  flatItem: FlatCitationItem;
  showProofThumbnail: boolean;
  onSourceClick?: (group: SourceCitationGroup) => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedLeft, setAdjustedLeft] = useState<number | null>(null);
  const { item, sourceName, sourceFavicon, group } = flatItem;
  const statusInfo = getStatusInfo(item.verification);

  // Get anchor text for display
  const anchorText = item.citation.anchorText?.toString() || item.citation.fullPhrase || null;
  const displayAnchorText = anchorText
    ? anchorText.length > 60
      ? `${anchorText.slice(0, 60)}...`
      : anchorText
    : null;

  // Find proof image for this specific citation
  const rawProofImage = showProofThumbnail ? item.verification?.verificationImageBase64 : null;
  const proofImage = (() => {
    if (typeof rawProofImage !== "string") return null;
    const trimmed = rawProofImage.trim();
    if (trimmed.length === 0) return null;
    const lower = trimmed.toLowerCase();
    // Data URI: allow safe raster formats only (no SVG — can contain scripts)
    if (lower.startsWith("data:")) {
      const safePrefixes = ["data:image/png", "data:image/jpeg", "data:image/jpg", "data:image/webp", "data:image/avif", "data:image/gif"];
      return safePrefixes.some(p => lower.startsWith(p)) ? trimmed : null;
    }
    // HTTPS URL: validate via URL constructor against trusted hosts
    try {
      const url = new URL(trimmed);
      const trustedHosts = ["api.deepcitation.com", "cdn.deepcitation.com"];
      return url.protocol === "https:" && trustedHosts.includes(url.hostname) ? trimmed : null;
    } catch {
      return null;
    }
  })();

  const handleProofClick = (e: React.MouseEvent) => {
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
      if (rect.left < margin) {
        setAdjustedLeft(-rect.left + margin);
      } else if (rect.right > window.innerWidth - margin) {
        setAdjustedLeft(window.innerWidth - margin - rect.right);
      } else {
        setAdjustedLeft(null);
      }
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
        "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700",
        "rounded-lg shadow-lg min-w-[180px] max-w-[260px]",
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
            className="w-4 h-4 rounded-sm object-contain flex-shrink-0"
            loading="lazy"
            onError={handleFaviconError}
          />
        ) : (
          <span className="w-4 h-4 rounded-sm bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[8px] font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">
            {sourceName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{sourceName}</span>
        <span className={cn("inline-flex w-3.5 h-3.5 flex-shrink-0", statusInfo.color)} title={statusInfo.label}>
          {statusInfo.icon}
        </span>
      </div>

      {/* Anchor text preview */}
      {displayAnchorText && (
        <div className="px-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400 truncate">
          {displayAnchorText}
        </div>
      )}

      {/* Proof image thumbnail */}
      {proofImage && (
        <div className="px-2 pb-2">
          <button
            type="button"
            className="block w-full rounded overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer"
            onClick={handleProofClick}
            aria-label={`View proof for ${sourceName}`}
          >
            <img
              src={proofImage}
              alt="Verification proof"
              className="w-full h-auto max-h-16 object-cover"
              loading="lazy"
            />
          </button>
          <span className="block text-[10px] text-gray-400 dark:text-gray-500 mt-1 text-center">
            Click to view details
          </span>
        </div>
      )}
    </div>
  );
}

// =========
// StackedStatusIcons — horizontally expanding icon row (per-citation)
// =========

function StackedStatusIcons({
  flatCitations,
  isHovered,
  maxIcons,
  hoveredIndex,
  onIconHover,
  onIconLeave,
  showProofThumbnails,
  onSourceClick,
}: {
  flatCitations: FlatCitationItem[];
  isHovered: boolean;
  maxIcons: number;
  hoveredIndex: number | null;
  onIconHover: (index: number) => void;
  onIconLeave: () => void;
  showProofThumbnails: boolean;
  onSourceClick?: (group: SourceCitationGroup) => void;
}) {
  const displayItems = flatCitations.slice(0, maxIcons);
  const hasOverflow = flatCitations.length > maxIcons;
  const overflowCount = flatCitations.length - maxIcons;

  return (
    <div className="flex items-center" role="group" aria-label="Citation verification status">
      {displayItems.map((flatItem, i) => (
        <div
          key={flatItem.item.citationKey}
          className="relative transition-[margin-left] duration-300 ease-out"
          style={{
            marginLeft: i === 0 ? 0 : isHovered ? 6 : -8,
            zIndex: Math.max(1, Math.min(20, displayItems.length - i)),
          }}
          onMouseEnter={() => onIconHover(i)}
          onMouseLeave={onIconLeave}
        >
          <StatusIconChip
            verification={flatItem.item.verification}
            title={`${flatItem.sourceName}: ${getStatusInfo(flatItem.item.verification).label}`}
          />
          {/* Tooltip when this specific icon is hovered and bar is expanded */}
          {isHovered && hoveredIndex === i && (
            <CitationTooltip
              flatItem={flatItem}
              showProofThumbnail={showProofThumbnails}
              onSourceClick={onSourceClick}
            />
          )}
        </div>
      ))}
      {hasOverflow && (
        <div
          className="transition-[margin-left] duration-300 ease-out"
          style={{
            marginLeft: isHovered ? 6 : -8,
            zIndex: 0,
          }}
        >
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 ring-2 ring-white dark:ring-gray-800 text-[9px] font-medium text-gray-600 dark:text-gray-300">
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
 * - **Collapsed**: Per-citation status icons (check/X/spinner) + label + stacked source favicons
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
    { citationGroups, onClick, onSourceClick, isOpen, className, label, maxIcons = 10, showProofThumbnails = true },
    ref,
  ) => {
    const [isHovered, setIsHovered] = useState(false);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const summary = useMemo(() => computeStatusSummary(citationGroups), [citationGroups]);
    const displayLabel = label ?? generateDefaultLabel(citationGroups.length);

    // Flatten citation groups into individual items for per-citation icons
    const flatCitations = useMemo(() => flattenCitations(citationGroups), [citationGroups]);

    // Source groups are still used for favicons display
    const displayGroups = useMemo(() => citationGroups.slice(0, 5), [citationGroups]);
    const hasMoreFavicons = citationGroups.length > 5;

    const handleMouseEnter = useCallback(() => setIsHovered(true), []);
    const handleMouseLeave = useCallback(() => {
      setIsHovered(false);
      setHoveredIndex(null);
      clearTimeout(leaveTimeoutRef.current);
    }, []);
    const handleFocus = useCallback(() => {
      clearTimeout(leaveTimeoutRef.current);
      setIsHovered(true);
    }, []);
    const handleBlur = useCallback(() => {
      leaveTimeoutRef.current = setTimeout(() => {
        setIsHovered(false);
        setHoveredIndex(null);
      }, TOOLTIP_HIDE_DELAY_MS);
    }, []);

    const handleIconHover = useCallback((index: number) => {
      clearTimeout(leaveTimeoutRef.current);
      setHoveredIndex(index);
    }, []);

    const handleIconLeave = useCallback(() => {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = setTimeout(() => setHoveredIndex(null), TOOLTIP_HIDE_DELAY_MS);
    }, []);

    // Clean up timeout on unmount
    useEffect(() => {
      return () => clearTimeout(leaveTimeoutRef.current);
    }, []);

    if (summary.total === 0) return null;

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
          "w-full max-w-full text-left rounded-lg border transition-all duration-200 overflow-hidden",
          "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50",
          "hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900",
          className,
        )}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Citations: ${displayLabel}`}
        data-testid="citation-drawer-trigger"
      >
        {/* Single-line bar — always one line */}
        <div className="flex items-center gap-3 px-3 py-2 min-w-0">
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
          />

          {/* Label */}
          <span className="flex-1 min-w-0 text-sm text-gray-600 dark:text-gray-300 truncate">{displayLabel}</span>

          {/* Stacked favicons */}
          <div className="flex items-center -space-x-1 flex-shrink-0">
            {displayGroups.map((group, index) => {
              if (group.sourceFavicon) {
                return (
                  <img
                    key={`${group.sourceDomain ?? group.sourceName}-${index}`}
                    src={group.sourceFavicon}
                    alt=""
                    className="w-4 h-4 rounded-full ring-1 ring-white dark:ring-gray-800 object-contain"
                    width={16}
                    height={16}
                    loading="lazy"
                    onError={handleFaviconError}
                  />
                );
              }
              return (
                <span
                  key={`${group.sourceDomain ?? group.sourceName}-${index}`}
                  className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600 ring-1 ring-white dark:ring-gray-800 flex items-center justify-center text-[8px] font-medium text-gray-600 dark:text-gray-300"
                >
                  {(group.sourceName || "S").charAt(0).toUpperCase()}
                </span>
              );
            })}
            {hasMoreFavicons && (
              <span className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600 ring-1 ring-white dark:ring-gray-800 flex items-center justify-center text-[8px] font-medium text-gray-600 dark:text-gray-300">
                +{citationGroups.length - 5}
              </span>
            )}
          </div>

          {/* Chevron — static arrow indicating "click to open" */}
          <svg
            className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>
    );
  },
);

CitationDrawerTrigger.displayName = "CitationDrawerTrigger";
