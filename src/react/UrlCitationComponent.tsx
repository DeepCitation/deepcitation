import type React from "react";
import { forwardRef, memo, useCallback, useMemo } from "react";
import type { Citation } from "../types/citation.js";
import { getCitationKey } from "../utils/citationKey.js";
import { extractDomain } from "../utils/urlSafety.js";
import {
  DOT_COLORS,
  DOT_INDICATOR_FIXED_SIZE_STYLE,
  MISS_WAVY_UNDERLINE_STYLE,
  VERIFIED_COLOR_STYLE,
} from "./constants.js";
import { useIsTouchDevice } from "./hooks/useIsTouchDevice.js";
import type { MessageKey } from "./i18n.js";
import { type TranslateFunction, useTranslation } from "./i18n.js";
import { CheckIcon, ExternalLinkIcon, LockIcon, XCircleIcon } from "./icons.js";
import { handleImageError } from "./imageUtils.js";
import type { IndicatorVariant, UrlCitationProps, UrlFetchStatus } from "./types.js";
import { isBlockedStatus, isErrorStatus } from "./urlStatus.js";
import { getUrlPath, safeWindowOpen, truncateString } from "./urlUtils.js";
import { cn, generateCitationInstanceId } from "./utils.js";

function getUrlStatusLabel(fetchStatus: UrlFetchStatus, t: TranslateFunction): string {
  const KEY_MAP: Record<UrlFetchStatus, MessageKey> = {
    verified: "urlStatus.verified",
    partial: "urlStatus.partial",
    pending: "urlStatus.pending",
    accessible: "urlStatus.accessible",
    redirected: "urlStatus.redirected",
    redirected_valid: "urlStatus.redirectedValid",
    blocked_antibot: "urlStatus.blockedAntibot",
    blocked_login: "urlStatus.blockedLogin",
    blocked_paywall: "urlStatus.blockedPaywall",
    blocked_geo: "urlStatus.blockedGeo",
    blocked_rate_limit: "urlStatus.blockedRateLimit",
    error_timeout: "urlStatus.errorTimeout",
    error_not_found: "urlStatus.errorNotFound",
    error_server: "urlStatus.errorServer",
    error_network: "urlStatus.errorNetwork",
    unknown: "urlStatus.unknown",
  };
  return t(KEY_MAP[fetchStatus]);
}

/**
 * Pulsing dot indicator for pending state.
 * Uses DOT_COLORS.gray for consistency across components (gray for pending state).
 */
const PendingDot = () => (
  <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", DOT_COLORS.gray)} aria-hidden="true" />
);

/**
 * Verified checkmark indicator.
 * Color tracks --dc-verified so it stays in sync with the status dot and quote border.
 */
const VerifiedCheck = () => (
  <span aria-hidden="true" style={VERIFIED_COLOR_STYLE}>
    <CheckIcon className="w-full h-full" />
  </span>
);

/**
 * Status icon wrapper for consistent sizing and alignment.
 * Includes role="img" for accessibility of icon-based indicators.
 */
const StatusIconWrapper = ({
  children,
  className,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) => (
  <span
    className={cn("w-3 h-3 flex-shrink-0 flex items-center justify-center", className)}
    role="img"
    aria-label={ariaLabel}
  >
    {children}
  </span>
);

/**
 * Default favicon component.
 */
const DefaultFavicon = ({ url, faviconUrl, isBroken }: { url: string; faviconUrl?: string; isBroken?: boolean }) => {
  const domain = extractDomain(url);
  const src = faviconUrl || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`;

  if (isBroken) {
    return (
      <span className="w-3.5 h-3.5 flex items-center justify-center text-xs text-dc-subtle-foreground shrink-0">
        🌐
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="w-3.5 h-3.5 rounded-sm shrink-0"
      width={14}
      height={14}
      loading="lazy"
      // Performance fix: use module-level handler to avoid re-render overhead
      onError={handleImageError}
    />
  );
};

interface ExternalLinkButtonProps {
  show: boolean;
  alwaysVisible: boolean;
  handleExternalLinkClick: (e: React.MouseEvent) => void;
  ariaLabel: string;
  title: string;
}

/**
 * External link icon that appears on hover (desktop) or always (touch devices).
 * Uses CSS `group-hover:` / `group-focus-within:` instead of React state so it
 * works regardless of whether JS event handlers are attached (e.g. preventTooltips).
 */
const ExternalLinkButton = ({
  show,
  alwaysVisible,
  handleExternalLinkClick,
  ariaLabel,
  title,
}: ExternalLinkButtonProps) => {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={handleExternalLinkClick}
      className={cn(
        "relative inline-flex items-center justify-center w-6 h-6 -ml-0.5 transition-all",
        "text-dc-subtle-foreground group-hover:text-dc-primary",
        !alwaysVisible && "opacity-30 group-hover:opacity-100 group-focus-within:opacity-100",
      )}
      aria-label={ariaLabel}
      title={title}
    >
      <ExternalLinkIcon className="w-3.5 h-3.5" />
    </button>
  );
};

interface UrlStatusIndicatorProps {
  indicatorVariant: IndicatorVariant;
  isVerified: boolean;
  isPartial: boolean;
  isBlocked: boolean;
  isError: boolean;
  isPending: boolean;
  fetchStatus: UrlFetchStatus;
  errorMessage?: string;
  statusLabel: string;
  t: TranslateFunction;
  renderBlockedIndicator?: (status: UrlFetchStatus, errorMessage?: string) => React.ReactNode;
}

const UrlStatusIndicator = ({
  indicatorVariant,
  isVerified,
  isPartial,
  isBlocked,
  isError,
  isPending,
  fetchStatus,
  errorMessage,
  statusLabel,
  t,
  renderBlockedIndicator,
}: UrlStatusIndicatorProps) => {
  // "none" means no status indicator at all
  if (indicatorVariant === "none") return null;

  // Dot variant: simple colored dots for all statuses
  if (indicatorVariant === "dot") {
    if (isVerified) {
      return (
        <StatusIconWrapper ariaLabel={t("indicator.verified")}>
          <span
            className={cn("rounded-full", DOT_COLORS.green)}
            style={DOT_INDICATOR_FIXED_SIZE_STYLE}
            aria-hidden="true"
          />
        </StatusIconWrapper>
      );
    }
    if (isPartial) {
      return (
        <StatusIconWrapper ariaLabel={t("indicator.partial")}>
          <span
            className={cn("rounded-full", DOT_COLORS.amber)}
            style={DOT_INDICATOR_FIXED_SIZE_STYLE}
            aria-hidden="true"
          />
        </StatusIconWrapper>
      );
    }
    if (isBlocked) {
      if (renderBlockedIndicator) return <>{renderBlockedIndicator(fetchStatus, errorMessage)}</>;
      return (
        <StatusIconWrapper ariaLabel={statusLabel}>
          <span
            className={cn("rounded-full", DOT_COLORS.amber)}
            style={DOT_INDICATOR_FIXED_SIZE_STYLE}
            aria-hidden="true"
          />
        </StatusIconWrapper>
      );
    }
    if (isError) {
      if (renderBlockedIndicator) return <>{renderBlockedIndicator(fetchStatus, errorMessage)}</>;
      return (
        <StatusIconWrapper ariaLabel={statusLabel}>
          <span
            className={cn("rounded-full", DOT_COLORS.red)}
            style={DOT_INDICATOR_FIXED_SIZE_STYLE}
            aria-hidden="true"
          />
        </StatusIconWrapper>
      );
    }
    if (isPending) {
      return (
        <StatusIconWrapper ariaLabel={t("indicator.verifying")}>
          <PendingDot />
        </StatusIconWrapper>
      );
    }
    return null;
  }

  // Default: icon variant
  // Verified: Green checkmark
  if (isVerified) {
    return (
      <StatusIconWrapper ariaLabel={t("indicator.verified")}>
        <VerifiedCheck />
      </StatusIconWrapper>
    );
  }

  // Partial: Amber check
  if (isPartial) {
    return (
      <StatusIconWrapper className="text-dc-partial" ariaLabel={t("indicator.partial")}>
        <CheckIcon className="w-full h-full" />
      </StatusIconWrapper>
    );
  }

  // Blocked: Lock icon
  if (isBlocked) {
    if (renderBlockedIndicator) return <>{renderBlockedIndicator(fetchStatus, errorMessage)}</>;
    return (
      <StatusIconWrapper className="text-dc-partial" ariaLabel={statusLabel}>
        <LockIcon className="w-full h-full" />
      </StatusIconWrapper>
    );
  }

  // Error: X in circle icon (centered, not subscript)
  if (isError) {
    if (renderBlockedIndicator) return <>{renderBlockedIndicator(fetchStatus, errorMessage)}</>;
    return (
      <StatusIconWrapper className="text-dc-destructive" ariaLabel={statusLabel}>
        <XCircleIcon className="w-full h-full" />
      </StatusIconWrapper>
    );
  }

  // Pending: Pulsing dot
  if (isPending) {
    return (
      <StatusIconWrapper ariaLabel={t("indicator.verifying")}>
        <PendingDot />
      </StatusIconWrapper>
    );
  }

  return null;
};

/**
 * URL Citation Component
 *
 * Displays a URL citation with compact domain display,
 * verification status, and blocked/error indicators.
 *
 * @example
 * ```tsx
 * <UrlCitationComponent
 *   urlMeta={{
 *     url: "https://example.com/article",
 *     fetchStatus: "verified",
 *   }}
 * />
 * // Renders: [example.com ✓]
 *
 * <UrlCitationComponent
 *   urlMeta={{
 *     url: "https://protected-site.com/page",
 *     fetchStatus: "blocked_login",
 *   }}
 * />
 * // Renders: [protected-site.com 🔒]
 * ```
 */
export const UrlCitationComponent = forwardRef<HTMLSpanElement, UrlCitationProps>(
  (
    {
      urlMeta,
      citation: providedCitation,
      children,
      className,
      variant = "badge", // Default to badge for URLs
      showFullUrlOnHover = true,
      showFavicon = true,
      showTitle = false,
      maxDisplayLength = 30,
      renderBlockedIndicator,
      onUrlClick,
      eventHandlers,
      preventTooltips = false,
      showStatusIndicator = true,
      indicatorVariant = "icon",
      showExternalLinkOnHover = true, // Show external link icon on hover by default
    },
    ref,
  ) => {
    const isTouchDevice = useIsTouchDevice();
    const t = useTranslation();
    const { url, domain: providedDomain, title, fetchStatus, faviconUrl, errorMessage } = urlMeta;

    // Derive citation from URL meta if not provided
    const citation: Citation = useMemo(
      () =>
        providedCitation || {
          type: "url",
          url,
          fullPhrase: title || url,
        },
      [providedCitation, url, title],
    );

    const citationKey = useMemo(() => getCitationKey(citation), [citation]);
    const citationInstanceId = useMemo(() => generateCitationInstanceId(citationKey), [citationKey]);

    // Compute display text
    const domain = useMemo(() => providedDomain || extractDomain(url), [providedDomain, url]);
    const path = useMemo(() => getUrlPath(url), [url]);

    const displayText = useMemo(() => {
      if (showTitle && title) {
        return truncateString(title, maxDisplayLength);
      }
      // Show domain + truncated path
      const pathPart = path ? truncateString(path, maxDisplayLength - domain.length - 1) : "";
      return pathPart ? `${domain}${pathPart}` : domain;
    }, [showTitle, title, domain, path, maxDisplayLength]);

    const isBlocked = isBlockedStatus(fetchStatus);
    const isError = isErrorStatus(fetchStatus);
    const isVerified = fetchStatus === "verified";
    const isPartial = fetchStatus === "partial";
    const isPending = fetchStatus === "pending";
    const isBroken = isError;
    const statusLabel = useMemo(() => getUrlStatusLabel(fetchStatus, t), [fetchStatus, t]);

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (onUrlClick) {
          onUrlClick(url, e);
        } else {
          // Always open the URL when clicking on the component
          // The external link icon is just a visual hint, not a separate action
          safeWindowOpen(url);
        }
        // Always call the event handler so parent can handle (e.g., show popover)
        eventHandlers?.onClick?.(citation, citationKey, e);
      },
      [onUrlClick, url, eventHandlers, citation, citationKey],
    );

    // Handler specifically for the external link icon
    const handleExternalLinkClick = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        safeWindowOpen(url);
      },
      [url],
    );

    const handleMouseEnter = useCallback(() => {
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    const handleMouseLeave = useCallback(() => {
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    // Keyboard handler for accessibility (WCAG 2.1.1 Keyboard)
    // Since we use role="button", we need to handle Enter and Space keys
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          if (onUrlClick) {
            onUrlClick(url, e);
          } else {
            // Always open the URL when activating via keyboard
            safeWindowOpen(url);
          }
          eventHandlers?.onClick?.(citation, citationKey, e);
        }
      },
      [onUrlClick, url, eventHandlers, citation, citationKey],
    );

    const externalLinkButtonElement = (
      <ExternalLinkButton
        show={showExternalLinkOnHover}
        alwaysVisible={isTouchDevice}
        handleExternalLinkClick={handleExternalLinkClick}
        ariaLabel={t("action.openInNewTab")}
        title={t("action.openInNewTab")}
      />
    );

    const statusIndicatorElement = (
      <UrlStatusIndicator
        indicatorVariant={indicatorVariant}
        isVerified={isVerified}
        isPartial={isPartial}
        isBlocked={isBlocked}
        isError={isError}
        isPending={isPending}
        fetchStatus={fetchStatus}
        errorMessage={errorMessage}
        statusLabel={statusLabel}
        t={t}
        renderBlockedIndicator={renderBlockedIndicator}
      />
    );

    // Badge variant (default) - matches the HTML design
    // Changed from <a> to <span> to prevent default link behavior
    // Click always opens URL in new tab
    if (variant === "badge") {
      return (
        <>
          {children}
          <span
            ref={ref}
            data-citation-id={citationKey}
            data-citation-instance={citationInstanceId}
            data-url={url}
            data-fetch-status={fetchStatus}
            data-variant="badge"
            className={cn(
              // Base styles matching the HTML design
              "group inline-flex items-center gap-2 px-2 py-1",
              "bg-dc-background",
              "border border-dc-border",
              "rounded-md",
              "text-dc-foreground",
              "no-underline cursor-pointer",
              "transition-all duration-120 ease-[cubic-bezier(0.2,0,0,1)]",
              "hover:border-dc-border",
              "hover:bg-dc-muted",
              // Broken state: muted styling
              isBroken && "opacity-60",
              className,
            )}
            title={showFullUrlOnHover ? errorMessage || url : undefined}
            onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
            onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={t("aria.linkToDomainStatus", { domain: displayText || domain, status: statusLabel })}
          >
            {showFavicon && <DefaultFavicon url={url} faviconUrl={faviconUrl} isBroken={isBroken} />}
            <span
              className={cn(
                "font-mono text-[11px] font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px]",
                "text-dc-foreground",
              )}
              style={isBroken ? MISS_WAVY_UNDERLINE_STYLE : undefined}
            >
              {displayText}
            </span>
            {showStatusIndicator && statusIndicatorElement}
            {externalLinkButtonElement}
          </span>
        </>
      );
    }

    // Chip variant - pill style with neutral colors
    if (variant === "chip") {
      return (
        <>
          {children}
          <span
            ref={ref}
            data-citation-id={citationKey}
            data-citation-instance={citationInstanceId}
            data-url={url}
            data-fetch-status={fetchStatus}
            data-variant="chip"
            className={cn(
              "group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-sm cursor-pointer transition-colors no-underline mr-0.5",
              "bg-dc-muted text-dc-foreground",
              "hover:bg-dc-muted",
              isBroken && "opacity-60",
              className,
            )}
            title={showFullUrlOnHover ? url : undefined}
            onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
            onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={t("aria.linkToDomainStatus", { domain: displayText || domain, status: statusLabel })}
          >
            {showFavicon && <DefaultFavicon url={url} faviconUrl={faviconUrl} />}
            <span className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-dc-foreground">
              {displayText}
            </span>
            {showStatusIndicator && statusIndicatorElement}
            {externalLinkButtonElement}
          </span>
        </>
      );
    }

    // Inline variant - neutral underline style with spacing
    // Changed from <a> to <span> to prevent default link behavior
    if (variant === "inline") {
      return (
        <>
          {children}
          <span
            ref={ref}
            data-citation-id={citationKey}
            data-citation-instance={citationInstanceId}
            data-fetch-status={fetchStatus}
            data-variant="inline"
            className={cn(
              "group inline-flex items-center gap-1 cursor-pointer transition-colors no-underline border-b border-dotted mr-0.5",
              "text-dc-foreground border-dc-border",
              "hover:border-dc-border",
              isBroken && "opacity-60",
              className,
            )}
            style={isBroken ? MISS_WAVY_UNDERLINE_STYLE : undefined}
            title={showFullUrlOnHover ? url : undefined}
            onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
            onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={t("aria.linkToDomainStatus", { domain: displayText || domain, status: statusLabel })}
          >
            {showFavicon && <DefaultFavicon url={url} faviconUrl={faviconUrl} />}
            <span>{displayText}</span>
            {showStatusIndicator && statusIndicatorElement}
            {externalLinkButtonElement}
          </span>
        </>
      );
    }

    // Bracket variant - neutral text color with brackets, spacing for inline context
    return (
      <>
        {children}
        <span
          ref={ref}
          data-citation-id={citationKey}
          data-citation-instance={citationInstanceId}
          data-url={url}
          data-fetch-status={fetchStatus}
          data-variant="bracket"
          className={cn(
            "group inline-flex items-baseline gap-0.5 whitespace-nowrap cursor-pointer transition-colors mr-0.5",
            "font-mono text-xs leading-tight",
            "text-dc-subtle-foreground",
            isBroken && "opacity-60",
            className,
          )}
          title={showFullUrlOnHover ? url : undefined}
          onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
          onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-label={t("aria.linkToDomainStatus", { domain: displayText || domain, status: statusLabel })}
        >
          [{showFavicon && <DefaultFavicon url={url} faviconUrl={faviconUrl} />}
          <span
            className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap"
            style={isBroken ? MISS_WAVY_UNDERLINE_STYLE : undefined}
          >
            {displayText}
          </span>
          {showStatusIndicator && statusIndicatorElement}
          {externalLinkButtonElement}]
        </span>
      </>
    );
  },
);

UrlCitationComponent.displayName = "UrlCitationComponent";

/**
 * Memoized version for performance.
 */
export const MemoizedUrlCitationComponent = memo(UrlCitationComponent);
