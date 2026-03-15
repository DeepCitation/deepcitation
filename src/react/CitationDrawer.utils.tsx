import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { isUrlCitation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import type { CitationDrawerItem, SourceCitationGroup } from "./CitationDrawer.types.js";
import { isPartialSearchStatus } from "./citationStatus.js";
import type { MessageKey, TranslateFunction } from "./i18n.js";
import { defaultMessages, defaultTranslator } from "./i18n.js";
// Import icon components for JSX rendering in getStatusInfo
import {
  CheckIcon as CheckIconComponent,
  SpinnerIcon as SpinnerIconComponent,
  XCircleIcon as XCircleIconComponent,
} from "./icons.js";
import type { IndicatorVariant } from "./types.js";

// =========
// Utilities: sourceLabelMap lookup
// =========

function hasSourceLabels(sourceLabelMap: Record<string, string> | undefined): sourceLabelMap is Record<string, string> {
  if (!sourceLabelMap) return false;
  for (const _key in sourceLabelMap) {
    return true;
  }
  return false;
}

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
  if (!hasSourceLabels(sourceLabelMap)) return groups;

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
export function getPrimarySourceName(
  citationGroups: SourceCitationGroup[],
  t: TranslateFunction = defaultTranslator,
): string {
  if (citationGroups.length === 0) return t("drawer.sources");
  const firstName = citationGroups[0].sourceName?.trim() || t("drawer.source");
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
export function generateDefaultLabel(
  citationGroups: SourceCitationGroup[],
  t: TranslateFunction = defaultTranslator,
): string {
  const name = getPrimarySourceName(citationGroups, t);
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

    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(item);
      continue;
    }

    groups.set(groupKey, [item]);
  }

  // Convert map to array of SourceCitationGroup
  const result = Array.from(groups.entries()).map(([_key, items]) => {
    const firstCitation = items[0].citation;
    const firstVerification = items[0].verification;
    const isUrlSource = firstCitation.type === "url";
    const sourceDomain = isUrlSource ? firstCitation.domain || extractDomain(firstCitation.url) : undefined;

    return {
      sourceName: isUrlSource
        ? firstCitation.siteName || sourceDomain || "Unknown Source"
        : firstVerification?.label || firstCitation.attachmentId || "Document",
      sourceDomain,
      sourceFavicon:
        firstVerification?.url?.verifiedFaviconUrl || (isUrlSource ? firstCitation.faviconUrl : undefined) || undefined,
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
 * @param indicatorVariant - "icon" for SVG icons (default), "dot" for subtle colored dots, "none" for no indicator
 */
export function getStatusInfo(
  verification: Verification | null,
  indicatorVariant: IndicatorVariant = "icon",
  t: TranslateFunction = defaultTranslator,
): {
  color: string;
  icon: React.ReactNode;
  label: string;
} {
  const status = verification?.status;

  const isPartial = isPartialSearchStatus(status);

  if (indicatorVariant === "none") {
    let label = t("indicator.verified");
    if (!status || status === "pending" || status === "loading") {
      label = t("indicator.verifying");
    } else if (status === "not_found") {
      label = t("indicator.notFound");
    } else if (isPartial) {
      label = t("indicator.partial");
    }

    return { color: "", icon: null, label };
  }

  if (indicatorVariant === "dot") {
    if (!status || status === "pending" || status === "loading") {
      return {
        color: "text-slate-400",
        icon: <span className="block rounded-full bg-slate-400 animate-pulse" style={DOT_INDICATOR_FIXED_SIZE_STYLE} />,
        label: t("indicator.verifying"),
      };
    }
    if (status === "not_found") {
      return {
        color: "text-red-500",
        icon: <span className="block rounded-full bg-red-500" style={DOT_INDICATOR_FIXED_SIZE_STYLE} />,
        label: t("indicator.notFound"),
      };
    }
    if (isPartial) {
      return {
        color: "text-amber-500",
        icon: <span className="block rounded-full bg-amber-500" style={DOT_INDICATOR_FIXED_SIZE_STYLE} />,
        label: t("indicator.partial"),
      };
    }
    return {
      color: "text-green-500",
      icon: <span className="block rounded-full bg-green-500" style={DOT_INDICATOR_FIXED_SIZE_STYLE} />,
      label: t("indicator.verified"),
    };
  }

  // Default: icon variant
  if (!status || status === "pending" || status === "loading") {
    return {
      color: "text-slate-400",
      icon: <SpinnerIconComponent />,
      label: t("indicator.verifying"),
    };
  }

  if (status === "not_found") {
    return {
      color: "text-red-500",
      icon: <XCircleIconComponent />,
      label: t("indicator.notFound"),
    };
  }

  if (isPartial) {
    return {
      color: "text-amber-500",
      icon: <CheckIconComponent />,
      label: t("indicator.partial"),
    };
  }

  // Verified statuses
  return {
    color: "text-green-500",
    icon: <CheckIconComponent />,
    label: t("indicator.verified"),
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
  notFound: {
    label: defaultMessages["indicator.notFound"],
    textColor: "text-red-500",
    borderColor: "border-l-red-400 dark:border-l-red-500",
  },
  partial: {
    label: defaultMessages["indicator.partial"],
    textColor: "text-amber-500",
    borderColor: "border-l-amber-400 dark:border-l-amber-500",
  },
  pending: {
    label: defaultMessages["indicator.verifying"],
    textColor: "text-slate-400",
    borderColor: "border-l-slate-300 dark:border-l-slate-600",
  },
  verified: {
    label: defaultMessages["indicator.verified"],
    textColor: "text-green-500",
    borderColor: "border-l-green-400 dark:border-l-green-500",
  },
};

const STATUS_LABEL_KEYS: Record<StatusCategory, MessageKey> = {
  notFound: "indicator.notFound",
  partial: "indicator.partial",
  pending: "indicator.verifying",
  verified: "indicator.verified",
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
      // citations are already sorted worst-first by the .map() above,
      // so citations[0] holds the worst status — no need to recompute.
      const worstA = a.citations.length > 0 ? getStatusPriority(a.citations[0].verification) : 0;
      const worstB = b.citations.length > 0 ? getStatusPriority(b.citations[0].verification) : 0;
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
export function groupCitationsByStatus(
  groups: SourceCitationGroup[],
  t: TranslateFunction = defaultTranslator,
): StatusSection[] {
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
      label: t(STATUS_LABEL_KEYS[category]),
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
  const citationKeysRef = useRef<Set<string>>(new Set());

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen(prev => !prev), []);

  const addCitation = useCallback((item: CitationDrawerItem) => {
    setCitations(prev => {
      // Track keys in a Set so duplicate checks stay O(1) as the drawer grows.
      if (citationKeysRef.current.has(item.citationKey)) return prev;
      citationKeysRef.current.add(item.citationKey);
      return [...prev, item];
    });
  }, []);

  const removeCitation = useCallback((citationKey: string) => {
    setCitations(prev => {
      const next = prev.filter(c => c.citationKey !== citationKey);
      if (next.length === prev.length) return prev;
      citationKeysRef.current.delete(citationKey);
      return next;
    });
  }, []);

  const clearCitations = useCallback(() => {
    citationKeysRef.current.clear();
    setCitations([]);
  }, []);

  const setCitationsList = useCallback((items: CitationDrawerItem[]) => {
    citationKeysRef.current = new Set(items.map(item => item.citationKey));
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
export function flattenCitations(
  citationGroups: SourceCitationGroup[],
  t: TranslateFunction = defaultTranslator,
): FlatCitationItem[] {
  const items: FlatCitationItem[] = [];
  for (const group of citationGroups) {
    for (const item of group.citations) {
      items.push({
        item,
        sourceName: group.sourceName?.trim() || t("drawer.source"),
        sourceFavicon: group.sourceFavicon,
        group,
      });
    }
  }
  return items.sort((a, b) => getStatusPriority(b.item.verification) - getStatusPriority(a.item.verification));
}
