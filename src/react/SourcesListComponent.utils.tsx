import { useCallback, useState } from "react";
import type { SourceType } from "../types/citation.js";
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
    const domain = extractDomain(url).toLowerCase();

    // Social media
    if (domain.includes("twitter.com") || domain === "x.com" || domain.endsWith(".x.com")) return "social";
    if (domain.includes("facebook.com") || domain.includes("instagram.com")) return "social";
    if (domain.includes("linkedin.com")) return "social";
    if (domain.includes("threads.net") || domain.includes("mastodon")) return "social";

    // Video platforms
    if (domain.includes("youtube.com") || domain.includes("youtu.be")) return "video";
    if (domain.includes("twitch.tv")) return "video";
    if (domain.includes("vimeo.com") || domain.includes("tiktok.com")) return "video";

    // Code repositories
    if (domain.includes("github.com") || domain.includes("gitlab.com")) return "code";
    if (domain.includes("bitbucket.org") || domain.includes("stackoverflow.com")) return "code";

    // Academic
    if (domain.includes("arxiv.org") || domain.includes("scholar.google")) return "academic";
    if (domain.includes("pubmed") || domain.includes("doi.org")) return "academic";
    if (domain.includes("researchgate.net") || domain.includes("academia.edu")) return "academic";

    // News
    if (domain.includes("news.") || domain.includes("reuters.com")) return "news";
    if (domain.includes("bbc.com") || domain.includes("cnn.com")) return "news";
    if (domain.includes("nytimes.com") || domain.includes("wsj.com")) return "news";
    if (domain.includes("theguardian.com") || domain.includes("washingtonpost.com")) return "news";

    // Reference
    if (domain.includes("wikipedia.org") || domain.includes("britannica.com")) return "reference";
    if (domain.includes("merriam-webster.com") || domain.includes("dictionary.com")) return "reference";

    // Forums
    if (domain.includes("reddit.com") || domain.includes("quora.com")) return "forum";
    if (domain.includes("discourse") || domain.includes("forum")) return "forum";

    // Commerce
    if (domain.includes("amazon.") || domain.includes("ebay.")) return "commerce";
    if (domain.includes("shopify") || domain.includes("etsy.com")) return "commerce";

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
