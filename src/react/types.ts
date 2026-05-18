import type { Citation, CitationStatus } from "../types/citation.js";
import type { SearchStatus } from "../types/search.js";
import type { ContentMatchStatus, Verification } from "../types/verification.js";

/**
 * Indicator style variant for verification status display.
 *
 * | Variant   | Description                                    |
 * |-----------|------------------------------------------------|
 * | `"icon"`  | Icon-based indicators: checkmark, spinner, X (default) |
 * | `"dot"`   | Subtle colored dot (like GitHub status dots / shadcn badge dots) |
 * | `"caret"` | Disclosure chevron (˅/˄) — flips when popover opens. No status coloring. |
 * | `"nav-dot"`| Neutral wayfinding dot — always one gray dot, independent of verification status. For navigation-anchor citations that have nothing to verify. |
 * | `"none"`  | No status indicator rendered                   |
 */
export type IndicatorVariant = "icon" | "dot" | "caret" | "nav-dot" | "none";

/**
 * Visual style variants for citations.
 *
 * | Variant       | Description                                    |
 * |---------------|------------------------------------------------|
 * | `chip`        | Pill/badge style with neutral gray background  |
 * | `brackets`    | [text✓] with square brackets                   |
 * | `text`        | Plain text, inherits parent styling (default)  |
 * | `superscript` | Small raised text like footnotes¹              |
 * | `footnote`    | Clean footnote marker with neutral default     |
 * | `badge`       | Source chip showing name + count (ChatGPT-style) |
 * | `linter`      | Inline text with semantic underlines            |
 * | `block`       | Sharp, square-bordered box (inline block marker)|
 */
export type CitationVariant =
  | "chip" // Pill/badge with neutral gray background
  | "brackets" // [text✓] with brackets
  | "text" // Plain text, inherits styling (default)
  | "superscript" // Small raised footnote style
  | "footnote" // Clean footnote marker with neutral default
  | "badge" // Source name chip with count (ChatGPT-style)
  | "linter" // Inline text with semantic underlines
  | "block"; // Sharp, square-bordered box (inline block marker)

/**
 * Content to display in the citation.
 *
 * | Content       | Description                                    |
 * |---------------|------------------------------------------------|
 * | `sourceMatch`  | Descriptive text (e.g., "Revenue Growth")      |
 * | `number`      | Citation number (e.g., "1", "2", "3")          |
 * | `indicator`   | Only the status icon (✓/⚠), no text            |
 * | `source`      | Source name with count (e.g., "Wikipedia +2")  |
 *
 * Default content per variant:
 * - `chip` → `sourceMatch`
 * - `brackets` → `sourceMatch`
 * - `text` → `sourceMatch`
 * - `linter` → `sourceMatch`
 * - `superscript` → `number`
 * - `footnote` → `number`
 * - `badge` → `source`
 */
export type CitationContent =
  | "sourceMatch" // Show sourceMatch text
  | "number" // Show citation number
  | "indicator" // Only show status icon
  | "source"; // Show source name with count (ChatGPT-style)

/**
 * URL fetch/access status for URL citations.
 * Covers HTTP accessibility and redirect scenarios.
 */
export type UrlFetchStatus =
  | "verified" // URL accessible and content verified
  | "partial" // URL accessible, partial content match
  | "pending" // Verification in progress
  | "accessible" // URL accessible but content not yet verified
  | "redirected" // URL redirected to different domain
  | "redirected_valid" // URL redirected but content still valid
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

export type { ContentMatchStatus };

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
 * Bundled download metadata for the source file download button.
 * When present, renders a download button in the popover header.
 */
export interface DownloadInfo {
  /** Sanitized download URL for the source file. */
  url: string;
  /** Explicit filename for the download. When omitted, inferred from the citation URL. */
  filename?: string;
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
 * A custom action button rendered in the citation popover header.
 * Follows the same icon-only pattern as the built-in download button.
 */
export interface PopoverAction {
  /** Icon element (rendered at size-3.5) */
  icon: React.ReactNode;
  /**
   * Accessible label for screen readers. Used as `aria-label` and as the
   * React list key — must be unique among sibling actions in the same popover.
   *
   * @remarks
   * `label` and `title` are rendered directly as `aria-label` / `title` attributes
   * without going through the DeepCitation i18n translator. Callers are responsible
   * for providing translated strings when the application is multilingual.
   */
  label: string;
  /** Tooltip text (defaults to label) */
  title?: string;
  /** Click handler — receives the citation and verification for context */
  onClick: (context: { citation: Citation; verification: Verification | null }) => void;
  /** When true, the action is not rendered */
  hidden?: boolean;
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
   * Visual style variant for the citation.
   * @default "text"
   */
  variant?: CitationVariant;
  /**
   * What content to display in the citation.
   * If not specified, defaults based on variant:
   * - `chip` → `sourceMatch`
   * - `brackets` → `number`
   * - `text` → `sourceMatch`
   * - `superscript` → `number`
   * - `footnote` → `number`
   * - `block` → `number`
   * - `linter` → `sourceMatch`
   */
  content?: CitationContent;
  /** Fallback display text when citation sourceMatch is empty */
  fallbackText?: string | null;
  /**
   * Override the display text shown on the citation trigger.
   *
   * When provided with `content: "sourceMatch"` (or variants that default to it),
   * this text replaces `citation.sourceMatch` on the trigger. The popover still
   * shows the original verified claim, with an inline annotation when the label
   * differs from the verified text.
   *
   * Has no effect when `content` is `"number"`, `"source"`, or `"indicator"`.
   *
   * @example
   * ```tsx
   * <CitationComponent
   *   citation={citation}
   *   verification={verification}
   *   claimText="99.99%"
   * />
   * // Trigger shows "99.99%", popover shows verified claim "100%"
   * ```
   */
  claimText?: string;
  /** Suppress all telemetry events (citation_seen, evidence_ready, popover timing). */
  disableTelemetry?: boolean;
  /** Image prefetch strategy. `"eager"` (default) prefetches on verification; `"lazy"` skips prefetch. */
  prefetch?: "eager" | "lazy";
  /**
   * Override label for the source displayed in popovers/headers.
   *
   * For document citations, this overrides the filename/label shown in the
   * popover header (e.g., "Annual Report 2024" instead of "document.pdf").
   *
   * For URL citations, this overrides the URL/domain display
   * (e.g., "Company Blog" instead of "example.com/blog/post").
   *
   * When not provided, the component falls back to:
   * - Document citations: `verification.label` or nothing
   * - URL citations: `citation.url` or `citation.domain`
   *
   * @example Document citation with custom label
   * ```tsx
   * <CitationComponent
   *   citation={citation}
   *   verification={verification}
   *   sourceTitle="Q4 Financial Report"
   * />
   * ```
   *
   * @example URL citation with custom label
   * ```tsx
   * <CitationComponent
   *   citation={urlCitation}
   *   verification={verification}
   *   sourceTitle="Official Documentation"
   * />
   * ```
   */
  sourceTitle?: string;
}

/**
 * Visual style variants for URL citations.
 *
 * | Variant   | Description                                              |
 * |-----------|----------------------------------------------------------|
 * | `badge`   | Clean bordered badge with favicon (default)              |
 * | `chip`    | Pill/badge style with background color                   |
 * | `inline`  | Underlined inline link                                   |
 * | `bracket` | [text✓] with square brackets                             |
 */
export type UrlCitationVariant = "badge" | "chip" | "inline" | "bracket";

/**
 * Props for URL citation component
 */
export interface UrlCitationProps extends Omit<BaseCitationProps, "citation" | "variant"> {
  /** Visual style variant for the URL citation */
  variant?: UrlCitationVariant;
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
  renderBlockedIndicator?: (status: UrlFetchStatus, errorMessage?: string) => React.ReactNode;
  /** Click handler for the URL (supports both mouse and keyboard activation) */
  onUrlClick?: (url: string, event: React.MouseEvent | React.KeyboardEvent) => void;
  /** Event handlers for citation interactions */
  eventHandlers?: CitationEventHandlers;
  /** Whether tooltips should be prevented */
  preventTooltips?: boolean;
  /** Whether to show the status indicator (checkmark, warning, spinner). Defaults to true. */
  showStatusIndicator?: boolean;
  /**
   * Visual style for status indicators.
   * - `"icon"`: Icon-based indicators (default)
   * - `"dot"`: Subtle colored dots (like GitHub status dots)
   * @default "icon"
   */
  indicatorVariant?: IndicatorVariant;
  /**
   * Whether to show an external link icon on hover.
   * The icon serves as a visual hint that clicking will open the URL.
   * @default true
   */
  showExternalLinkOnHover?: boolean;
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
  /** Search status */
  searchStatus: SearchStatus | undefined | null;
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
  /** Whether this is a merged sourceMatch display */
  isMergedDisplay: boolean;
}

/**
 * Event handlers for citation interactions.
 * Provides symmetric handlers for mouse and touch events.
 */
export interface CitationEventHandlers {
  /** Called when mouse enters citation */
  onMouseEnter?: (citation: Citation, citationKey: string) => void;
  /** Called when mouse leaves citation */
  onMouseLeave?: (citation: Citation, citationKey: string) => void;
  /**
   * Called when citation is clicked or activated via keyboard/touch.
   * Event types:
   * - `MouseEvent`: Desktop mouse clicks
   * - `TouchEvent`: Mobile tap interactions (from handleTouchEnd)
   * - `KeyboardEvent`: Keyboard activation (Enter/Space)
   */
  onClick?: (
    citation: Citation,
    citationKey: string,
    event: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
  ) => void;
  /**
   * Called after the default click behavior runs.
   *
   * Unlike `onClick`, this does not replace default behavior. Use this for
   * side effects that should run while preserving built-in popover interactions.
   */
  onClickAfterDefault?: (
    citation: Citation,
    citationKey: string,
    event: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
  ) => void;
  /**
   * Called before the default click behavior runs. Return `false` to suppress
   * the default popover toggle (and the paired `onClickAfterDefault`). Use when
   * single-click drives a separate interaction and the popover should open via
   * `onDoubleClick` or another trigger instead.
   *
   * Returning anything other than `false` allows the default to proceed.
   *
   * Note: keyboard activations (Enter/Space) do not invoke this callback — it
   * fires only for pointer events. If `onClick` is also provided, it takes
   * precedence and this callback will not be called.
   */
  onClickBeforeDefault?: (
    citation: Citation,
    citationKey: string,
    event: React.MouseEvent | React.TouchEvent,
  ) => boolean | undefined;
  /**
   * Called on double-click. Independent of the single-click path — defaults
   * are not affected. Intended for consumers that reserve single-click for a
   * separate interaction and open the popover on double-click instead.
   *
   * Note: browsers fire two `click` events before `dblclick` (~300ms delay).
   * Pair this with `onClickBeforeDefault` returning `false` to prevent those
   * clicks from toggling the popover or triggering `onClickAfterDefault`.
   */
  onDoubleClick?: (citation: Citation, citationKey: string, event: React.MouseEvent) => void;
  /** Called on touch start (mobile) - useful for analytics or custom interactions */
  onTouchStart?: (citation: Citation, citationKey: string, event: React.TouchEvent) => void;
  /** Called on touch end (mobile) */
  onTouchEnd?: (citation: Citation, citationKey: string, event: React.TouchEvent) => void;
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
}

/**
 * Configuration for click behavior.
 * Return actions to perform, or `false` to prevent default behavior.
 *
 * Event types received:
 * - `MouseEvent`: Desktop mouse clicks
 * - `TouchEvent`: Mobile tap interactions (from handleTouchEnd)
 * - `KeyboardEvent`: Keyboard activation (Enter/Space for accessibility)
 *
 * Note: On mobile touch devices, the event will be a TouchEvent, not MouseEvent.
 * Use `event.type` to distinguish if needed.
 */
export type CitationClickBehavior = (
  context: CitationBehaviorContext,
  event: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
) => CitationBehaviorActions | false | undefined;

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
  shouldShowTooltip: boolean;
}

// ============================================================================
// Sources List Types (Anthropic-style aggregated citations)
// ============================================================================

/**
 * Visual variant for sources list display.
 *
 * | Variant    | Description                                              |
 * |------------|----------------------------------------------------------|
 * | `panel`    | Collapsible panel inline with content                    |
 * | `drawer`   | Bottom sheet/drawer modal (mobile-friendly)              |
 * | `modal`    | Centered modal overlay                                   |
 * | `inline`   | Inline list without container styling                    |
 */
export type SourcesListVariant = "panel" | "drawer" | "modal" | "inline";

/**
 * Props for individual source item in the sources list.
 */
export interface SourcesListItemProps {
  /** Unique identifier for this source */
  id: string;
  /** The source URL */
  url: string;
  /** Page/document title */
  title: string;
  /** Display domain (e.g., "Twitch", "LinkedIn") */
  domain: string;
  /** Platform/source type for icon selection */
  sourceType?: import("../types/citation.js").SourceType;
  /** Favicon URL (falls back to Google favicon service) */
  faviconUrl?: string;
  /** Citation numbers that reference this source */
  citationNumbers?: number[];
  /** Verification status */
  verificationStatus?: "verified" | "partial" | "pending" | "failed" | "unknown";
  /** Click handler */
  onClick?: (source: SourcesListItemProps, event: React.MouseEvent) => void;
  /** Additional class name */
  className?: string;
  /** Whether to show the verification indicator */
  showVerificationIndicator?: boolean;
  /** Whether to show citation numbers as badges */
  showCitationBadges?: boolean;
  /** Custom render for the favicon */
  renderFavicon?: (props: SourcesListItemProps) => React.ReactNode;
  /** Time to certainty for this source (ms). Displayed as a review time receipt. */
  ttcMs?: number;
}

/**
 * Header configuration for sources list.
 */
export interface SourcesListHeaderConfig {
  /** Title text (default: "Sources") */
  title?: string;
  /** Whether to show close button */
  showCloseButton?: boolean;
  /** Whether to show source count badge */
  showCount?: boolean;
  /** Custom header render */
  renderHeader?: (props: { title: string; count: number; onClose?: () => void }) => React.ReactNode;
}

/**
 * Props for the SourcesListComponent.
 *
 * Displays an aggregated list of sources at the end of AI-generated content,
 * similar to Claude's "Sources" panel.
 */
export interface SourcesListProps {
  /** Array of sources to display */
  sources: SourcesListItemProps[];
  /** Visual variant for display */
  variant?: SourcesListVariant;
  /** Whether the list is visible/open */
  isOpen?: boolean;
  /** Callback when visibility changes */
  onOpenChange?: (isOpen: boolean) => void;
  /** Header configuration */
  header?: SourcesListHeaderConfig;
  /** Whether sources are still loading */
  isLoading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Maximum height before scrolling (panel/inline variants) */
  maxHeight?: string | number;
  /** Additional class name for container */
  className?: string;
  /** Class name for the list items container */
  listClassName?: string;
  /** Click handler for source items */
  onSourceClick?: (source: SourcesListItemProps, event: React.MouseEvent) => void;
  /** Whether to show verification indicators on items */
  showVerificationIndicators?: boolean;
  /** Whether to show citation number badges on items */
  showCitationBadges?: boolean;
  /** Group sources by domain/platform */
  groupByDomain?: boolean;
  /** Custom render for source items */
  renderItem?: (props: SourcesListItemProps, index: number) => React.ReactNode;
  /** Custom render for empty state */
  renderEmpty?: () => React.ReactNode;
  /** Custom render for loading state */
  renderLoading?: () => React.ReactNode;
  /** Aggregate timing metrics across all sources. Shown in header when provided. */
  timingMetrics?: import("../types/timing.js").TimingMetrics;
}

/**
 * Props for the compact sources trigger button.
 * Shows favicon icons and opens the full sources list.
 */
export interface SourcesTriggerProps {
  /** Sources to show as preview favicons */
  sources: SourcesListItemProps[];
  /** Maximum number of favicon icons to show */
  maxIcons?: number;
  /** Click handler to open sources list */
  onClick?: () => void;
  /** Label text (default: "Sources") */
  label?: string;
  /** Additional class name */
  className?: string;
  /** Whether the sources list is currently open */
  isOpen?: boolean;
}

// Re-export ChatGPT-style Citation Drawer types from separate file
export type {
  CitationDrawerItem,
  CitationDrawerItemProps,
  CitationDrawerProps,
  SourceCitationGroup,
} from "./CitationDrawer.types.js";

/**
 * Props for the source chip variant (ChatGPT-style inline citation).
 */
export interface SourceChipProps {
  /** Primary citation to display */
  citation: Citation;
  /** Verification result */
  verification?: Verification | null;
  /** Additional citations grouped with this one */
  additionalCitations?: import("./CitationDrawer.types.js").CitationDrawerItem[];
  /** Callback when chip is clicked (typically opens drawer) */
  onClick?: (group: import("./CitationDrawer.types.js").SourceCitationGroup, event: React.MouseEvent) => void;
  /** Additional class name */
  className?: string;
}

/**
 * Helper function type for grouping citations by source.
 */
export type GroupCitationsBySource = (
  citations: import("./CitationDrawer.types.js").CitationDrawerItem[],
  sourceTitleMap?: Record<string, string>,
) => import("./CitationDrawer.types.js").SourceCitationGroup[];
