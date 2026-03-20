import { type ReactNode, useMemo, useState } from "react";
import type { Citation } from "../types/citation.js";
import { isUrlCitation } from "../types/citation.js";
import type { SearchAttempt, SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { isDomainMatch } from "../utils/urlSafety.js";
import { UrlCitationComponent } from "./Citation.js";
import {
  DOT_COLORS,
  FOCUS_RING_CLASSES,
  HITBOX_EXTEND_8x14,
  TERTIARY_ACTION_BASE_CLASSES,
  TERTIARY_ACTION_HOVER_CLASSES,
  TERTIARY_ACTION_IDLE_CLASSES,
  TRUSTED_IMAGE_HOSTS,
} from "./constants.js";
import { formatCaptureDate } from "./dateUtils.js";
import { type TranslateFunction, tPlural, useLocale, useTranslation } from "./i18n.js";
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
import {
  buildSearchNarrative,
  getStatusColorScheme,
  getStatusHeaderText,
  type NarrativeRow,
  type SearchNarrative,
} from "./searchNarrative.js";
import type { IndicatorVariant, UrlFetchStatus } from "./types.js";
import { sanitizeUrl } from "./urlUtils.js";
import { cn, isImageSource } from "./utils.js";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum length for quote box phrase display */
const MAX_QUOTE_BOX_LENGTH = 150;

/** Maximum length for anchor text preview in headers */
const MAX_ANCHOR_TEXT_PREVIEW_LENGTH = 50;

/** Maximum length for URL display in popover header */
const MAX_URL_DISPLAY_LENGTH = 45;

/** Icon color classes by status - defined outside component to avoid recreation on every render */
const ICON_COLOR_CLASSES = {
  green: "text-dc-verified",
  amber: "text-dc-partial",
  red: "text-dc-destructive",
  gray: "text-dc-pending",
} as const;

const HEADER_DOWNLOAD_BUTTON_BASE_CLASSES =
  "shrink-0 size-8 flex items-center justify-center cursor-pointer text-dc-pending hover:text-dc-primary transition-[opacity,color] duration-120";
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
   * Download URL for the source file. When provided, renders a download button in the popover header.
   */
  downloadUrl?: string;
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
 * Cross-origin URLs use fetch→blob URL so the download is in-place with no
 * new-tab flash. Falls back to a plain anchor (no target="_blank") if CORS
 * blocks the fetch — Content-Disposition: attachment still downloads in-place.
 */
function triggerBackgroundDownload(url: string, filename?: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const isHappyDom = typeof navigator !== "undefined" && /HappyDOM/i.test(navigator.userAgent);

  // Anchor fallback — no target="_blank" to avoid new-tab flash.
  // Relies on Content-Disposition: attachment for in-place download.
  const anchorDownload = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    if (!isHappyDom) {
      a.click();
    }
    a.remove();
  };

  if (isHappyDom) {
    anchorDownload();
    return;
  }

  // Same-origin: iframe path (seamless, no navigation risk).
  if (isSameOrigin(url)) {
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
    return;
  }

  // Cross-origin: only take the fetch→blob path for trusted hosts (TRUSTED_IMAGE_HOSTS).
  // Fetching from arbitrary HTTPS domains is unsafe per the domain-allowlist policy in CLAUDE.md.
  // For untrusted hosts, fall back to anchor (the browser handles navigation safely).
  const isTrustedHost = TRUSTED_IMAGE_HOSTS.some(trustedHost => isDomainMatch(url, trustedHost));
  if (!isTrustedHost) {
    anchorDownload();
    return;
  }

  // Trusted cross-origin: fetch → blob URL for a seamless, no-new-tab download.
  fetch(url, { credentials: "omit" })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename || "";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Fire-and-forget: 60s is safely longer than any realistic download-start delay.
      // This plain function (not a hook) has no cleanup mechanism — intentional.
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    })
    .catch(() => {
      // CORS blocked or network error — fall back to anchor (no new tab).
      anchorDownload();
    });
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
  const t = useTranslation();
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
      <span className="w-4 h-4 shrink-0 text-dc-pending">
        <GlobeIcon />
      </span>
    );
  }

  return (
    <img
      src={effectiveFaviconUrl}
      alt={alt?.trim() || t("drawer.source")}
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
  green: "bg-dc-muted text-dc-muted-foreground border-dc-border",
  amber: "bg-dc-muted text-dc-muted-foreground border-dc-border",
  red: "bg-dc-muted text-dc-muted-foreground border-dc-border",
  gray: "bg-dc-muted text-dc-subtle-foreground border-dc-border",
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

  const label = isImage ? t("location.image") : hasPage ? t("location.page", { pageNumber }) : t("location.pageLabel");
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
          "relative inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded-dc-md border cursor-pointer",
          "transition-colors bg-dc-primary/10 text-dc-primary border-dc-primary/30 hover:bg-dc-primary/15",
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
        <span className="size-3 inline-flex items-center justify-center">
          <XIcon />
        </span>
      </button>
    );
  }

  if (!onClick) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded-dc-md border",
          colorClasses,
        )}
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
        "relative inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded-dc-md border cursor-pointer",
        TERTIARY_ACTION_BASE_CLASSES,
        TERTIARY_ACTION_IDLE_CLASSES,
        TERTIARY_ACTION_HOVER_CLASSES,
        "hover:bg-zinc-200 dark:hover:bg-zinc-700",
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
  downloadUrl,
}: SourceContextHeaderProps) {
  const t = useTranslation();
  const isUrl = isUrlCitation(citation);

  // Common page/line data (pageNumber/lineIds only exist on DocumentCitation)
  const pageNumber = verification?.document?.verifiedPageNumber ?? (isUrl ? undefined : citation.pageNumber);
  const lineIds = verification?.document?.verifiedLineIds ?? (isUrl ? undefined : citation.lineIds);
  const isImage = isImageSource(verification);
  const pageLineText = isImage ? t("location.image") : formatPageLineText(pageNumber, lineIds, t);
  const colorScheme = getStatusColorScheme(status);
  // Show page pill when there's an expand/close action. Page number is shown when available
  // but the pill also renders with a generic "Page" label for not_found citations where
  // verifiedPageNumber is null.
  const showPagePill = !!onExpand || !!onClose;
  // URL-specific data
  const url = isUrl ? citation.url || "" : "";

  const shouldShowSourceDownloadButton = !!downloadUrl;

  // Display name for document citations (never show attachmentId to users)
  const displayName = isUrl ? undefined : sourceLabel || verification?.label || t("drawer.document");

  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-dc-border"
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
            <span className="w-4 h-4 shrink-0 text-dc-pending">
              <DocumentIcon />
            </span>
            {displayName && (
              <span className="text-xs font-medium text-dc-foreground truncate max-w-[280px]">{displayName}</span>
            )}
          </>
        )}
        {shouldShowSourceDownloadButton && (
          <button
            type="button"
            aria-label={t("aria.downloadSource")}
            title={t("aria.downloadSourceName", { name: displayName ?? url })}
            className={cn(HEADER_DOWNLOAD_BUTTON_BASE_CLASSES, HEADER_DOWNLOAD_BUTTON_REVEAL_CLASSES)}
            onClick={e => {
              e.stopPropagation();
              const safeUrl = downloadUrl ? sanitizeUrl(downloadUrl) : null;
              const name = sourceLabel || displayName || url;
              const downloadName = isUrl && name && !name.endsWith(".pdf") ? `${name}.pdf` : name;
              if (safeUrl) triggerBackgroundDownload(safeUrl, downloadName);
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
          <span className="text-[10px] text-dc-subtle-foreground shrink-0 uppercase tracking-wide">{pageLineText}</span>
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
  t: TranslateFunction,
): string | null {
  if (!pageNumber || pageNumber <= 0) return null;
  // Don't show line numbers in the header - they can be unreliable due to column layouts
  // Line differences are shown separately in the verification log when relevant
  return t("location.page", { pageNumber });
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
  const t = useTranslation();
  // Pages are 1-indexed for display; page 0 indicates unset/invalid
  const hasExpected = expectedPage != null && expectedPage > 0;
  const hasFound = foundPage != null && foundPage > 0;

  // Image sources: show "Image" instead of page numbers
  if (isImage && (hasExpected || hasFound)) {
    return <span className="text-xs text-dc-subtle-foreground">{t("location.image")}</span>;
  }

  const locationDiffers = hasExpected && hasFound && expectedPage !== foundPage;

  // Show arrow format when location differs (e.g., "p.5 → 7")
  if (locationDiffers) {
    return (
      <span className="text-xs text-dc-subtle-foreground flex items-center gap-1">
        <span className="text-dc-pending">{t("location.page", { pageNumber: expectedPage })}</span>
        <span className="text-dc-pending">→</span>
        <span className="text-dc-foreground">{foundPage}</span>
      </span>
    );
  }

  // Show found page or expected page
  const pageToShow = hasFound ? foundPage : expectedPage;
  if (pageToShow != null && pageToShow > 0) {
    return <span className="text-xs text-dc-subtle-foreground">{t("location.page", { pageNumber: pageToShow })}</span>;
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
    <div role="status" aria-live="polite" className="px-4 py-2 bg-dc-partial-bg border-b border-dc-partial-border">
      <div className="flex items-start gap-2">
        <svg
          className="size-4 text-dc-partial shrink-0 mt-0.5"
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
          <span className="font-medium">
            {t("ambiguity.found", { totalOccurrences: ambiguity.totalOccurrences.toLocaleString() })}
          </span>
          {ambiguity.occurrencesOnExpectedPage > 0 && (
            <span className="text-amber-700 dark:text-amber-300">
              {" "}
              {t("ambiguity.onExpectedPage", {
                occurrencesOnExpectedPage: ambiguity.occurrencesOnExpectedPage.toLocaleString(),
              })}
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
  const t = useTranslation();
  const colorScheme = getStatusColorScheme(status);
  const headerText = getStatusHeaderText(status, t);

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
        {displayText && <span className="font-medium truncate text-dc-foreground">{displayText}</span>}
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
    <blockquote className="text-dc-muted-foreground bg-dc-muted p-3 border-l-[3px] border-dc-border leading-relaxed text-sm">
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
      className={cn("border-l-2 border-dc-border pl-1.5 ml-0.5", mono && "font-mono", className)}
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
  narrative: SearchNarrative;
  status?: SearchStatus | null;
  isExpanded: boolean;
  onToggle: () => void;
  verifiedAt?: Date | string | null;
}

/**
 * Clickable summary footer — demoted text link for audit details.
 * Uses unified "Verification details" label across all states.
 * The parenthetical changes based on status: "(Exact match)" vs "(16 attempts)".
 */
function VerificationLogSummary({ narrative, status, isExpanded, onToggle, verifiedAt }: VerificationLogSummaryProps) {
  const t = useTranslation();
  const locale = useLocale();
  const isMiss = status === "not_found";
  const outcomeSummary = narrative.outcomeSummary;

  // Format the verified date for display
  const formatted = formatCaptureDate(verifiedAt, { locale });
  const dateStr = formatted?.display ?? "";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls="verification-log-timeline"
      className="w-full px-4 py-1.5 flex items-center justify-between text-xs transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-1.5 text-dc-pending group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
        <svg
          className={cn("size-3 transition-transform duration-120", isExpanded && "rotate-90")}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span>{t("verification.details")}</span>
        <span className="text-dc-muted-foreground/70">({outcomeSummary})</span>
      </div>
      {dateStr && (
        <span
          className="text-dc-muted-foreground flex-shrink-0 ml-2"
          title={
            isMiss
              ? t("verification.checkedAt", { date: formatted?.tooltip ?? dateStr })
              : t("verification.verifiedAt", { date: formatted?.tooltip ?? dateStr })
          }
        >
          {dateStr}
        </span>
      )}
    </button>
  );
}

// =============================================================================
// AUDIT-FOCUSED SEARCH DISPLAY
// =============================================================================

/** Maximum length for phrase display — used for tooltip truncation detection. */
const MAX_PHRASE_DISPLAY_LENGTH = 60;

/**
 * "Looking for" section showing original citation text being searched.
 */
export function LookingForSection({ anchorText, fullPhrase }: { anchorText?: string; fullPhrase?: string }) {
  const t = useTranslation();
  const hasAnchorText = anchorText && anchorText.trim().length > 0;
  const hasFullPhrase = fullPhrase && fullPhrase.trim().length > 0 && fullPhrase !== anchorText;

  if (!hasAnchorText && !hasFullPhrase) return null;

  return (
    <div>
      <div className="text-[11px] text-dc-subtle-foreground uppercase tracking-wide mb-1.5">
        {t("verification.lookingFor")}
      </div>
      {hasAnchorText && (
        <div className="text-sm font-medium text-dc-foreground mb-1 border-l-2 border-dc-border pl-2">{anchorText}</div>
      )}
      {hasFullPhrase && (
        <div className="text-xs text-dc-muted-foreground font-mono break-all bg-dc-muted p-2 rounded border-l-2 border-dc-border">
          {fullPhrase}
        </div>
      )}
    </div>
  );
}

/** Renders a single NarrativeRow as a compact timeline entry. */
function NarrativeRowRenderer({ row }: { row: NarrativeRow }) {
  const t = useTranslation();
  const isTruncated = row.phraseFull.length > MAX_PHRASE_DISPLAY_LENGTH;

  switch (row.kind) {
    case "success": {
      // Card layout for the single "hit only" view (showAllRows=false)
      if (row.duplicateCount === 1 && !row.isUnexpectedHit && row.methodLabel) {
        return (
          <div className="px-4 py-3 space-y-3 text-sm">
            <div>
              <div className="p-2.5 bg-dc-muted space-y-2">
                <div className="flex items-start gap-2">
                  <span className="size-3.5 max-w-3.5 max-h-3.5 mt-0.5 text-dc-verified shrink-0">
                    <CheckIcon />
                  </span>
                  <QuotedText mono className="text-xs text-dc-foreground break-all">
                    {row.phraseDisplay}
                  </QuotedText>
                </div>
                <div className="flex items-center justify-between text-[11px] text-dc-subtle-foreground">
                  <span>{row.methodLabel}</span>
                  {row.locationLabel && <span>{row.locationLabel}</span>}
                </div>
              </div>
            </div>
          </div>
        );
      }
      // Compact row for "show all" mode — amber border
      const showLocationMultiplicity = row.isUnexpectedHit && row.duplicateCount > 1;
      const locationMultiplicityLabel = showLocationMultiplicity
        ? tPlural(t, "location.matchingLocations", row.duplicateCount, { count: row.duplicateCount })
        : null;
      return (
        <div className="py-1 px-2 text-xs font-mono border-l-2 border-amber-400 dark:border-amber-500 text-dc-foreground grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span
            className="font-mono text-xxs truncate min-w-0"
            title={row.note || (isTruncated ? row.phraseFull : undefined)}
          >
            {row.phraseDisplay}
          </span>
          <span
            className={cn(
              "text-[10px] whitespace-nowrap justify-self-end text-right self-center",
              row.isUnexpectedHit ? "font-semibold text-dc-foreground" : "text-dc-subtle-foreground",
            )}
          >
            {row.locationLabel}
            {locationMultiplicityLabel ? ` · ${locationMultiplicityLabel}` : ""}
          </span>
        </div>
      );
    }
    case "failure":
      return (
        <div className="py-1 px-2 text-xs font-mono border-l-2 border-dc-destructive/40 text-dc-subtle-foreground grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span
            className="font-mono text-xxs truncate min-w-0"
            title={row.note || (isTruncated ? row.phraseFull : undefined)}
          >
            {row.phraseDisplay}
          </span>
          <span className="text-[10px] whitespace-nowrap justify-self-end text-right self-center text-dc-subtle-foreground">
            {row.locationLabel}
          </span>
        </div>
      );
    case "collapsed_failure":
      return (
        <div className="py-1 px-2 text-xs font-mono border-l-2 border-dc-destructive/40 text-dc-subtle-foreground grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="font-mono text-xxs truncate min-w-0" title={isTruncated ? row.phraseFull : undefined}>
            {row.phraseDisplay}
          </span>
          <span className="text-[10px] whitespace-nowrap justify-self-end text-right self-center text-dc-subtle-foreground">
            {row.locationLabel}
          </span>
        </div>
      );
  }
}

/**
 * Renders pre-computed narrative rows as the audit timeline.
 * Replaces AuditSearchDisplay — all interpretation logic is in buildSearchNarrative().
 */
function NarrativeRowsDisplay({
  narrative,
  fullPhrase,
  anchorText,
}: {
  narrative: SearchNarrative;
  fullPhrase?: string;
  anchorText?: string;
}) {
  const t = useTranslation();

  // If no rows, fall back to citation data
  if (narrative.rows.length === 0) {
    const fallbackPhrases = [fullPhrase, anchorText].filter((p): p is string => Boolean(p));
    if (fallbackPhrases.length === 0) return null;

    return (
      <div className="px-4 py-3 space-y-3 text-sm">
        <div>
          <div className="text-[11px] text-dc-subtle-foreground uppercase tracking-wide mb-1.5">
            {t("verification.searchedFor")}
          </div>
          <div className="space-y-1">
            {fallbackPhrases.map(phrase => (
              <div key={`fallback-${phrase.slice(0, 40)}`} className="flex items-start gap-2">
                <span className="size-3 max-w-3 max-h-3 mt-0.5 text-dc-pending shrink-0">
                  <MissIcon />
                </span>
                <QuotedText mono className="text-xs text-dc-foreground break-all">
                  {phrase}
                </QuotedText>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Render all rows — NarrativeRowRenderer handles card vs compact layout per row.kind
  return (
    <div className={narrative.showAllRows ? "px-4 py-2 space-y-1.5 text-sm" : undefined}>
      {narrative.rows.map(row => (
        <NarrativeRowRenderer key={row.key} row={row} />
      ))}
    </div>
  );
}

// =============================================================================
// VERIFICATION LOG TIMELINE
// =============================================================================

interface VerificationLogTimelineProps {
  narrative: SearchNarrative;
  fullPhrase?: string;
  anchorText?: string;
  /** Callback to collapse the expanded details. Skipped when the user is selecting text. */
  onCollapse?: () => void;
}

/**
 * Scrollable timeline showing search attempts.
 * Renders pre-computed NarrativeRow[] — no interpretation logic.
 *
 * Clicking the area collapses it (unless the user is selecting text).
 */
export function VerificationLogTimeline({
  narrative,
  fullPhrase,
  anchorText,
  onCollapse,
}: VerificationLogTimelineProps) {
  const t = useTranslation();
  const content = <NarrativeRowsDisplay narrative={narrative} fullPhrase={fullPhrase} anchorText={anchorText} />;

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
 *
 * Internally builds a SearchNarrative (via buildSearchNarrative) once per render
 * and passes it to child components — all interpretation logic is centralized.
 */
export function VerificationLog({
  searchAttempts,
  status,
  expectedPage,
  expectedLine,
  foundPage: _foundPage, // kept for API compat; narrative derives from attempt.foundLocation
  foundLine: _foundLine, // kept for API compat; narrative derives from attempt.foundLocation
  isExpanded: controlledIsExpanded,
  onExpandChange,
  fullPhrase,
  anchorText,
  ambiguity,
  verifiedAt,
}: VerificationLogProps) {
  const t = useTranslation();
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

  // Build the narrative once — all interpretation logic is centralized here
  const narrative = useMemo(
    () => buildSearchNarrative(searchAttempts, status, expectedPage, expectedLine, t),
    [searchAttempts, status, expectedPage, expectedLine, t],
  );

  // Don't render if no attempts
  if (!searchAttempts || searchAttempts.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-dc-border">
      {/* Ambiguity warning when multiple occurrences exist */}
      {ambiguity && <AmbiguityWarning ambiguity={ambiguity} />}
      <VerificationLogSummary
        narrative={narrative}
        status={status}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        verifiedAt={verifiedAt}
      />
      {isExpanded && (
        <VerificationLogTimeline
          narrative={narrative}
          fullPhrase={fullPhrase}
          anchorText={anchorText}
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
  const t = useTranslation();
  const displayAnchorText = anchorText || fullPhrase?.slice(0, MAX_ANCHOR_TEXT_PREVIEW_LENGTH) || t("aria.citation");
  const displayPhrase = fullPhrase || anchorText || "";

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="text-[10px] text-dc-subtle-foreground uppercase font-medium tracking-wide">
        {t("verification.lookingFor")}
      </div>
      <div className="text-[15px] font-semibold text-dc-foreground border-l-2 border-dc-border pl-2">
        {displayAnchorText}
      </div>
      {displayPhrase && displayPhrase !== displayAnchorText && <QuoteBox phrase={displayPhrase} />}
    </div>
  );
}
