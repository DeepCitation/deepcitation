import { useCallback, useState } from "react";
import type { SourceType } from "../types/citation.js";
import { isDomainMatch } from "../utils/urlSafety.js";
import type { SourcesListItemProps } from "./types.js";
import { extractDomain } from "./urlUtils.js";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extracts domain from URL for favicon fetching.
 */
export function getFaviconUrl(url: string, customFaviconUrl?: string): string {
  if (customFaviconUrl) return customFaviconUrl;
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

/**
 * Detects source type from URL domain.
 */
export function detectSourceType(url: string): SourceType {
  // Validate URL format
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return "unknown";
  }

  try {
    // Parse URL to safely check pathname and domain
    const parsedUrl = new URL(url);
    const domain = extractDomain(url);

    // Social media - use safe domain matching to prevent spoofing
    if (isDomainMatch(url, "twitter.com") || isDomainMatch(url, "x.com")) return "social";
    if (isDomainMatch(url, "facebook.com") || isDomainMatch(url, "instagram.com")) return "social";
    if (isDomainMatch(url, "linkedin.com")) return "social";
    if (isDomainMatch(url, "threads.net")) return "social";
    // Mastodon: check domain ends with mastodon.* pattern
    if (domain.includes(".mastodon.") || domain.endsWith(".social") && parsedUrl.pathname.includes("/@")) return "social";

    // Video platforms
    if (isDomainMatch(url, "youtube.com") || isDomainMatch(url, "youtu.be")) return "video";
    if (isDomainMatch(url, "twitch.tv")) return "video";
    if (isDomainMatch(url, "vimeo.com") || isDomainMatch(url, "tiktok.com")) return "video";

    // Code repositories
    if (isDomainMatch(url, "github.com") || isDomainMatch(url, "gitlab.com")) return "code";
    if (isDomainMatch(url, "bitbucket.org") || isDomainMatch(url, "stackoverflow.com")) return "code";

    // Academic
    if (isDomainMatch(url, "arxiv.org")) return "academic";
    if (isDomainMatch(url, "scholar.google.com")) return "academic";
    // PubMed: check domain for ncbi.nlm.nih.gov or pathname for /pubmed
    if (isDomainMatch(url, "pubmed.ncbi.nlm.nih.gov") ||
        (isDomainMatch(url, "ncbi.nlm.nih.gov") && parsedUrl.pathname.includes("/pubmed"))) return "academic";
    if (isDomainMatch(url, "doi.org")) return "academic";
    if (isDomainMatch(url, "researchgate.net") || isDomainMatch(url, "academia.edu")) return "academic";

    // News
    // Safe check: domain starts with "news." subdomain pattern
    if (domain.startsWith("news.")) return "news";
    if (isDomainMatch(url, "reuters.com")) return "news";
    if (isDomainMatch(url, "bbc.com") || isDomainMatch(url, "cnn.com")) return "news";
    if (isDomainMatch(url, "bbc.co.uk") || isDomainMatch(url, "nytimes.com")) return "news";
    if (isDomainMatch(url, "wsj.com") || isDomainMatch(url, "theguardian.com")) return "news";
    if (isDomainMatch(url, "washingtonpost.com")) return "news";

    // Reference
    if (isDomainMatch(url, "wikipedia.org") || isDomainMatch(url, "britannica.com")) return "reference";
    if (isDomainMatch(url, "merriam-webster.com") || isDomainMatch(url, "dictionary.com")) return "reference";

    // Forums
    if (isDomainMatch(url, "reddit.com") || isDomainMatch(url, "quora.com")) return "forum";
    // Safe check: pathname contains /discourse or /forum indicators
    if (parsedUrl.pathname.includes("/discourse") || parsedUrl.pathname.includes("/forum")) return "forum";

    // Commerce
    // Note: amazon and ebay have many regional TLDs (amazon.com, amazon.co.uk, etc.)
    // so we check if domain starts with these prefixes
    if (domain.startsWith("amazon.") || domain.startsWith("ebay.")) return "commerce";
    // Shopify: check for shopify in domain
    if (domain.includes(".myshopify.") || domain.endsWith(".myshopify.com")) return "commerce";
    if (isDomainMatch(url, "etsy.com")) return "commerce";

    // PDF check (by extension in URL)
    if (url.toLowerCase().endsWith(".pdf")) return "pdf";

    return "web";
  } catch {
    return "unknown";
  }
}

/**
 * Gets a human-readable platform name from domain.
 */
export function getPlatformName(url: string, domain?: string): string {
  const d = (domain || extractDomain(url)).toLowerCase();

  // Map known domains to platform names
  const platformMap: Record<string, string> = {
    "twitter.com": "X",
    "x.com": "X",
    "facebook.com": "Facebook",
    "instagram.com": "Instagram",
    "linkedin.com": "LinkedIn",
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "twitch.tv": "Twitch",
    "github.com": "GitHub",
    "gitlab.com": "GitLab",
    "stackoverflow.com": "Stack Overflow",
    "reddit.com": "Reddit",
    "wikipedia.org": "Wikipedia",
    "arxiv.org": "arXiv",
    "medium.com": "Medium",
    "substack.com": "Substack",
    "notion.so": "Notion",
    "docs.google.com": "Google Docs",
    "drive.google.com": "Google Drive",
    "figma.com": "Figma",
    "streamscharts.com": "Streams Charts",
    "dexerto.com": "Dexerto",
  };

  // Check for exact match first
  if (platformMap[d]) return platformMap[d];

  // Check if domain ends with or equals a known domain (e.g., "en.wikipedia.org" matches "wikipedia.org")
  for (const [key, name] of Object.entries(platformMap)) {
    if (d === key || d.endsWith(`.${key}`)) return name;
  }

  // Capitalize first letter of domain
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/**
 * Converts SourceCitation array to SourcesListItemProps array.
 */
export function sourceCitationsToListItems(
  citations: Array<{
    url?: string;
    title?: string;
    domain?: string;
    sourceType?: SourceType;
    faviconUrl?: string;
    citationNumber?: number;
  }>,
): SourcesListItemProps[] {
  const sourceMap = new Map<string, SourcesListItemProps>();

  for (const citation of citations) {
    if (!citation.url) continue;

    const domain = citation.domain || extractDomain(citation.url);
    const key = citation.url;

    if (sourceMap.has(key)) {
      // Aggregate citation numbers
      const existing = sourceMap.get(key);
      if (existing && citation.citationNumber && !existing.citationNumbers?.includes(citation.citationNumber)) {
        existing.citationNumbers = [...(existing.citationNumbers || []), citation.citationNumber];
      }
    } else {
      sourceMap.set(key, {
        id: key,
        url: citation.url,
        title: citation.title || domain,
        domain,
        sourceType: citation.sourceType || detectSourceType(citation.url),
        faviconUrl: citation.faviconUrl,
        citationNumbers: citation.citationNumber ? [citation.citationNumber] : [],
      });
    }
  }

  return Array.from(sourceMap.values());
}

/**
 * Hook for managing sources list state.
 */
export function useSourcesList(initialSources: SourcesListItemProps[] = []) {
  const [sources, setSources] = useState<SourcesListItemProps[]>(initialSources);
  const [isOpen, setIsOpen] = useState(false);

  const addSource = useCallback((source: SourcesListItemProps) => {
    setSources(prev => {
      const exists = prev.some(s => s.url === source.url);
      if (exists) return prev;
      return [...prev, source];
    });
  }, []);

  const removeSource = useCallback((id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
  }, []);

  const clearSources = useCallback(() => {
    setSources([]);
  }, []);

  return {
    sources,
    setSources,
    addSource,
    removeSource,
    clearSources,
    isOpen,
    setIsOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
  };
}
