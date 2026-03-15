import type React from "react";
import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getPortalContainer, TTC_TEXT_STYLE } from "./constants.js";
import { useTranslation } from "./i18n.js";
import { handleImageError, handleImageErrorOpacity } from "./imageUtils.js";
import { detectSourceType, getFaviconUrl, getPlatformName } from "./SourcesListComponent.utils.js";
import { formatTtc } from "./timingUtils.js";
import type { SourcesListItemProps, SourcesListProps, SourcesTriggerProps } from "./types.js";
import { extractDomain, safeWindowOpen } from "./urlUtils.js";
import { classNames } from "./utils.js";

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
  pending: { icon: "…", className: "text-dc-pending" },
  failed: { icon: "✗", className: "text-red-500 dark:text-red-400" },
  unknown: { icon: "?", className: "text-dc-subtle-foreground" },
} as const;

type VerificationStatusType = keyof typeof VERIFICATION_STATUS_CONFIG;
const VERIFICATION_STATUS_LABEL_KEY: Record<
  VerificationStatusType,
  "sourcesList.verified" | "sourcesList.partial" | "sourcesList.pending" | "sourcesList.failed" | "sourcesList.unknown"
> = {
  verified: "sourcesList.verified",
  partial: "sourcesList.partial",
  pending: "sourcesList.pending",
  failed: "sourcesList.failed",
  unknown: "sourcesList.unknown",
};

const VerificationBadge = ({
  showVerificationIndicator,
  verificationStatus,
}: {
  showVerificationIndicator: boolean;
  verificationStatus?: VerificationStatusType;
}) => {
  const t = useTranslation();
  if (!showVerificationIndicator || !verificationStatus) return null;
  const config = VERIFICATION_STATUS_CONFIG[verificationStatus];
  return (
    <span
      className={classNames("text-sm ml-1", config.className)}
      aria-label={t(VERIFICATION_STATUS_LABEL_KEY[verificationStatus])}
    >
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
    const t = useTranslation();
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
          "hover:bg-dc-muted/60",
          "border-b border-dc-border last:border-b-0",
          className,
        )}
        onClick={handleClick}
        role="link"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            // Trigger a real click event so handleClick receives a proper MouseEvent —
            // avoids an unsafe KeyboardEvent→MouseEvent cast.
            e.currentTarget.click();
          }
        }}
        aria-label={t("aria.sourceFromPlatform", { title, platformName })}
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
              onError={handleImageError}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-1">
            <span className="text-dc-foreground font-medium text-sm leading-tight line-clamp-2">{title}</span>
            <VerificationBadge
              showVerificationIndicator={showVerificationIndicator}
              verificationStatus={verificationStatus}
            />
          </div>

          {/* Platform/Domain */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-dc-subtle-foreground text-xs">{platformName}</span>
            {showCitationBadges && citationNumbers && citationNumbers.length > 0 && (
              <div className="flex items-center gap-1">
                {citationNumbers.slice(0, 3).map(num => (
                  <span
                    key={num}
                    className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-medium bg-slate-200 dark:bg-slate-700 text-dc-muted-foreground rounded"
                  >
                    {num}
                  </span>
                ))}
                {citationNumbers.length > 3 && (
                  <span className="text-xs text-dc-pending">+{citationNumbers.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* TtC indicator */}
        {ttcMs != null && (
          <span className="shrink-0 text-dc-pending mt-1" style={TTC_TEXT_STYLE}>
            {formatTtc(ttcMs)}
          </span>
        )}

        {/* Arrow indicator */}
        <div className="shrink-0 text-dc-pending mt-1">
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
  ({ sources, maxIcons = 3, onClick, label, className, isOpen }, ref) => {
    const t = useTranslation();
    const displaySources = useMemo(() => sources.slice(0, maxIcons), [sources, maxIcons]);
    const hasMore = sources.length > maxIcons;
    const resolvedLabel = label ?? t("drawer.sources");

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={classNames(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm",
          "bg-dc-muted text-dc-foreground",
          "hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-dc-ring/40",
          className,
        )}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <span className="font-medium">{resolvedLabel}</span>

        {/* Stacked favicons */}
        <div className="flex items-center -space-x-1">
          {displaySources.map((source, i) => (
            <img
              key={source.id}
              src={getFaviconUrl(source.url, source.faviconUrl)}
              alt=""
              className={classNames("w-4 h-4 rounded-full ring-2 ring-dc-background", i > 0 && "-ml-1")}
              width={16}
              height={16}
              loading="lazy"
              // Performance fix: use module-level handler to avoid re-render overhead
              onError={handleImageErrorOpacity}
            />
          ))}
          {hasMore && (
            <span className="w-4 h-4 rounded-full bg-dc-border ring-2 ring-dc-background flex items-center justify-center text-[9px] font-medium text-dc-muted-foreground">
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

/** Stable empty header config — avoids creating a new object reference on every render. */
const EMPTY_HEADER_CONFIG: NonNullable<SourcesListProps["header"]> = {};

interface SourcesListHeaderProps {
  header: SourcesListProps["header"];
  sources: SourcesListItemProps[];
  variant: string;
  handleClose: () => void;
  timingMetrics?: import("../types/timing.js").TimingMetrics | null;
}

const SourcesListHeader = ({
  header: headerConfig = EMPTY_HEADER_CONFIG,
  sources,
  variant,
  handleClose,
  timingMetrics,
}: SourcesListHeaderProps) => {
  const t = useTranslation();
  const { title, showCloseButton = true, showCount = true, renderHeader: customRender } = headerConfig;
  const resolvedTitle = title ?? t("drawer.sources");

  if (customRender) {
    return customRender({
      title: resolvedTitle,
      count: sources.length,
      onClose: handleClose,
    });
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-dc-border">
      {showCloseButton && variant !== "inline" && (
        <button
          type="button"
          onClick={handleClose}
          className="p-1 -ml-1 text-dc-subtle-foreground hover:text-dc-foreground transition-colors"
          aria-label={t("action.closeSources")}
        >
          <CloseIcon />
        </button>
      )}
      <h2 className="text-base font-semibold text-dc-foreground flex-1 text-center">
        {resolvedTitle}
        {showCount && <span className="ml-2 text-sm font-normal text-dc-subtle-foreground">({sources.length})</span>}
      </h2>
      {/* Aggregate TtC or spacer for centering */}
      {timingMetrics && timingMetrics.resolvedCount > 0 ? (
        <span className="text-dc-pending shrink-0" style={TTC_TEXT_STYLE}>
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
  const t = useTranslation();
  if (isLoading) {
    if (renderLoading) return renderLoading();
    return (
      <div className="flex items-center justify-center py-8 text-dc-subtle-foreground">
        <SpinnerIcon />
        <span className="ml-2 text-sm">{t("sources.loading")}</span>
      </div>
    );
  }

  if (sources.length === 0) {
    if (renderEmpty) return renderEmpty();
    return (
      <div className="flex items-center justify-center py-8 text-dc-subtle-foreground text-sm">{emptyMessage}</div>
    );
  }

  if (groupByDomain && groupedSources) {
    return (
      <div className={listClassName}>
        {Object.entries(groupedSources).map(([domain, domainSources]) => (
          <div key={domain}>
            <div className="px-4 py-2 text-xs font-medium text-dc-subtle-foreground uppercase tracking-wider bg-dc-muted">
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
      emptyMessage,
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
    const t = useTranslation();
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
    const resolvedEmptyMessage = emptyMessage ?? t("sources.empty");

    const headerElement = (
      <SourcesListHeader
        header={header}
        sources={sources}
        variant={variant}
        handleClose={handleClose}
        timingMetrics={timingMetrics}
      />
    );

    // Render list content
    const listContentElement = (
      <SourcesListContentArea
        isLoading={isLoading}
        sources={sources}
        emptyMessage={resolvedEmptyMessage}
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
          className={classNames("bg-dc-background rounded-lg border border-dc-border", className)}
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
          className={classNames("bg-dc-background rounded-lg border border-dc-border shadow-lg", className)}
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
            "absolute inset-0 bg-black/40 dark:bg-black/60 transition-opacity duration-180",
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
              "absolute bottom-0 left-0 right-0 bg-dc-background rounded-t-2xl shadow-2xl",
              "transform transition-transform duration-180 ease-[cubic-bezier(0.2,0,0,1)]",
              isOpen ? "translate-y-0" : "translate-y-full",
              "max-h-[80vh] flex flex-col",
              className,
            )}
          >
            {/* Drawer handle */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-dc-border rounded-full" />
            </div>
            {headerElement}
            <div className="overflow-y-auto flex-1">{listContentElement}</div>
          </div>
        ) : (
          <div
            ref={containerRef}
            className={classNames(
              "relative bg-dc-background rounded-xl shadow-2xl",
              "transform transition-all ease-[cubic-bezier(0.2,0,0,1)]",
              "opacity-100 scale-100 duration-180",
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
