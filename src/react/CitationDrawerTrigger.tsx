import type React from "react";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Verification } from "../types/verification.js";
import type { SourceCitationGroup } from "./CitationDrawer.types.js";
import { getStatusInfo, getStatusPriority } from "./CitationDrawer.utils.js";
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
  /** Maximum status icons to display (default: 5) */
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

function generateDefaultLabel(summary: CitationStatusSummary): string {
  const parts: string[] = [];
  if (summary.verified > 0) parts.push(`${summary.verified} verified`);
  if (summary.partial > 0) parts.push(`${summary.partial} partial`);
  if (summary.notFound > 0) parts.push(`${summary.notFound} not found`);
  if (summary.pending > 0) parts.push(`${summary.pending} pending`);
  if (parts.length === 0) return `${summary.total} sources`;
  return `${summary.total} sources · ${parts.join(", ")}`;
}

/**
 * Get the "worst" verification in a group for aggregate display.
 * Priority: not_found > partial > pending > verified
 */
function getGroupAggregateVerification(group: SourceCitationGroup): Verification | null {
  let worst: { v: Verification | null; p: number } = { v: null, p: 0 };
  for (const item of group.citations) {
    const p = getStatusPriority(item.verification);
    if (p > worst.p) worst = { v: item.verification, p };
  }
  return worst.v;
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
// StatusIconChip — individual status icon in the stacked row
// =========

function StatusIconChip({ group, size = 20 }: { group: SourceCitationGroup; size?: number }) {
  const aggregateVerification = getGroupAggregateVerification(group);
  const statusInfo = getStatusInfo(aggregateVerification);
  const isPending =
    !aggregateVerification?.status ||
    aggregateVerification.status === "pending" ||
    aggregateVerification.status === "loading";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full ring-2 ring-white dark:ring-gray-800",
        getStatusBgColor(statusInfo.label),
        statusInfo.color,
      )}
      style={{ width: size, height: size }}
      title={`${group.sourceName}: ${statusInfo.label}`}
    >
      <span className={cn("w-3 h-3", isPending && "animate-spin")}>{statusInfo.icon}</span>
    </span>
  );
}

// =========
// SourceTooltip — popover shown when hovering individual spread-out icon
// =========

function SourceTooltip({
  group,
  showProofThumbnail,
  onSourceClick,
}: {
  group: SourceCitationGroup;
  showProofThumbnail: boolean;
  onSourceClick?: (group: SourceCitationGroup) => void;
}) {
  const aggregateVerification = getGroupAggregateVerification(group);
  const statusInfo = getStatusInfo(aggregateVerification);

  // Find the first verification with a proof image, validating the data URL
  const rawProofImage = showProofThumbnail
    ? group.citations.find(c => c.verification?.verificationImageBase64)?.verification?.verificationImageBase64
    : null;
  const proofImage =
    typeof rawProofImage === "string" &&
    (rawProofImage.startsWith("data:image/") || rawProofImage.startsWith("https://"))
      ? rawProofImage
      : null;

  const handleProofClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSourceClick?.(group);
  };

  return (
    <div
      className={cn(
        "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50",
        "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700",
        "rounded-lg shadow-lg min-w-[180px] max-w-[260px]",
        "pointer-events-auto",
      )}
      data-testid="source-tooltip"
    >
      {/* Source header: favicon + name + status */}
      <div className="flex items-center gap-2 px-3 py-2">
        {group.sourceFavicon ? (
          <img
            src={group.sourceFavicon}
            alt=""
            className="w-4 h-4 rounded-sm object-contain flex-shrink-0"
            loading="lazy"
            onError={handleFaviconError}
          />
        ) : (
          <span className="w-4 h-4 rounded-sm bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[8px] font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">
            {group.sourceName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{group.sourceName}</span>
        <span className={cn("inline-flex w-3.5 h-3.5 flex-shrink-0", statusInfo.color)} title={statusInfo.label}>
          {statusInfo.icon}
        </span>
      </div>

      {/* Citation count */}
      <div className="px-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400">
        {group.citations.length} citation{group.citations.length !== 1 ? "s" : ""} · {statusInfo.label}
      </div>

      {/* Proof image thumbnail */}
      {proofImage && (
        <div className="px-2 pb-2">
          <button
            type="button"
            className="block w-full rounded overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer"
            onClick={handleProofClick}
            aria-label={`View proof for ${group.sourceName}`}
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
// StackedStatusIcons — horizontally expanding icon row
// =========

function StackedStatusIcons({
  citationGroups,
  isHovered,
  maxIcons,
  hoveredGroupIndex,
  onIconHover,
  onIconLeave,
  showProofThumbnails,
  onSourceClick,
}: {
  citationGroups: SourceCitationGroup[];
  isHovered: boolean;
  maxIcons: number;
  hoveredGroupIndex: number | null;
  onIconHover: (index: number) => void;
  onIconLeave: () => void;
  showProofThumbnails: boolean;
  onSourceClick?: (group: SourceCitationGroup) => void;
}) {
  const displayGroups = citationGroups.slice(0, maxIcons);
  const hasOverflow = citationGroups.length > maxIcons;
  const overflowCount = citationGroups.length - maxIcons;

  return (
    <div className="flex items-center" role="group" aria-label="Source verification status">
      {displayGroups.map((group, i) => (
        <div
          key={`${group.sourceDomain ?? group.sourceName}-${i}`}
          className="relative transition-all duration-300 ease-out"
          style={{
            marginLeft: i === 0 ? 0 : isHovered ? 6 : -8,
            zIndex: Math.min(displayGroups.length - i, 10),
          }}
          onMouseEnter={() => onIconHover(i)}
          onMouseLeave={onIconLeave}
          onFocus={() => onIconHover(i)}
          onBlur={onIconLeave}
          tabIndex={0}
          role="button"
          aria-label={`${group.sourceName}: ${getStatusInfo(getGroupAggregateVerification(group)).label}`}
        >
          <StatusIconChip group={group} />
          {/* Tooltip when this specific icon is hovered/focused and bar is expanded */}
          {isHovered && hoveredGroupIndex === i && (
            <SourceTooltip group={group} showProofThumbnail={showProofThumbnails} onSourceClick={onSourceClick} />
          )}
        </div>
      ))}
      {hasOverflow && (
        <div
          className="transition-all duration-300 ease-out"
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
 * - **Collapsed**: Stacked verification icons + label + stacked favicons
 * - **Hover**: Icons spread horizontally, individual icon hover shows source tooltip with proof
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
    { citationGroups, onClick, onSourceClick, isOpen, className, label, maxIcons = 5, showProofThumbnails = true },
    ref,
  ) => {
    const [isHovered, setIsHovered] = useState(false);
    const [hoveredGroupIndex, setHoveredGroupIndex] = useState<number | null>(null);
    const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const summary = useMemo(() => computeStatusSummary(citationGroups), [citationGroups]);
    const displayLabel = label ?? generateDefaultLabel(summary);

    const displayGroups = useMemo(() => citationGroups.slice(0, maxIcons), [citationGroups, maxIcons]);
    const hasMoreFavicons = citationGroups.length > maxIcons;

    const handleMouseEnter = useCallback(() => setIsHovered(true), []);
    const handleMouseLeave = useCallback(() => {
      setIsHovered(false);
      setHoveredGroupIndex(null);
      clearTimeout(leaveTimeoutRef.current);
    }, []);
    const handleFocus = useCallback(() => {
      clearTimeout(leaveTimeoutRef.current);
      setIsHovered(true);
    }, []);
    const handleBlur = useCallback(() => {
      leaveTimeoutRef.current = setTimeout(() => {
        setIsHovered(false);
        setHoveredGroupIndex(null);
      }, TOOLTIP_HIDE_DELAY_MS);
    }, []);

    const handleIconHover = useCallback((index: number) => {
      clearTimeout(leaveTimeoutRef.current);
      setHoveredGroupIndex(index);
    }, []);

    const handleIconLeave = useCallback(() => {
      leaveTimeoutRef.current = setTimeout(() => setHoveredGroupIndex(null), TOOLTIP_HIDE_DELAY_MS);
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
          "w-full text-left rounded-lg border transition-all duration-200",
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
        <div className="flex items-center gap-3 px-3 py-2">
          {/* Stacked/spread verification icons */}
          <StackedStatusIcons
            citationGroups={citationGroups}
            isHovered={isHovered}
            maxIcons={maxIcons}
            hoveredGroupIndex={hoveredGroupIndex}
            onIconHover={handleIconHover}
            onIconLeave={handleIconLeave}
            showProofThumbnails={showProofThumbnails}
            onSourceClick={onSourceClick}
          />

          {/* Label */}
          <span className="flex-1 text-sm text-gray-600 dark:text-gray-300 truncate">{displayLabel}</span>

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
                  {group.sourceName.charAt(0).toUpperCase()}
                </span>
              );
            })}
            {hasMoreFavicons && (
              <span className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600 ring-1 ring-white dark:ring-gray-800 flex items-center justify-center text-[8px] font-medium text-gray-600 dark:text-gray-300">
                +{citationGroups.length - maxIcons}
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
