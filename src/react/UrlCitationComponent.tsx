import type React from "react";
import { forwardRef, memo, useCallback, useMemo, useState } from "react";
import type { Citation } from "../types/citation.js";
import { DOT_COLORS, DOT_INDICATOR_FIXED_SIZE_STYLE, MISS_WAVY_UNDERLINE_STYLE } from "./constants.js";
import { useIsTouchDevice } from "./hooks/useIsTouchDevice.js";
import { CheckIcon, ExternalLinkIcon, LockIcon, XCircleIcon } from "./icons.js";
import type { UrlCitationProps, UrlFetchStatus } from "./types.js";
import { isBlockedStatus, isErrorStatus } from "./urlStatus.js";
import { extractDomain, getUrlPath, STATUS_ICONS, safeWindowOpen, truncateString } from "./urlUtils.js";
import { classNames, generateCitationInstanceId, generateCitationKey } from "./utils.js";

/**
 * Module-level handler for hiding broken favicon images.
 * Performance fix: avoids creating new function references on every render.
 */
const handleFaviconError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.display = "none";
};

/**
 * Pulsing dot indicator for pending state.
 * Uses DOT_COLORS.gray for consistency across components (gray for pending state).
 */
const PendingDot = () => (
  <span
    className={classNames("w-1.5 h-1.5 rounded-full animate-pulse", DOT_COLORS.gray)}
    role="img"
    aria-label="Verification in progress"
  />
);

/**
 * Green verified checkmark indicator.
 * Uses green-600 color to match DOT_COLORS.green for visual consistency.
 */
const VerifiedCheck = () => (
  <span role="img" aria-label="Verified">
    <CheckIcon className={classNames("w-full h-full", "text-green-600 dark:text-green-500")} />
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
    className={classNames("w-3 h-3 flex-shrink-0 flex items-center justify-center", className)}
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
      <span className="w-3.5 h-3.5 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 shrink-0">
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
      onError={handleFaviconError}
    />
  );
};

// =============================================================================
// Extracted sub-components (moved out of forwardRef to avoid inline definitions)
// =============================================================================

interface ExternalLinkButtonProps {
  showExternalLinkIndicator: boolean;
  handleExternalLinkClick: (e: React.MouseEvent) => void;
}

const ExternalLinkButton = ({ showExternalLinkIndicator, handleExternalLinkClick }: ExternalLinkButtonProps) => {
  if (!showExternalLinkIndicator) return null;
  return (
    <button
      type="button"
      onClick={handleExternalLinkClick}
      className="inline-flex items-center justify-center w-3.5 h-3.5 ml-1 text-gray-400 group-hover:text-blue-500 dark:text-gray-500 dark:group-hover:text-blue-400 transition-colors"
      aria-label="Open in new tab"
      title="Open in new tab"
    >
      <ExternalLinkIcon className="w-full h-full" />
    </button>
  );
};

interface UrlStatusIndicatorProps {
  indicatorVariant: "icon" | "dot" | "none";
  isVerified: boolean;
  isPartial: boolean;
  isBlocked: boolean;
  isError: boolean;
  isPending: boolean;
  fetchStatus: UrlFetchStatus;
  errorMessage?: string;
  statusInfo: { label: string };
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
  statusInfo,
  renderBlockedIndicator,
}: UrlStatusIndicatorProps) => {
  // Dot variant: simple colored dots for all statuses
  if (indicatorVariant === "dot") {
    if (isVerified) {
      return (
        <StatusIconWrapper ariaLabel="Verified">
          <span
            className={classNames("rounded-full", DOT_COLORS.green)}
            style={DOT_INDICATOR_FIXED_SIZE_STYLE}
            aria-hidden="true"
          />
        </StatusIconWrapper>
      );
    }
    if (isPartial) {
      return (
        <StatusIconWrapper ariaLabel="Partial match">
          <span
            className={classNames("rounded-full", DOT_COLORS.amber)}
            style={DOT_INDICATOR_FIXED_SIZE_STYLE}
            aria-hidden="true"
          />
        </StatusIconWrapper>
      );
    }
    if (isBlocked) {
      if (renderBlockedIndicator) return <>{renderBlockedIndicator(fetchStatus, errorMessage)}</>;
      return (
        <StatusIconWrapper ariaLabel={statusInfo.label}>
          <span
            className={classNames("rounded-full", DOT_COLORS.amber)}
            style={DOT_INDICATOR_FIXED_SIZE_STYLE}
            aria-hidden="true"
          />
        </StatusIconWrapper>
      );
    }
    if (isError) {
      if (renderBlockedIndicator) return <>{renderBlockedIndicator(fetchStatus, errorMessage)}</>;
      return (
        <StatusIconWrapper ariaLabel={statusInfo.label}>
          <span
            className={classNames("rounded-full", DOT_COLORS.red)}
            style={DOT_INDICATOR_FIXED_SIZE_STYLE}
            aria-hidden="true"
          />
        </StatusIconWrapper>
      );
    }
    if (isPending) {
      return (
        <StatusIconWrapper ariaLabel="Verification in progress">
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
      <StatusIconWrapper ariaLabel="Verified">
        <VerifiedCheck />
      </StatusIconWrapper>
    );
  }

  // Partial: Amber check
  if (isPartial) {
    return (
      <StatusIconWrapper className="text-amber-500 dark:text-amber-400" ariaLabel="Partial match">
        <CheckIcon className="w-full h-full" />
      </StatusIconWrapper>
    );
  }

  // Blocked: Lock icon
  if (isBlocked) {
    if (renderBlockedIndicator) {
      return <>{renderBlockedIndicator(fetchStatus, errorMessage)}</>;
    }
    return (
      <StatusIconWrapper className="text-amber-500 dark:text-amber-400" ariaLabel={statusInfo.label}>
        <LockIcon className="w-full h-full" />
      </StatusIconWrapper>
    );
  }

  // Error: X in circle icon (centered, not subscript)
  if (isError) {
    if (renderBlockedIndicator) {
      return <>{renderBlockedIndicator(fetchStatus, errorMessage)}</>;
    }
    return (
      <StatusIconWrapper className="text-red-500 dark:text-red-400" ariaLabel={statusInfo.label}>
        <XCircleIcon className="w-full h-full" />
      </StatusIconWrapper>
    );
  }

  // Pending: Pulsing dot
  if (isPending) {
    return (
      <StatusIconWrapper ariaLabel="Verification in progress">
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
    // Track hover and focus state for external link indicator
    const [isHovered, setIsHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const isTouchDevice = useIsTouchDevice();

    // Show external link when hovered, focused, or always on touch (no hover on mobile)
    const shouldShowExternalLink = showExternalLinkOnHover;
    const showExternalLinkIndicator = shouldShowExternalLink && (isTouchDevice || isHovered || isFocused);
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
            safeWindowOpen(url);
          }
          eventHandlers?.onClick?.(citation, citationKey, e);
        }
      },
      [onUrlClick, url, eventHandlers, citation, citationKey],
    );

    const externalLinkButtonElement = (
      <ExternalLinkButton
        showExternalLinkIndicator={showExternalLinkIndicator}
        handleExternalLinkClick={handleExternalLinkClick}
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
        statusInfo={statusInfo}
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
            className={classNames(
              // Base styles matching the HTML design
              "group inline-flex items-center gap-2 px-2 py-1",
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
              className,
            )}
            title={showFullUrlOnHover ? errorMessage || url : undefined}
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
            className={classNames(
              "group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-sm cursor-pointer transition-colors no-underline mr-0.5",
              "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
              "hover:bg-gray-200 dark:hover:bg-gray-700",
              isBroken && "opacity-60",
              className,
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
            <span className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-gray-700 dark:text-gray-300">
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
            className={classNames(
              "group inline-flex items-center gap-1 cursor-pointer transition-colors no-underline border-b border-dotted mr-0.5",
              "text-gray-700 dark:text-gray-300 border-gray-400 dark:border-gray-500",
              "hover:border-gray-600 dark:hover:border-gray-300",
              isBroken && "opacity-60",
              className,
            )}
            style={isBroken ? MISS_WAVY_UNDERLINE_STYLE : undefined}
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
          className={classNames(
            "group inline-flex items-baseline gap-0.5 whitespace-nowrap cursor-pointer transition-colors mr-0.5",
            "font-mono text-xs leading-tight",
            "text-gray-500 dark:text-gray-400",
            isBroken && "opacity-60",
            className,
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
