import React, { forwardRef, memo, useCallback, useMemo, useState } from "react";
import type { Citation } from "../types/citation.js";
import type { UrlCitationMeta, UrlCitationProps, UrlFetchStatus } from "./types.js";
import { classNames, generateCitationInstanceId, generateCitationKey } from "./utils.js";
import { CheckIcon, XCircleIcon, LockIcon, ExternalLinkIcon } from "./icons.js";

/**
 * Module-level handler for hiding broken favicon images.
 * Performance fix: avoids creating new function references on every render.
 */
const handleFaviconError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.display = "none";
};

/**
 * Extracts domain from URL for compact display.
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    // Fallback for invalid URLs
    return url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }
}

/**
 * Truncates a string to max length with ellipsis.
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "…";
}

/**
 * Get path from URL for display.
 */
function getUrlPath(url: string): string {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    return path === "/" ? "" : path;
  } catch {
    return "";
  }
}

/**
 * Status indicator icons for URL fetch states.
 */
const STATUS_ICONS: Record<UrlFetchStatus, { icon: string; label: string; className: string }> = {
  verified: { icon: "✓", label: "Verified", className: "text-green-600 dark:text-green-500" },
  partial: { icon: "~", label: "Partial match", className: "text-amber-600 dark:text-amber-500" },
  pending: { icon: "…", label: "Verifying", className: "text-gray-400 dark:text-gray-500" },
  accessible: { icon: "○", label: "Accessible", className: "text-blue-500 dark:text-blue-400" },
  redirected: { icon: "↪", label: "Redirected", className: "text-amber-600 dark:text-amber-500" },
  redirected_valid: { icon: "↪✓", label: "Redirected (valid)", className: "text-green-600 dark:text-green-500" },
  blocked_antibot: { icon: "⊘", label: "Blocked by anti-bot", className: "text-amber-600 dark:text-amber-500" },
  blocked_login: { icon: "⊙", label: "Login required", className: "text-amber-600 dark:text-amber-500" },
  blocked_paywall: { icon: "$", label: "Paywall", className: "text-amber-600 dark:text-amber-500" },
  blocked_geo: { icon: "⊕", label: "Geo-restricted", className: "text-amber-600 dark:text-amber-500" },
  blocked_rate_limit: { icon: "◔", label: "Rate limited", className: "text-amber-600 dark:text-amber-500" },
  error_timeout: { icon: "⊗", label: "Timed out", className: "text-red-500 dark:text-red-400" },
  error_not_found: { icon: "⊗", label: "Not found", className: "text-red-500 dark:text-red-400" },
  error_server: { icon: "⊗", label: "Server error", className: "text-red-500 dark:text-red-400" },
  error_network: { icon: "⊗", label: "Network error", className: "text-red-500 dark:text-red-400" },
  unknown: { icon: "?", label: "Unknown status", className: "text-gray-400 dark:text-gray-500" },
};

/**
 * Checks if status is a blocked status.
 */
export function isBlockedStatus(status: UrlFetchStatus): boolean {
  return status.startsWith("blocked_");
}

/**
 * Checks if status is an error status.
 */
export function isErrorStatus(status: UrlFetchStatus): boolean {
  return status.startsWith("error_");
}

/**
 * Checks if status indicates the URL is accessible (may not have verified content yet).
 */
export function isAccessibleStatus(status: UrlFetchStatus): boolean {
  return status === "verified" || status === "partial" || status === "accessible" || status === "redirected_valid";
}

/**
 * Checks if status indicates a redirect occurred.
 */
export function isRedirectedStatus(status: UrlFetchStatus): boolean {
  return status === "redirected" || status === "redirected_valid";
}

/**
 * Checks if URL was successfully verified.
 */
export function isVerifiedStatus(status: UrlFetchStatus): boolean {
  return status === "verified" || status === "partial" || status === "redirected_valid";
}

/**
 * Pulsing dot indicator for pending state.
 */
const PendingDot = () => (
  <span
    className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-pulse"
    aria-hidden="true"
  />
);

/**
 * Green verified checkmark indicator.
 */
const VerifiedCheck = () => (
  <CheckIcon className="w-full h-full text-green-600 dark:text-green-500" />
);

/**
 * Status icon wrapper for consistent sizing and alignment.
 */
const StatusIconWrapper = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span
    className={classNames(
      "w-3 h-3 flex-shrink-0 flex items-center justify-center",
      className
    )}
  >
    {children}
  </span>
);

/**
 * Default favicon component.
 */
const DefaultFavicon = ({ url, faviconUrl, isBroken }: { url: string; faviconUrl?: string; isBroken?: boolean }) => {
  const domain = extractDomain(url);
  const src = faviconUrl || `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;

  if (isBroken) {
    return (
      <span className="w-3.5 h-3.5 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
        🌐
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
      width={14}
      height={14}
      loading="lazy"
      // Performance fix: use module-level handler to avoid re-render overhead
      onError={handleFaviconError}
    />
  );
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
      openUrlOnClick: _openUrlOnClick, // Deprecated, clicking always opens URL now
      showExternalLinkOnHover = true, // Show external link icon on hover by default
    },
    ref,
  ) => {
    // Track hover and focus state for external link indicator
    const [isHovered, setIsHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    // Show external link when either hovered or focused
    const shouldShowExternalLink = showExternalLinkOnHover;
    // Show external link when either hovered or focused (keyboard accessibility)
    const showExternalLinkIndicator = shouldShowExternalLink && (isHovered || isFocused);
    const { url, domain: providedDomain, title, fetchStatus, faviconUrl, errorMessage } = urlMeta;

    // Derive citation from URL meta if not provided
    const citation: Citation = useMemo(
      () =>
        providedCitation || {
          value: url,
          fullPhrase: title || url,
        },
      [providedCitation, url, title],
    );

    const citationKey = useMemo(() => generateCitationKey(citation), [citation]);
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

    const statusInfo = STATUS_ICONS[fetchStatus];
    const isBlocked = isBlockedStatus(fetchStatus);
    const isError = isErrorStatus(fetchStatus);
    const isVerified = fetchStatus === "verified";
    const isPartial = fetchStatus === "partial";
    const isPending = fetchStatus === "pending";
    const isBroken = isError;

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (onUrlClick) {
          onUrlClick(url, e);
        } else {
          // Always open the URL when clicking on the component
          // The external link icon is just a visual hint, not a separate action
          window.open(url, "_blank", "noopener,noreferrer");
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
        window.open(url, "_blank", "noopener,noreferrer");
      },
      [url],
    );

    const handleMouseEnter = useCallback(() => {
      setIsHovered(true);
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    const handleMouseLeave = useCallback(() => {
      setIsHovered(false);
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, citation, citationKey]);

    // Focus handlers for keyboard accessibility
    // Shows external link button when component receives keyboard focus
    const handleFocus = useCallback(() => {
      setIsFocused(true);
    }, []);

    const handleBlur = useCallback(() => {
      setIsFocused(false);
    }, []);

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
            window.open(url, "_blank", "noopener,noreferrer");
          }
          eventHandlers?.onClick?.(citation, citationKey, e);
        }
      },
      [onUrlClick, url, eventHandlers, citation, citationKey],
    );

    // External link button that appears on hover or focus
    const renderExternalLinkButton = () => {
      if (!showExternalLinkIndicator) return null;
      return (
        <button
          type="button"
          onClick={handleExternalLinkClick}
          className="inline-flex items-center justify-center w-3.5 h-3.5 ml-1 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
          aria-label="Open in new tab"
          title="Open in new tab"
        >
          <ExternalLinkIcon className="w-full h-full" />
        </button>
      );
    };

    const renderStatusIndicator = () => {
      // Verified: Green checkmark
      if (isVerified) {
        return (
          <StatusIconWrapper>
            <VerifiedCheck />
          </StatusIconWrapper>
        );
      }

      // Partial: Amber check
      if (isPartial) {
        return (
          <StatusIconWrapper className="text-amber-600 dark:text-amber-500">
            <CheckIcon className="w-full h-full" />
          </StatusIconWrapper>
        );
      }

      // Blocked: Lock icon
      if (isBlocked) {
        if (renderBlockedIndicator) {
          return renderBlockedIndicator(fetchStatus, errorMessage);
        }
        return (
          <StatusIconWrapper className="text-amber-600 dark:text-amber-500" aria-label={statusInfo.label}>
            <LockIcon className="w-full h-full" />
          </StatusIconWrapper>
        );
      }

      // Error: X in circle icon (centered, not subscript)
      if (isError) {
        if (renderBlockedIndicator) {
          return renderBlockedIndicator(fetchStatus, errorMessage);
        }
        return (
          <span
            className="w-3 h-3 flex-shrink-0 flex items-center justify-center text-red-500 dark:text-red-400"
            aria-label={statusInfo.label}
          >
            <XCircleIcon className="w-full h-full" />
          </span>
        );
      }

      // Pending: Pulsing dot
      if (isPending) {
        return (
          <StatusIconWrapper>
            <PendingDot />
          </StatusIconWrapper>
        );
      }

      return null;
    };

    // Badge variant (default) - matches the HTML design
    // Changed from <a> to <span> to prevent default link behavior
    // Click is handled by handleClick which respects openUrlOnClick prop
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
            className={classNames(
              // Base styles matching the HTML design
              "inline-flex items-center gap-2 px-2 py-1",
              "bg-white dark:bg-gray-900",
              "border border-gray-200 dark:border-gray-700",
              "rounded-md",
              "text-gray-800 dark:text-gray-200",
              "no-underline cursor-pointer",
              "transition-all duration-150 ease-in-out",
              "hover:border-gray-400 dark:hover:border-gray-500",
              "hover:bg-gray-50 dark:hover:bg-gray-800",
              // Broken state: muted styling
              isBroken && "opacity-60",
              className
            )}
            title={showFullUrlOnHover ? (errorMessage || url) : undefined}
            onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
            onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Link to ${domain}: ${statusInfo.label}`}
          >
            {showFavicon && <DefaultFavicon url={url} faviconUrl={faviconUrl} isBroken={isBroken} />}
            <span
              className={classNames(
                "font-mono text-[11px] font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px]",
                "text-gray-800 dark:text-gray-200",
                isBroken && "line-through"
              )}
            >
              {displayText}
            </span>
            {showStatusIndicator && renderStatusIndicator()}
            {renderExternalLinkButton()}
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
            className={classNames(
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-sm cursor-pointer transition-colors no-underline mr-0.5",
              "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
              "hover:bg-gray-200 dark:hover:bg-gray-700",
              isBroken && "opacity-60",
              className
            )}
            title={showFullUrlOnHover ? url : undefined}
            onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
            onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Link to ${domain}: ${statusInfo.label}`}
          >
            {showFavicon && <DefaultFavicon url={url} faviconUrl={faviconUrl} />}
            <span className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-gray-700 dark:text-gray-300">{displayText}</span>
            {showStatusIndicator && renderStatusIndicator()}
            {renderExternalLinkButton()}
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
            className={classNames(
              "inline-flex items-center gap-1 cursor-pointer transition-colors no-underline border-b border-dotted mr-0.5",
              "text-gray-700 dark:text-gray-300 border-gray-400 dark:border-gray-500",
              "hover:border-gray-600 dark:hover:border-gray-300",
              isBroken && "opacity-60 line-through",
              className
            )}
            title={showFullUrlOnHover ? url : undefined}
            onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
            onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Link to ${domain}: ${statusInfo.label}`}
          >
            {showFavicon && <DefaultFavicon url={url} faviconUrl={faviconUrl} />}
            <span>{displayText}</span>
            {showStatusIndicator && renderStatusIndicator()}
            {renderExternalLinkButton()}
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
          className={classNames(
            "inline-flex items-baseline gap-0.5 whitespace-nowrap cursor-pointer transition-colors mr-0.5",
            "font-mono text-xs leading-tight",
            "text-gray-500 dark:text-gray-400",
            isBroken && "opacity-60",
            className
          )}
          title={showFullUrlOnHover ? url : undefined}
          onMouseEnter={preventTooltips ? undefined : handleMouseEnter}
          onMouseLeave={preventTooltips ? undefined : handleMouseLeave}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-label={`Link to ${domain}: ${statusInfo.label}`}
        >
          [
          {showFavicon && <DefaultFavicon url={url} faviconUrl={faviconUrl} />}
          <span className={classNames(
            "max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap",
            isBroken && "line-through"
          )}>{displayText}</span>
          {showStatusIndicator && renderStatusIndicator()}
          {renderExternalLinkButton()}
          ]
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

/**
 * Hook to parse URL and create UrlCitationMeta.
 */
export function useUrlMeta(
  url: string,
  fetchStatus: UrlFetchStatus = "unknown",
  additionalMeta?: Partial<UrlCitationMeta>,
): UrlCitationMeta {
  return useMemo(
    () => ({
      url,
      domain: extractDomain(url),
      fetchStatus,
      ...additionalMeta,
    }),
    [url, fetchStatus, additionalMeta],
  );
}

/**
 * Compact URL display utilities.
 */
export const urlDisplayUtils = {
  extractDomain,
  truncateString,
  getUrlPath,
  isBlockedStatus,
  isErrorStatus,
  isVerifiedStatus,
};

/**
 * Status configuration for custom styling.
 */
export { STATUS_ICONS };
