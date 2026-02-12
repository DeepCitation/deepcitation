import type React from "react";
import { useCallback, useMemo, useState } from "react";
import type { Verification } from "../types/verification.js";
import type { CitationDrawerItem, SourceCitationGroup } from "./CitationDrawer.types.js";
import { isUrlCitation } from "./utils.js";

// Import icon components for JSX rendering in getStatusInfo
import {
  CheckIcon as CheckIconComponent,
  SpinnerIcon as SpinnerIconComponent,
  WarningIcon as WarningIconComponent,
} from "./icons.js";

/**
 * Groups citations by their source domain/name.
 * Returns an array of SourceCitationGroup objects.
 */
export function groupCitationsBySource(citations: CitationDrawerItem[]): SourceCitationGroup[] {
  const groups = new Map<string, CitationDrawerItem[]>();

  for (const item of citations) {
    // Group by attachmentId for document citations, domain/siteName/url for URL citations
    const cit = item.citation;
    const groupKey = isUrlCitation(cit)
      ? (cit.domain || cit.siteName || cit.url || "unknown")
      : (cit.attachmentId || item.verification?.label || "unknown-doc");

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)?.push(item);
  }

  // Convert map to array of SourceCitationGroup
  return Array.from(groups.entries()).map(([_key, items]) => {
    const firstCitation = items[0].citation;
    const firstVerification = items[0].verification;
    return {
      sourceName: firstCitation.type === "url"
        ? (firstCitation.siteName || firstCitation.domain || extractDomain(firstCitation.url) || "Unknown Source")
        : (firstVerification?.label || firstCitation.attachmentId || "Document"),
      sourceDomain: firstCitation.type === "url" ? (firstCitation.domain || extractDomain(firstCitation.url)) : undefined,
      sourceFavicon: (firstCitation.type === "url" ? firstCitation.faviconUrl : undefined) || undefined,
      citations: items,
      additionalCount: items.length - 1,
    };
  });
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

/**
 * Get verification status indicator info
 */
export function getStatusInfo(verification: Verification | null): {
  color: string;
  icon: React.ReactNode;
  label: string;
} {
  const status = verification?.status;

  if (!status || status === "pending" || status === "loading") {
    return {
      color: "text-gray-400",
      icon: <SpinnerIconComponent />,
      label: "Verifying",
    };
  }

  if (status === "not_found") {
    return {
      color: "text-amber-500",
      icon: <WarningIconComponent />,
      label: "Not found",
    };
  }

  const isPartial =
    status === "partial_text_found" ||
    status === "found_on_other_page" ||
    status === "found_on_other_line" ||
    status === "first_word_found";

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

  const isPartial =
    status === "partial_text_found" ||
    status === "found_on_other_page" ||
    status === "found_on_other_line" ||
    status === "first_word_found";

  if (isPartial) return 3;

  return 1; // verified
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
export function useCitationDrawer() {
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

  const citationGroups = useMemo(() => groupCitationsBySource(citations), [citations]);

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
