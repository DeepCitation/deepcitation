import type React from "react";
import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getPortalContainer } from "./constants.js";
import { detectSourceType, getFaviconUrl, getPlatformName } from "./SourcesListComponent.utils.js";
import { formatTtc } from "./timingUtils.js";
import type { SourcesListItemProps, SourcesListProps, SourcesTriggerProps } from "./types.js";
import { extractDomain, safeWindowOpen } from "./urlUtils.js";
import { classNames } from "./utils.js";

/** Inline style for TtC display on source items — muted, tabular-nums */
const TTC_TEXT_STYLE_ITEM: React.CSSProperties = {
  fontSize: "10px",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.02em",
};

/**
 * Module-level handlers for hiding broken favicon images.
 * Performance fix: avoids creating new function references on every render.
 */
const handleFaviconError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.display = "none";
};

const handleFaviconErrorOpacity = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.opacity = "0";
};

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
  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// ============================================================================
// VerificationBadge Component (extracted from inline renderVerificationBadge)
// ============================================================================

const VERIFICATION_STATUS_CONFIG = {
  verified: { icon: "✓", className: "text-green-600 dark:text-green-500" },
  partial: { icon: "~", className: "text-amber-500 dark:text-amber-400" },
  pending: { icon: "…", className: "text-gray-400 dark:text-gray-500" },
  failed: { icon: "✗", className: "text-red-500 dark:text-red-400" },
  unknown: { icon: "?", className: "text-gray-400 dark:text-gray-500" },
} as const;

type VerificationStatusType = keyof typeof VERIFICATION_STATUS_CONFIG;

const VerificationBadge = ({
  showVerificationIndicator,
  verificationStatus,
}: {
  showVerificationIndicator: boolean;
  verificationStatus?: VerificationStatusType;
}) => {
  if (!showVerificationIndicator || !verificationStatus) return null;
  const config = VERIFICATION_STATUS_CONFIG[verificationStatus];
  return (
    <span className={classNames("text-sm ml-1", config.className)} aria-label={verificationStatus}>
      {config.icon}
    </span>
  );
};

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
      ttcMs,
    },
    ref,
  ) => {
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (onClick) {
          onClick(
            {
              id,
              url,
              title,
              domain,
              sourceType,
              faviconUrl,
              citationNumbers,
              verificationStatus,
            },
            e,
          );
        } else {
          // Default: open URL in new tab (protocol-validated)
          safeWindowOpen(url);
        }
      },
      [onClick, id, url, title, domain, sourceType, faviconUrl, citationNumbers, verificationStatus],
    );

    const platformName = useMemo(() => getPlatformName(url, domain), [url, domain]);
    const favicon = useMemo(() => getFaviconUrl(url, faviconUrl), [url, faviconUrl]);
    const detectedType = useMemo(() => sourceType || detectSourceType(url), [sourceType, url]);

    return (
      <div
        ref={ref}
        data-source-id={id}
        data-source-type={detectedType}
        className={classNames(
          "flex items-start gap-3 p-3 cursor-pointer transition-colors",
          "hover:bg-gray-50 dark:hover:bg-gray-800/50",
          "border-b border-gray-100 dark:border-gray-800 last:border-b-0",
          className,
        )}
        onClick={handleClick}
        role="link"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            // Safe cast: handleClick expects MouseEvent but only uses common Event properties.
            // Both KeyboardEvent and MouseEvent share preventDefault/stopPropagation.
            // No mouse-specific properties (clientX/clientY) are accessed.
            handleClick(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        }}
        aria-label={`${title} from ${platformName}`}
      >
        {/* Favicon */}
        <div className="shrink-0 mt-0.5">
          {renderFavicon ? (
            renderFavicon({
              id,
              url,
              title,
              domain,
              sourceType,
              faviconUrl,
              citationNumbers,
              verificationStatus,
            })
          ) : (
            <img
              src={favicon}
              alt=""
              className="w-5 h-5 rounded"
              width={20}
              height={20}
              loading="lazy"
              // Performance fix: use module-level handler to avoid re-render overhead
              onError={handleFaviconError}
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
            <VerificationBadge
              showVerificationIndicator={showVerificationIndicator}
              verificationStatus={verificationStatus}
            />
          </div>

          {/* Platform/Domain */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-gray-500 dark:text-gray-400 text-xs">{platformName}</span>
            {showCitationBadges && citationNumbers && citationNumbers.length > 0 && (
              <div className="flex items-center gap-1">
                {citationNumbers.slice(0, 3).map(num => (
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

        {/* TtC indicator */}
        {ttcMs != null && (
          <span className="shrink-0 text-gray-400 dark:text-gray-500 mt-1" style={TTC_TEXT_STYLE_ITEM}>
            {formatTtc(ttcMs)}
          </span>
        )}

        {/* Arrow indicator */}
        <div className="shrink-0 text-gray-400 dark:text-gray-500 mt-1">
          <ChevronRightIcon />
        </div>
      </div>
    );
  },
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
          className,
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
              className={classNames("w-4 h-4 rounded-full ring-2 ring-gray-100 dark:ring-gray-800", i > 0 && "-ml-1")}
              width={16}
              height={16}
              loading="lazy"
              // Performance fix: use module-level handler to avoid re-render overhead
              onError={handleFaviconErrorOpacity}
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
  },
);

SourcesTrigger.displayName = "SourcesTrigger";

// ============================================================================
// SourcesListHeader Component (extracted from inline renderHeader)
// ============================================================================

interface SourcesListHeaderProps {
  header: SourcesListProps["header"];
  sources: SourcesListItemProps[];
  variant: string;
  handleClose: () => void;
  timingMetrics?: import("../types/timing.js").TimingMetrics | null;
}

const SourcesListHeader = ({ header: headerConfig = {}, sources, variant, handleClose, timingMetrics }: SourcesListHeaderProps) => {
  const { title = "Sources", showCloseButton = true, showCount = true, renderHeader: customRender } = headerConfig;

  if (customRender) {
    return customRender({
      title,
      count: sources.length,
      onClose: handleClose,
    });
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
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">({sources.length})</span>
        )}
      </h2>
      {/* Aggregate TtC or spacer for centering */}
      {timingMetrics && timingMetrics.resolvedCount > 0 ? (
        <span className="text-gray-400 dark:text-gray-500 shrink-0" style={TTC_TEXT_STYLE_ITEM}>
          avg rev {formatTtc(timingMetrics.avgTtcMs)}
        </span>
      ) : (
        showCloseButton && variant !== "inline" && <div className="w-8" />
      )}
    </div>
  );
};

// ============================================================================
// SourcesListContentArea Component (extracted from inline renderListContent)
// ============================================================================

interface SourcesListContentAreaProps {
  isLoading: boolean;
  sources: SourcesListItemProps[];
  emptyMessage: string;
  groupByDomain: boolean;
  groupedSources: Record<string, SourcesListItemProps[]> | null;
  listClassName?: string;
  onSourceClick?: SourcesListItemProps["onClick"];
  showVerificationIndicators: boolean;
  showCitationBadges: boolean;
  renderItem?: (source: SourcesListItemProps, index: number) => React.ReactNode;
  renderEmpty?: () => React.ReactNode;
  renderLoading?: () => React.ReactNode;
}

const SourcesListContentArea = ({
  isLoading,
  sources,
  emptyMessage,
  groupByDomain,
  groupedSources,
  listClassName,
  onSourceClick,
  showVerificationIndicators,
  showCitationBadges,
  renderItem,
  renderEmpty,
  renderLoading,
}: SourcesListContentAreaProps) => {
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
              ),
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
        ),
      )}
    </div>
  );
};

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
      timingMetrics,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    // Lazy-init: true on client (portals available), false during SSR — avoids a
    // useEffect + setState flash that would render null then immediately re-render.
    const [mounted] = useState(() => typeof document !== "undefined");

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
      [handleClose],
    );

    const headerElement = (
      <SourcesListHeader header={header} sources={sources} variant={variant} handleClose={handleClose} timingMetrics={timingMetrics} />
    );

    // Render list content
    const listContentElement = (
      <SourcesListContentArea
        isLoading={isLoading}
        sources={sources}
        emptyMessage={emptyMessage}
        groupByDomain={groupByDomain}
        groupedSources={groupedSources}
        listClassName={listClassName}
        onSourceClick={onSourceClick}
        showVerificationIndicators={showVerificationIndicators}
        showCitationBadges={showCitationBadges}
        renderItem={renderItem}
        renderEmpty={renderEmpty}
        renderLoading={renderLoading}
      />
    );

    // Calculate max height style
    const maxHeightStyle = maxHeight
      ? {
          maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
        }
      : undefined;

    // Variant-specific rendering
    if (variant === "inline") {
      if (!isOpen) return null;
      return (
        <div
          ref={ref}
          className={classNames(
            "bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700",
            className,
          )}
          style={maxHeightStyle}
        >
          {headerElement}
          <div className="overflow-y-auto" style={maxHeightStyle}>
            {listContentElement}
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
            className,
          )}
        >
          {headerElement}
          <div className="overflow-y-auto" style={maxHeightStyle || { maxHeight: "400px" }}>
            {listContentElement}
          </div>
        </div>
      );
    }

    // Modal and drawer variants use portals
    if (!mounted || !isOpen) return null;

    const portalContent = (
      <div
        ref={ref}
        className={classNames("fixed inset-0 z-50", variant === "modal" && "flex items-center justify-center")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sources-title"
      >
        {/* Backdrop */}
        <div
          className={classNames(
            "absolute inset-0 bg-black/40 dark:bg-black/60 transition-opacity",
            isOpen ? "opacity-100" : "opacity-0",
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
              className,
            )}
          >
            {/* Drawer handle */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>
            {headerElement}
            <div className="overflow-y-auto flex-1">{listContentElement}</div>
          </div>
        ) : (
          <div
            ref={containerRef}
            className={classNames(
              "relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl",
              "transform transition-all duration-200",
              isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95",
              "w-full max-w-md max-h-[80vh] flex flex-col mx-4",
              className,
            )}
          >
            {headerElement}
            <div className="overflow-y-auto flex-1">{listContentElement}</div>
          </div>
        )}
      </div>
    );

    // SSR-safe: skip portal if document.body unavailable
    const portalContainer = getPortalContainer();
    if (!portalContainer) return null;
    return createPortal(portalContent, portalContainer);
  },
);

SourcesListComponent.displayName = "SourcesListComponent";

// ============================================================================
// Memoized Exports
// ============================================================================

export const MemoizedSourcesListItem = memo(SourcesListItem);
export const MemoizedSourcesTrigger = memo(SourcesTrigger);
export const MemoizedSourcesListComponent = memo(SourcesListComponent);
