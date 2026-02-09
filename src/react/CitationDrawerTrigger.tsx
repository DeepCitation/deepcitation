import type React from "react";
import { forwardRef, useCallback, useMemo, useState } from "react";
import type { SourceCitationGroup } from "./CitationDrawer.types.js";
import { getStatusInfo } from "./CitationDrawer.utils.js";
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
  /** Whether the drawer is currently open (controls aria-expanded) */
  isOpen?: boolean;
  /** Additional class name */
  className?: string;
  /** Label text override (default: auto-generated from status counts) */
  label?: string;
  /** Maximum favicon icons to display in collapsed state */
  maxIcons?: number;
}

// =========
// Module-level handlers (avoid re-creation on render)
// =========

const handleFaviconError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.opacity = "0";
};

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

// =========
// StatusDots — compact stacked status indicators
// =========

function StatusDots({ summary }: { summary: CitationStatusSummary }) {
  const dots: Array<{ color: string; count: number; label: string }> = [];
  if (summary.verified > 0) dots.push({ color: "bg-green-500", count: summary.verified, label: "verified" });
  if (summary.partial > 0) dots.push({ color: "bg-amber-500", count: summary.partial, label: "partial" });
  if (summary.notFound > 0) dots.push({ color: "bg-red-500", count: summary.notFound, label: "not found" });
  if (summary.pending > 0) dots.push({ color: "bg-gray-400", count: summary.pending, label: "pending" });

  return (
    <div className="flex items-center -space-x-1" aria-hidden="true">
      {dots.map(dot => (
        <span
          key={dot.label}
          className={cn("w-2.5 h-2.5 rounded-full ring-1 ring-white dark:ring-gray-800", dot.color)}
          title={`${dot.count} ${dot.label}`}
        />
      ))}
    </div>
  );
}

// =========
// HoverSourceRow — individual source shown in hover expansion
// =========

function HoverSourceRow({ group }: { group: SourceCitationGroup }) {
  const firstItem = group.citations[0];
  if (!firstItem) return null;

  const statusInfo = getStatusInfo(firstItem.verification ?? null);
  const isPending =
    !firstItem.verification?.status ||
    firstItem.verification.status === "pending" ||
    firstItem.verification.status === "loading";

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 py-0.5">
      {group.sourceFavicon ? (
        <img
          src={group.sourceFavicon}
          alt=""
          className="w-3.5 h-3.5 rounded-sm object-contain flex-shrink-0"
          loading="lazy"
          onError={handleFaviconError}
        />
      ) : (
        <span className="w-3.5 h-3.5 rounded-sm bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[8px] font-medium flex-shrink-0">
          {group.sourceName.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="truncate">{group.sourceName}</span>
      {group.citations.length > 1 && (
        <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">×{group.citations.length}</span>
      )}
      <span
        className={cn("inline-flex w-3 h-3 flex-shrink-0", statusInfo.color, isPending ? "animate-spin" : "")}
        title={statusInfo.label}
      >
        {statusInfo.icon}
      </span>
    </div>
  );
}

// =========
// CitationDrawerTrigger
// =========

/**
 * Compact summary bar for citation verification status.
 *
 * Sits at the bottom of AI-generated content and provides progressive disclosure:
 * - **Collapsed**: Stacked status dots + label + stacked favicons
 * - **Hover**: Expands to show individual source rows
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
  ({ citationGroups, onClick, isOpen, className, label, maxIcons = 3 }, ref) => {
    const [isHovered, setIsHovered] = useState(false);

    const summary = useMemo(() => computeStatusSummary(citationGroups), [citationGroups]);
    const displayLabel = label ?? generateDefaultLabel(summary);

    const displayGroups = useMemo(() => citationGroups.slice(0, maxIcons), [citationGroups, maxIcons]);
    const hasMoreFavicons = citationGroups.length > maxIcons;

    const handleMouseEnter = useCallback(() => setIsHovered(true), []);
    const handleMouseLeave = useCallback(() => setIsHovered(false), []);
    const handleFocus = useCallback(() => setIsHovered(true), []);
    const handleBlur = useCallback(() => setIsHovered(false), []);

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
        {/* Collapsed bar — always visible */}
        <div className="flex items-center gap-3 px-3 py-2">
          {/* Status dots */}
          <StatusDots summary={summary} />

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

          {/* Chevron */}
          <svg
            className={cn(
              "w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 flex-shrink-0",
              isHovered && "rotate-180",
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Hover expansion — source rows */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-200 ease-in-out",
            isHovered ? "max-h-60 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="px-3 pb-2 pt-1 border-t border-gray-200 dark:border-gray-700 space-y-0.5">
            {citationGroups.slice(0, 5).map((group, index) => (
              <HoverSourceRow key={`${group.sourceDomain ?? group.sourceName}-${index}`} group={group} />
            ))}
            {citationGroups.length > 5 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                +{citationGroups.length - 5} more sources
              </span>
            )}
          </div>
        </div>
      </button>
    );
  },
);

CitationDrawerTrigger.displayName = "CitationDrawerTrigger";
