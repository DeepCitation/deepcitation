import type React from "react";
import { useCallback, useMemo, useState } from "react";
import type { Verification } from "../types/verification.js";
import type { CitationDrawerItem, SourceCitationGroup } from "./CitationDrawer.types.js";
import { isPartialSearchStatus } from "./citationStatus.js";
// Import icon components for JSX rendering in getStatusInfo
import {
  CheckIcon as CheckIconComponent,
  SpinnerIcon as SpinnerIconComponent,
  XCircleIcon as XCircleIconComponent,
} from "./icons.js";
import { isUrlCitation } from "./utils.js";

// =========
// Utilities: sourceLabelMap lookup
// =========

/**
 * Look up a friendly display label from the sourceLabelMap for a citation.
 * Tries citation.attachmentId first, then citation.url.
 */
export function lookupSourceLabel(
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

/**
 * Resolve source labels for an array of citation groups.
 * Returns new group objects with `sourceName` set to the resolved label
 * (from sourceLabelMap) when available, or the original sourceName otherwise.
 * No-ops when map is undefined/empty.
 */
export function resolveGroupLabels(
  groups: SourceCitationGroup[],
  sourceLabelMap: Record<string, string> | undefined,
): SourceCitationGroup[] {
  if (!sourceLabelMap || Object.keys(sourceLabelMap).length === 0) return groups;
  return groups.map(group => {
    const firstCitation = group.citations[0]?.citation;
    const labelOverride = lookupSourceLabel(firstCitation, sourceLabelMap);
    if (!labelOverride) return group;
    return { ...group, sourceName: labelOverride };
  });
}

/**
 * Get the primary source name from citation groups.
 * Uses the first group's sourceName, truncated to 25 chars.
 * Falls back to "Source" if empty.
 *
 * This is the canonical source name computation used by both
 * CitationDrawerTrigger and DrawerSourceHeading. The heading renders
 * the "+N" overflow separately in a styled span, so this function
 * returns only the primary name (no overflow suffix).
 */
export function getPrimarySourceName(citationGroups: SourceCitationGroup[]): string {
  if (citationGroups.length === 0) return "Sources";
  const firstName = citationGroups[0].sourceName?.trim() || "Source";
  return firstName.length > 25 ? `${firstName.slice(0, 25)}...` : firstName;
}

/**
 * Generate a smart default label from citation groups.
 * 1 group → show source name; 2+ groups → "firstName +N"; truncate names > 25 chars.
 *
 * Used by CitationDrawerTrigger for the single-line label text.
 * The drawer heading uses getPrimarySourceName() directly since it renders
 * the "+N" overflow count in a separate styled element.
 */
export function generateDefaultLabel(citationGroups: SourceCitationGroup[]): string {
  const name = getPrimarySourceName(citationGroups);
  if (citationGroups.length <= 1) return name;
  return `${name} +${citationGroups.length - 1}`;
}

/**
 * Groups citations by their source domain/name.
 * Returns an array of SourceCitationGroup objects.
 *
 * @param citations - Array of citation items to group
 * @param sourceLabelMap - Optional map of attachmentId/URL to friendly display label.
 *   When provided, group sourceName values are pre-resolved so downstream components
 *   never need to call lookupSourceLabel().
 */
export function groupCitationsBySource(
  citations: CitationDrawerItem[],
  sourceLabelMap?: Record<string, string>,
): SourceCitationGroup[] {
  const groups = new Map<string, CitationDrawerItem[]>();

  for (const item of citations) {
    // Group by attachmentId for document citations, domain/siteName/url for URL citations
    const cit = item.citation;
    const groupKey = isUrlCitation(cit)
      ? cit.domain || cit.siteName || cit.url || "unknown"
      : cit.attachmentId || item.verification?.label || "unknown-doc";

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)?.push(item);
  }

  // Convert map to array of SourceCitationGroup
  const result = Array.from(groups.entries()).map(([_key, items]) => {
    const firstCitation = items[0].citation;
    const firstVerification = items[0].verification;
    return {
      sourceName:
        firstCitation.type === "url"
          ? firstCitation.siteName || firstCitation.domain || extractDomain(firstCitation.url) || "Unknown Source"
          : firstVerification?.label || firstCitation.attachmentId || "Document",
      sourceDomain: firstCitation.type === "url" ? firstCitation.domain || extractDomain(firstCitation.url) : undefined,
      sourceFavicon:
        firstVerification?.url?.verifiedFaviconUrl ||
        (firstCitation.type === "url" ? firstCitation.faviconUrl : undefined) ||
        undefined,
      citations: items,
      additionalCount: items.length - 1,
    };
  });
  return resolveGroupLabels(result, sourceLabelMap);
}

/**
 * Extracts domain from a URL string.
 */
export function extractDomain(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

import { DOT_INDICATOR_FIXED_SIZE_STYLE } from "./constants.js";

/**
 * Get verification status indicator info.
 * @param verification - The verification result
 * @param indicatorVariant - "icon" for SVG icons (default), "dot" for subtle colored dots
 */
export function getStatusInfo(
  verification: Verification | null,
  indicatorVariant: "icon" | "dot" = "icon",
): {
  color: string;
  icon: React.ReactNode;
  label: string;
} {
  const status = verification?.status;

  const isPartial = isPartialSearchStatus(status);

  if (indicatorVariant === "dot") {
    if (!status || status === "pending" || status === "loading") {
      return {
        color: "text-gray-400",
        icon: <span className="block rounded-full bg-gray-400 animate-pulse" style={DOT_INDICATOR_FIXED_SIZE_STYLE} />,
        label: "Verifying",
      };
    }
    if (status === "not_found") {
      return {
        color: "text-red-500",
        icon: <span className="block rounded-full bg-red-500" style={DOT_INDICATOR_FIXED_SIZE_STYLE} />,
        label: "Not found",
      };
    }
    if (isPartial) {
      return {
        color: "text-amber-500",
        icon: <span className="block rounded-full bg-amber-500" style={DOT_INDICATOR_FIXED_SIZE_STYLE} />,
        label: "Partial match",
      };
    }
    return {
      color: "text-green-500",
      icon: <span className="block rounded-full bg-green-500" style={DOT_INDICATOR_FIXED_SIZE_STYLE} />,
      label: "Verified",
    };
  }

  // Default: icon variant
  if (!status || status === "pending" || status === "loading") {
    return {
      color: "text-gray-400",
      icon: <SpinnerIconComponent />,
      label: "Verifying",
    };
  }

  if (status === "not_found") {
    return {
      color: "text-red-500",
      icon: <XCircleIconComponent />,
      label: "Not found",
    };
  }

  if (isPartial) {
    return {
      color: "text-amber-500",
      icon: <CheckIconComponent />,
      label: "Partial match",
    };
  }

  // Verified statuses
  return {
    color: "text-green-500",
    icon: <CheckIconComponent />,
    label: "Verified",
  };
}

/**
 * Get numeric priority for a verification status.
 * Higher number = worse status. Used to pick the "worst" status in a group.
 *
 * Priority: not_found (4) > partial (3) > pending (2) > verified (1)
 */
export function getStatusPriority(verification: Verification | null): number {
  const status = verification?.status;

  if (!status || status === "pending" || status === "loading") return 2;
  if (status === "not_found") return 4;

  if (isPartialSearchStatus(status)) return 3;

  return 1; // verified
}

// =========
// Status summary + sorting utilities
// =========

/**
 * Status category bucket used for status-grouped views.
 * Maps to getStatusPriority() tiers: notFound(4), partial(3), pending(2), verified(1).
 */
export type StatusCategory = "notFound" | "partial" | "pending" | "verified";

/**
 * A section of citations grouped by their status.
 * Used by the "By status" view in the drawer.
 */
export interface StatusSection {
  category: StatusCategory;
  label: string;
  color: string;
  items: CitationDrawerItem[];
}

/**
 * Single source of truth for status display styling.
 * Maps each StatusCategory to a human label, text color (for section headers/labels),
 * and border color (for citation item left borders in CitationDrawer).
 */
export const STATUS_DISPLAY_MAP: Record<StatusCategory, { label: string; textColor: string; borderColor: string }> = {
  notFound: { label: "Not found", textColor: "text-red-500", borderColor: "border-l-red-400 dark:border-l-red-500" },
  partial: {
    label: "Partial match",
    textColor: "text-amber-500",
    borderColor: "border-l-amber-400 dark:border-l-amber-500",
  },
  pending: { label: "Verifying", textColor: "text-gray-400", borderColor: "border-l-gray-300 dark:border-l-gray-600" },
  verified: {
    label: "Verified",
    textColor: "text-green-500",
    borderColor: "border-l-green-400 dark:border-l-green-500",
  },
};

/**
 * Summary of verification statuses across all citations.
 * Computed from citation groups for header display and progress bar.
 */
export function computeStatusSummary(groups: SourceCitationGroup[]): {
  verified: number;
  partial: number;
  notFound: number;
  pending: number;
  total: number;
} {
  let verified = 0;
  let partial = 0;
  let notFound = 0;
  let pending = 0;

  for (const group of groups) {
    if (!group?.citations || !Array.isArray(group.citations)) continue;
    for (const item of group.citations) {
      const priority = getStatusPriority(item.verification);
      switch (priority) {
        case 4:
          notFound++;
          break;
        case 3:
          partial++;
          break;
        case 2:
          pending++;
          break;
        default:
          verified++;
      }
    }
  }

  return { verified, partial, notFound, pending, total: verified + partial + notFound + pending };
}

/**
 * Sort citation groups by worst status (failures first).
 * Within each group, individual citations are also sorted worst-first.
 * Returns a new array (does not mutate input).
 */
export function sortGroupsByWorstStatus(groups: SourceCitationGroup[]): SourceCitationGroup[] {
  return [...groups]
    .map(group => ({
      ...group,
      citations: [...group.citations].sort(
        (a, b) => getStatusPriority(b.verification) - getStatusPriority(a.verification),
      ),
    }))
    .sort((a, b) => {
      const worstA = a.citations.length > 0 ? Math.max(...a.citations.map(c => getStatusPriority(c.verification))) : 0;
      const worstB = b.citations.length > 0 ? Math.max(...b.citations.map(c => getStatusPriority(c.verification))) : 0;
      return worstB - worstA;
    });
}

/**
 * Get the StatusCategory for a citation item.
 */
export function getItemStatusCategory(item: CitationDrawerItem): StatusCategory {
  const priority = getStatusPriority(item.verification);
  switch (priority) {
    case 4:
      return "notFound";
    case 3:
      return "partial";
    case 2:
      return "pending";
    default:
      return "verified";
  }
}

/**
 * Group all citations into StatusSections for the "By status" view.
 * Returns sections ordered: notFound → partial → pending → verified.
 * Empty sections are omitted.
 */
export function groupCitationsByStatus(groups: SourceCitationGroup[]): StatusSection[] {
  const buckets: Record<StatusCategory, CitationDrawerItem[]> = {
    notFound: [],
    partial: [],
    pending: [],
    verified: [],
  };

  for (const group of groups) {
    for (const item of group.citations) {
      buckets[getItemStatusCategory(item)].push(item);
    }
  }

  const categoryOrder: StatusCategory[] = ["notFound", "partial", "pending", "verified"];

  return categoryOrder
    .filter(category => buckets[category].length > 0)
    .map(category => ({
      category,
      label: STATUS_DISPLAY_MAP[category].label,
      color: STATUS_DISPLAY_MAP[category].textColor,
      items: buckets[category],
    }));
}

/**
 * Hook for managing citation drawer state.
 *
 * @example
 * ```tsx
 * const { isOpen, openDrawer, closeDrawer, citationGroups, addCitation } = useCitationDrawer();
 *
 * // Add citations
 * addCitation({ citationKey: "1", citation, verification });
 *
 * // Open drawer
 * <button onClick={openDrawer}>View Citations</button>
 *
 * // Render drawer
 * <CitationDrawer
 *   isOpen={isOpen}
 *   onClose={closeDrawer}
 *   citationGroups={citationGroups}
 * />
 * ```
 */
export function useCitationDrawer(sourceLabelMap?: Record<string, string>) {
  const [isOpen, setIsOpen] = useState(false);
  const [citations, setCitations] = useState<CitationDrawerItem[]>([]);

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen(prev => !prev), []);

  const addCitation = useCallback((item: CitationDrawerItem) => {
    setCitations(prev => {
      // Don't add duplicates
      if (prev.some(c => c.citationKey === item.citationKey)) {
        return prev;
      }
      return [...prev, item];
    });
  }, []);

  const removeCitation = useCallback((citationKey: string) => {
    setCitations(prev => prev.filter(c => c.citationKey !== citationKey));
  }, []);

  const clearCitations = useCallback(() => {
    setCitations([]);
  }, []);

  const setCitationsList = useCallback((items: CitationDrawerItem[]) => {
    setCitations(items);
  }, []);

  const citationGroups = useMemo(() => groupCitationsBySource(citations, sourceLabelMap), [citations, sourceLabelMap]);

  return {
    isOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    citations,
    citationGroups,
    addCitation,
    removeCitation,
    clearCitations,
    setCitations: setCitationsList,
  };
}

// =========
// FlatCitationItem + flattenCitations
// =========

/** Flattened citation item with source context for icon row display */
export interface FlatCitationItem {
  item: CitationDrawerItem;
  sourceName: string;
  sourceFavicon?: string;
  group: SourceCitationGroup;
}

/**
 * Flatten citation groups into individual citation items with source context.
 * Sorted by status priority (worst first) so failures appear at the start of the icon row.
 */
export function flattenCitations(citationGroups: SourceCitationGroup[]): FlatCitationItem[] {
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
  return items.sort((a, b) => getStatusPriority(b.item.verification) - getStatusPriority(a.item.verification));
}
