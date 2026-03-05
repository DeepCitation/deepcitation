import { type ReactNode, useMemo, useState } from "react";
import type { Citation } from "../types/citation.js";
import type { SearchAttempt, SearchMethod, SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";

import { UrlCitationComponent } from "./Citation.js";
import {
  DOT_COLORS,
  FOCUS_RING_CLASSES,
  HITBOX_EXTEND_8x14,
  isValidProofImageSrc,
  TERTIARY_ACTION_BASE_CLASSES,
  TERTIARY_ACTION_HOVER_CLASSES,
  TERTIARY_ACTION_IDLE_CLASSES,
} from "./constants.js";
import { formatCaptureDate } from "./dateUtils.js";
import { normalizeScreenshotSrc } from "./EvidenceTray.js";
import { type MessageKey, type TranslateFunction, useTranslation } from "./i18n.js";
import {
  CheckIcon,
  ChevronRightIcon,
  DocumentIcon,
  DownloadIcon,
  GlobeIcon,
  MissIcon,
  SpinnerIcon,
  XCircleIcon,
  XIcon,
} from "./icons.js";
import { getUniqueSearchAttemptCount, groupSearchAttempts } from "./searchAttemptGrouping.js";
import type { IndicatorVariant, UrlFetchStatus } from "./types.js";
// import { isValidProofUrl } from "./urlUtils.js"; // temporarily unused while proof link is disabled

import { isUrlCitation } from "../types/citation.js";
import { cn, isImageSource } from "./utils.js";

/**
 * Statuses that show only the successful hit (not the full search trail).
 * Everything else — miss, partial, and transient (loading/pending) — shows all attempts.
 */
const SHOW_ONLY_HIT_STATUSES: ReadonlySet<SearchStatus> = new Set<SearchStatus>([
  "found",
  "found_phrase_missed_anchor_text",
]);

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum length for quote box phrase display */
const MAX_QUOTE_BOX_LENGTH = 150;

/** Maximum length for anchor text preview in headers */
const MAX_ANCHOR_TEXT_PREVIEW_LENGTH = 50;

/** Maximum length for phrase display in search attempt rows */
const MAX_PHRASE_DISPLAY_LENGTH = 60;
const TRUNCATED_PHRASE_PREFIX_LENGTH = 42;
const TRUNCATED_PHRASE_SUFFIX_LENGTH = 14;

/** Truncate a search phrase for display, showing "(empty)" for blank input. */
function truncatePhrase(raw: string | undefined | null, t: TranslateFunction): string {
  const phrase = raw ?? "";
  if (phrase.length === 0) return t("search.empty");
  if (phrase.length <= MAX_PHRASE_DISPLAY_LENGTH) return phrase;
  const prefix = phrase.slice(0, TRUNCATED_PHRASE_PREFIX_LENGTH);
  const suffix = phrase.slice(-TRUNCATED_PHRASE_SUFFIX_LENGTH);
  return `${prefix}...${suffix}`;
}

/** Maximum length for URL display in popover header */
const MAX_URL_DISPLAY_LENGTH = 45;

/** Icon color classes by status - defined outside component to avoid recreation on every render */
const ICON_COLOR_CLASSES = {
  green: "text-green-600 dark:text-green-400",
  amber: "text-amber-500 dark:text-amber-400",
  red: "text-red-500 dark:text-red-400",
  gray: "text-gray-400 dark:text-gray-500",
} as const;

const METHOD_KEY_MAP: Record<SearchMethod, MessageKey> = {
  exact_line_match: "search.method.exactLineMatch",
  line_with_buffer: "search.method.lineWithBuffer",
  expanded_line_buffer: "search.method.expandedLineBuffer",
  current_page: "search.method.currentPage",
  anchor_text_fallback: "search.method.anchorTextFallback",
  adjacent_pages: "search.method.adjacentPages",
  expanded_window: "search.method.expandedWindow",
  regex_search: "search.method.regexSearch",
  first_word_fallback: "search.method.firstWordFallback",
  first_half_fallback: "search.method.firstHalfFallback",
  last_half_fallback: "search.method.lastHalfFallback",
  first_quarter_fallback: "search.method.firstQuarterFallback",
  second_quarter_fallback: "search.method.secondQuarterFallback",
  third_quarter_fallback: "search.method.thirdQuarterFallback",
  fourth_quarter_fallback: "search.method.fourthQuarterFallback",
  longest_word_fallback: "search.method.longestWordFallback",
  custom_phrase_fallback: "search.method.customPhraseFallback",
  keyspan_fallback: "search.method.keyspanFallback",
};

function getMethodDisplayName(method: SearchMethod, t: TranslateFunction): string {
  return t(METHOD_KEY_MAP[method]);
}

const HEADER_DOWNLOAD_BUTTON_BASE_CLASSES =
  "shrink-0 size-8 flex items-center justify-center cursor-pointer text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-[opacity,color] duration-150";
const HEADER_DOWNLOAD_BUTTON_REVEAL_CLASSES =
  "focus-visible:opacity-100 focus-visible:pointer-events-auto md:opacity-30 md:group-hover/source-header:opacity-100 md:group-hover/source-header:pointer-events-auto md:group-focus-within/source-header:opacity-100 md:group-focus-within/source-header:pointer-events-auto";

// =============================================================================
// SOURCE CONTEXT HEADER COMPONENT
// =============================================================================

export interface SourceContextHeaderProps {
  /** The citation being displayed */
  citation: Citation;
  /** Verification data (optional, provides favicon for URL citations) */
  verification?: Verification | null;
  /** Search status (used to derive URL fetch status for URL citations) */
  status?: SearchStatus | null;
  /**
   * Override label for the source display.
   *
   * For document citations, this overrides the filename/label shown
   * (e.g., "Annual Report 2024" instead of "document.pdf").
   *
   * For URL citations, this overrides the URL display text
   * (e.g., "Company Blog" instead of "example.com/blog/post").
   */
  sourceLabel?: string;
  /** Callback when the page pill is clicked to expand to full page view */
  onExpand?: () => void;
  /**
   * Callback to close/go back from the expanded view.
   * When provided, the page pill shows an X button (active/expanded state)
   * instead of the chevron-right expand affordance.
   */
  onClose?: () => void;
  /**
   * Proof URL to link to in the expanded view header.
   * Rendered whenever a valid URL is provided.
   * Validated internally via `isValidProofUrl()` — safe to pass untrusted input.
   */
  proofUrl?: string | null;
  /**
   * Callback when the user clicks the download button.
   * The button only renders when this prop is provided.
   * Receives the full Citation object so the consumer can determine download logic.
   */
  onSourceDownload?: (citation: Citation) => void;
}

/**
 * Maps document verification SearchStatus to UrlFetchStatus for display in UrlCitationComponent.
 */
function mapSearchStatusToUrlFetchStatus(status: SearchStatus | null | undefined): UrlFetchStatus {
  if (!status) return "pending";
  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return "verified";
    case "found_on_other_page":
    case "found_on_other_line":
    case "partial_text_found":
    case "first_word_found":
      return "partial";
    case "not_found":
      // SearchStatus.not_found = text not found on page, not HTTP 404.
      return "unknown";
    case "loading":
    case "pending":
    case "timestamp_wip":
    case "skipped":
      return "pending";
    default: {
      // Exhaustiveness check: TypeScript will error if a new SearchStatus value is added
      // but not handled above. The 'never' type ensures all cases are covered.
      const _exhaustiveCheck: never = status;
      return _exhaustiveCheck;
    }
  }
}

function resolveImageDownloadUrl(verification: Verification | null | undefined): string | null {
  const proofImageUrl = verification?.assets?.proofImage?.url;
  if (proofImageUrl && isValidProofImageSrc(proofImageUrl)) {
    return proofImageUrl;
  }

  const verificationImageSrc = verification?.assets?.evidenceSnippet?.src;
  if (verificationImageSrc && isValidProofImageSrc(verificationImageSrc)) {
    return verificationImageSrc;
  }

  const rawScreenshot = verification?.assets?.webCapture?.src;
  if (!rawScreenshot || typeof rawScreenshot !== "string") {
    return null;
  }

  try {
    if (isValidProofImageSrc(rawScreenshot)) return rawScreenshot;
    const screenshotSrc = normalizeScreenshotSrc(rawScreenshot);
    return isValidProofImageSrc(screenshotSrc) ? screenshotSrc : null;
  } catch {
    return null;
  }
}

const DOWNLOAD_IFRAME_DATA_ATTR = "data-deepcitation-download-frame";
const DOWNLOAD_IFRAME_CLEANUP_DELAY_MS = 30_000;

/**
 * Returns true when the URL shares the same origin as the current page.
 * Falls back to false for invalid URLs or SSR contexts.
 */
function isSameOrigin(url: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Triggers a download in a background browsing context so the current view
 * remains visible even when the browser ignores anchor `download`.
 *
 * Same-origin URLs use a hidden iframe for a seamless download experience.
 * Cross-origin URLs use an `<a download>` click to avoid CSP frame-ancestors
 * errors (proof.deepcitation.com blocks framing from other origins).
 */
function triggerBackgroundDownload(url: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const isHappyDom = typeof navigator !== "undefined" && /HappyDOM/i.test(navigator.userAgent);

  const anchorDownload = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    if (!isHappyDom) {
      a.click();
    }
    a.remove();
  };

  // HappyDOM (test env) and cross-origin URLs use the anchor approach.
  // Cross-origin iframes are blocked by CSP frame-ancestors on proof pages.
  if (isHappyDom || !isSameOrigin(url)) {
    anchorDownload();
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.setAttribute(DOWNLOAD_IFRAME_DATA_ATTR, "true");

  const cleanup = () => {
    if (iframe.parentNode) {
      iframe.remove();
    }
  };

  const timeoutId = window.setTimeout(cleanup, DOWNLOAD_IFRAME_CLEANUP_DELAY_MS);
  iframe.addEventListener("load", () => {
    window.clearTimeout(timeoutId);
    cleanup();
  });
  iframe.addEventListener("error", () => {
    window.clearTimeout(timeoutId);
    cleanup();
  });

  try {
    iframe.src = url;
    document.body.appendChild(iframe);
  } catch {
    window.clearTimeout(timeoutId);
    cleanup();
    anchorDownload();
  }
}

/**
 * FaviconImage subcomponent with fallback handling.
 * Shows favicon from verification or citation, with Google Favicon fallback,
 * and falls back to GlobeIcon on error.
 *
 * Privacy Note: When no favicon URL is provided, this component uses
 * Google's Favicon Service (google.com/s2/favicons) as a fallback.
 * This makes an external request to Google with the domain being cited,
 * which may have privacy implications for sensitive use cases.
 */
export function FaviconImage({
  faviconUrl,
  domain,
  alt,
}: {
  faviconUrl: string | null | undefined;
  domain: string | null | undefined;
  alt: string;
}) {
  const [hasError, setHasError] = useState(false);

  // Build fallback chain for favicon URL (simple computation, no useMemo needed)
  // Privacy: Google Favicon Service is used as fallback, which sends domain to Google
  let effectiveFaviconUrl: string | null = null;
  if (faviconUrl) {
    effectiveFaviconUrl = faviconUrl;
  } else if (domain) {
    effectiveFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
  }

  // Show GlobeIcon if no URL or if image failed to load
  if (!effectiveFaviconUrl || hasError) {
    return (
      <span className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500">
        <GlobeIcon />
      </span>
    );
  }

  return (
    <img
      src={effectiveFaviconUrl}
      alt={alt?.trim() || "Source"}
      className="w-4 h-4 shrink-0"
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
}

// =============================================================================
// PAGE PILL COMPONENT
// =============================================================================

interface PagePillProps {
  /** Page number to display. When 0 or undefined, a generic "Page" label is shown. */
  pageNumber?: number;
  /** Status color scheme for the pill */
  colorScheme: "green" | "amber" | "red" | "gray";
  /** Callback when clicked (triggers expansion) — shows chevron-right */
  onClick?: () => void;
  /** Callback to close from expanded view — shows X and active (blue) styling */
  onClose?: () => void;
  /** When true, source is a raster image — label becomes "Image"/"Image" instead of "p.X" */
  isImage?: boolean;
}

/** Page pill color classes by status */
const PAGE_PILL_COLORS = {
  green: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600",
  amber: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600",
  red: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600",
  gray: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600",
} as const;

/**
 * Compact badge showing page number.
 * - Default (no action): static label
 * - With `onClick`: shows chevron-right, triggers expansion to full page view
 * - With `onClose`: shows X icon with blue "active" styling, triggers close/back
 */
export function PagePill({ pageNumber, colorScheme, onClick, onClose, isImage }: PagePillProps) {
  const t = useTranslation();
  const hasPage = pageNumber !== undefined && pageNumber > 0;
  // Need either a page number to display or an action to perform
  if (!hasPage && !onClick && !onClose) return null;

  const label = isImage ? (onClick ? "Image" : "Image") : hasPage ? `p.${pageNumber}` : "Page";
  const colorClasses = PAGE_PILL_COLORS[colorScheme];

  // Active/expanded state: entire pill is a button to close, shows X instead of chevron
  if (onClose) {
    return (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onClose();
        }}
        className={cn(
          "relative inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded border cursor-pointer",
          "transition-colors bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40",
          FOCUS_RING_CLASSES,
          HITBOX_EXTEND_8x14,
        )}
        aria-label={
          isImage
            ? t("aria.closeImageView")
            : hasPage
              ? t("aria.closePageViewNum", { pageNumber })
              : t("aria.closePageView")
        }
        title={t("action.closeExpanded")}
      >
        <span>{label}</span>
        <span className="size-3">
          <XIcon />
        </span>
      </button>
    );
  }

  if (!onClick) {
    return (
      <span
        className={cn("inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded border", colorClasses)}
      >
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "relative inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded border cursor-pointer",
        TERTIARY_ACTION_BASE_CLASSES,
        TERTIARY_ACTION_IDLE_CLASSES,
        TERTIARY_ACTION_HOVER_CLASSES,
        "hover:bg-gray-200 dark:hover:bg-gray-700",
        HITBOX_EXTEND_8x14,
        colorClasses,
      )}
      aria-label={
        isImage
          ? t("action.viewImage")
          : hasPage
            ? t("action.expandFullPageNum", { pageNumber })
            : t("action.expandFullPage")
      }
    >
      <span>{label}</span>
      <span className="size-3">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

// =============================================================================
// SOURCE CONTEXT HEADER COMPONENT
// =============================================================================

/**
 * SourceContextHeader displays source information (favicon + source info) for citations.
 * Shown at the top of popovers to give auditors immediate visibility into citation sources.
 *
 * For URL citations: Shows status icon + UrlCitationComponent badge + page/line info (all in one row)
 * For Document citations: Shows document icon + label/attachmentId + page/line info
 *
 * The `sourceLabel` prop allows overriding the displayed source name for both types.
 */
export function SourceContextHeader({
  citation,
  verification,
  status,
  sourceLabel,
  onExpand,
  onClose,
  proofUrl: _proofUrl,
  onSourceDownload,
}: SourceContextHeaderProps) {
  const t = useTranslation();
  const isUrl = isUrlCitation(citation);

  // Common page/line data (pageNumber/lineIds only exist on DocumentCitation)
  const pageNumber = verification?.document?.verifiedPageNumber ?? (isUrl ? undefined : citation.pageNumber);
  const lineIds = verification?.document?.verifiedLineIds ?? (isUrl ? undefined : citation.lineIds);
  const isImage = isImageSource(verification);
  const pageLineText = isImage ? "Image" : formatPageLineText(pageNumber, lineIds);
  const colorScheme = getStatusColorScheme(status);
  // Show page pill when there's an expand/close action. Page number is shown when available
  // but the pill also renders with a generic "Page" label for not_found citations where
  // verifiedPageNumber is null.
  const showPagePill = !!onExpand || !!onClose;
  // URL-specific data
  const url = isUrl ? citation.url || "" : "";
  // Show the source download button whenever the caller provides onSourceDownload.
  // The caller (CitationComponent) already resolved whether a downloadable source
  // exists from documentFiles/origin policy, so we trust that signal unconditionally.
  const shouldShowSourceDownloadButton = !!onSourceDownload;
  const imageDownloadUrl = resolveImageDownloadUrl(verification);
  // Keep a single download action visible: explicit source-download callback wins.
  const shouldShowImageDownloadButton = !!imageDownloadUrl && !shouldShowSourceDownloadButton;

  // Display name for document citations (never show attachmentId to users)
  const displayName = isUrl ? undefined : sourceLabel || verification?.label || "Document";

  return (
    <div
      role="presentation"
      className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700"
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        // Let Escape propagate to the document-level handler where the
        // escapeInterceptRef mechanism collapses the search log first; a
        // second Escape then closes the popover. Stop other keys to avoid
        // side effects.
        if (e.key !== "Escape") e.stopPropagation();
      }}
    >
      {/* Left: Icon + source name + contextual download */}
      <div className="group/source-header flex items-center gap-2 min-w-0 flex-1">
        {isUrl ? (
          <UrlCitationComponent
            urlMeta={{
              url,
              domain: verification?.url?.verifiedDomain || citation.domain,
              title: sourceLabel,
              faviconUrl: verification?.url?.verifiedFaviconUrl || citation.faviconUrl,
              fetchStatus: mapSearchStatusToUrlFetchStatus(status),
            }}
            variant="chip"
            maxDisplayLength={MAX_URL_DISPLAY_LENGTH}
            preventTooltips={true}
            showStatusIndicator={false}
            showTitle={!!sourceLabel}
            className="!bg-transparent !px-0 !py-0 !opacity-100 hover:!bg-transparent"
          />
        ) : (
          <>
            <span className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500">
              <DocumentIcon />
            </span>
            {displayName && (
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate max-w-[280px]">
                {displayName}
              </span>
            )}
          </>
        )}
        {shouldShowImageDownloadButton && (
          <button
            type="button"
            aria-label={t("aria.downloadImage")}
            title={t("aria.downloadImage")}
            className={cn(HEADER_DOWNLOAD_BUTTON_BASE_CLASSES, HEADER_DOWNLOAD_BUTTON_REVEAL_CLASSES)}
            onClick={e => {
              e.stopPropagation();
              if (!imageDownloadUrl) return;
              triggerBackgroundDownload(imageDownloadUrl);
            }}
          >
            <span className="size-3.5 block">
              <DownloadIcon />
            </span>
          </button>
        )}
        {shouldShowSourceDownloadButton && (
          <button
            type="button"
            aria-label={t("aria.downloadSource")}
            title={`Download ${displayName ?? url}`}
            className={cn(HEADER_DOWNLOAD_BUTTON_BASE_CLASSES, HEADER_DOWNLOAD_BUTTON_REVEAL_CLASSES)}
            onClick={e => {
              e.stopPropagation();
              onSourceDownload?.(citation);
            }}
          >
            <span className="size-3.5 block">
              <DownloadIcon />
            </span>
          </button>
        )}
      </div>
      {/* Right: Proof link (expanded view) + Page pill */}
      <div className="flex items-center gap-3">
        {/* Not ready {validatedProofUrl && (
          <a
            href={validatedProofUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("action.openProof")}
            className="shrink-0 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <span className="size-3.5 block">
              <ExternalLinkIcon />
            </span>
          </a>
        )} */}
        {showPagePill && (
          <PagePill
            pageNumber={pageNumber ?? undefined}
            colorScheme={colorScheme}
            onClick={onExpand}
            onClose={onClose}
            isImage={isImage}
          />
        )}
        {!showPagePill && pageLineText && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0 uppercase tracking-wide">
            {pageLineText}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Formats page and line info for display in headers.
 * Returns "Page X" or "Page X, Line Y" or null if no info available.
 *
 * Note: Line numbers are intentionally not shown by default since document
 * columns can cause sync issues with expected line IDs. Line numbers are
 * only useful when there's a difference from expected.
 */
function formatPageLineText(
  pageNumber: number | null | undefined,
  _lineIds: number[] | null | undefined,
): string | null {
  if (!pageNumber || pageNumber <= 0) return null;
  // Don't show line numbers in the header - they can be unreliable due to column layouts
  // Line differences are shown separately in the verification log when relevant
  return `p.${pageNumber}`;
}

// =============================================================================
// TYPES
// =============================================================================

/** Ambiguity information for when text appears multiple times */
export interface AmbiguityInfo {
  /** Total number of occurrences found in the document */
  totalOccurrences: number;
  /** Number of occurrences on the expected page */
  occurrencesOnExpectedPage: number;
  /** Confidence level in the matched occurrence */
  confidence: "high" | "medium" | "low";
  /** Human-readable note about the ambiguity */
  note: string;
}

export interface VerificationLogProps {
  /** Array of search attempts from verification */
  searchAttempts: SearchAttempt[];
  /** Overall verification status */
  status?: SearchStatus | null;
  /** Expected page number from citation */
  expectedPage?: number;
  /** Expected line number from citation */
  expectedLine?: number;
  /** Page where match was found */
  foundPage?: number;
  /** Line where match was found */
  foundLine?: number;
  /** Whether the log is expanded (controlled) */
  isExpanded?: boolean;
  /** Callback when expansion state changes */
  onExpandChange?: (expanded: boolean) => void;
  /** Full phrase from citation (for audit display) */
  fullPhrase?: string;
  /** Anchor text from citation (for audit display) */
  anchorText?: string;
  /** Ambiguity information when multiple occurrences exist */
  ambiguity?: AmbiguityInfo | null;
  /** When the verification was performed */
  verifiedAt?: Date | string | null;
}

export interface StatusHeaderProps {
  /** Verification status */
  status?: SearchStatus | null;
  /** Page where match was found */
  foundPage?: number;
  /** Expected page from citation */
  expectedPage?: number;
  /** Whether this is a compact header (for success states) */
  compact?: boolean;
  /** Anchor text to display inline when status text is empty */
  anchorText?: string;
  /** Whether to hide the page badge (to avoid duplication when SourceContextHeader shows it) */
  hidePageBadge?: boolean;
  /**
   * Visual style for status indicators.
   * - `"icon"`: Icon-based indicators (default)
   * - `"dot"`: Subtle colored dots
   * @default "icon"
   */
  indicatorVariant?: IndicatorVariant;
  /** When true, source is a raster image — PageBadge shows "Image" instead of "p.X" */
  isImage?: boolean;
}

export interface QuoteBoxProps {
  /** The phrase to display */
  phrase: string;
  /** Maximum length before truncation */
  maxLength?: number;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get the color scheme based on status.
 */
// biome-ignore lint/style/useComponentExportOnlyModules: Utility function used by EvidenceTray for PagePill colorScheme
export function getStatusColorScheme(status?: SearchStatus | null): "green" | "amber" | "red" | "gray" {
  if (!status) return "gray";

  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return "green";
    case "found_on_other_page":
    case "found_on_other_line":
    case "partial_text_found":
    case "first_word_found":
      return "amber";
    case "not_found":
      return "red";
    default:
      return "gray";
  }
}

/**
 * Get the header text based on status.
 */
function getStatusHeaderText(status?: SearchStatus | null): string {
  if (!status) return "Verifying...";

  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return "Verified";
    case "found_on_other_page":
      return "Found on different page";
    case "found_on_other_line":
      return "Found on different line";
    case "partial_text_found":
    case "first_word_found":
      return "Partial match";
    case "not_found":
      return "Not found";
    case "pending":
    case "loading":
      return "Verifying...";
    default:
      return "";
  }
}

// =============================================================================
// PAGE BADGE COMPONENT
// =============================================================================

interface PageBadgeProps {
  /** Expected page from citation */
  expectedPage?: number;
  /** Page where match was found */
  foundPage?: number;
  /** When true, source is a raster image — shows "Image" instead of "p.X" */
  isImage?: boolean;
}

/**
 * Displays page location information.
 * Shows arrow format (Page 5 → 7) when location differs from expected.
 *
 * Note: Pages are 1-indexed for user display. Page 0 is treated as invalid/unset
 * since documents start at "Page 1" in user-facing contexts.
 */
function PageBadge({ expectedPage, foundPage, isImage }: PageBadgeProps) {
  // Pages are 1-indexed for display; page 0 indicates unset/invalid
  const hasExpected = expectedPage != null && expectedPage > 0;
  const hasFound = foundPage != null && foundPage > 0;

  // Image sources: show "Image" instead of page numbers
  if (isImage && (hasExpected || hasFound)) {
    return <span className="text-xs text-gray-500 dark:text-gray-400">Image</span>;
  }

  const locationDiffers = hasExpected && hasFound && expectedPage !== foundPage;

  // Show arrow format when location differs (e.g., "p.5 → 7")
  if (locationDiffers) {
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
        <span className="text-gray-400 dark:text-gray-500">p.{expectedPage}</span>
        <span className="text-gray-400 dark:text-gray-500">→</span>
        <span className="text-gray-700 dark:text-gray-300">{foundPage}</span>
      </span>
    );
  }

  // Show found page or expected page
  const pageToShow = hasFound ? foundPage : expectedPage;
  if (pageToShow != null && pageToShow > 0) {
    return <span className="text-xs text-gray-500 dark:text-gray-400">p.{pageToShow}</span>;
  }

  return null;
}

// =============================================================================
// AMBIGUITY WARNING COMPONENT
// =============================================================================

interface AmbiguityWarningProps {
  ambiguity: AmbiguityInfo;
}

/**
 * Warning banner shown when text appears multiple times in the document.
 * Helps auditors understand potential matching ambiguity.
 */
export function AmbiguityWarning({ ambiguity }: AmbiguityWarningProps) {
  const t = useTranslation();
  if (ambiguity.totalOccurrences <= 1) return null;

  // Truncate very long notes at word boundary to prevent layout issues
  let displayNote = ambiguity.note;
  if (displayNote && displayNote.length > 200) {
    const truncated = displayNote.slice(0, 200);
    const lastSpace = truncated.lastIndexOf(" ");
    displayNote = `${lastSpace > 150 ? truncated.slice(0, lastSpace) : truncated}...`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800"
    >
      <div className="flex items-start gap-2">
        <svg
          className="size-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          role="img"
          aria-label={t("misc.warning")}
        >
          <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-xs text-amber-800 dark:text-amber-200">
          <span className="font-medium">Found {ambiguity.totalOccurrences.toLocaleString()} occurrences</span>
          {ambiguity.occurrencesOnExpectedPage > 0 && (
            <span className="text-amber-700 dark:text-amber-300">
              {" "}
              ({ambiguity.occurrencesOnExpectedPage.toLocaleString()} on expected page)
            </span>
          )}
          {displayNote && <p className="mt-0.5 text-amber-700 dark:text-amber-300 max-w-prose">{displayNote}</p>}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// STATUS HEADER COMPONENT
// =============================================================================

/**
 * Header bar showing verification status with icon and text.
 *
 * shadcn HoverCard style:
 * - Clean white/dark background (no colored header backgrounds)
 * - Colored icon only indicates status
 * - Subtle ring border for elevation
 * - Page badge is only shown if hidePageBadge is false (to avoid duplication with SourceContextHeader)
 */
export function StatusHeader({
  status,
  foundPage,
  expectedPage,
  compact = false,
  anchorText: _anchorText,
  hidePageBadge = false,
  indicatorVariant = "icon",
  isImage,
}: StatusHeaderProps) {
  const colorScheme = getStatusColorScheme(status);
  const headerText = getStatusHeaderText(status);

  // Select appropriate icon based on status
  // - Green (verified): CheckIcon
  // - Amber (partial): CheckIcon (de-emphasized, not aggressive warning)
  // - Red (not found): XCircleIcon (X in circle for clear "not found" indication)
  // - Gray (pending): SpinnerIcon (not aggressive warning)
  let IconComponent = null;
  if (indicatorVariant === "icon") {
    IconComponent =
      colorScheme === "green"
        ? CheckIcon
        : colorScheme === "amber"
          ? CheckIcon
          : colorScheme === "red"
            ? XCircleIcon
            : SpinnerIcon;
  }

  // Single-row layout: icon + status text + page badge
  // Status text is always provided by getStatusHeaderText; anchor text is shown
  // in the HighlightedPhrase area below, not echoed here
  const displayText = headerText || null;

  return (
    <div className={cn("flex items-center justify-between gap-2 text-sm", compact ? "px-3 pt-2.5" : "px-4 pt-3")}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {indicatorVariant === "dot" ? (
          <span
            className={cn(
              "size-2.5 rounded-full shrink-0",
              DOT_COLORS[colorScheme],
              colorScheme === "gray" && "animate-pulse",
            )}
            aria-hidden="true"
          />
        ) : indicatorVariant === "icon" ? (
          <span className={cn("size-4 max-w-4 max-h-4 shrink-0", ICON_COLOR_CLASSES[colorScheme])}>
            {IconComponent && <IconComponent />}
          </span>
        ) : null}
        {displayText && <span className="font-medium truncate text-gray-800 dark:text-gray-100">{displayText}</span>}
      </div>
      {!hidePageBadge && <PageBadge expectedPage={expectedPage} foundPage={foundPage} isImage={isImage} />}
    </div>
  );
}

// =============================================================================
// QUOTE BOX COMPONENT
// =============================================================================

/**
 * Styled quote box for displaying the phrase being verified.
 * Uses left border accent (which aligns with shadcn patterns).
 * No literal quotes - the styling indicates quoted text for copy/paste friendliness.
 */
export function QuoteBox({ phrase, maxLength = MAX_QUOTE_BOX_LENGTH }: QuoteBoxProps) {
  const displayPhrase = phrase.length > maxLength ? `${phrase.slice(0, maxLength)}...` : phrase;

  return (
    <blockquote className="text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-3 border-l-[3px] border-gray-300 dark:border-gray-600 leading-relaxed text-sm">
      {displayPhrase}
    </blockquote>
  );
}

// =============================================================================
// QUOTED TEXT COMPONENT
// =============================================================================

export interface QuotedTextProps {
  /** The text to display as quoted */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Whether to use monospace font (default: false) */
  mono?: boolean;
}

/**
 * Inline quoted text component that uses left border + indent instead of literal quote characters.
 * This makes copy/paste cleaner - users get the actual text without surrounding quotes.
 *
 * Uses 2px border (vs 3px for QuoteBox) for subtler inline styling.
 * For block-level quotes, use QuoteBox instead.
 */
export function QuotedText({ children, className, mono = false }: QuotedTextProps) {
  // Return null for empty/whitespace-only children
  if (!children || (typeof children === "string" && !children.trim())) {
    return null;
  }

  return (
    <q
      className={cn("border-l-2 border-gray-300 dark:border-gray-600 pl-1.5 ml-0.5", mono && "font-mono", className)}
      style={{ quotes: "none" }}
    >
      {children}
    </q>
  );
}

// =============================================================================
// VERIFICATION LOG SUMMARY
// =============================================================================

interface VerificationLogSummaryProps {
  status?: SearchStatus | null;
  searchAttempts: SearchAttempt[];
  expectedPage?: number;
  expectedLine?: number;
  foundPage?: number;
  foundLine?: number;
  isExpanded: boolean;
  onToggle: () => void;
  verifiedAt?: Date | string | null;
}

/**
 * Get a human-readable outcome summary for the collapsed state.
 * Shows what kind of match was found (or that nothing was found).
 */
function getOutcomeSummary(status: SearchStatus | null | undefined, searchAttempts: SearchAttempt[]): string {
  // Early return for not_found - no need to search for successful attempt
  if (!status || status === "not_found") {
    const count = getUniqueSearchAttemptCount(searchAttempts);
    return `${count} ${count === 1 ? "attempt" : "attempts"} tried`;
  }

  // Only search for successful attempt when we know something was found
  const successfulAttempt = searchAttempts.find(a => a.success);

  // For found states, describe the match type
  if (successfulAttempt?.matchedVariation) {
    switch (successfulAttempt.matchedVariation) {
      case "exact_full_phrase":
        return "Exact match";
      case "normalized_full_phrase":
        return "Normalized match";
      case "exact_anchor_text":
      case "normalized_anchor_text":
        return "Anchor text match";
      case "partial_full_phrase":
      case "partial_anchor_text":
        return "Partial match";
      case "first_word_only":
        return "First word match";
      default:
        return "Match found";
    }
  }

  // Fallback based on status
  switch (status) {
    case "found":
    case "found_phrase_missed_anchor_text":
      return "Exact match";
    case "found_anchor_text_only":
      return "Anchor text match";
    case "found_on_other_page":
    case "found_on_other_line":
      return "Found at different location";
    case "partial_text_found":
      return "Partial match";
    case "first_word_found":
      return "First word match";
    default:
      return "Match found";
  }
}

/**
 * Clickable summary footer — demoted text link for audit details.
 * Uses unified "Verification details" label across all states.
 * The parenthetical changes based on status: "(Exact match)" vs "(16 attempts)".
 */
function VerificationLogSummary({
  status,
  searchAttempts,
  isExpanded,
  onToggle,
  verifiedAt,
}: VerificationLogSummaryProps) {
  const isMiss = status === "not_found";
  const outcomeSummary = getOutcomeSummary(status, searchAttempts);

  // Format the verified date for display
  const formatted = formatCaptureDate(verifiedAt);
  const dateStr = formatted?.display ?? "";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls="verification-log-timeline"
      className="w-full px-4 py-1.5 flex items-center justify-between text-xs transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
        <svg
          className={cn("size-3 transition-transform duration-150", isExpanded && "rotate-90")}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span>Verification details</span>
        <span className="text-gray-400/70 dark:text-gray-600">({outcomeSummary})</span>
      </div>
      {dateStr && (
        <span
          className="text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2"
          title={isMiss ? `Checked ${formatted?.tooltip ?? dateStr}` : `Verified ${formatted?.tooltip ?? dateStr}`}
        >
          {dateStr}
        </span>
      )}
    </button>
  );
}

// =============================================================================
// SEARCH SUMMARY BUILDER
// =============================================================================

// =============================================================================
// AUDIT-FOCUSED SEARCH DISPLAY
// =============================================================================

interface AuditSearchDisplayProps {
  searchAttempts: SearchAttempt[];
  /** Citation's full phrase (for display) */
  fullPhrase?: string;
  /** Citation's anchor text (for display) */
  anchorText?: string;
  /** Expected page from the original citation location */
  expectedPage?: number;
  /** Expected line from the original citation location */
  expectedLine?: number;
  /** Verification status (determines display mode) */
  status?: SearchStatus | null;
  /** Full verification object (for closest match extraction) */
  verification?: Verification | null;
}

function getFirstLine(line: number | number[] | undefined): number | undefined {
  if (Array.isArray(line)) return line[0];
  return line;
}

function formatLocationLabel(page?: number, line?: number): string {
  const hasPage = page != null && page > 0;
  const hasLine = line != null && line > 0;
  if (hasPage && hasLine) return `p.${page} · l.${line}`;
  if (hasPage) return `p.${page}`;
  if (hasLine) return `l.${line}`;
  return "unknown";
}

interface AttemptTableRowProps {
  text: string;
  locationText: string;
  duplicateCount: number;
  success: boolean;
  isUnexpectedHit: boolean;
}

/** Compact row used by the attempts table for not-found and partial states. */
function AttemptTableRow({ text, locationText, duplicateCount, success, isUnexpectedHit }: AttemptTableRowProps) {
  const isTruncated = (text ?? "").length > MAX_PHRASE_DISPLAY_LENGTH;
  const showLocationMultiplicity = success && isUnexpectedHit && duplicateCount > 1;

  // success here means we successfully found a partial match, exact match does not need attempt details as the result is self evident
  return (
    <div
      className={cn(
        "py-1 px-2 text-xs font-mono border-l-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2",
        success
          ? "border-amber-400 dark:border-amber-500 text-gray-700 dark:text-gray-200"
          : "border-red-300 dark:border-red-500/60 text-gray-500 dark:text-gray-400",
      )}
    >
      <span className="font-mono text-xxs truncate min-w-0" title={isTruncated ? text : undefined}>
        {text}
      </span>
      <span
        className={cn(
          "text-[10px] whitespace-nowrap justify-self-end text-right self-center",
          isUnexpectedHit ? "font-semibold text-gray-700 dark:text-gray-200" : "text-gray-500 dark:text-gray-400",
        )}
      >
        {locationText}
        {showLocationMultiplicity ? ` · ${duplicateCount} matching locations` : ""}
      </span>
    </div>
  );
}

/**
 * "Looking for" section showing original citation text being searched.
 */
export function LookingForSection({ anchorText, fullPhrase }: { anchorText?: string; fullPhrase?: string }) {
  const hasAnchorText = anchorText && anchorText.trim().length > 0;
  const hasFullPhrase = fullPhrase && fullPhrase.trim().length > 0 && fullPhrase !== anchorText;

  if (!hasAnchorText && !hasFullPhrase) return null;

  return (
    <div>
      <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Looking for</div>
      {hasAnchorText && (
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1 border-l-2 border-gray-300 dark:border-gray-600 pl-2">
          {anchorText}
        </div>
      )}
      {hasFullPhrase && (
        <div className="text-xs text-gray-600 dark:text-gray-300 font-mono break-all bg-gray-50 dark:bg-gray-800/50 p-2 rounded border-l-2 border-gray-300 dark:border-gray-600">
          {fullPhrase}
        </div>
      )}
    </div>
  );
}

/**
 * Audit-focused search display.
 * - For exact matches ("found", "found_phrase_missed_anchor_text"): Shows only the successful match details
 * - For all other statuses (not_found, partial): Shows all search attempts to help debug
 */
function AuditSearchDisplay({
  searchAttempts,
  fullPhrase,
  anchorText,
  expectedPage,
  expectedLine,
  status,
}: AuditSearchDisplayProps) {
  const t = useTranslation();
  const groupedAttempts = useMemo(() => groupSearchAttempts(searchAttempts), [searchAttempts]);
  // Show all searches unless the status is a confirmed exact match.
  // Transient statuses (loading, pending) show partial attempts as they arrive.
  // Null/undefined status is treated as "unknown" — show all searches.
  const showAll = status == null || !SHOW_ONLY_HIT_STATUSES.has(status);
  const successfulAttempt = useMemo(
    () => groupedAttempts.find(group => group.attempt.success)?.attempt,
    [groupedAttempts],
  );

  // If no search attempts, fall back to citation data
  if (groupedAttempts.length === 0) {
    const fallbackPhrases = [fullPhrase, anchorText].filter((p): p is string => Boolean(p));
    if (fallbackPhrases.length === 0) return null;

    // Display fallback as simple list
    return (
      <div className="px-4 py-3 space-y-3 text-sm">
        <div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            Searched for
          </div>
          <div className="space-y-1">
            {fallbackPhrases.map(phrase => (
              <div key={`fallback-${phrase.slice(0, 40)}`} className="flex items-start gap-2">
                <span className="size-3 max-w-3 max-h-3 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0">
                  <MissIcon />
                </span>
                <QuotedText mono className="text-xs text-gray-700 dark:text-gray-200 break-all">
                  {phrase}
                </QuotedText>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // For exact matches: show only the successful match details
  if (!showAll && successfulAttempt) {
    const displayPhrase = truncatePhrase(successfulAttempt.searchPhrase, t);

    const methodName = getMethodDisplayName(successfulAttempt.method, t);
    const locationText = successfulAttempt.foundLocation
      ? `Page ${successfulAttempt.foundLocation.page}${successfulAttempt.foundLocation.line ? `, line ${successfulAttempt.foundLocation.line}` : ""}`
      : successfulAttempt.pageSearched != null
        ? `Page ${successfulAttempt.pageSearched}`
        : "";

    return (
      <div className="px-4 py-3 space-y-3 text-sm">
        <div>
          <div className="p-2.5 bg-gray-50 dark:bg-gray-800/40 space-y-2">
            {/* What was matched */}
            <div className="flex items-start gap-2">
              <span className="size-3.5 max-w-3.5 max-h-3.5 mt-0.5 text-green-600 dark:text-green-400 shrink-0">
                <CheckIcon />
              </span>
              <QuotedText mono className="text-xs text-gray-700 dark:text-gray-200 break-all">
                {displayPhrase}
              </QuotedText>
            </div>
            {/* Where it was found */}
            <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
              <span>{methodName}</span>
              {locationText && <span>{locationText}</span>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const attemptRows = groupedAttempts.map(group => {
    const { attempt, key, duplicateCount } = group;
    const foundPage = attempt.foundLocation?.page ?? attempt.pageSearched;
    const foundLine = attempt.foundLocation?.line ?? getFirstLine(attempt.lineSearched);
    const locationText = formatLocationLabel(foundPage, foundLine);

    const unexpectedPage =
      attempt.success &&
      expectedPage != null &&
      expectedPage > 0 &&
      foundPage != null &&
      foundPage > 0 &&
      foundPage !== expectedPage;
    const unexpectedLine =
      attempt.success &&
      expectedLine != null &&
      expectedLine > 0 &&
      foundLine != null &&
      foundLine > 0 &&
      foundLine !== expectedLine;

    return {
      key,
      text: truncatePhrase(attempt.searchPhrase, t),
      success: attempt.success,
      isUnexpectedHit: unexpectedPage || unexpectedLine,
      locationText,
      duplicateCount,
    };
  });

  const orderedRows = [...attemptRows.filter(row => !row.success), ...attemptRows.filter(row => row.success)];

  return (
    <div className="px-4 py-2 space-y-1.5 text-sm">
      {orderedRows.map(row => (
        <AttemptTableRow
          key={row.key}
          text={row.text}
          duplicateCount={row.duplicateCount}
          success={row.success}
          isUnexpectedHit={row.isUnexpectedHit}
          locationText={row.locationText}
        />
      ))}
    </div>
  );
}

// =============================================================================
// VERIFICATION LOG TIMELINE
// =============================================================================

interface VerificationLogTimelineProps {
  searchAttempts: SearchAttempt[];
  fullPhrase?: string;
  anchorText?: string;
  expectedPage?: number;
  expectedLine?: number;
  status?: SearchStatus | null;
  /** Callback to collapse the expanded details. Skipped when the user is selecting text. */
  onCollapse?: () => void;
}

/**
 * Scrollable timeline showing search attempts.
 * - For exact matches ("found", "found_phrase_missed_anchor_text"): Shows only the successful match
 * - For not_found and all partial statuses: Shows all search attempts with clear count
 *
 * Clicking the area collapses it (unless the user is selecting text).
 */
export function VerificationLogTimeline({
  searchAttempts,
  fullPhrase,
  anchorText,
  expectedPage,
  expectedLine,
  status,
  onCollapse,
}: VerificationLogTimelineProps) {
  const t = useTranslation();
  const content = (
    <AuditSearchDisplay
      searchAttempts={searchAttempts}
      fullPhrase={fullPhrase}
      anchorText={anchorText}
      expectedPage={expectedPage}
      expectedLine={expectedLine}
      status={status}
    />
  );

  if (!onCollapse) {
    return <div id="verification-log-timeline">{content}</div>;
  }

  return (
    <button
      type="button"
      id="verification-log-timeline"
      aria-label={t("aria.collapseSearchLog")}
      className="w-full p-0 m-0 border-0 bg-transparent text-left cursor-pointer"
      onClick={e => {
        // Stop propagation so parent handlers (e.g. page-expand) don't fire
        e.stopPropagation();
        // Don't collapse if the user is selecting text
        if (window.getSelection()?.isCollapsed === false) return;
        onCollapse();
      }}
    >
      {content}
    </button>
  );
}

// =============================================================================
// MAIN VERIFICATION LOG COMPONENT
// =============================================================================

/**
 * Collapsible verification log showing search attempt timeline.
 * Displays a summary header that can be clicked to expand the full log.
 */
export function VerificationLog({
  searchAttempts,
  status,
  expectedPage,
  expectedLine,
  foundPage,
  foundLine,
  isExpanded: controlledIsExpanded,
  onExpandChange,
  fullPhrase,
  anchorText,
  ambiguity,
  verifiedAt,
}: VerificationLogProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);

  // Use controlled state if provided, otherwise internal
  const isExpanded = controlledIsExpanded ?? internalIsExpanded;
  const setIsExpanded = (expanded: boolean) => {
    if (onExpandChange) {
      onExpandChange(expanded);
    } else {
      setInternalIsExpanded(expanded);
    }
  };

  // Memoize the successful attempt lookup
  const successfulAttempt = useMemo(() => searchAttempts.find(a => a.success), [searchAttempts]);

  // Don't render if no attempts
  if (!searchAttempts || searchAttempts.length === 0) {
    return null;
  }

  // Derive found location from successful attempt if not provided
  const derivedFoundPage = foundPage ?? successfulAttempt?.foundLocation?.page ?? successfulAttempt?.pageSearched;
  const derivedFoundLine = foundLine ?? successfulAttempt?.foundLocation?.line;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      {/* Ambiguity warning when multiple occurrences exist */}
      {ambiguity && <AmbiguityWarning ambiguity={ambiguity} />}
      <VerificationLogSummary
        status={status}
        searchAttempts={searchAttempts}
        expectedPage={expectedPage}
        expectedLine={expectedLine}
        foundPage={derivedFoundPage}
        foundLine={derivedFoundLine}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        verifiedAt={verifiedAt}
      />
      {isExpanded && (
        <VerificationLogTimeline
          searchAttempts={searchAttempts}
          fullPhrase={fullPhrase}
          anchorText={anchorText}
          expectedPage={expectedPage}
          expectedLine={expectedLine}
          status={status}
          onCollapse={() => setIsExpanded(false)}
        />
      )}
    </div>
  );
}

// =============================================================================
// ATTEMPTING TO VERIFY SECTION
// =============================================================================

export interface AttemptingToVerifyProps {
  /** The anchor text or anchor text being verified */
  anchorText?: string;
  /** The full phrase being searched */
  fullPhrase?: string;
}

/**
 * Section showing what citation is being verified.
 * Displays the anchor text and quote box being searched.
 */
export function AttemptingToVerify({ anchorText, fullPhrase }: AttemptingToVerifyProps) {
  const displayAnchorText = anchorText || fullPhrase?.slice(0, MAX_ANCHOR_TEXT_PREVIEW_LENGTH) || "Citation";
  const displayPhrase = fullPhrase || anchorText || "";

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium tracking-wide">
        Searching for:
      </div>
      <div className="text-[15px] font-semibold text-gray-800 dark:text-gray-100 border-l-2 border-gray-300 dark:border-gray-600 pl-2">
        {displayAnchorText}
      </div>
      {displayPhrase && displayPhrase !== displayAnchorText && <QuoteBox phrase={displayPhrase} />}
    </div>
  );
}
