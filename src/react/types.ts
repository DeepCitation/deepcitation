import type { Citation, CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import type { SearchState } from "../types/search.js";

/**
 * Available citation display variants.
 *
 * - `brackets`: Shows keySpan/number in brackets with blue text styling (default).
 *               Use hideKeySpan=true for numeric-only display.
 *               Use hideBrackets=true to hide the square brackets.
 * - `text`: Shows the keySpan, inherits parent text styling, no truncation, shows indicator
 * - `minimal`: No brackets, just display text with indicator
 * - `indicator`: Only the status indicator (checkmark/warning), no text
 */
export type CitationVariant =
  | "brackets" // [keySpan✓] with blue text styling
  | "text" // keySpan✓ - inherits parent styling
  | "minimal" // text✓ - just text with indicator
  | "indicator"; // ✓ - only the indicator

/**
 * URL fetch status for URL citations.
 */
export type UrlFetchStatus =
  | "verified" // URL content verified successfully
  | "partial" // Partial content match
  | "pending" // Verification in progress
  | "blocked_antibot" // Blocked by anti-bot protection (Cloudflare, etc.)
  | "blocked_login" // Requires login/authentication
  | "blocked_paywall" // Behind paywall
  | "blocked_geo" // Geo-restricted content
  | "blocked_rate_limit" // Rate limited
  | "error_timeout" // Request timed out
  | "error_not_found" // 404 or similar
  | "error_server" // 5xx server error
  | "error_network" // Network/DNS error
  | "unknown"; // Unknown status

/**
 * URL citation metadata.
 */
export interface UrlCitationMeta {
  /** The full URL */
  url: string;
  /** Display domain (e.g., "example.com") */
  domain?: string;
  /** Page title if fetched */
  title?: string;
  /** Fetch/verification status */
  fetchStatus: UrlFetchStatus;
  /** When the URL was last verified */
  verifiedAt?: Date | string;
  /** HTTP status code if available */
  httpStatus?: number;
  /** Error message if applicable */
  errorMessage?: string;
  /** Favicon URL if available */
  faviconUrl?: string;
}

/**
 * Style configuration for the citation component.
 * All properties are optional class name strings.
 */
export interface CitationStyles {
  /** Container wrapper class */
  container?: string;
  /** Citation number bracket wrapper */
  bracketWrapper?: string;
  /** Inner bracket content */
  bracketContent?: string;
  /** Citation text/number itself */
  citationText?: string;
  /** Verified status indicator */
  verifiedIcon?: string;
  /** Partial match indicator */
  partialIcon?: string;
  /** Pending/loading state */
  pendingText?: string;
}

/**
 * State classes applied based on citation verification status
 */
export interface CitationStateClasses {
  /** Applied when citation is verified (found in document) */
  verified?: string;
  /** Applied when citation is a miss (not found) */
  miss?: string;
  /** Applied when citation is a partial match */
  partial?: string;
  /** Applied when citation verification is pending */
  pending?: string;
}

/**
 * Cursor classes for different zoom states
 */
export interface CitationCursorClasses {
  zoomIn?: string;
  zoomOut?: string;
  pointer?: string;
}

/**
 * Props for the base CitationComponent
 */
export interface BaseCitationProps {
  /** The citation data to display */
  citation: Citation;
  /** Child content to render before the citation bracket */
  children?: React.ReactNode;
  /** Additional class name for the container */
  className?: string;
  /** Class name for controlling inner content width */
  innerWidthClassName?: string;
  /**
   * When true, hides keySpan and displays citation number only. When false, displays keySpan text.
   * @default false
   */
  hideKeySpan?: boolean;
  /** Fallback display text when citation keySpan is empty */
  fallbackDisplay?: string | null;
  /** Display variant for the citation */
  variant?: CitationVariant;
}

/**
 * Props for URL citation component
 */
export interface UrlCitationProps extends Omit<BaseCitationProps, "citation"> {
  /** URL metadata including fetch status */
  urlMeta: UrlCitationMeta;
  /** The citation data (optional, will be derived from urlMeta if not provided) */
  citation?: Citation;
  /** Whether to show the full URL on hover */
  showFullUrlOnHover?: boolean;
  /** Whether to show favicon */
  showFavicon?: boolean;
  /** Whether to show the page title instead of domain */
  showTitle?: boolean;
  /** Maximum characters for truncated display */
  maxDisplayLength?: number;
  /** Custom render for the blocked status indicator */
  renderBlockedIndicator?: (
    status: UrlFetchStatus,
    errorMessage?: string
  ) => React.ReactNode;
  /** Click handler for the URL */
  onUrlClick?: (url: string, event: React.MouseEvent) => void;
  /** Event handlers for citation interactions */
  eventHandlers?: CitationEventHandlers;
  /** Whether tooltips should be prevented */
  preventTooltips?: boolean;
}

/**
 * Extended props for the citation content renderer
 */
export interface CitationContentProps extends BaseCitationProps {
  /** Unique key for this citation */
  citationKey: string;
  /** Unique instance ID for this citation render */
  citationInstanceId: string;
  /** Found citation highlight data */
  verification: Verification | null | undefined;
  /** Current search state */
  searchState: SearchState | undefined | null;
  /** Actual page number where citation was found */
  actualPageNumber?: number | null;
  /** Page number from citation data */
  citationPageNumber?: number | null;
  /** Unique highlight ID */
  highlightId?: string;
  /** Citation verification status */
  status: CitationStatus;
  /** Whether tooltips should be suppressed */
  preventTooltips?: boolean;
  /** Whether on mobile device */
  isMobile?: boolean;
  /** Style configuration */
  styles?: CitationStyles;
  /** State-based classes */
  stateClasses?: CitationStateClasses;
  /** Cursor classes */
  cursorClasses?: CitationCursorClasses;
}

/**
 * Render props for custom citation rendering
 */
export interface CitationRenderProps {
  /** The citation data */
  citation: Citation;
  /** Citation verification status */
  status: CitationStatus;
  /** The citation key */
  citationKey: string;
  /** Display text for the citation */
  displayText: string;
  /** Whether this is a merged keySpan display */
  isMergedDisplay: boolean;
}

/**
 * Event handlers for citation interactions
 */
export interface CitationEventHandlers {
  /** Called when mouse enters citation */
  onMouseEnter?: (citation: Citation, citationKey: string) => void;
  /** Called when mouse leaves citation */
  onMouseLeave?: (citation: Citation, citationKey: string) => void;
  /** Called when citation is clicked */
  onClick?: (
    citation: Citation,
    citationKey: string,
    event: React.MouseEvent | React.TouchEvent
  ) => void;
  /** Called on touch end (mobile) */
  onTouchEnd?: (
    citation: Citation,
    citationKey: string,
    event: React.TouchEvent
  ) => void;
}

/**
 * Context provided to behavior handlers for making decisions.
 */
export interface CitationBehaviorContext {
  /** The citation data */
  citation: Citation;
  /** Unique key for this citation */
  citationKey: string;
  /** Verification result if available */
  verification: Verification | null;
  /** Whether the popover is currently pinned open */
  isTooltipExpanded: boolean;
  /** Whether the full-size image overlay is currently open */
  isImageExpanded: boolean;
  /** Whether a verification image is available */
  hasImage: boolean;
}

/**
 * Actions that can be performed by the citation component.
 * These are returned by behavior handlers to control component state.
 */
export interface CitationBehaviorActions {
  /** Pin or unpin the popover (keeps it visible without hover) */
  setTooltipExpanded?: boolean;
  /** Open or close the full-size image overlay */
  setImageExpanded?: boolean | string;
  /** Expand or collapse the search phrases list (for miss/partial states) */
  setPhrasesExpanded?: boolean;
}

/**
 * Configuration for click behavior.
 * Return actions to perform, or `false` to prevent default behavior.
 */
export type CitationClickBehavior = (
  context: CitationBehaviorContext,
  event: React.MouseEvent | React.TouchEvent
) => CitationBehaviorActions | false | void;

/**
 * Configuration for hover behavior.
 */
export interface CitationHoverBehavior {
  /** Called when mouse enters the citation */
  onEnter?: (context: CitationBehaviorContext) => void;
  /** Called when mouse leaves the citation */
  onLeave?: (context: CitationBehaviorContext) => void;
}

/**
 * Configuration for customizing default citation behaviors.
 *
 * When you provide `onClick` or `onHover`, they REPLACE the corresponding default behaviors.
 * Use `eventHandlers` for side effects that should run alongside defaults.
 *
 * @example Custom click behavior (replaces default)
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   verification={verification}
 *   behaviorConfig={{
 *     onClick: (context, event) => {
 *       if (context.hasImage) {
 *         return { setImageExpanded: true };
 *       }
 *     }
 *   }}
 * />
 * ```
 *
 * @example Disable click behavior entirely
 * ```tsx
 * <CitationComponent
 *   citation={citation}
 *   verification={verification}
 *   behaviorConfig={{ onClick: () => false }}
 * />
 * ```
 */
export interface CitationBehaviorConfig {
  /**
   * Custom click behavior handler. When provided, REPLACES the default click behavior.
   *
   * Return values:
   * - `CitationBehaviorActions`: Apply specific state changes
   * - `false`: Prevent any state changes
   * - `void`/`undefined`: No state changes
   */
  onClick?: CitationClickBehavior;

  /**
   * Custom hover behavior handlers. When provided, REPLACE the default hover behavior.
   */
  onHover?: CitationHoverBehavior;
}

/**
 * Props for the tooltip wrapper component
 */
export interface CitationTooltipProps {
  children: React.ReactNode;
  citation: Citation;
  verification?: Verification | null;
  searchState?: SearchState | null;
  shouldShowTooltip: boolean;
}
