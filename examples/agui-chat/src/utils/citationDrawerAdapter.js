/**
 * Convert the verify API response into CitationDrawerItem[] for use
 * with CitationDrawerTrigger and CitationDrawer.
 */
export function toDrawerItems(citations, verifications) {
    return Object.entries(citations).map(([citationKey, citation]) => ({
        citationKey,
        citation,
        verification: verifications[citationKey] ?? null,
    }));
}
