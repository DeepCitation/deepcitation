import type React from "react";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Verification } from "../types/verification.js";
import type { CitationDrawerItem, SourceCitationGroup } from "./CitationDrawer.types.js";
import { extractDomain, getStatusInfo } from "./CitationDrawer.utils.js";
import { isValidProofImageSrc } from "./constants.js";
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

/** Icon overlap when bar is expanded (rem scales with root font size) */
const ICON_MARGIN_EXPANDED = "-0.25rem";
/** Icon overlap when bar is collapsed (rem scales with root font size) */
const ICON_MARGIN_COLLAPSED = "-0.5rem";


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

/**
 * Build a descriptive title for a citation icon tooltip.
 * Includes truncated anchor text to disambiguate icons from the same source.
 * Format: "SourceName: anchor text preview... — Verified"
 */
function getTitleForCitation(flatItem: FlatCitationItem): string {
  const statusLabel = getStatusInfo(flatItem.item.verification).label;
  const anchorText = flatItem.item.citation.anchorText?.toString() || flatItem.item.citation.fullPhrase || null;
  const preview = anchorText
    ? anchorText.length > 40
      ? `${anchorText.slice(0, 40)}...`
      : anchorText
    : null;

  if (preview) {
    return `${flatItem.sourceName}: ${preview} — ${statusLabel}`;
  }
  return `${flatItem.sourceName} — ${statusLabel}`;
}

/**
 * Generate a smart default label from citation groups.
 * 1 group → show source name; 2+ groups → "firstName +N"; truncate names > 25 chars.
 */
function generateDefaultLabel(citationGroups: SourceCitationGroup[]): string {
  if (citationGroups.length === 0) return "Sources";
  const firstName = citationGroups[0].sourceName?.trim() || "Source";
  const truncated = firstName.length > 25 ? `${firstName.slice(0, 25)}...` : firstName;
  if (citationGroups.length === 1) return truncated;
  return `${truncated} +${citationGroups.length - 1}`;
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
        "inline-flex items-center justify-center",
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

  // Find proof image for this specific citation, validating the source
  const rawProofImage = showProofThumbnail ? item.verification?.verificationImageBase64 : null;
  const proofImage = isValidProofImageSrc(rawProofImage) ? rawProofImage : null;

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
        "rounded-lg min-w-[180px] max-w-[260px] max-h-[50vh] overflow-y-auto",
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
            className="w-4 h-4 rounded-sm object-contain shrink-0"
            loading="lazy"
            onError={handleFaviconError}
          />
        ) : (
          <span className="w-4 h-4 rounded-sm bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[8px] font-medium text-gray-600 dark:text-gray-300 shrink-0">
            {sourceName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{sourceName}</span>
        <span className={cn("inline-flex w-3.5 h-3.5 shrink-0", statusInfo.color)} title={statusInfo.label}>
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
          <div
            role="button"
            tabIndex={0}
            className="block w-full rounded overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer"
            onClick={handleProofClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleProofClick(e as unknown as React.MouseEvent);
              }
            }}
            aria-label={`View proof for ${sourceName}`}
          >
            <img
              src={proofImage}
              alt="Verification proof"
              className="w-full h-auto max-h-16 object-cover"
              loading="lazy"
            />
          </div>
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
          className="relative transition-[margin-left] duration-100 ease-out"
          style={{
            marginLeft: i === 0 ? 0 : isHovered ? ICON_MARGIN_EXPANDED : ICON_MARGIN_COLLAPSED,
            zIndex: Math.max(1, Math.min(20, displayItems.length - i)),
          }}
          onMouseEnter={() => onIconHover(i)}
          onMouseLeave={onIconLeave}
        >
          <StatusIconChip
            verification={flatItem.item.verification}
            title={getTitleForCitation(flatItem)}
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
          className="transition-[margin-left] duration-100 ease-out"
          style={{
            marginLeft: isHovered ? ICON_MARGIN_EXPANDED : ICON_MARGIN_COLLAPSED,
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
    { citationGroups, onClick, onSourceClick, isOpen, className, label, maxIcons = 10, showProofThumbnails = true },
    ref,
  ) => {
    const [isHovered, setIsHovered] = useState(false);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const displayLabel = label ?? generateDefaultLabel(citationGroups);

    // Flatten citation groups into individual items for per-citation icons
    const flatCitations = useMemo(() => flattenCitations(citationGroups), [citationGroups]);

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
          "bg-white dark:bg-gray-900",
          "border border-gray-200 dark:border-gray-700 rounded-md",
          "transition-all duration-200 overflow-hidden",
          "hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900",
          className,
        )}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Citations: ${displayLabel}`}
        data-testid="citation-drawer-trigger"
      >
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
        <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[200px]">{displayLabel}</span>

        {/* Chevron */}
        <svg
          className="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0"
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
