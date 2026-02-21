import React, { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// React 19.2+ Activity component for prefetching - falls back to Fragment if unavailable
const Activity =
  (
    React as {
      Activity?: React.ComponentType<{
        mode: "visible" | "hidden";
        children: React.ReactNode;
      }>;
    }
  ).Activity ?? (({ children }: { mode: "visible" | "hidden"; children: React.ReactNode }) => <>{children}</>);

import type { DeepTextItem, ScreenBox } from "../types/boxes.js";
import type { CitationStatus } from "../types/citation.js";
import type { MatchedVariation, SearchAttempt, SearchStatus } from "../types/search.js";
import type { UrlAccessStatus, Verification, VerificationPage } from "../types/verification.js";
import { CitationAnnotationOverlay } from "./CitationAnnotationOverlay.js";
import { useCitationOverlay } from "./CitationOverlayContext.js";
import { computeKeyholeOffset } from "./computeKeyholeOffset.js";
import {
  buildKeyholeMaskImage,
  DOT_COLORS,
  DOT_INDICATOR_SIZE_STYLE,
  EASE_COLLAPSE,
  EASE_EXPAND,
  EVIDENCE_TRAY_BORDER_DASHED,
  EVIDENCE_TRAY_BORDER_SOLID,
  EXPANDED_ZOOM_MAX,
  EXPANDED_ZOOM_MIN,
  EXPANDED_ZOOM_STEP,
  INDICATOR_SIZE_STYLE,
  isValidProofImageSrc,
  KEYHOLE_FADE_WIDTH,
  KEYHOLE_SKIP_THRESHOLD,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  KEYHOLE_STRIP_HEIGHT_VAR,
  MISS_TRAY_THUMBNAIL_HEIGHT,
  MISS_WAVY_UNDERLINE_STYLE,
  PARTIAL_COLOR_STYLE,
  PENDING_COLOR_STYLE,
  POPOVER_CONTAINER_BASE_CLASSES,
  POPOVER_MORPH_COLLAPSE_MS,
  POPOVER_MORPH_EXPAND_MS,
  POPOVER_WIDTH_DEFAULT,
  POPOVER_WIDTH_VAR,
  SPINNER_TIMEOUT_MS,
  TOUCH_CLICK_DEBOUNCE_MS,
  VERIFIED_COLOR_STYLE,
} from "./constants.js";
import { formatCaptureDate } from "./dateUtils.js";
import { HighlightedPhrase } from "./HighlightedPhrase.js";
import { useDragToPan } from "./hooks/useDragToPan.js";
import { CheckIcon, SpinnerIcon, WarningIcon, XIcon, ZoomInIcon, ZoomOutIcon } from "./icons.js";
import { PopoverContent } from "./Popover.js";
import { Popover, PopoverTrigger } from "./PopoverPrimitives.js";
import { StatusIndicatorWrapper } from "./StatusIndicatorWrapper.js";
import { buildSearchSummary } from "./searchSummaryUtils.js";
import type {
  BaseCitationProps,
  CitationBehaviorActions,
  CitationBehaviorConfig,
  CitationBehaviorContext,
  CitationContent,
  CitationEventHandlers,
  CitationInteractionMode,
  CitationRenderProps,
  CitationVariant,
  IndicatorVariant,
  UrlFetchStatus,
} from "./types.js";
import { isValidProofUrl } from "./urlUtils.js";
import { cn, generateCitationInstanceId, generateCitationKey, isUrlCitation } from "./utils.js";
import { SourceContextHeader, StatusHeader, VerificationLogTimeline } from "./VerificationLog.js";

// Re-export types for convenience
export type {
  CitationContent,
  CitationInteractionMode,
  CitationVariant,
  IndicatorVariant,
} from "./types.js";

/**
 * Module-level handler for hiding broken images.
 * Performance fix: avoids creating new function references on every render.
 */
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.display = "none";
};

/** Tracks which deprecation warnings have already been emitted (dev-mode only). */
const deprecationWarned = new Set<string>();

// ---------- Body scroll lock (ref-counted) ----------
// Multiple CitationComponent instances may open simultaneously (hover overlap).
// A simple capture-and-restore pattern breaks when locks stack. Instead we
// ref-count: the first lock captures the original values, the last unlock
// restores them. This prevents leaving the page permanently scroll-locked.
let scrollLockCount = 0;
let scrollLockOriginalOverflow = "";
let scrollLockOriginalPaddingRight = "";

function acquireScrollLock() {
  if (scrollLockCount === 0) {
    scrollLockOriginalOverflow = document.body.style.overflow;
    scrollLockOriginalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  scrollLockCount++;
}

function releaseScrollLock() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = scrollLockOriginalOverflow;
    document.body.style.paddingRight = scrollLockOriginalPaddingRight;
  }
}

/** Popover container width. Customizable via CSS custom property `--dc-popover-width`. */
const POPOVER_WIDTH = `var(${POPOVER_WIDTH_VAR}, ${POPOVER_WIDTH_DEFAULT})`;

/** Extra px beyond image natural width for the expanded popover shell (mx-3 margins + borders). */
const EXPANDED_IMAGE_SHELL_PX = 32;

/** Tolerance factor for coordinate scaling sanity checks (5% overflow for rounding errors) */
const SCALING_TOLERANCE = 1.05;

// =============================================================================
// TOUCH DEVICE DETECTION
// =============================================================================

/**
 * Detects if the device has touch capability.
 * Uses useState + useEffect for React 17+ compatibility.
 *
 * This is used to auto-detect mobile/touch devices so the component can
 * show the popover on first tap rather than immediately opening the image overlay.
 *
 * Detection uses pointer: coarse media query as primary method, which specifically
 * identifies devices where the PRIMARY input is coarse (touch), avoiding false
 * positives on Windows laptops with touchscreens but mouse as primary input.
 */
function getIsTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  // Primary check: pointer: coarse media query
  // This specifically checks if the PRIMARY pointing device is coarse (touch)
  // Windows laptops with touchscreens typically report (pointer: fine) because
  // the mouse/trackpad is the primary input device
  const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return hasCoarsePointer;
}

function useIsTouchDevice(): boolean {
  // Initialize with current value (SSR-safe: defaults to false on server)
  const [isTouchDevice, setIsTouchDevice] = useState(() => getIsTouchDevice());

  useEffect(() => {
    // Listen for changes in pointer capability (e.g., tablet mode changes)
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(pointer: coarse)");
      const handleChange = () => setIsTouchDevice(getIsTouchDevice());

      // Use addEventListener with 'change' event (modern API)
      mediaQuery.addEventListener?.("change", handleChange);
      return () => mediaQuery.removeEventListener?.("change", handleChange);
    }
  }, []);

  return isTouchDevice;
}

// =============================================================================
// ERROR BOUNDARY
// =============================================================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary for catching and displaying rendering errors in citation components.
 * Prevents the entire app from crashing if citation rendering fails.
 */
class CitationErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[DeepCitation] Citation component error:", error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      // Default fallback: minimal error indicator
      return (
        <span
          className="inline-flex items-center text-red-500 dark:text-red-400"
          title={`Citation error: ${this.state.error?.message || "Unknown error"}`}
        >
          <WarningIcon className="size-3" />
        </span>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/** Variants that handle their own hover styling (don't need parent hover) */
const VARIANTS_WITH_OWN_HOVER = new Set<CitationVariant>(["chip", "badge", "linter", "superscript"]);

/**
 * Get status-aware hover classes for contained hover styling.
 * Used by chip, superscript, and other variants that need hover contained within their bounds.
 *
 * @param isVerified - Whether the citation is verified
 * @param isPartialMatch - Whether it's a partial match
 * @param isMiss - Whether it's not found
 * @param shouldShowSpinner - Whether to show loading spinner
 * @param opacity - Opacity level for hover backgrounds:
 *   - 15 (default): Used for contained variants (chip, superscript) where hover is
 *     applied directly to the element. Higher opacity provides better visual feedback
 *     since the element itself is the hover target.
 *   - 10: Used for the outer trigger wrapper on variants without contained hover.
 *     Lower opacity is more subtle since the wrapper may extend beyond the visual element.
 * @returns Array of Tailwind class strings for hover states
 */
function getStatusHoverClasses(
  isVerified: boolean,
  isPartialMatch: boolean,
  isMiss: boolean,
  shouldShowSpinner: boolean,
  opacity: 10 | 15 = 15,
): (string | false)[] {
  const opacitySuffix = opacity === 10 ? "/10" : "/15";
  return [
    isVerified &&
      !isPartialMatch &&
      !shouldShowSpinner &&
      `hover:bg-green-600${opacitySuffix} dark:hover:bg-green-500${opacitySuffix}`,
    isPartialMatch &&
      !shouldShowSpinner &&
      `hover:bg-amber-500${opacitySuffix} dark:hover:bg-amber-500${opacitySuffix}`,
    isMiss && !shouldShowSpinner && `hover:bg-red-500${opacitySuffix} dark:hover:bg-red-400${opacitySuffix}`,
    (shouldShowSpinner || (!isVerified && !isMiss && !isPartialMatch)) && "hover:bg-gray-200 dark:hover:bg-gray-700",
  ];
}

/**
 * Get the default content type based on variant.
 */
function getDefaultContent(variant: CitationVariant): CitationContent {
  switch (variant) {
    case "chip":
    case "text":
    case "brackets":
    case "linter":
      return "anchorText";
    case "badge":
      return "source";
    default:
      return "number";
  }
}

/**
 * Strip leading/trailing brackets from text.
 * Handles cases where LLM output includes brackets in anchorText.
 */
function stripBrackets(text: string): string {
  return text.replace(/^\[+\s*/, "").replace(/\s*\]+$/, "");
}

/**
 * Get display text based on content type and citation data.
 * Returns "1" as fallback if no citation number is available.
 */
function getDisplayText(
  citation: BaseCitationProps["citation"],
  content: CitationContent,
  fallbackDisplay?: string | null,
): string {
  if (content === "indicator") {
    return "";
  }

  if (content === "anchorText") {
    const raw = citation.anchorText?.toString() || citation.citationNumber?.toString() || fallbackDisplay || "1";
    return stripBrackets(raw);
  }

  if (content === "source") {
    // Source content: show siteName or domain (URL citations only)
    if (isUrlCitation(citation)) {
      return citation.siteName || citation.domain || citation.anchorText?.toString() || "Source";
    }
    return citation.anchorText?.toString() || "Source";
  }

  // content === "number"
  return citation.citationNumber?.toString() || "1";
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Props for the CitationComponent.
 *
 * ## Behavior
 *
 * Default interaction pattern:
 * - **Hover**: Shows popover with verification image/details
 * - **Click**: Opens full-size image overlay (zoom)
 * - **Escape / Click outside / Click overlay**: Closes image overlay
 *
 * Custom behavior:
 * - Use `behaviorConfig.onClick` to replace the default click behavior
 * - Use `eventHandlers.onClick` to add side effects (disables default)
 *
 * @example Default usage
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   verification={verification}
 * />
 * ```
 *
 * @example Custom click behavior
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   verification={verification}
 *   behaviorConfig={{
 *     onClick: (context) => {
 *       // Custom action
 *       console.log('Clicked:', context.citationKey);
 *       return { setImageExpanded: true };
 *     }
 *   }}
 * />
 * ```
 */
export interface CitationComponentProps extends BaseCitationProps {
  /** Verification result from the DeepCitation API */
  verification?: Verification | null;
  /**
   * Explicitly show loading spinner. When true, displays spinner regardless
   * of verification status. Use this when verification is in-flight.
   */
  isLoading?: boolean;
  /**
   * Visual style variant for the citation.
   * - `linter`: Inline text with semantic underlines (default)
   * - `chip`: Pill/badge style with neutral gray background
   * - `brackets`: [text✓] with square brackets
   * - `text`: Plain text, inherits parent styling
   * - `superscript`: Small raised text like footnotes¹
   * - `badge`: ChatGPT-style source chip with favicon + count
   */
  variant?: CitationVariant;
  /**
   * What content to display in the citation.
   * - `anchorText`: Descriptive text (e.g., "Revenue Growth")
   * - `number`: Citation number (e.g., "1", "2", "3")
   * - `indicator`: Only the status icon, no text
   * - `source`: Source name (e.g., "Wikipedia")
   *
   * Defaults based on variant:
   * - `linter` → `anchorText`
   * - `chip` → `anchorText`
   * - `brackets` → `anchorText`
   * - `text` → `anchorText`
   * - `superscript` → `number`
   * - `badge` → `source`
   */
  content?: CitationContent;
  /**
   * @deprecated The interactionMode prop has been removed. The component now always uses
   * lazy mode behavior: click toggles popover, second click toggles search details.
   * This prop is ignored for backwards compatibility.
   */
  interactionMode?: CitationInteractionMode;
  /** Event handlers for citation interactions */
  eventHandlers?: CitationEventHandlers;
  /**
   * Configuration for customizing default click/hover behaviors.
   * Providing onClick REPLACES the default click behavior.
   */
  behaviorConfig?: CitationBehaviorConfig;
  /** Enable mobile touch handlers */
  isMobile?: boolean;
  /** Custom render function for the status indicator */
  renderIndicator?: (status: CitationStatus) => React.ReactNode;
  /** Custom render function for entire citation content */
  renderContent?: (props: CitationRenderProps) => React.ReactNode;
  /** Position of popover. Use "hidden" to disable. */
  popoverPosition?: "top" | "bottom" | "hidden";
  /** Custom render function for popover content */
  renderPopoverContent?: (props: {
    citation: BaseCitationProps["citation"];
    verification: Verification | null;
    status: CitationStatus;
  }) => React.ReactNode;
  /**
   * Number of additional citations grouped with this one (for source variant).
   * Shows as "+N" suffix (e.g., "Wikipedia +2")
   */
  additionalCount?: number;
  /**
   * Favicon URL to display (for source variant).
   * Falls back to citation.faviconUrl if not provided.
   */
  faviconUrl?: string;
  /**
   * Whether to show the status indicator (checkmark, warning, spinner).
   * Defaults to true. Set to false to hide the indicator.
   */
  showIndicator?: boolean;
  /**
   * Visual style for status indicators.
   * - `"icon"`: Checkmarks, spinner, X icons (default)
   * - `"dot"`: Subtle colored dots (like GitHub status dots / shadcn badge dots)
   * @default "icon"
   */
  indicatorVariant?: IndicatorVariant;
}

function getStatusLabel(status: CitationStatus): string {
  if (status.isVerified && !status.isPartialMatch) return "Verified";
  if (status.isPartialMatch) return "Partial Match";
  if (status.isMiss) return "Not Found";
  if (status.isPending) return "Verifying...";
  return "";
}

// =============================================================================
// TRUST LEVEL HELPERS
// =============================================================================

/**
 * Get the trust level from a MatchedVariation.
 * Trust levels determine indicator colors:
 * - high: Green checkmark (exact or normalized full phrase)
 * - medium: Green checkmark (anchorText matches)
 * - low: Amber checkmark (partial matches)
 */
function getTrustLevel(matchedVariation?: MatchedVariation): "high" | "medium" | "low" {
  if (!matchedVariation) return "medium";
  switch (matchedVariation) {
    case "exact_full_phrase":
    case "normalized_full_phrase":
      return "high";
    case "exact_anchor_text":
    case "normalized_anchor_text":
      return "medium";
    case "partial_full_phrase":
    case "partial_anchor_text":
    case "first_word_only":
      return "low";
    default:
      return "medium";
  }
}

/**
 * Check if a match has low trust (should show amber indicator).
 */
function isLowTrustMatch(matchedVariation?: MatchedVariation): boolean {
  return getTrustLevel(matchedVariation) === "low";
}

/**
 * Derive citation status from a Verification object.
 * The status comes from verification.status.
 *
 * Status classification:
 * - GREEN (isVerified only): Full phrase found at expected location
 *   - "found": Exact match
 *   - "found_phrase_missed_anchor_text": Full phrase found, anchor text highlighting failed
 *
 * - AMBER (isVerified + isPartialMatch): Something found but not ideal
 *   - "found_anchor_text_only": Only anchor text found, full phrase not matched
 *   - "found_on_other_page": Found but on different page than expected
 *   - "found_on_other_line": Found but on different line than expected
 *   - "partial_text_found": Only part of the text was found
 *   - "first_word_found": Only the first word matched (lowest confidence)
 *   - Low-trust matches from matchedVariation also show amber
 *
 * - RED (isMiss): Not found
 *   - "not_found": Text not found in document
 *
 * Note: isPending is only true when status is explicitly "pending" or "loading".
 * Use the isLoading prop to show spinner when verification is in-flight.
 */
function getStatusFromVerification(verification: Verification | null | undefined): CitationStatus {
  const status = verification?.status;

  // No verification or no status = no status flags set
  // (use isLoading prop to explicitly show loading state)
  if (!verification || !status) {
    return {
      isVerified: false,
      isMiss: false,
      isPartialMatch: false,
      isPending: false,
    };
  }

  const isMiss = status === "not_found";
  const isPending = status === "pending" || status === "loading";

  // Check if any successful search attempt has low trust
  const hasLowTrustMatch =
    verification.searchAttempts?.some(a => a.success && isLowTrustMatch(a.matchedVariation)) ?? false;

  // Partial matches show amber indicator - something found but not ideal
  const isPartialMatch =
    status === "found_anchor_text_only" || // Only anchor text found, not full phrase
    status === "found_on_other_page" ||
    status === "found_on_other_line" ||
    status === "partial_text_found" ||
    status === "first_word_found" ||
    hasLowTrustMatch; // Low-trust matches also show as partial (amber)

  // Verified = we found something (either exact or partial)
  const isVerified =
    status === "found" ||
    status === "found_phrase_missed_anchor_text" || // Full phrase found, just missed anchor text highlight
    isPartialMatch;

  return { isVerified, isMiss, isPartialMatch, isPending };
}

// =============================================================================
// INDICATOR COMPONENTS
// =============================================================================
//
// Status indicators show the verification state visually:
//
// | Status        | Indicator          | Color  | searchState.status values                    |
// |---------------|--------------------| -------|----------------------------------------------|
// | Pending       | Spinner            | Gray   | "pending", "loading", null/undefined         |
// | Verified      | Checkmark (✓)      | Green  | "found", "found_anchor_text_only", etc.         |
// | Partial Match | Checkmark (✓)      | Amber  | "found_on_other_page", "partial_text_found"  |
// | Not Found     | X icon (✕)         | Red    | "not_found"                                  |
//
// Use `renderIndicator` prop to customize. Use `variant="indicator"` to show only the icon.
// =============================================================================

/** Verified indicator - green checkmark for exact matches (subscript-positioned)
 * Vertical offset (top-[0.1em]) changed from 0.15em to better align with the larger 0.85em icon size.
 * Uses [text-decoration:none] to prevent inheriting line-through from parent.
 * Dynamic sizing via em units for font-proportional scaling.
 */
const VerifiedIndicator = () => (
  <span
    className="inline-flex relative ml-0.5 top-[0.1em] [text-decoration:none] animate-in fade-in-0 zoom-in-75 duration-200"
    style={{ ...INDICATOR_SIZE_STYLE, ...VERIFIED_COLOR_STYLE }}
    data-dc-indicator="verified"
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
);

/** Partial match indicator - amber checkmark for partial/relocated matches (subscript-positioned)
 * Color customizable via `--dc-partial-color` CSS custom property.
 * Uses [text-decoration:none] to prevent inheriting line-through from parent.
 * Dynamic sizing via em units for font-proportional scaling.
 */
const PartialIndicator = () => (
  <span
    className="inline-flex relative ml-0.5 top-[0.1em] [text-decoration:none] animate-in fade-in-0 zoom-in-75 duration-200"
    style={{ ...INDICATOR_SIZE_STYLE, ...PARTIAL_COLOR_STYLE }}
    data-dc-indicator="partial"
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
);

/** Miss indicator - red X for not found (centered, not subscript)
 * Color customizable via `--dc-error-color` CSS custom property.
 * Uses simple XIcon for better visibility at all sizes.
 * The circle in XCircleIcon becomes hard to see at small font sizes.
 * Centered vertically (not subscript) to make the "not found" status more prominent.
 * aria-hidden="true" because parent component already conveys verification status.
 * Uses [text-decoration:none] to prevent inheriting line-through from parent.
 * Dynamic sizing via em units for font-proportional scaling.
 */
const MissIndicator = () => (
  <StatusIndicatorWrapper className="relative top-[0.1em] [text-decoration:none]" dataIndicator="error">
    <XIcon />
  </StatusIndicatorWrapper>
);

// =============================================================================
// DOT INDICATOR COMPONENT (subtle colored dot, like GitHub/shadcn status dots)
// =============================================================================
// Smaller than icon indicators (ml-0.5 vs ml-1) because the dots are roughly
// half the size and need less visual separation from adjacent text.
// DOT_COLORS is imported from ./constants.js for consistency across components.

/** Unified dot indicator — color + optional pulse animation. */
const DotIndicator = ({
  color,
  pulse = false,
  label,
}: {
  color: keyof typeof DOT_COLORS;
  pulse?: boolean;
  label: string;
}) => (
  <span
    className={cn(
      "inline-block ml-1 rounded-full [text-decoration:none] [vertical-align:0.1em]",
      DOT_COLORS[color],
      pulse && "animate-pulse",
    )}
    style={DOT_INDICATOR_SIZE_STYLE}
    data-dc-indicator={
      color === "red" ? "error" : color === "gray" ? "pending" : color === "amber" ? "partial" : "verified"
    }
    role="img"
    aria-label={label}
  />
);

const VerifiedDot = () => <DotIndicator color="green" label="Verified" />;
const PartialDot = () => <DotIndicator color="amber" label="Partial match" />;
const PendingDot = () => <DotIndicator color="gray" pulse label="Verifying" />;
const MissDot = () => <DotIndicator color="red" label="Not found" />;

// =============================================================================
// SPINNER STAGE TYPE (used by CitationStatusIndicator and parent component)
// =============================================================================

type SpinnerStage = "active" | "slow" | "stale";

// =============================================================================
// CITATION STATUS INDICATOR (extracted from inline renderStatusIndicator)
// =============================================================================

interface CitationStatusIndicatorProps {
  renderIndicator?: (status: CitationStatus) => React.ReactNode;
  status: CitationStatus;
  showIndicator: boolean;
  indicatorVariant: IndicatorVariant;
  shouldShowSpinner: boolean;
  isVerified: boolean;
  isPartialMatch: boolean;
  isMiss: boolean;
  spinnerStage: SpinnerStage;
}

/**
 * Renders the appropriate status indicator based on citation verification state.
 * Renders in priority order:
 * 1. Custom renderIndicator (if provided)
 * 2. Spinner (for pending/loading states)
 * 3. Verified checkmark (green)
 * 4. Partial match checkmark (amber)
 * 5. Miss X icon (red)
 */
const CitationStatusIndicator = ({
  renderIndicator,
  status,
  showIndicator,
  indicatorVariant,
  shouldShowSpinner,
  isVerified,
  isPartialMatch,
  isMiss,
  spinnerStage,
}: CitationStatusIndicatorProps): React.ReactNode => {
  if (renderIndicator) return renderIndicator(status);
  if (!showIndicator) return null;

  if (indicatorVariant === "dot") {
    if (shouldShowSpinner) return <PendingDot />;
    if (isVerified && !isPartialMatch) return <VerifiedDot />;
    if (isPartialMatch) return <PartialDot />;
    if (isMiss) return <MissDot />;
    return null;
  }

  // Default: icon variant — 3-stage spinner
  if (shouldShowSpinner) {
    return (
      <span
        className={cn(
          "inline-flex relative ml-1 top-[0.1em] [text-decoration:none]",
          spinnerStage === "active" && "animate-spin",
          spinnerStage === "slow" && "animate-spin opacity-60",
        )}
        style={{
          ...INDICATOR_SIZE_STYLE,
          ...PENDING_COLOR_STYLE,
          ...(spinnerStage === "slow" ? { animationDuration: "2s" } : undefined),
        }}
        data-dc-indicator="pending"
        aria-hidden="true"
        title={spinnerStage === "slow" ? "Still verifying..." : undefined}
      >
        <SpinnerIcon />
      </span>
    );
  }
  if (isVerified && !isPartialMatch) return <VerifiedIndicator />;
  if (isPartialMatch) return <PartialIndicator />;
  if (isMiss) return <MissIndicator />;
  return null;
};

// =============================================================================
// CITATION CONTENT DISPLAY (extracted from inline renderCitationContent)
// =============================================================================

interface CitationContentDisplayProps {
  renderContent?: (props: CitationRenderProps) => React.ReactNode;
  citation: CitationRenderProps["citation"];
  status: CitationStatus;
  citationKey: string;
  displayText: string;
  resolvedContent: CitationContent;
  variant: CitationVariant;
  statusClasses: string;
  isVerified: boolean;
  isPartialMatch: boolean;
  isMiss: boolean;
  shouldShowSpinner: boolean;
  showIndicator: boolean;
  faviconUrl?: string;
  additionalCount?: number;
  indicatorProps: CitationStatusIndicatorProps;
}

/**
 * Renders the citation content based on the selected variant (chip, superscript, text, badge, linter, brackets).
 * Each variant has its own visual treatment and hover behavior.
 */
const CitationContentDisplay = ({
  renderContent,
  citation,
  status,
  citationKey,
  displayText,
  resolvedContent,
  variant,
  statusClasses,
  isVerified,
  isPartialMatch,
  isMiss,
  shouldShowSpinner,
  showIndicator,
  faviconUrl,
  additionalCount,
  indicatorProps,
}: CitationContentDisplayProps): React.ReactNode => {
  const indicator = <CitationStatusIndicator {...indicatorProps} />;

  if (renderContent) {
    return renderContent({
      citation,
      status,
      citationKey,
      displayText,
      isMergedDisplay: resolvedContent === "anchorText",
    });
  }

  // Content type: indicator only
  if (resolvedContent === "indicator") {
    return <span>{indicator}</span>;
  }

  // Variant: chip (pill/badge style with neutral gray background)
  if (variant === "chip") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[0.9em] font-normal transition-colors",
          "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
          ...getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner),
        )}
      >
        <span
          className={cn(
            "max-w-60 overflow-hidden text-ellipsis whitespace-nowrap",
            isMiss && !shouldShowSpinner && "opacity-70",
          )}
        >
          {displayText}
        </span>
        {indicator}
      </span>
    );
  }

  // Variant: superscript (footnote style)
  if (variant === "superscript") {
    const anchorTextDisplay = citation.anchorText?.toString() || "";
    const citationNumber = citation.citationNumber?.toString() || "1";

    const supStatusClasses = cn(
      !shouldShowSpinner && "text-gray-700 dark:text-gray-200",
      shouldShowSpinner && "text-gray-500 dark:text-gray-400",
    );
    return (
      <>
        {anchorTextDisplay && <span className="font-normal">{anchorTextDisplay}</span>}
        <sup
          className={cn(
            "text-xs font-medium transition-colors inline-flex items-baseline px-0.5 rounded",
            supStatusClasses,
            ...getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner),
          )}
        >
          [<span>{citationNumber}</span>
          {indicator}]
        </sup>
      </>
    );
  }

  // Variant: text
  if (variant === "text") {
    return (
      <span className={cn("font-normal", statusClasses)}>
        {displayText}
        {indicator}
      </span>
    );
  }

  // Variant: badge (ChatGPT-style source chip)
  if (variant === "badge") {
    const faviconSrc = faviconUrl || (isUrlCitation(citation) ? citation.faviconUrl : undefined);
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium",
          "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
          "transition-colors cursor-pointer",
          isVerified && !isPartialMatch && !shouldShowSpinner && "hover:bg-green-600/10 dark:hover:bg-green-500/10",
          isPartialMatch && !shouldShowSpinner && "hover:bg-amber-500/10 dark:hover:bg-amber-500/10",
          isMiss && !shouldShowSpinner && "hover:bg-red-500/10 dark:hover:bg-red-400/10",
          (shouldShowSpinner || (!isVerified && !isMiss && !isPartialMatch)) &&
            "hover:bg-gray-200 dark:hover:bg-gray-700",
        )}
      >
        {faviconSrc && (
          <img
            src={faviconSrc}
            alt=""
            className="w-4 h-4 rounded-sm object-contain"
            loading="lazy"
            onError={handleImageError}
          />
        )}
        <span
          className={cn(
            "max-w-40 overflow-hidden text-ellipsis whitespace-nowrap",
            isMiss && !shouldShowSpinner && "opacity-70",
          )}
          style={isMiss && !shouldShowSpinner ? MISS_WAVY_UNDERLINE_STYLE : undefined}
        >
          {displayText}
        </span>
        {additionalCount !== undefined && additionalCount > 0 && (
          <span className="text-gray-500 dark:text-gray-400">+{additionalCount}</span>
        )}
        {indicator}
      </span>
    );
  }

  // Variant: linter
  if (variant === "linter") {
    const isVerifiedState = isVerified && !isPartialMatch && !shouldShowSpinner;
    const isPartialState = isPartialMatch && !shouldShowSpinner;
    const isMissState = isMiss && !shouldShowSpinner;
    const isPendingState = shouldShowSpinner;

    const linterStyles: React.CSSProperties = {
      textDecoration: "underline",
      textDecorationThickness: "2px",
      textUnderlineOffset: "3px",
      borderRadius: "2px",
      color: "inherit",
      fontSize: "inherit",
      fontFamily: "inherit",
      lineHeight: "inherit",
    };

    if (isMissState) {
      linterStyles.textDecorationStyle = "wavy";
      linterStyles.textDecorationColor = "var(--dc-linter-error, #c0605f)";
    } else if (isPartialState) {
      linterStyles.textDecorationStyle = "dashed";
      linterStyles.textDecorationColor = "var(--dc-linter-warning, #f59e0b)";
    } else if (isVerifiedState) {
      linterStyles.textDecorationStyle = "solid";
      linterStyles.textDecorationColor = "var(--dc-linter-success, #4a7c5f)";
    } else {
      linterStyles.textDecorationStyle = "dotted";
      linterStyles.textDecorationColor = "var(--dc-linter-pending, #9ca3af)";
    }

    const linterClasses = cn(
      "cursor-pointer font-normal",
      isVerifiedState && "hover:bg-green-600/10 dark:hover:bg-green-500/10",
      isPartialState && "hover:bg-amber-500/10 dark:hover:bg-amber-500/10",
      isMissState && "hover:bg-red-500/10 dark:hover:bg-red-400/10",
      isPendingState && "bg-gray-500/[0.05] hover:bg-gray-500/10 dark:bg-gray-400/[0.05] dark:hover:bg-gray-400/10",
    );

    return (
      <span className={linterClasses} style={linterStyles}>
        {displayText}
        {showIndicator && indicator}
      </span>
    );
  }

  // Variant: brackets (default)
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 whitespace-nowrap",
        "font-mono font-normal text-xs leading-tight",
        "text-gray-500 dark:text-gray-400",
        "transition-colors",
      )}
      aria-hidden="true"
    >
      [
      <span className={cn("max-w-80 overflow-hidden text-ellipsis", statusClasses)}>
        {displayText}
        {indicator}
      </span>
      ]
    </span>
  );
};

// =============================================================================
// EXPANDED IMAGE RESOLVER
// =============================================================================

/** Source data for the expanded page viewer. */
export interface ExpandedImageSource {
  src: string;
  dimensions?: { width: number; height: number } | null;
  highlightBox?: ScreenBox | null;
  renderScale?: { x: number; y: number } | null;
  textItems?: DeepTextItem[];
}

/**
 * Normalizes a webPageScreenshotBase64 field to a usable data URI.
 * The field may arrive as raw base64 or as a complete data URI; both forms are accepted.
 * @throws {Error} If the input is invalid (empty, not a string, or malformed)
 * @internal Exported for testing purposes only
 */
// biome-ignore lint/style/useComponentExportOnlyModules: Utility function exported for testing
export function normalizeScreenshotSrc(raw: string): string {
  // Validate input is a non-empty string
  if (!raw || typeof raw !== "string") {
    throw new Error("normalizeScreenshotSrc: Invalid screenshot data - expected non-empty string");
  }

  // Already a data URI - return as-is
  if (raw.startsWith("data:")) {
    return raw;
  }

  // Validate base64 format (basic check - should only contain valid base64 chars + max 2 padding chars)
  // This prevents injection of malicious strings that would bypass isValidProofImageSrc()
  if (!/^[A-Za-z0-9+/]+(={0,2})?$/.test(raw.slice(0, 100))) {
    throw new Error("normalizeScreenshotSrc: Invalid base64 format detected");
  }

  return `data:image/jpeg;base64,${raw}`;
}

/**
 * Single resolver for the best available full-page image from verification data.
 * Tries in order:
 * 1. matchPage from verification.pages (best: has image, dimensions, highlight, textItems)
 * 2. proof.proofImageUrl (good: CDN image, no overlay data)
 * 2b. First non-match page from verification.pages (for not_found: pages were searched but none matched)
 * 3. url.webPageScreenshotBase64 (URL citations: full page screenshot)
 * 4. document.verificationImageSrc (baseline: keyhole image at full size)
 *
 * Each source is validated with isValidProofImageSrc() before use, blocking SVG data URIs
 * (which can contain scripts), javascript: URIs, and untrusted hosts. Localhost is allowed
 * for development. Invalid sources are skipped and the next tier is tried.
 */
// biome-ignore lint/style/useComponentExportOnlyModules: exported for testing
export function resolveExpandedImage(verification: Verification | null | undefined): ExpandedImageSource | null {
  if (!verification) return null;

  // 1. Best: matching page from verification.pages array
  const matchPage = verification.pages?.find(p => p.isMatchPage);
  if (matchPage?.source && isValidProofImageSrc(matchPage.source)) {
    return {
      src: matchPage.source,
      dimensions: matchPage.dimensions,
      highlightBox: matchPage.highlightBox ?? null,
      renderScale: matchPage.renderScale ?? null,
      textItems: matchPage.textItems ?? [],
    };
  }

  // 2. Good: CDN-hosted proof image
  if (verification.proof?.proofImageUrl && isValidProofImageSrc(verification.proof.proofImageUrl)) {
    return {
      src: verification.proof.proofImageUrl,
      dimensions: null,
      highlightBox: null,
      textItems: [],
    };
  }

  // 2b. Non-match page fallback (for not_found — pages exist but none is a match)
  const anyPage = verification.pages?.[0];
  if (anyPage?.source && isValidProofImageSrc(anyPage.source)) {
    return {
      src: anyPage.source,
      dimensions: anyPage.dimensions,
      highlightBox: null,
      renderScale: anyPage.renderScale ?? null,
      textItems: anyPage.textItems ?? [],
    };
  }

  // 3. URL screenshot — base64-encoded page screenshot (URL citations)
  const urlScreenshot = verification.url?.webPageScreenshotBase64;
  if (urlScreenshot) {
    try {
      const src = normalizeScreenshotSrc(urlScreenshot);
      if (isValidProofImageSrc(src)) {
        return { src, dimensions: null, highlightBox: null, textItems: [] };
      }
    } catch {
      // Malformed base64 — fall through to next candidate
    }
  }

  // 4. Baseline: keyhole verification image at full size
  if (verification.document?.verificationImageSrc && isValidProofImageSrc(verification.document.verificationImageSrc)) {
    return {
      src: verification.document.verificationImageSrc,
      dimensions: verification.document.verificationImageDimensions ?? null,
      highlightBox: null,
      textItems: [],
    };
  }

  return null;
}

// =============================================================================
// VERIFICATION IMAGE COMPONENT — "Keyhole" Crop & Fade
// =============================================================================

/**
 * Resolves the best available highlight bounding box from verification data.
 * Tries in order: matching page highlightBox → anchorTextMatchDeepItems → phraseMatchDeepItem.
 *
 * When the highlight coordinates come from source PDF space, they need to be scaled
 * to the verification image pixel space using the ratio of image dimensions to page dimensions.
 */
function resolveHighlightBox(verification: Verification): { x: number; width: number } | null {
  // 1. Prefer highlightBox from matching verification page (already in image coordinates)
  const matchPage = verification.pages?.find(p => p.isMatchPage);
  if (matchPage?.highlightBox) {
    return { x: matchPage.highlightBox.x, width: matchPage.highlightBox.width };
  }

  const imgDims = verification.document?.verificationImageDimensions;

  // Helper: scale a DeepTextItem from PDF space to image pixel space.
  // If the scaled result falls outside the image bounds, assumes coordinates
  // are already in image space and returns them unscaled.
  const scaleItem = (item: { x: number; width: number }) => {
    if (imgDims && matchPage?.dimensions && matchPage.dimensions.width > 0) {
      const scale = imgDims.width / matchPage.dimensions.width;
      const scaledX = item.x * scale;
      const scaledWidth = item.width * scale;
      // Sanity check: if scaled coords are within image bounds, use them
      if (scaledX >= 0 && scaledX + scaledWidth <= imgDims.width * SCALING_TOLERANCE) {
        return { x: scaledX, width: scaledWidth };
      }
    }
    // Assume image coordinates if scaling is unavailable or produces out-of-bounds values
    return { x: item.x, width: item.width };
  };

  // 2. Anchor text match deep items (may be in PDF space, scale if we have dimensions)
  const anchorItem = verification.document?.anchorTextMatchDeepItems?.[0];
  if (anchorItem) return scaleItem(anchorItem);

  // 3. Phrase match deep item
  const phraseItem = verification.document?.phraseMatchDeepItem;
  if (phraseItem) return scaleItem(phraseItem);

  return null;
}

/** CSS to hide native scrollbars on the keyhole strip. */
const KEYHOLE_SCROLLBAR_HIDE: React.CSSProperties = {
  scrollbarWidth: "none", // Firefox
  msOverflowStyle: "none", // IE/Edge
};

/**
 * Displays a verification image as a "keyhole" strip — a fixed-height horizontal
 * window showing the image at 100% natural scale, cropped and centered on the
 * match region. CSS gradient fades indicate overflow on each edge.
 *
 * - **Never squashes or stretches** the image.
 * - **Drag to pan** horizontally (mouse). Touch uses native overflow scroll.
 * - **Click** to expand to full-size overlay.
 * - **Hover** shows a darkened overlay with magnifying glass icon.
 *
 * Falls back to horizontal centering when no bounding box data is available.
 */
export function AnchorTextFocusedImage({
  verification,
  onImageClick,
  onFitStateChange,
  page,
  onViewPageClick,
}: {
  verification: Verification;
  onImageClick?: () => void;
  /** Called after image load to report whether the image fits entirely within the keyhole. */
  onFitStateChange?: (fitsCompletely: boolean) => void;
  page?: VerificationPage | null;
  onViewPageClick?: (page: VerificationPage) => void;
}) {
  const showViewPageButton = page?.source && onViewPageClick;

  // Resolve highlight region from verification data
  const highlightBox = useMemo(() => resolveHighlightBox(verification), [verification]);

  // Drag-to-pan hook for mouse interaction
  const { containerRef, isDragging, handlers, scrollState, wasDragging } = useDragToPan();

  // Track image load to compute initial scroll position
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFitInfo, setImageFitInfo] = useState<{ displayedWidth: number; imageFitsCompletely: boolean } | null>(
    null,
  );
  const imageRef = useRef<HTMLImageElement>(null);

  // Set initial scroll position after image loads.
  // useLayoutEffect guarantees refs are populated and runs before paint,
  // so the strip appears at the correct offset without a flash of misposition.
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef and imageRef are stable refs that never change identity; useLayoutEffect guarantees the DOM nodes they point to are ready
  useLayoutEffect(() => {
    if (!imageLoaded) return;
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return;

    // The image renders at natural aspect ratio constrained by strip height.
    // Its displayed width = naturalWidth * (stripHeight / naturalHeight).
    const stripHeight = container.clientHeight;
    const displayedWidth =
      img.naturalHeight > 0 ? img.naturalWidth * (stripHeight / img.naturalHeight) : img.naturalWidth;
    const containerWidth = container.clientWidth;

    // Detect whether the image nearly fits within the keyhole (minimal cropping).
    // Uses KEYHOLE_SKIP_THRESHOLD (1.25) so images within ~80% of keyhole height
    // are treated as "fits" — expanding would reveal almost nothing new.
    // displayedWidth <= containerWidth → image is narrow enough to show in full horizontally.
    // When both are true, the keyhole already reveals nearly everything — expand adds no value.
    if (displayedWidth > 0) {
      const imageFitsCompletely =
        img.naturalHeight > 0 &&
        img.naturalHeight <= stripHeight * KEYHOLE_SKIP_THRESHOLD &&
        displayedWidth <= containerWidth;
      setImageFitInfo({ displayedWidth, imageFitsCompletely });
    }

    const { scrollLeft } = computeKeyholeOffset(displayedWidth, containerWidth, highlightBox);
    container.scrollLeft = scrollLeft;

    // Trigger scroll event so useDragToPan updates fade state for initial position
    container.dispatchEvent(new Event("scroll"));
  }, [imageLoaded, highlightBox]);

  // Notify parent when fit state is determined (after image loads)
  useEffect(() => {
    if (imageFitInfo !== null) onFitStateChange?.(imageFitInfo.imageFitsCompletely);
  }, [imageFitInfo, onFitStateChange]);

  // Compute fade mask based on scroll state
  const maskImage = useMemo(
    () => buildKeyholeMaskImage(scrollState.canScrollLeft, scrollState.canScrollRight, KEYHOLE_FADE_WIDTH),
    [scrollState.canScrollLeft, scrollState.canScrollRight],
  );

  const rawUrlScreenshot = verification.url?.webPageScreenshotBase64;
  let normalizedUrlScreenshot: string | undefined;
  if (rawUrlScreenshot) {
    try {
      normalizedUrlScreenshot = normalizeScreenshotSrc(rawUrlScreenshot);
    } catch {
      /* malformed */
    }
  }
  const rawImageSrc = verification.document?.verificationImageSrc ?? normalizedUrlScreenshot;
  const imageSrc = isValidProofImageSrc(rawImageSrc) ? rawImageSrc : null;
  if (!imageSrc) return null;

  const stripHeightStyle = `var(${KEYHOLE_STRIP_HEIGHT_VAR}, ${KEYHOLE_STRIP_HEIGHT_DEFAULT}px)`;
  const isPannable = scrollState.canScrollLeft || scrollState.canScrollRight;
  // When the image fits entirely in the keyhole, expanding would show nothing new — suppress affordances.
  const canExpand = !imageFitInfo?.imageFitsCompletely && !!onImageClick;

  return (
    <div className="relative">
      {/* Keyhole strip container — clickable to expand, draggable to pan.
          maxWidth clamps to the image's rendered width so no blank space appears to the right. */}
      <div
        className="relative group/keyhole"
        style={imageFitInfo ? { maxWidth: imageFitInfo.displayedWidth } : undefined}
      >
        <button
          type="button"
          className="block relative w-full"
          style={{ cursor: isDragging ? "grabbing" : isPannable ? "grab" : canExpand ? "zoom-in" : "default" }}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            // Suppress click if user was dragging
            if (wasDragging.current) {
              wasDragging.current = false;
              return;
            }
            if (canExpand) onImageClick?.();
          }}
          aria-label={
            [isPannable && "Drag or click arrows to pan", canExpand && "click to view full size"]
              .filter(Boolean)
              .join(", ") || "Verification image"
          }
        >
          <div
            ref={containerRef}
            data-dc-keyhole=""
            className="overflow-x-auto overflow-y-hidden"
            style={{
              height: stripHeightStyle,
              WebkitMaskImage: maskImage,
              maskImage,
              ...KEYHOLE_SCROLLBAR_HIDE,
              cursor: isDragging ? "grabbing" : isPannable ? "grab" : canExpand ? "zoom-in" : "default",
            }}
            {...handlers}
          >
            {/* Hide webkit scrollbar via inline style tag scoped to this container */}
            <style>{`[data-dc-keyhole]::-webkit-scrollbar { display: none; }`}</style>
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Citation verification"
              className="block h-full w-auto max-w-none select-none"
              style={{ height: stripHeightStyle }}
              loading="eager"
              decoding="async"
              draggable={false}
              onLoad={() => setImageLoaded(true)}
              onError={handleImageError}
            />
          </div>

          {/* Left pan hint — clicking pans the image left */}
          {scrollState.canScrollLeft && (
            // biome-ignore lint/a11y/useKeyWithClickEvents: pan hints are inside a <button>; keyboard access is provided by the parent element
            <div
              className="absolute left-0 top-0 h-full min-w-[44px] flex items-center justify-center opacity-0 group-hover/keyhole:opacity-100 transition-opacity duration-150 cursor-pointer"
              aria-label="Pan image left"
              onClick={e => {
                e.stopPropagation();
                const el = containerRef.current;
                if (!el) return;
                el.scrollTo({ left: el.scrollLeft - Math.max(el.clientWidth * 0.5, 80), behavior: "smooth" });
              }}
            >
              <span className="text-sm font-bold text-white bg-black/50 w-7 h-7 flex items-center justify-center rounded-full leading-none">
                ←
              </span>
            </div>
          )}

          {/* Right pan hint — clicking pans the image right */}
          {scrollState.canScrollRight && (
            // biome-ignore lint/a11y/useKeyWithClickEvents: pan hints are inside a <button>; keyboard access is provided by the parent element
            <div
              className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center opacity-0 group-hover/keyhole:opacity-100 transition-opacity duration-150 cursor-pointer"
              aria-label="Pan image right"
              onClick={e => {
                e.stopPropagation();
                const el = containerRef.current;
                if (!el) return;
                el.scrollTo({ left: el.scrollLeft + Math.max(el.clientWidth * 0.5, 80), behavior: "smooth" });
              }}
            >
              <span className="text-sm font-bold text-white bg-black/50 w-7 h-7 flex items-center justify-center rounded-full leading-none">
                →
              </span>
            </div>
          )}
        </button>
      </div>

      {/* Action bar — only shown when View page button is available */}
      {showViewPageButton && (
        <div className="flex items-center justify-end px-2 bg-gray-100 dark:bg-gray-800 rounded-b-md border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onViewPageClick(page);
            }}
            className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-150 cursor-pointer min-h-[44px] px-2"
            aria-label="View full page"
          >
            <span>View page</span>
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// HUMANIZING MESSAGES (Issue #5)
// =============================================================================

/**
 * Get a conversational message for not-found or partial match states.
 * Uses the actual anchor text for context, truncating if needed.
 */
function getHumanizingMessage(
  status: SearchStatus | null | undefined,
  anchorText?: string,
  expectedPage?: number,
  foundPage?: number,
): string | null {
  if (!status) return null;

  const MAX_ANCHOR_LENGTH = 30;
  // Type guard: ensure anchorText is a string before using string methods
  const safeAnchorText = typeof anchorText === "string" ? anchorText : null;
  const displayText = safeAnchorText
    ? safeAnchorText.length > MAX_ANCHOR_LENGTH
      ? `"${safeAnchorText.slice(0, MAX_ANCHOR_LENGTH)}…"`
      : `"${safeAnchorText}"`
    : "this phrase";

  switch (status) {
    case "not_found":
      return null; // Redundant — the red icon + "Not found" header already conveys this
    case "found_on_other_page":
      if (expectedPage && foundPage) {
        return `Found ${displayText} on page ${foundPage} instead of page ${expectedPage}.`;
      }
      return `Found ${displayText} on a different page than expected.`;
    case "found_on_other_line":
      return `Found ${displayText} at a different position than expected.`;
    case "partial_text_found":
      return `Only part of ${displayText} was found.`;
    case "first_word_found":
      return `Only the beginning of ${displayText} was found.`;
    case "found_anchor_text_only":
      return `Found ${displayText}, but not the full surrounding context.`;
    default:
      return null;
  }
}

// =============================================================================
// URL ACCESS EXPLANATIONS
// =============================================================================

/** Structured explanation for URL access failures shown in the popover. */
interface UrlAccessExplanation {
  /** Short status title, e.g., "Paywall Detected" */
  title: string;
  /** 1-sentence explanation of what happened */
  description: string;
  /** Actionable suggestion for the user, or null if nothing can be done */
  suggestion: string | null;
  /** Color scheme: "amber" for blocked (potentially resolvable), "red" for errors */
  colorScheme: "amber" | "red";
}

/**
 * Maps UrlAccessStatus (from verification API response) to UrlFetchStatus (UI layer).
 * Used when the verification object has url-specific access data.
 *
 * For the generic "blocked" status, uses the error message to infer the specific
 * block type (paywall, login, rate limit, geo-restriction, or anti-bot fallback).
 */
function mapUrlAccessStatusToFetchStatus(status: UrlAccessStatus, errorMessage?: string | null): UrlFetchStatus {
  switch (status) {
    case "accessible":
      return "verified";
    case "redirected":
      return "redirected";
    case "redirected_same_domain":
      return "redirected_valid";
    case "not_found":
      return "error_not_found";
    case "forbidden":
      return "blocked_login";
    case "server_error":
      return "error_server";
    case "timeout":
      return "error_timeout";
    case "blocked":
      return inferBlockedType(errorMessage);
    case "network_error":
      return "error_network";
    case "pending":
      return "pending";
    case "unknown":
      return "unknown";
  }
}

/**
 * Infer specific blocked type from the error message when the API returns
 * the generic "blocked" status. Falls back to "blocked_antibot" (site protection)
 * as the most common cause.
 */
function inferBlockedType(errorMessage?: string | null): UrlFetchStatus {
  if (!errorMessage) return "blocked_antibot";
  const msg = errorMessage.toLowerCase();
  if (msg.includes("paywall") || msg.includes("subscribe") || msg.includes("subscription")) {
    return "blocked_paywall";
  }
  if (msg.includes("login") || msg.includes("sign in") || msg.includes("sign-in") || msg.includes("authenticate")) {
    return "blocked_login";
  }
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("too many")) {
    return "blocked_rate_limit";
  }
  if (msg.includes("geo") || msg.includes("region") || msg.includes("country") || msg.includes("available in")) {
    return "blocked_geo";
  }
  return "blocked_antibot";
}

/**
 * Maps SearchStatus (from verification response) to UrlFetchStatus (UI layer).
 * Used as fallback when verification.url.urlAccessStatus is not available.
 */
function mapSearchStatusToFetchStatus(status: SearchStatus | null | undefined): UrlFetchStatus {
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
      return "error_not_found";
    case "loading":
    case "pending":
    case "timestamp_wip":
    case "skipped":
      return "pending";
    default: {
      const _exhaustiveCheck: never = status;
      return _exhaustiveCheck;
    }
  }
}

/**
 * Get a structured explanation for URL access failures.
 * Returns null for success/pending/unknown statuses (no explanation needed).
 */
function getUrlAccessExplanation(
  fetchStatus: UrlFetchStatus,
  errorMessage?: string | null,
): UrlAccessExplanation | null {
  switch (fetchStatus) {
    // Blocked scenarios (amber — potentially resolvable by the user)
    case "blocked_paywall":
      return {
        title: "Paywall Detected",
        description: errorMessage || "This site requires a paid subscription to access.",
        suggestion: "You can verify this citation by visiting the URL directly if you have a subscription.",
        colorScheme: "amber",
      };
    case "blocked_login":
      return {
        title: "Login Required",
        description: errorMessage || "This page requires authentication to view its content.",
        suggestion: "Log in to the site and visit the URL to verify this citation.",
        colorScheme: "amber",
      };
    case "blocked_geo":
      return {
        title: "Region Restricted",
        description: errorMessage || "This content isn't available from our verification server's location.",
        suggestion: "Try visiting the URL directly — it may be accessible from your location.",
        colorScheme: "amber",
      };
    case "blocked_antibot":
      return {
        title: "Blocked by Site Protection",
        description: errorMessage || "This site's bot protection prevented our crawler from accessing the page.",
        suggestion: "Visit the URL directly in your browser to verify this citation.",
        colorScheme: "amber",
      };
    case "blocked_rate_limit":
      return {
        title: "Rate Limited",
        description: errorMessage || "Too many requests were sent to this site.",
        suggestion: "Try again later — the rate limit should reset shortly.",
        colorScheme: "amber",
      };

    // Error scenarios (red — likely can't be resolved without fixing the URL)
    case "error_not_found":
      return {
        title: "Page Not Found",
        description: errorMessage || "This URL returned a 404 error — the page may have been moved or deleted.",
        suggestion: "Check if the URL is correct, or search the site for the content.",
        colorScheme: "red",
      };
    case "error_server":
      return {
        title: "Server Error",
        description: errorMessage || "The website returned a server error and could not be accessed.",
        suggestion: "Try again later — the site may be experiencing temporary issues.",
        colorScheme: "red",
      };
    case "error_timeout":
      return {
        title: "Connection Timed Out",
        description: errorMessage || "The website took too long to respond to our verification request.",
        suggestion: "Try again later — the site may be under heavy load.",
        colorScheme: "red",
      };
    case "error_network":
      return {
        title: "Network Error",
        description: errorMessage || "Could not connect to this website — the domain may be unreachable.",
        suggestion: "Check if the URL is correct and that the site is still online.",
        colorScheme: "red",
      };

    // Non-error statuses — no explanation needed
    default:
      return null;
  }
}

/**
 * Renders a colored banner explaining why a URL could not be accessed.
 * Amber background for blocked states (potentially resolvable), red for errors.
 * Includes ARIA role="status" and a leading icon so screen readers and
 * color-blind users can distinguish severity without relying on color alone.
 */
function UrlAccessExplanationSection({ explanation }: { explanation: UrlAccessExplanation }) {
  const isAmber = explanation.colorScheme === "amber";
  return (
    <div
      className={cn(
        "px-4 py-3 border-b",
        isAmber
          ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
          : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
      )}
      role="status"
      aria-label={`${isAmber ? "Warning" : "Error"}: ${explanation.title}`}
    >
      <div
        className={cn(
          "text-sm font-medium mb-1 flex items-center gap-1.5",
          isAmber ? "text-amber-800 dark:text-amber-200" : "text-red-800 dark:text-red-200",
        )}
      >
        <span className="shrink-0 text-xs" aria-hidden="true">
          {isAmber ? "\u26A0" : "\u2718"}
        </span>
        {explanation.title}
      </div>
      <p className={cn("text-xs", isAmber ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300")}>
        {explanation.description}
      </p>
      {explanation.suggestion && (
        <p
          className={cn(
            "text-xs mt-1.5 opacity-80",
            isAmber ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300",
          )}
        >
          {explanation.suggestion}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// HIGHLIGHTED PHRASE DISPLAY
// =============================================================================

/**
 * Renders fullPhrase with the anchorText substring highlighted using the same
 * amber highlight style used in the API-side proof images.
 * Only highlights when fullPhrase has enough additional context beyond anchorText.
 * When isMiss is true, renders the phrase without highlighting (since the text wasn't found).
 */
// HighlightedPhrase — imported from ./HighlightedPhrase.js (canonical location)

// =============================================================================
// EVIDENCE TRAY COMPONENTS
// =============================================================================

/**
 * Footer for the evidence tray showing outcome label + verification date.
 */
function EvidenceTrayFooter({
  status,
  searchAttempts,
  verifiedAt,
  showExpandHint,
}: {
  status?: SearchStatus | null;
  searchAttempts?: SearchAttempt[];
  verifiedAt?: Date | string | null;
  showExpandHint?: boolean;
}) {
  const formatted = formatCaptureDate(verifiedAt);
  const dateStr = formatted?.display ?? "";

  // Derive outcome label
  const isMiss = status === "not_found";
  let outcomeLabel: string;
  if (isMiss) {
    const count = searchAttempts?.length ?? 0;
    outcomeLabel = `Scan complete · ${count} ${count === 1 ? "search" : "searches"}`;
  } else {
    const successfulAttempt = searchAttempts?.find(a => a.success);
    if (successfulAttempt?.matchedVariation === "exact_full_phrase") {
      outcomeLabel = "Exact match";
    } else if (successfulAttempt?.matchedVariation === "normalized_full_phrase") {
      outcomeLabel = "Normalized match";
    } else if (
      successfulAttempt?.matchedVariation === "exact_anchor_text" ||
      successfulAttempt?.matchedVariation === "normalized_anchor_text"
    ) {
      outcomeLabel = "Anchor text match";
    } else {
      outcomeLabel = "Match found";
    }
  }

  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-500">
      <span>
        {outcomeLabel}
        {showExpandHint && (
          <span className="opacity-0 group-hover/ev-tray:opacity-100 transition-opacity duration-150">
            {" · Click to expand"}
          </span>
        )}
      </span>
      {dateStr && <span title={formatted?.tooltip ?? dateStr}>{dateStr}</span>}
    </div>
  );
}

/**
 * Search analysis summary for not-found evidence tray.
 * Shows attempt count, human-readable summary, and an expandable search details log.
 */
export function SearchAnalysisSummary({
  searchAttempts,
  verification,
}: {
  searchAttempts: SearchAttempt[];
  verification?: Verification | null;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const summary = useMemo(() => buildSearchSummary(searchAttempts, verification), [searchAttempts, verification]);

  // Build 1-2 sentence summary
  let description: string;
  if (summary.includesFullDocScan) {
    description = "Searched the full document.";
  } else if (summary.pageRange) {
    description = `Searched ${summary.pageRange}.`;
  } else {
    description = `Ran ${summary.totalAttempts} ${summary.totalAttempts === 1 ? "search" : "searches"}.`;
  }

  if (summary.closestMatch) {
    const truncated =
      summary.closestMatch.text.length > 60
        ? `${summary.closestMatch.text.slice(0, 60)}...`
        : summary.closestMatch.text;
    description += ` Closest match: "${truncated}"`;
    if (summary.closestMatch.page) {
      description += ` on page ${summary.closestMatch.page}`;
    }
    description += ".";
  }

  // Format verified date for compact display
  const formatted = formatCaptureDate(verification?.verifiedAt);
  const dateStr = formatted?.display ?? "";

  return (
    <div className="px-3 py-2">
      {/* Compact single-line summary — entire line clickable to toggle details */}
      {searchAttempts.length > 0 ? (
        <button
          type="button"
          className="w-full flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer transition-colors text-left"
          onClick={e => {
            e.stopPropagation();
            setShowDetails(s => !s);
          }}
          aria-expanded={showDetails}
          title={description}
        >
          <svg
            className={cn("size-2.5 shrink-0 transition-transform duration-150", showDetails && "rotate-90")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="truncate">
            {description}
            {dateStr && <> · {dateStr}</>}
          </span>
        </button>
      ) : (
        <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate" title={description}>
          {description}
          {dateStr && <> · {dateStr}</>}
        </span>
      )}
      {showDetails && (
        <div className="mt-2">
          <VerificationLogTimeline searchAttempts={searchAttempts} status={verification?.status} />
        </div>
      )}
    </div>
  );
}

/**
 * Evidence tray — the "proof zone" at the bottom of the summary popover.
 * For verified/partial: Shows keyhole image with "Expand" hover CTA.
 * For not-found: Shows search analysis summary with "Verify manually" hover CTA.
 * When `onExpand` is provided, the tray is clickable. Otherwise, it's informational only.
 *
 * @param proofImageSrc - Full-page proof image for miss states only. Ignored when
 *   `hasImage` is truthy (verified/partial path renders the keyhole image instead).
 */
export function EvidenceTray({
  verification,
  status,
  onExpand,
  onImageClick,
  proofImageSrc,
}: {
  verification: Verification | null;
  status: CitationStatus;
  onExpand?: () => void;
  onImageClick?: () => void;
  proofImageSrc?: string;
}) {
  const hasImage = verification?.document?.verificationImageSrc || verification?.url?.webPageScreenshotBase64;
  const isMiss = status.isMiss;
  const searchAttempts = verification?.searchAttempts ?? [];
  const borderClass = isMiss ? EVIDENCE_TRAY_BORDER_DASHED : EVIDENCE_TRAY_BORDER_SOLID;
  const [keyholeImageFits, setKeyholeImageFits] = useState(false);

  // Shared inner content
  const content = (
    <>
      {/* Content: image or search analysis */}
      {hasImage && verification ? (
        <AnchorTextFocusedImage
          verification={verification}
          onImageClick={onImageClick}
          onFitStateChange={setKeyholeImageFits}
        />
      ) : isMiss && searchAttempts.length > 0 ? (
        <>
          {isValidProofImageSrc(proofImageSrc) && (
            <div className="overflow-hidden" style={{ height: MISS_TRAY_THUMBNAIL_HEIGHT }}>
              <img
                src={proofImageSrc}
                className="w-full h-full object-cover object-top"
                draggable={false}
                alt="Searched page"
              />
            </div>
          )}
          <SearchAnalysisSummary searchAttempts={searchAttempts} verification={verification} />
        </>
      ) : null}

      {/* Footer: outcome + date (skip for miss — compressed summary has this info) */}
      {!isMiss && (
        <EvidenceTrayFooter
          status={verification?.status}
          searchAttempts={searchAttempts}
          verifiedAt={verification?.verifiedAt}
          showExpandHint={!!onImageClick && !keyholeImageFits}
        />
      )}
    </>
  );

  return (
    <div className="m-3">
      {onExpand ? (
        /* Interactive: clickable with hover CTA */
        <div
          role="button"
          tabIndex={0}
          onClick={e => {
            e.stopPropagation();
            onExpand();
          }}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onExpand();
            }
          }}
          className={cn(
            "w-full rounded-xs overflow-hidden text-left cursor-pointer group/ev-tray relative",
            "transition-opacity",
            borderClass,
          )}
          aria-label="Expand for details"
        >
          {content}
        </div>
      ) : (
        /* Informational: non-clickable display */
        <div className={cn("w-full rounded-xs overflow-hidden text-left", borderClass)}>{content}</div>
      )}
    </div>
  );
}

// =============================================================================
// EXPANDED PAGE VIEWER
// =============================================================================
// INLINE EXPANDED IMAGE (Zone 3 replacement when keyhole is clicked)
// =============================================================================

/**
 * Replaces Zone 3 (evidence tray) when the keyhole is expanded in-place.
 * Renders the image at natural size with 2D drag-to-pan. The summary content
 * (Zone 1 header + Zone 2 quote) stays visible above — this component is
 * deliberately headerless. Click (without drag) to collapse.
 *
 * When `fill` is true (expanded-page mode), includes subtle zoom controls
 * (−/slider/+) for both desktop and mobile. Mobile defaults to fit-to-screen.
 * Supports pinch-to-zoom on touch devices and trackpad pinch (Ctrl+wheel).
 */
export function InlineExpandedImage({
  src,
  onCollapse,
  verification,
  status,
  fill = false,
  onNaturalSize,
  renderScale,
}: {
  src: string;
  onCollapse: () => void;
  verification?: Verification | null;
  status?: CitationStatus;
  /** When true, the component expands to fill its flex parent (for use inside flex-column containers). */
  fill?: boolean;
  /** Called after image load with natural pixel dimensions. */
  onNaturalSize?: (width: number, height: number) => void;
  /** Scale factors for converting DeepTextItem PDF coords to image pixels. */
  renderScale?: { x: number; y: number } | null;
}) {
  const { containerRef, isDragging, handlers: panHandlers, wasDragging } = useDragToPan({ direction: "xy" });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const isTouchDevice = useIsTouchDevice();

  // Zoom state — only active when fill=true (expanded-page mode).
  // 1.0 = natural pixel size. < 1.0 = fit-to-screen (shrunk to container).
  const [zoom, setZoom] = useState(1);
  // Ref mirror of zoom for touch event handlers (avoids stale closures in pinch gesture)
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const containerSizeRef = useRef<{ width: number; height: number } | null>(null);
  const hasSetInitialZoom = useRef(false);

  // Track container size via ResizeObserver (both width and height for fit-to-screen)
  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        containerSizeRef.current = { width: rect.width, height: rect.height };
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fill, containerRef]);

  // Reset imageLoaded synchronously when src changes (avoids a useEffect render cycle).
  // This ensures the spinner shows while the new image loads after an evidence ↔ page swap.
  // Also reset zoom to 1 so each page starts at default scale.
  const prevSrcRef = useRef(src);
  if (prevSrcRef.current !== src) {
    prevSrcRef.current = src;
    setImageLoaded(false);
    setNaturalWidth(null);
    setNaturalHeight(null);
    setZoom(1);
    hasSetInitialZoom.current = false;
  }

  // On mobile, default to fit-to-screen zoom after image loads so the entire page
  // is visible without scrolling — users can then pinch or use slider to zoom in.
  // On desktop, keep natural pixel size (zoom = 1).
  // NOTE: Only set hasSetInitialZoom=true after a successful zoom set (or when
  // container size is available but no zoom change is needed). If container size
  // isn't available yet (ResizeObserver hasn't fired), skip without marking as done
  // so the effect retries on the next render after ResizeObserver populates the ref.
  useEffect(() => {
    if (!fill || !imageLoaded || !naturalWidth || !naturalHeight || hasSetInitialZoom.current) return;
    const cs = containerSizeRef.current;
    if (!cs || cs.width <= 0 || cs.height <= 0) return; // retry next render
    hasSetInitialZoom.current = true;
    if (isTouchDevice) {
      // Fit to screen: scale so entire page fits in the container
      const fit = Math.min(cs.width / naturalWidth, cs.height / naturalHeight);
      if (fit < 1) setZoom(Math.max(EXPANDED_ZOOM_MIN, fit));
    }
  }, [fill, imageLoaded, naturalWidth, naturalHeight, isTouchDevice]);

  // Clamp helper — shared by buttons, slider, pinch, and wheel
  const clampZoom = useCallback((z: number) => {
    return Math.max(EXPANDED_ZOOM_MIN, Math.min(EXPANDED_ZOOM_MAX, Math.round(z * 100) / 100));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(z => clampZoom(z + EXPANDED_ZOOM_STEP));
  }, [clampZoom]);
  const handleZoomOut = useCallback(() => {
    setZoom(z => clampZoom(z - EXPANDED_ZOOM_STEP));
  }, [clampZoom]);

  // Trackpad pinch zoom (Ctrl+wheel) — prevents default browser zoom
  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // deltaY is negative for zoom-in, positive for zoom-out on trackpads
      const delta = -e.deltaY * 0.005;
      setZoom(z => clampZoom(z + delta));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fill, containerRef, clampZoom]);

  // Touch pinch-to-zoom (two-finger gesture).
  // Uses zoomRef to read current zoom without re-registering listeners on every zoom change.
  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;

    let initialDistance: number | null = null;
    let initialZoom = 1;

    const getTouchDistance = (touches: TouchList): number => {
      const [a, b] = [touches[0], touches[1]];
      if (!a || !b) return 0;
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dist = getTouchDistance(e.touches);
        if (dist < 1) return; // fingers at same point — avoid division by zero
        initialDistance = dist;
        initialZoom = zoomRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initialDistance === null) return;
      e.preventDefault(); // prevent native scroll while pinching
      const currentDistance = getTouchDistance(e.touches);
      const scale = currentDistance / initialDistance;
      setZoom(clampZoom(initialZoom * scale));
    };

    const onTouchEnd = () => {
      initialDistance = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [fill, containerRef, clampZoom]);

  // Compute effective image width for zoom
  const zoomedWidth = fill && naturalWidth ? naturalWidth * zoom : undefined;

  // Derive footer label — matches EvidenceTrayFooter logic
  const isMiss = status?.isMiss;
  const searchAttempts = verification?.searchAttempts ?? [];
  let outcomeLabel: string;
  if (isMiss) {
    const count = searchAttempts.length;
    outcomeLabel = `Scan complete · ${count} ${count === 1 ? "search" : "searches"}`;
  } else {
    const successfulAttempt = searchAttempts.find(a => a.success);
    if (successfulAttempt?.matchedVariation === "exact_full_phrase") {
      outcomeLabel = "Exact match";
    } else if (successfulAttempt?.matchedVariation === "normalized_full_phrase") {
      outcomeLabel = "Normalized match";
    } else if (
      successfulAttempt?.matchedVariation === "exact_anchor_text" ||
      successfulAttempt?.matchedVariation === "normalized_anchor_text"
    ) {
      outcomeLabel = "Anchor text match";
    } else {
      outcomeLabel = "Match found";
    }
  }
  const formatted = formatCaptureDate(verification?.verifiedAt);
  const dateStr = formatted?.display ?? "";

  // Show zoom controls in fill mode when image has loaded
  const showZoomControls = fill && imageLoaded && naturalWidth !== null;

  return (
    <div
      className={cn(
        "mx-3 mb-3 animate-in fade-in-0 duration-150 group/expanded-img",
        fill && "flex-1 min-h-0 flex flex-col",
      )}
      style={
        zoomedWidth !== undefined
          ? { maxWidth: zoomedWidth }
          : naturalWidth !== null
            ? { maxWidth: naturalWidth }
            : undefined
      }
    >
      {/* Wrapper: relative so zoom controls can be positioned absolutely over the scroll area */}
      <div className={cn("relative", fill && "flex-1 min-h-0 flex flex-col")}>
        {/* Scrollable image area — click (no drag) collapses */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: drag-to-pan area; keyboard exit handled by parent popover Escape */}
        <div
          ref={containerRef}
          data-dc-inline-expanded=""
          className={cn(
            "relative bg-gray-50 dark:bg-gray-900 select-none overflow-auto rounded-t-sm",
            fill && "flex-1 min-h-0",
          )}
          style={{
            ...(fill ? {} : { maxHeight: "min(600px, 80dvh)" }),
            overscrollBehavior: "none",
            cursor: isDragging ? "grabbing" : fill ? "grab" : "zoom-out",
            ...KEYHOLE_SCROLLBAR_HIDE,
          }}
          onDragStart={e => e.preventDefault()}
          onClick={e => {
            e.stopPropagation();
            if (wasDragging.current) {
              wasDragging.current = false;
              return;
            }
            onCollapse();
          }}
          {...panHandlers}
        >
          <style>{`[data-dc-inline-expanded]::-webkit-scrollbar { display: none; }`}</style>
          {/* Keyed on src: remounts with a fade-in whenever the image swaps (evidence ↔ page). */}
          <div key={src} className="animate-in fade-in-0 duration-150">
            {!imageLoaded && (
              <div className="flex items-center justify-center h-24">
                <span className="size-5 animate-spin text-gray-400">
                  <SpinnerIcon />
                </span>
              </div>
            )}
            {/* Relative wrapper: positions annotation overlay exactly over the image */}
            <div
              style={{
                position: "relative",
                display: "inline-block",
                ...(zoomedWidth !== undefined ? { width: zoomedWidth } : {}),
              }}
            >
              <img
                src={src}
                alt="Verification evidence"
                className={cn("block", !imageLoaded && "hidden")}
                style={zoomedWidth !== undefined ? { width: zoomedWidth, maxWidth: "none" } : { maxWidth: "none" }}
                onLoad={e => {
                  const w = e.currentTarget.naturalWidth;
                  const h = e.currentTarget.naturalHeight;
                  setImageLoaded(true);
                  setNaturalWidth(w);
                  setNaturalHeight(h);
                  onNaturalSize?.(w, h);
                }}
                draggable={false}
              />
              {imageLoaded &&
                renderScale &&
                naturalWidth &&
                naturalHeight &&
                verification?.document?.phraseMatchDeepItem && (
                  <CitationAnnotationOverlay
                    phraseMatchDeepItem={verification.document.phraseMatchDeepItem}
                    renderScale={renderScale}
                    imageNaturalWidth={naturalWidth}
                    imageNaturalHeight={naturalHeight}
                    highlightColor={verification.highlightColor}
                    anchorTextDeepItem={verification.document.anchorTextMatchDeepItems?.[0]}
                    anchorText={verification.verifiedAnchorText}
                    fullPhrase={verification.verifiedFullPhrase}
                  />
                )}
            </div>
          </div>
        </div>

        {/* Floating zoom controls — positioned absolutely over the scroll container
            so they stay visible regardless of horizontal/vertical scroll position.
            Contains −/slider/+ with percentage label. Supports drag on slider. */}
        {showZoomControls && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              zIndex: 1,
              pointerEvents: "auto",
            }}
          >
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: zoom controls are auxiliary UI, main interaction is drag-to-pan */}
            <div
              className="flex items-center gap-0.5 bg-black/40 backdrop-blur-sm text-white/80 rounded-full px-1 py-0.5 shadow-sm"
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleZoomOut();
                }}
                disabled={zoom <= EXPANDED_ZOOM_MIN}
                className="size-6 flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"
                aria-label="Zoom out"
              >
                <span className="size-3.5">
                  <ZoomOutIcon />
                </span>
              </button>
              {/* Range slider — draggable zoom control */}
              <input
                type="range"
                min={EXPANDED_ZOOM_MIN * 100}
                max={EXPANDED_ZOOM_MAX * 100}
                step={5}
                value={Math.round(zoom * 100)}
                onChange={e => {
                  e.stopPropagation();
                  setZoom(clampZoom(Number(e.target.value) / 100));
                }}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                className="w-16 h-1 appearance-none bg-white/30 rounded-full cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                  [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0
                  [&::-moz-range-thumb]:cursor-pointer"
                aria-label="Zoom level"
                aria-valuetext={`${Math.round(zoom * 100)}%`}
              />
              <span className="min-w-[4ch] text-center font-mono tabular-nums select-none text-[11px] leading-none">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleZoomIn();
                }}
                disabled={zoom >= EXPANDED_ZOOM_MAX}
                className="size-6 flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"
                aria-label="Zoom in"
              >
                <span className="size-3.5">
                  <ZoomInIcon />
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Footer — matches EvidenceTrayFooter style; shows collapse hint on hover */}
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-b-sm border border-t-0 border-gray-200 dark:border-gray-700">
        <span>
          {outcomeLabel}
          <span className="opacity-0 group-hover/expanded-img:opacity-100 transition-opacity duration-150">
            {" · Click to collapse"}
          </span>
        </span>
        {dateStr && <span title={formatted?.tooltip ?? dateStr}>{dateStr}</span>}
      </div>
    </div>
  );
}

// =============================================================================
// POPOVER CONTENT COMPONENT
// =============================================================================

/** Popover view state: summary (default), evidence image expanded in-place, or full proof page */
type PopoverViewState = "summary" | "expanded-evidence" | "expanded-page";

interface PopoverContentProps {
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  status: CitationStatus;
  isLoading?: boolean;
  /** Whether the popover is currently visible (used for Activity prefetching) */
  isVisible?: boolean;
  /**
   * Override label for the source display in the popover header.
   * See BaseCitationProps.sourceLabel for details.
   */
  sourceLabel?: string;
  /**
   * Visual style for status indicators inside the popover.
   * @default "icon"
   */
  indicatorVariant?: "icon" | "dot";
  /** Current view state: summary or expanded */
  viewState?: PopoverViewState;
  /** Callback when view state changes */
  onViewStateChange?: (viewState: PopoverViewState) => void;
  /** Override the expanded image src (from behaviorConfig.onClick returning setImageExpanded: "<url>") */
  expandedImageSrcOverride?: string | null;
  /** Reports the expanded image's natural width (or null on collapse) so the parent can size PopoverContent. */
  onExpandedWidthChange?: (width: number | null) => void;
}

function DefaultPopoverContent({
  citation,
  verification,
  status,
  isLoading = false,
  isVisible = true,
  sourceLabel,
  indicatorVariant = "icon",
  viewState = "summary",
  onViewStateChange,
  expandedImageSrcOverride,
  onExpandedWidthChange,
}: PopoverContentProps) {
  const hasImage = verification?.document?.verificationImageSrc || verification?.url?.webPageScreenshotBase64;
  const { isMiss, isPartialMatch, isPending, isVerified } = status;
  const searchStatus = verification?.status;

  // Save/restore scroll position for back navigation

  // Resolve expanded image for the full-page viewer; allow caller to override the src
  const expandedImage = useMemo(() => {
    const resolved = resolveExpandedImage(verification);
    if (!expandedImageSrcOverride) return resolved;
    // Custom src provided: clear overlay metadata since dimensions belong to the original image
    return resolved
      ? { ...resolved, src: expandedImageSrcOverride, dimensions: null, highlightBox: null, renderScale: null }
      : { src: expandedImageSrcOverride };
  }, [verification, expandedImageSrcOverride]);

  // Suppress page expand when page image dimensions are known and already fit within
  // the evidence view constraints (≤480px wide, ≤600px tall) — expanding adds no value.
  const pageFitsInEvidence =
    expandedImage?.dimensions && expandedImage.dimensions.width <= 480 && expandedImage.dimensions.height <= 600;
  const canExpandToPage = !!expandedImage && !pageFitsInEvidence;

  // Track the natural width of the currently displayed expanded image.
  // Pre-set from known dimensions when entering an expanded state; confirmed by
  // InlineExpandedImage onLoad. Used to clamp the inner container width so the
  // popover doesn't stretch wider than the image.
  const [expandedNaturalWidth, setExpandedNaturalWidth] = useState<number | null>(null);

  // Helper: update local state AND report to parent in one step.
  const setWidth = useCallback(
    (w: number | null) => {
      setExpandedNaturalWidth(w);
      onExpandedWidthChange?.(w);
    },
    [onExpandedWidthChange],
  );

  // Pre-set width from known dimensions when the view state changes.
  // For expanded states without known dimensions, keep the previous width as an estimate
  // (null → viewport-width fallback; or previous expanded width).
  useEffect(() => {
    if (viewState === "summary") {
      setWidth(null);
    } else if (viewState === "expanded-page" && expandedImage?.dimensions?.width) {
      setWidth(expandedImage.dimensions.width);
    } else if (viewState === "expanded-evidence") {
      const w = verification?.document?.verificationImageDimensions?.width;
      if (w) setWidth(w);
    }
  }, [
    viewState,
    expandedImage?.dimensions?.width,
    verification?.document?.verificationImageDimensions?.width,
    setWidth,
  ]);

  // Callback for InlineExpandedImage onLoad — confirms/corrects the pre-set width.
  const handleExpandedImageLoad = useCallback(
    (width: number, _height: number) => {
      setWidth(width);
    },
    [setWidth],
  );

  // Tracks which state we entered expanded-page from, so onCollapse can return there.
  // "expanded-evidence" → expanded-page → back: returns to expanded-evidence (no InlineExpandedImage remount, no animation).
  // "summary" → expanded-page → back: returns to summary.
  const prevBeforeExpandedPageRef = useRef<"summary" | "expanded-evidence">("summary");

  const handleExpand = useCallback(() => {
    if (!canExpandToPage) return;
    // Only record origin state when first entering expanded-page (not on redundant calls)
    if (viewState !== "expanded-page") {
      prevBeforeExpandedPageRef.current = viewState === "expanded-evidence" ? "expanded-evidence" : "summary";
    }
    onViewStateChange?.("expanded-page");
  }, [canExpandToPage, onViewStateChange, viewState]);

  // Resolve the evidence image src once at this level (used by handleKeyholeClick and Zone 3).
  const evidenceSrc = useMemo(() => {
    if (verification?.document?.verificationImageSrc) {
      const s = verification.document.verificationImageSrc;
      return isValidProofImageSrc(s) ? s : null;
    }
    const raw = verification?.url?.webPageScreenshotBase64;
    if (!raw) return null;
    try {
      const s = normalizeScreenshotSrc(raw);
      return isValidProofImageSrc(s) ? s : null;
    } catch {
      return null;
    }
  }, [verification]);

  // Prefetch images imperatively when the popover becomes visible.
  // Keyhole image: preload as soon as the popover opens (user is hovering).
  // Page image: preload now so it's ready when the user clicks to expand.
  useEffect(() => {
    if (!isVisible) return;
    if (evidenceSrc) new Image().src = evidenceSrc;
    const pageSrc = expandedImage?.src;
    if (pageSrc && isValidProofImageSrc(pageSrc)) new Image().src = pageSrc;
  }, [isVisible, evidenceSrc, expandedImage?.src]);

  // Toggles the keyhole image expansion in Zone 3. Clicking when already expanded collapses.
  const handleKeyholeClick = useCallback(() => {
    if (viewState === "expanded-evidence") {
      onViewStateChange?.("summary");
      return;
    }
    if (!evidenceSrc) return;
    onViewStateChange?.("expanded-evidence");
  }, [viewState, evidenceSrc, onViewStateChange]);

  // Get page info (document citations only)
  const expectedPage = !isUrlCitation(citation) ? citation.pageNumber : undefined;
  const foundPage = verification?.document?.verifiedPageNumber ?? undefined;

  // Get humanizing message for partial/not-found states
  const anchorText = citation.anchorText?.toString();
  const fullPhrase = citation.fullPhrase;
  const humanizingMessage = useMemo(
    () => getHumanizingMessage(searchStatus, anchorText, expectedPage ?? undefined, foundPage),
    [searchStatus, anchorText, expectedPage, foundPage],
  );

  // Get URL access explanation for blocked/error states (URL citations only)
  const urlAccessExplanation = useMemo(() => {
    if (!isUrlCitation(citation)) return null;
    const urlAccessStatus = verification?.url?.urlAccessStatus;
    const errorMsg = verification?.url?.urlVerificationError;
    const fetchStatus = urlAccessStatus
      ? mapUrlAccessStatusToFetchStatus(urlAccessStatus, errorMsg)
      : mapSearchStatusToFetchStatus(searchStatus);
    return getUrlAccessExplanation(fetchStatus, verification?.url?.urlVerificationError);
  }, [citation, verification, searchStatus]);

  // Loading/pending state view — skeleton mirrors resolved layout shape
  if (isLoading || isPending) {
    const searchingPhrase = fullPhrase || anchorText;
    return (
      <div className={`${POPOVER_CONTAINER_BASE_CLASSES} min-w-[200px] max-w-[480px]`}>
        {/* Source context header */}
        <SourceContextHeader
          citation={citation}
          verification={verification}
          status={searchStatus}
          sourceLabel={sourceLabel}
        />
        <div className="p-3 flex flex-col gap-2.5">
          {/* Skeleton: status bar placeholder */}
          <div className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          {/* Skeleton: quote box placeholder */}
          <div className="pl-3 border-l-[3px] border-gray-200 dark:border-gray-700 space-y-1.5">
            <div className="h-3 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          {/* Skeleton: image strip placeholder */}
          <div className="h-[60px] w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          {/* Actual search status */}
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
            <span className="inline-block relative top-[0.1em] mr-1.5 size-2 animate-spin">
              <SpinnerIcon />
            </span>
            Searching...
          </span>
          {searchingPhrase && (
            <p className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded font-mono text-[11px] break-words text-gray-700 dark:text-gray-300">
              &ldquo;{searchingPhrase.length > 80 ? `${searchingPhrase.slice(0, 80)}…` : searchingPhrase}&rdquo;
            </p>
          )}
          {!isUrlCitation(citation) && citation.pageNumber && citation.pageNumber > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Looking on p.{citation.pageNumber}</span>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // SUCCESS STATE (Green) - Three-zone layout: Header + Claim + Evidence
  // ==========================================================================
  if (isVerified && !isPartialMatch && !isMiss && hasImage && verification) {
    const isExpanded = viewState === "expanded-evidence" || viewState === "expanded-page";
    const isFullPage = viewState === "expanded-page";
    const validProofUrl =
      isFullPage && verification?.proof?.proofUrl ? isValidProofUrl(verification.proof.proofUrl) : null;
    return (
      <Activity mode={isVisible ? "visible" : "hidden"}>
        <div
          className={cn(POPOVER_CONTAINER_BASE_CLASSES, "animate-in fade-in-0 duration-150")}
          style={{
            width: isExpanded
              ? expandedNaturalWidth !== null
                ? `min(${expandedNaturalWidth + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem))`
                : "calc(100dvw - 2rem)"
              : POPOVER_WIDTH,
            maxWidth: "100%",
            transition: isExpanded
              ? `width ${POPOVER_MORPH_EXPAND_MS}ms ${EASE_EXPAND}, height ${POPOVER_MORPH_EXPAND_MS}ms ${EASE_EXPAND}`
              : `width ${POPOVER_MORPH_COLLAPSE_MS}ms ${EASE_COLLAPSE}, height ${POPOVER_MORPH_COLLAPSE_MS}ms ${EASE_COLLAPSE}`,
            // Full-page only: flex column layout with inherited maxHeight from PopoverContent.
            // No forced height — the popover sizes to content, capped by the viewport boundary.
            // Small images keep the popover compact; large images grow to the maxHeight cap.
            ...(isFullPage && {
              display: "flex",
              flexDirection: "column" as const,
              maxHeight: "inherit",
              overflowY: "hidden" as const,
            }),
          }}
        >
          {/* Zone 1: Metadata Header */}
          <SourceContextHeader
            citation={citation}
            verification={verification}
            status={searchStatus}
            sourceLabel={sourceLabel}
            onExpand={isFullPage ? undefined : canExpandToPage ? handleExpand : undefined}
            onClose={isFullPage ? () => onViewStateChange?.(prevBeforeExpandedPageRef.current) : undefined}
            proofUrl={validProofUrl}
          />
          {/* Zone 2: Claim Body — Status + highlighted phrase */}
          <StatusHeader
            status={searchStatus}
            foundPage={foundPage}
            expectedPage={expectedPage ?? undefined}
            hidePageBadge
            anchorText={anchorText}
            indicatorVariant={indicatorVariant}
          />

          {fullPhrase && (
            <div className="mx-3 mt-1 mb-3 pl-3 pr-3 py-2 text-xs leading-relaxed break-words bg-gray-50 dark:bg-gray-800/50 border-l-[3px] border-green-500 dark:border-green-600">
              <HighlightedPhrase fullPhrase={fullPhrase} anchorText={anchorText} isMiss={isMiss} />
            </div>
          )}

          {/* Zone 3: Expanded keyhole image OR expanded page OR normal evidence tray */}
          {viewState === "expanded-evidence" && evidenceSrc ? (
            <InlineExpandedImage
              src={evidenceSrc}
              onCollapse={() => onViewStateChange?.("summary")}
              verification={verification}
              status={status}
              onNaturalSize={handleExpandedImageLoad}
            />
          ) : viewState === "expanded-page" && expandedImage?.src ? (
            <InlineExpandedImage
              src={expandedImage.src}
              onCollapse={() => onViewStateChange?.(prevBeforeExpandedPageRef.current)}
              verification={verification}
              status={status}
              fill
              onNaturalSize={handleExpandedImageLoad}
              renderScale={expandedImage.renderScale}
            />
          ) : (
            <EvidenceTray
              verification={verification}
              status={status}
              onExpand={canExpandToPage ? handleExpand : undefined}
              onImageClick={handleKeyholeClick}
            />
          )}
        </div>
      </Activity>
    );
  }

  // ==========================================================================
  // PARTIAL/DISPLACED STATE (Amber) or NOT FOUND (Red) - Three-zone layout
  // ==========================================================================
  if (isMiss || isPartialMatch) {
    const isExpanded = viewState === "expanded-evidence" || viewState === "expanded-page";
    const isFullPage = viewState === "expanded-page";
    const validProofUrl =
      isFullPage && verification?.proof?.proofUrl ? isValidProofUrl(verification.proof.proofUrl) : null;
    return (
      <Activity mode={isVisible ? "visible" : "hidden"}>
        <div
          className={cn(POPOVER_CONTAINER_BASE_CLASSES, "animate-in fade-in-0 duration-150")}
          style={{
            width: isExpanded
              ? expandedNaturalWidth !== null
                ? `min(${expandedNaturalWidth + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem))`
                : "calc(100dvw - 2rem)"
              : POPOVER_WIDTH,
            maxWidth: "100%",
            transition: isExpanded
              ? `width ${POPOVER_MORPH_EXPAND_MS}ms ${EASE_EXPAND}, height ${POPOVER_MORPH_EXPAND_MS}ms ${EASE_EXPAND}`
              : `width ${POPOVER_MORPH_COLLAPSE_MS}ms ${EASE_COLLAPSE}, height ${POPOVER_MORPH_COLLAPSE_MS}ms ${EASE_COLLAPSE}`,
            ...(isFullPage && {
              display: "flex",
              flexDirection: "column" as const,
              height: "100%",
              overflowY: "hidden" as const,
            }),
          }}
        >
          {/* Zone 1: Metadata Header */}
          <SourceContextHeader
            citation={citation}
            verification={verification}
            status={searchStatus}
            sourceLabel={sourceLabel}
            onExpand={isFullPage ? undefined : canExpandToPage ? handleExpand : undefined}
            onClose={isFullPage ? () => onViewStateChange?.(prevBeforeExpandedPageRef.current) : undefined}
            proofUrl={validProofUrl}
          />

          {/* Zone 2: Claim Body — Status + highlighted phrase */}
          <StatusHeader
            status={searchStatus}
            foundPage={foundPage}
            expectedPage={expectedPage ?? undefined}
            hidePageBadge
            anchorText={anchorText}
            indicatorVariant={indicatorVariant}
          />

          {/* URL access explanation (for URL citations with access failures) */}
          {urlAccessExplanation && <UrlAccessExplanationSection explanation={urlAccessExplanation} />}
          {/* Humanizing message for document citations */}
          {!urlAccessExplanation && humanizingMessage && (
            <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border-b border-gray-100 dark:border-gray-800">
              {humanizingMessage}
            </div>
          )}

          {fullPhrase && (
            <div
              className={cn(
                "mx-3 mt-1 mb-3 pl-3 pr-3 py-2 text-xs leading-relaxed break-words bg-gray-50 dark:bg-gray-800/50 border-l-[3px]",
                isMiss ? "border-red-500 dark:border-red-400" : "border-amber-500 dark:border-amber-400",
              )}
            >
              <HighlightedPhrase fullPhrase={fullPhrase} anchorText={anchorText} isMiss={isMiss} />
            </div>
          )}

          {/* Zone 3: Expanded keyhole image OR expanded page OR normal evidence tray */}
          {viewState === "expanded-evidence" && evidenceSrc ? (
            <InlineExpandedImage
              src={evidenceSrc}
              onCollapse={() => onViewStateChange?.("summary")}
              verification={verification}
              status={status}
              onNaturalSize={handleExpandedImageLoad}
            />
          ) : viewState === "expanded-page" && expandedImage?.src ? (
            <InlineExpandedImage
              src={expandedImage.src}
              onCollapse={() => onViewStateChange?.(prevBeforeExpandedPageRef.current)}
              verification={verification}
              status={status}
              fill
              onNaturalSize={handleExpandedImageLoad}
              renderScale={expandedImage.renderScale}
            />
          ) : hasImage && verification ? (
            <EvidenceTray
              verification={verification}
              status={status}
              onExpand={canExpandToPage ? handleExpand : undefined}
              onImageClick={handleKeyholeClick}
              proofImageSrc={expandedImage?.src}
            />
          ) : /* Show EvidenceTray for miss with search analysis or expandable page, or null */
          isMiss && (verification?.searchAttempts?.length || canExpandToPage) && verification ? (
            <EvidenceTray
              verification={verification}
              status={status}
              onExpand={canExpandToPage ? handleExpand : undefined}
              proofImageSrc={expandedImage?.src}
            />
          ) : null}
        </div>
      </Activity>
    );
  }

  // ==========================================================================
  // FALLBACK: Text-only view (verified/partial match without image)
  // ==========================================================================
  const statusLabel = getStatusLabel(status);
  const hasSnippet = verification?.verifiedMatchSnippet;
  const pageNumber = verification?.document?.verifiedPageNumber;

  if (!hasSnippet && !statusLabel && !urlAccessExplanation) return null;

  return (
    <div className={`${POPOVER_CONTAINER_BASE_CLASSES} min-w-[180px] max-w-full`}>
      {/* Source context header */}
      <SourceContextHeader
        citation={citation}
        verification={verification}
        status={searchStatus}
        sourceLabel={sourceLabel}
      />
      {/* URL access explanation (for URL citations with access failures) */}
      {urlAccessExplanation && <UrlAccessExplanationSection explanation={urlAccessExplanation} />}
      <div className="p-3 flex flex-col gap-2">
        {!urlAccessExplanation && statusLabel && (
          <span
            className={cn(
              "text-xs font-medium",
              status.isVerified && !status.isPartialMatch && "text-green-600 dark:text-green-400",
              status.isPartialMatch && "text-amber-500 dark:text-amber-400",
              status.isMiss && "text-red-500 dark:text-red-400",
              status.isPending && "text-gray-500 dark:text-gray-400",
            )}
          >
            {statusLabel}
          </span>
        )}
        {hasSnippet && (
          <q
            className="border-l-2 border-gray-300 dark:border-gray-600 pl-1.5 ml-0.5 text-sm text-gray-700 dark:text-gray-200"
            style={{ quotes: "none" }}
          >
            {verification.verifiedMatchSnippet}
          </q>
        )}
        {pageNumber && pageNumber > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Page {pageNumber}</span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * CitationComponent displays a citation with verification status.
 *
 * ## Interaction Pattern
 *
 * - **Hover**: Style effects only (no popover)
 * - **First Click**: Shows popover with verification image and details
 * - **Second Click**: Closes the popover
 * - **Click Outside / Escape**: Closes the popover
 *
 * ## Customization
 *
 * Use `behaviorConfig.onClick` to completely replace the click behavior,
 * or `eventHandlers.onClick` to add side effects (which disables defaults).
 */
export const CitationComponent = forwardRef<HTMLSpanElement, CitationComponentProps>(
  (
    {
      citation,
      children,
      className,
      fallbackDisplay,
      verification,
      isLoading = false,
      variant = "linter",
      content: contentProp,
      interactionMode: _interactionMode, // Deprecated, ignored
      eventHandlers,
      behaviorConfig,
      isMobile: isMobileProp,
      renderIndicator,
      renderContent,
      popoverPosition = "bottom",
      renderPopoverContent,
      additionalCount,
      faviconUrl,
      showIndicator = true,
      indicatorVariant = "icon",
      sourceLabel,
    },
    ref,
  ) => {
    // Warn about deprecated props in development (once per prop to avoid console spam)
    if (process.env.NODE_ENV !== "production") {
      if (_interactionMode !== undefined && !deprecationWarned.has("interactionMode")) {
        deprecationWarned.add("interactionMode");
        console.warn(
          "CitationComponent: interactionMode prop is deprecated and has no effect. " +
            "The component now always uses click-to-show-popover behavior.",
        );
      }
      if (eventHandlers?.onClick && behaviorConfig?.onClick && !deprecationWarned.has("eventHandlers.onClick")) {
        deprecationWarned.add("eventHandlers.onClick");
        console.warn(
          "CitationComponent: eventHandlers.onClick is ignored when behaviorConfig.onClick is provided. " +
            "Prefer behaviorConfig.onClick for customizing click behavior.",
        );
      }
    }

    // Get overlay context for blocking hover when any image overlay is open
    const { isAnyOverlayOpen } = useCitationOverlay();

    // Auto-detect touch device if isMobile prop not explicitly provided
    const isTouchDevice = useIsTouchDevice();
    const isMobile = isMobileProp ?? isTouchDevice;

    // Resolve content: explicit content prop or default for variant
    const resolvedContent: CitationContent = useMemo(() => {
      if (contentProp) return contentProp;
      return getDefaultContent(variant);
    }, [contentProp, variant]);
    const [isHovering, setIsHovering] = useState(false);
    const [popoverViewState, setPopoverViewState] = useState<PopoverViewState>("summary");
    // Custom image src from behaviorConfig.onClick returning setImageExpanded: "<url>"
    const [customExpandedSrc, setCustomExpandedSrc] = useState<string | null>(null);
    // Natural width of the expanded image (propagated from DefaultPopoverContent).
    // Used to size PopoverContent so floating-ui can position it correctly.
    const [expandedImageWidth, setExpandedImageWidth] = useState<number | null>(null);
    // Computed sideOffset for expanded-page mode — positions the popover to span the full
    // viewport height by anchoring its top edge near the viewport top (not just below the trigger).
    const [expandedPageSideOffset, setExpandedPageSideOffset] = useState<number | null>(null);

    // Collapse the expanded image on ESC key (capture phase to intercept before Radix).
    // First Escape collapses the expanded view back to summary; second Escape (handled
    // by Radix since popoverViewState is now "summary") closes the popover.
    // stopPropagation prevents Radix from also handling ESC and closing the popover.
    useEffect(() => {
      if (popoverViewState === "summary") return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setPopoverViewState("summary");
          setCustomExpandedSrc(null);
        }
      };
      document.addEventListener("keydown", handler, true);
      return () => document.removeEventListener("keydown", handler, true);
    }, [popoverViewState]);

    // Lock body scroll when the popover is open (ref-counted so overlapping
    // instances don't leave the page permanently locked). See acquireScrollLock().
    useEffect(() => {
      if (!isHovering) return;
      acquireScrollLock();
      return () => releaseScrollLock();
    }, [isHovering]);

    // When entering expanded-page mode, compute offsets that position the popover:
    //   Y axis: top edge near viewport top (y≈8px) so the image fills the full height.
    //   X axis: horizontally centered on the viewport (not the trigger).
    //
    // avoidCollisions is disabled for expanded-page to prevent floating-ui from
    // overriding the vertical offset, so we must handle horizontal centering ourselves.
    //
    // Formulas (side="bottom", align="center"):
    //   sideOffset  = MARGIN - triggerBottom
    //   alignOffset = viewportCenterX - triggerCenterX
    const [expandedPageAlignOffset, setExpandedPageAlignOffset] = useState<number | null>(null);
    useLayoutEffect(() => {
      if (popoverViewState !== "expanded-page") {
        setExpandedPageSideOffset(null);
        setExpandedPageAlignOffset(null);
        return;
      }
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setExpandedPageSideOffset(8 - rect.bottom);
      const triggerCenterX = rect.left + rect.width / 2;
      const viewportCenterX = window.innerWidth / 2;
      setExpandedPageAlignOffset(Math.round(viewportCenterX - triggerCenterX));
    }, [popoverViewState]);

    // Dismiss the popover and reset its view state in one step.
    // Replaces the old useEffect that watched isHovering — moving the reset into
    // the event handler avoids an extra render cycle (flash).
    const closePopover = useCallback(() => {
      setIsHovering(false);
      setPopoverViewState("summary");
      setCustomExpandedSrc(null);
      setExpandedImageWidth(null);
    }, []);

    // Track if popover was already open before current interaction (for mobile/lazy mode).
    // Lifecycle:
    // 1. Set in handleTouchStart to capture isHovering state BEFORE the touch triggers any changes
    // 2. Read in handleTouchEnd/handleClick to determine if this is a "first tap" or "second tap"
    // 3. First tap (ref=false): Opens popover
    // 4. Second tap (ref=true): Closes popover
    const wasPopoverOpenBeforeTap = useRef(false);

    // Track last touch time for touch-to-click debouncing (prevents double-firing).
    // Note: This ref is per-component-instance, so debouncing is citation-specific.
    // Tapping Citation A then quickly tapping Citation B will NOT incorrectly debounce B,
    // because each CitationComponent instance has its own lastTouchTimeRef.
    const lastTouchTimeRef = useRef(0);

    // Ref to track isHovering for touch handlers (avoids stale closure issues).
    // This ref is kept in sync with isHovering state on every render, allowing
    // handleTouchStart to read the current value without being recreated on every
    // isHovering change (which would cause unnecessary callback churn).
    // Pattern explanation: Mutating refs during render is safe here because:
    // 1. Refs are explicitly designed to hold mutable values that don't affect rendering
    // 2. This is a standard React pattern for keeping refs in sync with state/props
    // 3. The mutation has no side effects - it just mirrors the state value
    // See: https://react.dev/reference/react/useRef#referencing-a-value-with-a-ref
    const isHoveringRef = useRef(isHovering);
    isHoveringRef.current = isHovering;

    // Ref to track isAnyOverlayOpen for the mobile outside-touch effect (avoids stale closure).
    // When an image overlay is open, we don't want outside taps to close the popover.
    const isAnyOverlayOpenRef = useRef(isAnyOverlayOpen);
    isAnyOverlayOpenRef.current = isAnyOverlayOpen;

    // Ref for the popover content element (for mobile click-outside dismiss detection)
    const popoverContentRef = useRef<HTMLElement | null>(null);

    // Callback ref for setting the popover content element
    const setPopoverContentRef = useCallback((element: HTMLElement | null) => {
      popoverContentRef.current = element;
    }, []);

    // Ref for the trigger element (for mobile click-outside dismiss detection)
    // We need our own ref in addition to the forwarded ref to reliably check click targets
    const triggerRef = useRef<HTMLSpanElement>(null);

    // Merge the forwarded ref with our internal triggerRef
    const setTriggerRef = useCallback(
      (element: HTMLSpanElement | null) => {
        // Set our internal ref
        triggerRef.current = element;
        // Forward to the external ref
        if (typeof ref === "function") {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }
      },
      [ref],
    );

    const citationKey = useMemo(() => generateCitationKey(citation), [citation]);
    const citationInstanceId = useMemo(() => generateCitationInstanceId(citationKey), [citationKey]);

    // Derive status from verification object
    const status = useMemo(() => getStatusFromVerification(verification), [verification]);
    const { isMiss, isPartialMatch, isVerified, isPending } = status;

    // Resolve the image source, preferring the new field name with fallback to deprecated one
    const resolvedImageSrc = verification?.document?.verificationImageSrc ?? null;

    // 3-stage spinner: active (0-5s) → slow (5-15s) → stale (15s+)
    const [spinnerStage, setSpinnerStage] = useState<SpinnerStage>("active");
    const spinnerTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    const hasDefinitiveResult =
      resolvedImageSrc ||
      verification?.status === "found" ||
      verification?.status === "found_anchor_text_only" ||
      verification?.status === "found_phrase_missed_anchor_text" ||
      verification?.status === "not_found" ||
      verification?.status === "partial_text_found" ||
      verification?.status === "found_on_other_page" ||
      verification?.status === "found_on_other_line" ||
      verification?.status === "first_word_found";

    const shouldShowSpinner = (isLoading || isPending) && !hasDefinitiveResult && spinnerStage !== "stale";

    useEffect(() => {
      for (const t of spinnerTimeoutsRef.current) clearTimeout(t);
      spinnerTimeoutsRef.current = [];

      if ((isLoading || isPending) && !hasDefinitiveResult) {
        setSpinnerStage("active");
        spinnerTimeoutsRef.current.push(
          setTimeout(() => setSpinnerStage("slow"), SPINNER_TIMEOUT_MS),
          setTimeout(() => setSpinnerStage("stale"), SPINNER_TIMEOUT_MS * 3),
        );
      } else {
        setSpinnerStage("active");
      }

      return () => {
        for (const t of spinnerTimeoutsRef.current) clearTimeout(t);
      };
    }, [isLoading, isPending, hasDefinitiveResult]);

    const displayText = useMemo(() => {
      return getDisplayText(citation, resolvedContent, fallbackDisplay);
    }, [citation, resolvedContent, fallbackDisplay]);

    // Behavior context for custom handlers
    const getBehaviorContext = useCallback(
      (): CitationBehaviorContext => ({
        citation,
        citationKey,
        verification: verification ?? null,
        isTooltipExpanded: isHovering,
        isImageExpanded: popoverViewState !== "summary",
        hasImage: !!resolvedImageSrc,
      }),
      [citation, citationKey, verification, isHovering, popoverViewState, resolvedImageSrc],
    );

    // Apply behavior actions from custom handler
    const applyBehaviorActions = useCallback(
      (actions: CitationBehaviorActions) => {
        if (actions.setImageExpanded !== undefined) {
          if (actions.setImageExpanded === false) {
            // Close: collapse to summary and dismiss the popover
            closePopover();
          } else if (actions.setImageExpanded) {
            // Open: show popover in expanded (full page) view
            setIsHovering(true);
            setPopoverViewState("expanded-page");
            // If a custom image URL was provided, validate before storing
            if (typeof actions.setImageExpanded === "string" && isValidProofImageSrc(actions.setImageExpanded)) {
              setCustomExpandedSrc(actions.setImageExpanded);
            }
          }
        }
      },
      [closePopover],
    );

    // Shared tap/click action handler - used by both click and touch handlers.
    // Extracts the common logic to avoid duplication.
    //
    // Action types:
    // - "showPopover": Show the popover (first tap/click when popover is closed)
    // - "hidePopover": Hide the popover (for lazy mode toggle behavior)
    // - "expandImage": Transition popover to expanded view
    //
    // Dependency chain explanation:
    // - getBehaviorContext: Captures current state (citation, verification, isHovering, popoverViewState)
    //   and is itself a useCallback that updates when those values change
    // - applyBehaviorActions: Handles setImageExpanded by updating popoverViewState
    // - behaviorConfig/eventHandlers: User-provided callbacks that may change
    // - citation/citationKey: Core data passed to callbacks
    // - State setters (setIsHovering, etc.): Stable references included for exhaustive-deps
    const handleTapAction = useCallback(
      (
        e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
        action: "showPopover" | "hidePopover" | "expandImage",
      ): void => {
        const context = getBehaviorContext();

        // Custom onClick via behaviorConfig replaces default
        if (behaviorConfig?.onClick) {
          const result = behaviorConfig.onClick(context, e);
          if (result && typeof result === "object") {
            applyBehaviorActions(result);
          }
          eventHandlers?.onClick?.(citation, citationKey, e);
          return;
        }

        // Custom eventHandlers.onClick disables default
        if (eventHandlers?.onClick) {
          eventHandlers.onClick(citation, citationKey, e);
          return;
        }

        // Execute the requested action
        switch (action) {
          case "showPopover":
            setIsHovering(true);
            break;
          case "hidePopover":
            closePopover();
            break;
          case "expandImage":
            setPopoverViewState("expanded-page");
            break;
        }
      },
      [behaviorConfig, eventHandlers, citation, citationKey, getBehaviorContext, applyBehaviorActions, closePopover],
    );

    // Click handler
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();

        // Ignore click events that occur shortly after touch events (prevents double-firing)
        if (isMobile && Date.now() - lastTouchTimeRef.current < TOUCH_CLICK_DEBOUNCE_MS) {
          return;
        }

        // On mobile: first tap shows popover, second tap closes it
        // wasPopoverOpenBeforeTap is set in handleTouchStart before the click fires
        if (isMobile) {
          if (!wasPopoverOpenBeforeTap.current) {
            handleTapAction(e, "showPopover");
          } else {
            handleTapAction(e, "hidePopover");
          }
          return;
        }

        // Click toggles popover visibility
        if (!isHovering) {
          handleTapAction(e, "showPopover");
        } else {
          handleTapAction(e, "hidePopover");
        }
      },
      [isMobile, isHovering, handleTapAction],
    );

    // Keyboard handler for accessibility - Enter/Space triggers tap action
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();

          // Toggle popover visibility
          if (!isHovering) {
            handleTapAction(e, "showPopover");
          } else {
            handleTapAction(e, "hidePopover");
          }
        }
      },
      [isHovering, handleTapAction],
    );

    const handleMouseEnter = useCallback(() => {
      // Don't trigger hover popover if any image overlay is expanded
      if (isAnyOverlayOpen) return;
      // Don't show popover on hover - only on click (lazy mode behavior)
      if (behaviorConfig?.onHover?.onEnter) {
        behaviorConfig.onHover.onEnter(getBehaviorContext());
      }
      eventHandlers?.onMouseEnter?.(citation, citationKey);
    }, [eventHandlers, behaviorConfig, citation, citationKey, getBehaviorContext, isAnyOverlayOpen]);

    const handleMouseLeave = useCallback(() => {
      // Popover is click-to-open, so it should only close on click (not on hover-away).
      // Fire external callbacks for consumers tracking hover state, but do not close the popover.
      if (behaviorConfig?.onHover?.onLeave) {
        behaviorConfig.onHover.onLeave(getBehaviorContext());
      }
      eventHandlers?.onMouseLeave?.(citation, citationKey);
    }, [eventHandlers, behaviorConfig, citation, citationKey, getBehaviorContext]);

    // Escape key handling is managed by Radix Popover via onOpenChange and onEscapeKeyDown props

    // Mobile click-outside dismiss handler
    //
    // On mobile, tapping outside the citation trigger or popover should dismiss the popover.
    // Desktop uses a document-level mousedown listener (below) for click-outside dismiss.
    //
    // Why custom handling instead of Radix's built-in click-outside behavior:
    // The PopoverContent has onPointerDownOutside and onInteractOutside handlers that call
    // e.preventDefault() to give us full control over popover state. This is necessary for
    // the two-tap mobile interaction pattern (first tap shows popover, second tap opens image).
    // However, it means we need custom touch handling to dismiss the popover on outside taps.
    //
    // Event order when tapping the trigger while popover is open:
    // 1. handleOutsideTouch (capture phase, document) - checks .contains(), returns early
    // 2. handleTouchStart (bubble phase, trigger) - reads isHoveringRef.current
    // 3. handleTouchEnd/handleClick - determines first vs second tap action
    // The .contains() check in step 1 ensures we don't dismiss when tapping the trigger,
    // allowing the normal two-tap flow to proceed.
    //
    // Portal note: popoverContentRef works with portaled content because Radix renders
    // the popover content as a child of document.body, but we hold a direct ref to that
    // DOM element, so .contains() correctly detects touches inside it.
    //
    // Cleanup: The listener only attaches when isMobile AND isHovering are both true.
    // It's automatically removed when either condition becomes false or on unmount.
    // This minimizes document-level listener churn since popovers open/close frequently.
    useEffect(() => {
      if (!isMobile || !isHovering) return;

      const handleOutsideTouch = (e: TouchEvent) => {
        // Don't dismiss popover while an image overlay is open - user expects to return
        // to the popover after closing the zoomed image. Uses ref to avoid stale closure.
        if (isAnyOverlayOpenRef.current) {
          return;
        }

        // Type guard for touch event target
        const target = e.target;
        if (!(target instanceof Node)) {
          return;
        }

        // Check if touch is inside the trigger element
        if (triggerRef.current?.contains(target)) {
          return;
        }

        // Check if touch is inside the popover content (works with portaled content)
        if (popoverContentRef.current?.contains(target)) {
          return;
        }

        // Touch is outside both - dismiss the popover
        closePopover();
      };

      // Use touchstart with capture phase to detect touches before they're handled
      // by other handlers (like handleTouchStart on the citation trigger itself)
      document.addEventListener("touchstart", handleOutsideTouch, {
        capture: true,
      });

      return () => {
        document.removeEventListener("touchstart", handleOutsideTouch, {
          capture: true,
        });
      };
    }, [isMobile, isHovering, closePopover]);

    // Desktop click-outside dismiss handler
    //
    // On desktop, clicking outside the citation trigger or popover should dismiss the popover.
    // This is separate from the mouse-leave handler because clicks should always be
    // respected immediately, even during hover close delays.
    //
    // Why separate from mobile handler:
    // - Desktop uses mousedown (not touchstart) for better UX consistency with other web apps
    // - Mobile has its own touch handler above with different timing characteristics
    //
    // Note: We still check isAnyOverlayOpenRef to keep the popover open when image overlay is shown.
    useEffect(() => {
      if (isMobile || !isHovering) return;

      const handleOutsideClick = (e: MouseEvent) => {
        // Don't dismiss popover while an image overlay is open - user expects to return
        // to the popover after closing the zoomed image. Uses ref to avoid stale closure.
        if (isAnyOverlayOpenRef.current) {
          return;
        }

        // Type guard for mouse event target
        const target = e.target;
        if (!(target instanceof Node)) {
          return;
        }

        // Check if click is inside the trigger element
        if (triggerRef.current?.contains(target)) {
          return;
        }

        // Check if click is inside the popover content (works with portaled content)
        if (popoverContentRef.current?.contains(target)) {
          return;
        }

        // Click is outside both - dismiss the popover
        closePopover();
      };

      // Use mousedown with capture phase to detect clicks before they bubble
      document.addEventListener("mousedown", handleOutsideClick, {
        capture: true,
      });

      return () => {
        document.removeEventListener("mousedown", handleOutsideClick, {
          capture: true,
        });
      };
    }, [isMobile, isHovering, closePopover]);

    // Touch start handler for mobile - captures popover state before touch ends.
    // Reads isHoveringRef.current (which is kept in sync with isHovering state above)
    // to avoid stale closure issues without recreating the callback on every hover change.
    const handleTouchStart = useCallback(
      (e: React.TouchEvent<HTMLSpanElement>) => {
        if (isMobile) {
          // Capture whether popover was already open before this tap.
          // This determines first vs second tap behavior in handleTouchEnd.
          wasPopoverOpenBeforeTap.current = isHoveringRef.current;

          // Call user-provided touch start handler (for analytics, etc.)
          eventHandlers?.onTouchStart?.(citation, citationKey, e);
        }
      },
      [isMobile, eventHandlers, citation, citationKey],
    );

    // Touch handler for mobile - handles tap-to-show-popover and tap-to-close.
    // On second tap, closes the popover.
    const handleTouchEnd = useCallback(
      (e: React.TouchEvent<HTMLSpanElement>) => {
        if (isMobile) {
          e.preventDefault();
          e.stopPropagation();

          // Record touch time for click debouncing
          lastTouchTimeRef.current = Date.now();

          eventHandlers?.onTouchEnd?.(citation, citationKey, e);

          // Determine if this is the first tap (popover was closed) or second tap (popover was open)
          if (!wasPopoverOpenBeforeTap.current) {
            handleTapAction(e, "showPopover");
          } else {
            handleTapAction(e, "hidePopover");
          }
        }
      },
      [isMobile, eventHandlers, citation, citationKey, handleTapAction],
    );

    // Inline variants (text, linter) inherit text color from their parent element.
    // This allows citations to blend seamlessly into styled text (e.g., colored headers).
    // Self-contained variants (chip, badge, brackets) set their own text color.
    // Superscript is excluded: its anchor text inherits naturally, and its <sup> element
    // is a distinct UI element (footnote reference) that keeps its own styling.
    const isInlineVariant = variant === "text" || variant === "linter";

    // Early return for miss with fallback display (only when showing anchorText)
    // Inline variants inherit color (dimmed via opacity), others use explicit gray.
    if (fallbackDisplay !== null && fallbackDisplay !== undefined && resolvedContent === "anchorText" && isMiss) {
      const fallbackClasses = isInlineVariant ? "opacity-50" : "text-gray-400 dark:text-gray-500";
      return <span className={cn(fallbackClasses, className)}>{fallbackDisplay}</span>;
    }

    const statusClasses = cn(
      // Found status (text color) - verified or partial match, for brackets variant
      (isVerified || isPartialMatch) &&
        variant === "brackets" &&
        "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline",
      // Miss state: opacity dims the inherited/explicit color
      isMiss && "opacity-70",
      // Explicit gray only for non-inline variants (inline variants inherit from parent)
      isMiss && !isInlineVariant && "text-gray-700 dark:text-gray-200",
      // Pending/spinner: muted color for non-inline variants only.
      // Inline variants inherit color; the spinner icon signals loading.
      // (Linter handles pending color in its own inline styles.)
      shouldShowSpinner && !isInlineVariant && "text-gray-500 dark:text-gray-400",
    );

    // Build props for the extracted CitationStatusIndicator component
    const indicatorProps: CitationStatusIndicatorProps = {
      renderIndicator,
      status,
      showIndicator,
      indicatorVariant,
      shouldShowSpinner,
      isVerified,
      isPartialMatch,
      isMiss,
      spinnerStage,
    };

    // Build the citation content element using the extracted module-level components
    const citationContentNode = (
      <CitationContentDisplay
        renderContent={renderContent}
        citation={citation}
        status={status}
        citationKey={citationKey}
        displayText={displayText}
        resolvedContent={resolvedContent}
        variant={variant}
        statusClasses={statusClasses}
        isVerified={isVerified}
        isPartialMatch={isPartialMatch}
        isMiss={isMiss}
        shouldShowSpinner={shouldShowSpinner}
        showIndicator={showIndicator}
        faviconUrl={faviconUrl}
        additionalCount={additionalCount}
        indicatorProps={indicatorProps}
      />
    );

    // Popover visibility
    const isPopoverHidden = popoverPosition === "hidden";
    // Show popover for:
    // 1. Verification with image or snippet (verified cases)
    // 2. Loading/pending states (informative searching message)
    // 3. Miss states (show what was searched)
    const shouldShowPopover =
      !isPopoverHidden &&
      // Has verification with image or snippet
      ((verification && (resolvedImageSrc || verification.verifiedMatchSnippet)) ||
        // Loading/pending state
        shouldShowSpinner ||
        isPending ||
        isLoading ||
        // Miss state (show what was searched)
        isMiss);

    const hasImage = !!resolvedImageSrc;

    // Shared trigger element props
    // All variants use status-aware hover colors (green/amber/red/gray)
    // Cursor is always pointer since click toggles popover/details
    const cursorClass = "cursor-pointer";

    // Generate unique IDs for ARIA attributes
    const popoverId = `citation-popover-${citationInstanceId}`;
    const statusDescId = `citation-status-${citationInstanceId}`;
    const statusDescription = shouldShowSpinner ? "Verifying..." : getStatusLabel(status);

    // Variants with their own hover styles don't need parent hover (would extend beyond bounds)
    const variantHasOwnHover = VARIANTS_WITH_OWN_HOVER.has(variant);

    const triggerProps = {
      "data-citation-id": citationKey,
      "data-citation-instance": citationInstanceId,
      className: cn(
        "relative inline-flex items-baseline",
        "px-0.5 -mx-0.5 rounded-sm",
        "transition-all duration-[50ms]",
        cursorClass,
        // Improved touch target size on mobile (minimum 44px recommended)
        // Using py-1.5 for better touch accessibility without breaking layout
        isMobile && "py-1.5 touch-manipulation",
        // Status-aware hover for variants that don't handle their own hover styling (10% opacity)
        ...(variantHasOwnHover ? [] : getStatusHoverClasses(isVerified, isPartialMatch, isMiss, shouldShowSpinner, 10)),
        // Focus styles for keyboard accessibility
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
        className,
      ),
      // ARIA attributes for accessibility
      role: "button" as const,
      tabIndex: 0,
      "aria-expanded": isHovering,
      "aria-controls": shouldShowPopover ? popoverId : undefined,
      "aria-label": displayText ? `Citation: ${displayText}` : "Citation",
      "aria-describedby": statusDescription ? statusDescId : undefined,
      // Event handlers
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      onTouchStart: isMobile ? handleTouchStart : undefined,
      onTouchEndCapture: isMobile ? handleTouchEnd : undefined,
    };

    // Render with Radix Popover
    if (shouldShowPopover) {
      const popoverContentElement = renderPopoverContent ? (
        <CitationErrorBoundary>
          {renderPopoverContent({
            citation,
            verification: verification ?? null,
            status,
          })}
        </CitationErrorBoundary>
      ) : (
        <CitationErrorBoundary>
          <DefaultPopoverContent
            citation={citation}
            verification={verification ?? null}
            status={status}
            isLoading={isLoading || shouldShowSpinner}
            isVisible={isHovering}
            sourceLabel={sourceLabel}
            indicatorVariant={indicatorVariant}
            viewState={popoverViewState}
            onViewStateChange={setPopoverViewState}
            expandedImageSrcOverride={customExpandedSrc}
            onExpandedWidthChange={setExpandedImageWidth}
          />
        </CitationErrorBoundary>
      );

      // Pre-render the image content in hidden mode when we have an image
      // but the user isn't hovering yet. This uses React 19.2's Activity
      // component to prefetch and decode the image before it's needed.
      const prefetchElement =
        hasImage && !isHovering && !renderPopoverContent ? (
          <CitationErrorBoundary>
            <DefaultPopoverContent
              citation={citation}
              verification={verification ?? null}
              status={status}
              isLoading={false}
              isVisible={false}
              sourceLabel={sourceLabel}
              indicatorVariant={indicatorVariant}
            />
          </CitationErrorBoundary>
        ) : null;

      return (
        <>
          {children}
          {/* Visually hidden live region for screen reader status announcements */}
          {statusDescription && (
            <span id={statusDescId} className="sr-only" aria-live="polite">
              {statusDescription}
            </span>
          )}
          {/* Hidden prefetch layer - pre-renders image content using Activity */}
          {prefetchElement}
          <Popover
            open={isHovering}
            onOpenChange={open => {
              // Only handle close (Escape key) - don't interfere with our custom hover logic
              if (!open && !isAnyOverlayOpenRef.current) {
                closePopover();
              }
            }}
          >
            <PopoverTrigger asChild>
              <span ref={setTriggerRef} {...triggerProps}>
                {citationContentNode}
              </span>
            </PopoverTrigger>
            <PopoverContent
              ref={setPopoverContentRef}
              id={popoverId}
              // In expanded-page mode, force side="bottom" so our sideOffset formula is correct
              // (popoverTop = triggerBottom + sideOffset). avoidCollisions is disabled so
              // floating-ui doesn't override the computed position.
              side={popoverViewState === "expanded-page" ? "bottom" : popoverPosition === "bottom" ? "bottom" : "top"}
              avoidCollisions={popoverViewState !== "expanded-page"}
              sideOffset={
                popoverViewState === "expanded-page" && expandedPageSideOffset !== null
                  ? expandedPageSideOffset
                  : undefined
              }
              alignOffset={
                popoverViewState === "expanded-page" && expandedPageAlignOffset !== null
                  ? expandedPageAlignOffset
                  : undefined
              }
              onPointerDownOutside={(e: Event) => e.preventDefault()}
              onInteractOutside={(e: Event) => e.preventDefault()}
              style={
                popoverViewState === "expanded-page"
                  ? {
                      maxWidth: "calc(100dvw - 2rem)",
                      // Clamp to image natural width + shell padding; fall back to
                      // viewport width when dimensions are unknown (before image loads).
                      width:
                        expandedImageWidth !== null
                          ? `min(${expandedImageWidth + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem))`
                          : "calc(100dvw - 2rem)",
                      // No forced height — popover sizes to content, capped by maxHeight.
                      // Small images → compact popover. Large images → grows to boundary.
                      // Override Popover.tsx's default maxHeight (which uses
                      // --radix-popover-content-available-height, only measuring space
                      // on ONE side of the trigger) to allow filling the full viewport.
                      maxHeight: "calc(100dvh - 2rem)",
                    }
                  : popoverViewState === "expanded-evidence"
                    ? {
                        maxWidth: "calc(100dvw - 2rem)",
                        width:
                          expandedImageWidth !== null
                            ? `min(${expandedImageWidth + EXPANDED_IMAGE_SHELL_PX}px, calc(100dvw - 2rem))`
                            : "calc(100dvw - 2rem)",
                      }
                    : undefined
              }
              onClick={(e: React.MouseEvent) => {
                // Clicking directly on the popover backdrop (not on inner content) dismisses it.
                // e.target === e.currentTarget means the click hit the dialog's own element,
                // not a child element — so this only fires when clicking the outer wrapper area.
                if (e.target === e.currentTarget) closePopover();
              }}
            >
              {popoverContentElement}
            </PopoverContent>
          </Popover>
        </>
      );
    }

    // Render without popover
    return (
      <>
        {children}
        {/* Visually hidden live region for screen reader status announcements */}
        {statusDescription && (
          <span id={statusDescId} className="sr-only" aria-live="polite">
            {statusDescription}
          </span>
        )}
        <span ref={setTriggerRef} {...triggerProps}>
          {citationContentNode}
        </span>
      </>
    );
  },
);

CitationComponent.displayName = "CitationComponent";

export const MemoizedCitationComponent = memo(CitationComponent);
