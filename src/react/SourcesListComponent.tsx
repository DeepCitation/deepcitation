import React, { forwardRef, memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { SourceType } from "../types/citation.js";
import type {
  SourcesListProps,
  SourcesListItemProps,
  SourcesTriggerProps,
  SourcesListVariant,
} from "./types.js";
import { classNames } from "./utils.js";
import { extractDomain } from "./UrlCitationComponent.js";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extracts domain from URL for favicon fetching.
 */
function getFaviconUrl(url: string, customFaviconUrl?: string): string {
  if (customFaviconUrl) return customFaviconUrl;
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
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
    if (d === key || d.endsWith("." + key)) return name;
  }

  // Capitalize first letter of domain
  return d.charAt(0).toUpperCase() + d.slice(1);
}

// ============================================================================
// Icons
// ============================================================================

const CloseIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const SpinnerIcon = () => (
  <svg
    className="animate-spin"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// ============================================================================
// SourcesListItem Component
// ============================================================================

/**
 * Individual source item in the sources list.
 * Displays favicon, title, and domain/platform name.
 */
export const SourcesListItem = forwardRef<HTMLDivElement, SourcesListItemProps>(
  (
    {
      id,
      url,
      title,
      domain,
      sourceType,
      faviconUrl,
      citationNumbers,
      verificationStatus,
      onClick,
      className,
      showVerificationIndicator = false,
      showCitationBadges = false,
      renderFavicon,
    },
    ref
  ) => {
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (onClick) {
          onClick(
            { id, url, title, domain, sourceType, faviconUrl, citationNumbers, verificationStatus },
            e
          );
        } else {
          // Default: open URL in new tab
          window.open(url, "_blank", "noopener,noreferrer");
        }
      },
      [onClick, id, url, title, domain, sourceType, faviconUrl, citationNumbers, verificationStatus]
    );

    const platformName = useMemo(() => getPlatformName(url, domain), [url, domain]);
    const favicon = useMemo(() => getFaviconUrl(url, faviconUrl), [url, faviconUrl]);
    const detectedType = useMemo(() => sourceType || detectSourceType(url), [sourceType, url]);

    const renderVerificationBadge = () => {
      if (!showVerificationIndicator || !verificationStatus) return null;

      const statusConfig = {
        verified: { icon: "✓", className: "text-green-600 dark:text-green-500" },
        partial: { icon: "~", className: "text-amber-600 dark:text-amber-500" },
        pending: { icon: "…", className: "text-gray-400 dark:text-gray-500" },
        failed: { icon: "✗", className: "text-red-500 dark:text-red-400" },
        unknown: { icon: "?", className: "text-gray-400 dark:text-gray-500" },
      };

      const config = statusConfig[verificationStatus];
      return (
        <span className={classNames("text-sm ml-1", config.className)} aria-label={verificationStatus}>
          {config.icon}
        </span>
      );
    };

    return (
      <div
        ref={ref}
        data-source-id={id}
        data-source-type={detectedType}
        className={classNames(
          "flex items-start gap-3 p-3 cursor-pointer transition-colors",
          "hover:bg-gray-50 dark:hover:bg-gray-800/50",
          "border-b border-gray-100 dark:border-gray-800 last:border-b-0",
          className
        )}
        onClick={handleClick}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        }}
        aria-label={`${title} from ${platformName}`}
      >
        {/* Favicon */}
        <div className="flex-shrink-0 mt-0.5">
          {renderFavicon ? (
            renderFavicon({ id, url, title, domain, sourceType, faviconUrl, citationNumbers, verificationStatus })
          ) : (
            <img
              src={favicon}
              alt=""
              className="w-5 h-5 rounded"
              width={20}
              height={20}
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-1">
            <span className="text-gray-900 dark:text-gray-100 font-medium text-sm leading-tight line-clamp-2">
              {title}
            </span>
            {renderVerificationBadge()}
          </div>

          {/* Platform/Domain */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-gray-500 dark:text-gray-400 text-xs">
              {platformName}
            </span>
            {showCitationBadges && citationNumbers && citationNumbers.length > 0 && (
              <div className="flex items-center gap-1">
                {citationNumbers.slice(0, 3).map((num) => (
                  <span
                    key={num}
                    className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                  >
                    {num}
                  </span>
                ))}
                {citationNumbers.length > 3 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">+{citationNumbers.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Arrow indicator */}
        <div className="flex-shrink-0 text-gray-400 dark:text-gray-500 mt-1">
          <ChevronRightIcon />
        </div>
      </div>
    );
  }
);

SourcesListItem.displayName = "SourcesListItem";

// ============================================================================
// SourcesTrigger Component
// ============================================================================

/**
 * Compact trigger button that shows favicon previews and opens the sources list.
 * Matches the "Sources" button shown in the screenshots with stacked favicons.
 */
export const SourcesTrigger = forwardRef<HTMLButtonElement, SourcesTriggerProps>(
  ({ sources, maxIcons = 3, onClick, label = "Sources", className, isOpen }, ref) => {
    const displaySources = useMemo(() => sources.slice(0, maxIcons), [sources, maxIcons]);
    const hasMore = sources.length > maxIcons;

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={classNames(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm",
          "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
          "hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          className
        )}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <span className="font-medium">{label}</span>

        {/* Stacked favicons */}
        <div className="flex items-center -space-x-1">
          {displaySources.map((source, i) => (
            <img
              key={source.id}
              src={getFaviconUrl(source.url, source.faviconUrl)}
              alt=""
              className={classNames(
                "w-4 h-4 rounded-full ring-2 ring-gray-100 dark:ring-gray-800",
                i > 0 && "-ml-1"
              )}
              width={16}
              height={16}
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0";
              }}
            />
          ))}
          {hasMore && (
            <span className="w-4 h-4 rounded-full bg-gray-300 dark:bg-gray-600 ring-2 ring-gray-100 dark:ring-gray-800 flex items-center justify-center text-[9px] font-medium text-gray-600 dark:text-gray-300">
              +{sources.length - maxIcons}
            </span>
          )}
        </div>
      </button>
    );
  }
);

SourcesTrigger.displayName = "SourcesTrigger";

// ============================================================================
// SourcesListComponent
// ============================================================================

/**
 * SourcesListComponent
 *
 * Displays an aggregated list of sources at the end of AI-generated content,
 * following the Anthropic/Claude "Sources" panel pattern.
 *
 * Features:
 * - Multiple display variants: panel, drawer (mobile), modal, inline
 * - Favicon + title + domain display for each source
 * - Grouping by domain/platform
 * - Loading and empty states
 * - Keyboard navigation support
 * - Portal rendering for drawer/modal variants
 *
 * @example
 * ```tsx
 * <SourcesListComponent
 *   sources={[
 *     { id: "1", url: "https://twitch.tv/theo", title: "Theo - Twitch", domain: "twitch.tv" },
 *     { id: "2", url: "https://linkedin.com/in/...", title: "Theodore Nguyen", domain: "linkedin.com" },
 *   ]}
 *   variant="drawer"
 *   isOpen={isSourcesOpen}
 *   onOpenChange={setIsSourcesOpen}
 * />
 * ```
 */
export const SourcesListComponent = forwardRef<HTMLDivElement, SourcesListProps>(
  (
    {
      sources,
      variant = "drawer",
      isOpen = true,
      onOpenChange,
      header = {},
      isLoading = false,
      emptyMessage = "No sources available",
      maxHeight,
      className,
      listClassName,
      onSourceClick,
      showVerificationIndicators = false,
      showCitationBadges = false,
      groupByDomain = false,
      renderItem,
      renderEmpty,
      renderLoading,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    // Handle ESC key to close
    useEffect(() => {
      if (!isOpen || variant === "inline") return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onOpenChange?.(false);
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onOpenChange, variant]);

    // Portal mounting
    useEffect(() => {
      setMounted(true);
    }, []);

    // Group sources by domain if requested
    const groupedSources = useMemo(() => {
      if (!groupByDomain) return null;

      const groups: Record<string, SourcesListItemProps[]> = {};
      for (const source of sources) {
        const key = source.domain || extractDomain(source.url);
        if (!groups[key]) groups[key] = [];
        groups[key].push(source);
      }
      return groups;
    }, [sources, groupByDomain]);

    const handleClose = useCallback(() => {
      onOpenChange?.(false);
    }, [onOpenChange]);

    const handleBackdropClick = useCallback(
      (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      },
      [handleClose]
    );

    // Render header
    const renderHeader = () => {
      const { title = "Sources", showCloseButton = true, showCount = true, renderHeader: customRender } = header;

      if (customRender) {
        return customRender({ title, count: sources.length, onClose: handleClose });
      }

      return (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          {showCloseButton && variant !== "inline" && (
            <button
              type="button"
              onClick={handleClose}
              className="p-1 -ml-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              aria-label="Close sources"
            >
              <CloseIcon />
            </button>
          )}
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex-1 text-center">
            {title}
            {showCount && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                ({sources.length})
              </span>
            )}
          </h2>
          {/* Spacer for centering when close button is present */}
          {showCloseButton && variant !== "inline" && <div className="w-8" />}
        </div>
      );
    };

    // Render list content
    const renderListContent = () => {
      if (isLoading) {
        if (renderLoading) return renderLoading();
        return (
          <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
            <SpinnerIcon />
            <span className="ml-2 text-sm">Loading sources...</span>
          </div>
        );
      }

      if (sources.length === 0) {
        if (renderEmpty) return renderEmpty();
        return (
          <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400 text-sm">
            {emptyMessage}
          </div>
        );
      }

      if (groupByDomain && groupedSources) {
        return (
          <div className={listClassName}>
            {Object.entries(groupedSources).map(([domain, domainSources]) => (
              <div key={domain}>
                <div className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50">
                  {getPlatformName(domainSources[0].url, domain)}
                </div>
                {domainSources.map((source, index) =>
                  renderItem ? (
                    renderItem(source, index)
                  ) : (
                    <SourcesListItem
                      key={source.id}
                      {...source}
                      onClick={onSourceClick}
                      showVerificationIndicator={showVerificationIndicators}
                      showCitationBadges={showCitationBadges}
                    />
                  )
                )}
              </div>
            ))}
          </div>
        );
      }

      return (
        <div className={listClassName}>
          {sources.map((source, index) =>
            renderItem ? (
              renderItem(source, index)
            ) : (
              <SourcesListItem
                key={source.id}
                {...source}
                onClick={onSourceClick}
                showVerificationIndicator={showVerificationIndicators}
                showCitationBadges={showCitationBadges}
              />
            )
          )}
        </div>
      );
    };

    // Calculate max height style
    const maxHeightStyle = maxHeight
      ? { maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight }
      : undefined;

    // Variant-specific rendering
    if (variant === "inline") {
      if (!isOpen) return null;
      return (
        <div
          ref={ref}
          className={classNames(
            "bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700",
            className
          )}
          style={maxHeightStyle}
        >
          {renderHeader()}
          <div className="overflow-y-auto" style={maxHeightStyle}>
            {renderListContent()}
          </div>
        </div>
      );
    }

    if (variant === "panel") {
      if (!isOpen) return null;
      return (
        <div
          ref={ref}
          className={classNames(
            "bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg",
            className
          )}
        >
          {renderHeader()}
          <div className="overflow-y-auto" style={maxHeightStyle || { maxHeight: "400px" }}>
            {renderListContent()}
          </div>
        </div>
      );
    }

    // Modal and drawer variants use portals
    if (!mounted || !isOpen) return null;

    const portalContent = (
      <div
        ref={ref}
        className={classNames(
          "fixed inset-0 z-50",
          variant === "modal" && "flex items-center justify-center"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sources-title"
      >
        {/* Backdrop */}
        <div
          className={classNames(
            "absolute inset-0 bg-black/40 dark:bg-black/60 transition-opacity",
            isOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={handleBackdropClick}
          aria-hidden="true"
        />

        {/* Content */}
        {variant === "drawer" ? (
          <div
            ref={containerRef}
            className={classNames(
              "absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl",
              "transform transition-transform duration-300 ease-out",
              isOpen ? "translate-y-0" : "translate-y-full",
              "max-h-[80vh] flex flex-col",
              className
            )}
          >
            {/* Drawer handle */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>
            {renderHeader()}
            <div className="overflow-y-auto flex-1">
              {renderListContent()}
            </div>
          </div>
        ) : (
          <div
            ref={containerRef}
            className={classNames(
              "relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl",
              "transform transition-all duration-200",
              isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95",
              "w-full max-w-md max-h-[80vh] flex flex-col mx-4",
              className
            )}
          >
            {renderHeader()}
            <div className="overflow-y-auto flex-1">
              {renderListContent()}
            </div>
          </div>
        )}
      </div>
    );

    return createPortal(portalContent, document.body);
  }
);

SourcesListComponent.displayName = "SourcesListComponent";

// ============================================================================
// Memoized Exports
// ============================================================================

export const MemoizedSourcesListItem = memo(SourcesListItem);
export const MemoizedSourcesTrigger = memo(SourcesTrigger);
export const MemoizedSourcesListComponent = memo(SourcesListComponent);

// ============================================================================
// Utility Exports
// ============================================================================

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
  }>
): SourcesListItemProps[] {
  const sourceMap = new Map<string, SourcesListItemProps>();

  for (const citation of citations) {
    if (!citation.url) continue;

    const domain = citation.domain || extractDomain(citation.url);
    const key = citation.url;

    if (sourceMap.has(key)) {
      // Aggregate citation numbers
      const existing = sourceMap.get(key)!;
      if (citation.citationNumber && !existing.citationNumbers?.includes(citation.citationNumber)) {
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
    setSources((prev) => {
      const exists = prev.some((s) => s.url === source.url);
      if (exists) return prev;
      return [...prev, source];
    });
  }, []);

  const removeSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
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
    toggle: () => setIsOpen((prev) => !prev),
  };
}
