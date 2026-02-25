import type { Citation, Verification } from "deepcitation";
import type { CitationDrawerItem } from "deepcitation/react";

/**
 * Convert the verify API response into CitationDrawerItem[] for use
 * with CitationDrawerTrigger and CitationDrawer.
 */
export function toDrawerItems(
  citations: Record<string, Citation>,
  verifications: Record<string, Verification>,
): CitationDrawerItem[] {
  return Object.entries(citations).map(([citationKey, citation]) => ({
    citationKey,
    citation,
    verification: verifications[citationKey] ?? null,
  }));
}
