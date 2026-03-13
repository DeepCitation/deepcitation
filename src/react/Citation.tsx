import type React from "react";
import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Citation, CitationStatus } from "../types/citation.js";
import type { FileDownload, PageImage, Verification } from "../types/verification.js";
import { getCitationKey } from "../utils/citationKey.js";
import { CitationContentDisplay } from "./CitationContentDisplay.js";
import {
  getDefaultContent,
  getDisplayText,
  getInteractionClasses,
  VARIANTS_WITH_OWN_HOVER,
} from "./CitationContentDisplay.utils.js";
import { CitationErrorBoundary } from "./CitationErrorBoundary.js";
import { useCitationOverlay } from "./CitationOverlayContext.js";
import type { CitationStatusIndicatorProps, SpinnerStage } from "./CitationStatusIndicator.js";
import { getStatusFromVerification, getStatusLabel } from "./citationStatus.js";
import {
  DOT_COLORS,
  DOT_INDICATOR_FIXED_SIZE_STYLE,
  GUARD_MAX_WIDTH_VAR,
  isValidProofImageSrc,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  MISS_WAVY_UNDERLINE_STYLE,
  SPINNER_TIMEOUT_MS,
  TAP_SLOP_PX,
  TOUCH_CLICK_DEBOUNCE_MS,
} from "./constants.js";
import { DefaultPopoverContent, type PopoverViewState } from "./DefaultPopoverContent.js";
import { resolveEvidenceSrc, resolveExpandedImage } from "./EvidenceTray.js";
import { getExpandedPopoverWidthPx, getSummaryPopoverWidthPx } from "./expandedWidthPolicy.js";
import { triggerHaptic } from "./haptics.js";
import { useExpandedPageSideOffset } from "./hooks/useExpandedPageSideOffset.js";
import { useIsTouchDevice } from "./hooks/useIsTouchDevice.js";
import { useLockedPopoverSide } from "./hooks/useLockedPopoverSide.js";
import { usePopoverAlignOffset } from "./hooks/usePopoverAlignOffset.js";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { useViewportBoundaryGuard } from "./hooks/useViewportBoundaryGuard.js";
import { type MessageKey, type TranslateFunction, useTranslation } from "./i18n.js";
import { CheckIcon, ExternalLinkIcon, LockIcon, XCircleIcon } from "./icons.js";
import { handleImageError } from "./imageUtils.js";
import { PopoverContent } from "./Popover.js";
import { Popover, PopoverTrigger } from "./PopoverPrimitives.js";
import { acquireScrollLock, releaseScrollLock } from "./scrollLock.js";
import { REVIEW_DWELL_THRESHOLD_MS, useCitationTiming } from "./timingUtils.js";
import type {
  BaseCitationProps,
  CitationBehaviorActions,
  CitationBehaviorConfig,
  CitationBehaviorContext,
  CitationContent,
  CitationEventHandlers,
  CitationRenderProps,
  CitationVariant,
  IndicatorVariant,
  UrlCitationProps,
  UrlFetchStatus,
} from "./types.js";
import { isBlockedStatus, isErrorStatus } from "./urlStatus.js";
import { extractDomain, getUrlPath, safeWindowOpen, truncateString } from "./urlUtils.js";
import { cn, generateCitationInstanceId } from "./utils.js";
import { isViewTransitioning, startEvidenceViewTransition } from "./viewTransition.js";

// Re-export types for convenience
export type {
  CitationContent,
  CitationVariant,
  IndicatorVariant,
} from "./types.js";

/** Tracks which deprecation warnings have already been emitted (dev-mode only). */
const deprecationWarned = new Set<string>();

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
  // TypeScript errors at compile time if UrlFetchStatus gains a new member
  // without a corresponding entry in KEY_MAP.
  return t(KEY_MAP[fetchStatus]);
}

// Body scroll lock — imported from scrollLock.ts (canonical location, ref-counted)
// CitationErrorBoundary — imported from ./CitationErrorBoundary.js (canonical location)

// Utility functions and CitationContentDisplay
// imported from ./CitationContentDisplay.js (canonical location)

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
 * - Use `eventHandlers.onClickAfterDefault` to add side effects while keeping defaults
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
   * - `text`: Plain text, inherits parent styling (default)
   * - `linter`: Inline text with semantic underlines
   * - `chip`: Pill/badge style with neutral gray background
   * - `brackets`: [text✓] with square brackets
   * - `superscript`: Small raised text like footnotes¹
   * - `footnote`: Clean footnote marker with neutral default
   * - `badge`: Source chip with name and indicator
   * @default "text"
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
   * - `text` → `anchorText`
   * - `linter` → `anchorText`
   * - `chip` → `anchorText`
   * - `brackets` → `anchorText`
   * - `superscript` → `number`
   * - `footnote` → `number`
   * - `badge` → `source`
   */
  content?: CitationContent;
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
   * Visual style for status indicators.
   * - `"icon"`: Checkmarks, spinner, X icons (default)
   * - `"dot"`: Subtle colored dots (like GitHub status dots / shadcn badge dots)
   * - `"caret"`: Disclosure chevron that flips when popover opens
   * - `"none"`: Hidden — no indicator rendered
   * @default "icon"
   */
  indicatorVariant?: IndicatorVariant;
  /**
   * Callback for citation lifecycle timing events (telemetry).
   * Emits events: citation_seen, evidence_ready, popover_opened, popover_closed, citation_reviewed.
   * Side-effect only — never replaces default behavior.
   */
  onTimingEvent?: (event: import("../types/timing.js").CitationTimingEvent) => void;
  /** Original file as received (PDF, DOCX, …). Absent for URL inputs. Used for source download. */
  originalDownload?: FileDownload;
  /** Converted artifact (PDF rendition, transcript, …). Used for source download with URL inputs. */
  convertedDownload?: FileDownload;
  /** Optional page images keyed by attachmentId (used for full-page rendering). */
  pageImagesByAttachmentId?: Record<string, PageImage[]>;
  /**
   * Enable haptic feedback on mobile for expand/collapse transitions.
   * Experimental — off by default while we validate the feel across devices.
   * @default false
   */
  experimentalHaptics?: boolean;
}

// getStatusLabel, getTrustLevel, isLowTrustMatch, getStatusFromVerification
// imported from ./citationStatus.js (canonical location)

// Indicator components, SpinnerStage, CitationStatusIndicator
// imported from ./CitationStatusIndicator.js (canonical location)

// FooterHint, EvidenceTray components — imported from ./EvidenceTray.js
// CitationContentDisplay — imported from ./CitationContentDisplay.js

// ExpandedImageSource, resolveExpandedImage,
// AnchorTextFocusedImage, EvidenceTray, InlineExpandedImage, SearchAnalysisSummary
// — imported from ./EvidenceTray.js (canonical location)

// DefaultPopoverContent, PopoverViewState — imported from ./DefaultPopoverContent.js (canonical location)

// =============================================================================
// SPINNER STAGE HOOK
// =============================================================================

/** Manages the 3-stage spinner progression: active (0–5s) → slow (5–15s) → stale (15s+). */
function useSpinnerStage(isLoading: boolean, isPending: boolean, hasDefinitiveResult: boolean): SpinnerStage {
  // Timer-driven state transitions (5s/15s) use setState-during-render reset pattern.
  // The compiler can't safely memoize across the timer + render-phase setState boundary.
  // "use no memo" — React Compiler opt-out (would be a directive if compiler were active).
  const shouldAnimate = (isLoading || isPending) && !hasDefinitiveResult;
  const [stage, setStage] = useState<SpinnerStage>("active");

  // Reset to "active" eagerly when a new animation cycle starts (setState-during-render
  // pattern — avoids the previous cleanup setState which caused a React Compiler bailout).
  const [prevShouldAnimate, setPrevShouldAnimate] = useState(shouldAnimate);
  if (shouldAnimate && !prevShouldAnimate) {
    setPrevShouldAnimate(true);
    setStage("active");
  } else if (!shouldAnimate && prevShouldAnimate) {
    setPrevShouldAnimate(false);
  }

  useEffect(() => {
    if (!shouldAnimate) return;
    const t1 = setTimeout(() => setStage("slow"), SPINNER_TIMEOUT_MS);
    const t2 = setTimeout(() => setStage("stale"), SPINNER_TIMEOUT_MS * 3);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [shouldAnimate]);

  // When not animating, always return "active" (derived, no setState needed)
  return shouldAnimate ? stage : "active";
}

// =============================================================================
// KEYBOARD-OPEN TRACKING HOOK
// =============================================================================

/**
 * Tracks whether the popover was opened via keyboard (Enter/Space) vs mouse/touch.
 * Manages the A.5.1 focus trap (inert on background) and A.5.2 conditional focus return.
 *
 * Isolated from CitationComponent because the React Compiler can't handle a ref
 * that's both read in an effect (focus trap) and mutated in callbacks (click/keydown).
 * "use no memo" tells the compiler to skip this hook without throwing, so the rest
 * of the file compiles normally.
 */
function useKeyboardOpenTracking(isHovering: boolean, popoverContentRef: React.RefObject<HTMLDivElement | null>) {
  // "use no memo" — React Compiler opt-out: ref read in effect + mutated in callbacks
  // is a pattern the compiler can't safely transform.
  const openedViaKeyboardRef = useRef(false);

  // A.5.1 Focus trap: set `inert` on background content when the popover is
  // opened via keyboard. This prevents Tab from escaping the popover into
  // background content. Mouse-opened popovers don't need this because users
  // can click outside to dismiss.
  //
  // When <main> exists, we set inert on it (the popover portal is a sibling
  // of <main> inside document.body, so it stays interactive).
  // When no <main> exists, we cannot set inert on document.body because the
  // popover portal renders inside body — that would make the popover
  // itself inert. Instead, we inert each direct child of body except the
  // one containing the popover.
  useEffect(() => {
    if (!isHovering || !openedViaKeyboardRef.current) return;
    const main = document.querySelector("main");
    if (main) {
      main.setAttribute("inert", "");
      return () => main.removeAttribute("inert");
    }
    // Fallback: inert all body children except the popover portal.
    // Defer with rAF so the portal is in the DOM before we scan.
    const inerted: Element[] = [];
    const rafId = requestAnimationFrame(() => {
      const popoverEl = popoverContentRef.current;
      if (!popoverEl) return; // portal not mounted — nothing to trap
      for (const child of Array.from(document.body.children)) {
        if (child.contains(popoverEl)) continue;
        if (!child.hasAttribute("inert")) {
          child.setAttribute("inert", "");
          inerted.push(child);
        }
      }
    });
    return () => {
      cancelAnimationFrame(rafId);
      for (const el of inerted) el.removeAttribute("inert");
    };
  }, [isHovering, popoverContentRef]);

  // A.5.2 Conditional focus return: keyboard users need focus returned to the
  // trigger so they can continue navigating. Mouse/touch users don't — returning
  // focus would scroll the trigger into view, disorienting users who scrolled away.
  const handleCloseAutoFocus = useCallback((e: Event) => {
    if (!openedViaKeyboardRef.current) {
      e.preventDefault();
    }
    openedViaKeyboardRef.current = false;
  }, []);

  return { openedViaKeyboardRef, handleCloseAutoFocus };
}

// =============================================================================
// POPOVER CONTENT RENDERER
// =============================================================================

/**
 * Renders popover content — either a custom render prop or the default.
 * Extracted as a named component so React can track it as a stable fiber type
 * for proper reconciliation (avoids remounting on every parent render).
 */
const PopoverContentRenderer = memo(function PopoverContentRenderer({
  renderPopoverContent,
  citation,
  verification,
  status,
  isLoading,
  isVisible,
  sourceLabel,
  indicatorVariant,
  viewState,
  onViewStateChange,
  expandedImageSrcOverride,
  onExpandedWidthChange,
  pageImages,
  prevBeforeExpandedPageRef,
  downloadUrl,
  escapeInterceptRef,
}: {
  renderPopoverContent?: CitationComponentProps["renderPopoverContent"];
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  status: CitationStatus;
  isLoading: boolean;
  isVisible: boolean;
  sourceLabel?: string;
  indicatorVariant: IndicatorVariant;
  viewState: PopoverViewState;
  onViewStateChange: (viewState: PopoverViewState) => void;
  expandedImageSrcOverride: string | null;
  onExpandedWidthChange?: (width: number | null, source?: "expanded-keyhole" | "expanded-page" | null) => void;
  pageImages?: PageImage[];
  prevBeforeExpandedPageRef: React.RefObject<"summary" | "expanded-keyhole">;
  downloadUrl?: string;
  escapeInterceptRef?: React.MutableRefObject<(() => void) | null>;
}) {
  if (renderPopoverContent) {
    const CustomContent = renderPopoverContent;
    return (
      <CitationErrorBoundary>
        <CustomContent citation={citation} verification={verification} status={status} />
      </CitationErrorBoundary>
    );
  }
  return (
    <CitationErrorBoundary>
      <DefaultPopoverContent
        citation={citation}
        verification={verification}
        status={status}
        isLoading={isLoading}
        isVisible={isVisible}
        sourceLabel={sourceLabel}
        indicatorVariant={indicatorVariant}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        expandedImageSrcOverride={expandedImageSrcOverride}
        onExpandedWidthChange={onExpandedWidthChange}
        pageImages={pageImages}
        prevBeforeExpandedPageRef={prevBeforeExpandedPageRef}
        downloadUrl={downloadUrl}
        escapeInterceptRef={escapeInterceptRef}
      />
    </CitationErrorBoundary>
  );
});

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
 * use `eventHandlers.onClick` to add side effects that replace defaults,
 * or `eventHandlers.onClickAfterDefault` to add side effects while preserving defaults.
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
      variant = "text",
      content: contentProp,
      eventHandlers,
      behaviorConfig,
      isMobile: isMobileProp,
      renderIndicator,
      renderContent,
      popoverPosition = "bottom",
      renderPopoverContent,
      additionalCount,
      faviconUrl,
      indicatorVariant: indicatorVariantProp = "icon",
      sourceLabel,
      onTimingEvent,
      originalDownload,
      convertedDownload,
      pageImagesByAttachmentId,
      experimentalHaptics = false,
      disableTelemetry = false,
      prefetch: prefetchMode = "eager",
    },
    ref,
  ) => {
    // Deprecation warning moved to useEffect to avoid mutating module-level state during render
    // (which triggers a React Compiler critical error).
    useEffect(() => {
      if (process.env.NODE_ENV !== "production") {
        if (eventHandlers?.onClick && behaviorConfig?.onClick && !deprecationWarned.has("eventHandlers.onClick")) {
          deprecationWarned.add("eventHandlers.onClick");
          console.warn(
            "CitationComponent: eventHandlers.onClick is ignored when behaviorConfig.onClick is provided. " +
              "Prefer behaviorConfig.onClick for customizing click behavior.",
          );
        }
      }
    }, [eventHandlers?.onClick, behaviorConfig?.onClick]);

    const indicatorVariant: IndicatorVariant = indicatorVariantProp;

    const pageImages = useMemo(() => {
      if (verification?.pageImages) return verification.pageImages;
      const attachmentId = verification?.attachmentId;
      if (!attachmentId || !pageImagesByAttachmentId) return undefined;
      return pageImagesByAttachmentId[attachmentId];
    }, [pageImagesByAttachmentId, verification]);

    const downloadUrl = useMemo(
      () =>
        verification?.originalDownload?.link.url ??
        originalDownload?.link.url ??
        verification?.convertedDownload?.link.url ??
        convertedDownload?.link.url ??
        null,
      [verification, originalDownload, convertedDownload],
    );

    const t = useTranslation();

    // Get overlay context for blocking hover when any image overlay is open
    const { isAnyOverlayOpen } = useCitationOverlay();

    // Auto-detect touch device if isMobile prop not explicitly provided
    const isTouchDevice = useIsTouchDevice();
    const isMobile = isMobileProp ?? isTouchDevice;
    const prefersReducedMotion = usePrefersReducedMotion();

    // Resolve content: explicit content prop or default for variant
    const resolvedContent: CitationContent = useMemo(() => {
      if (contentProp) return contentProp;
      return getDefaultContent(variant);
    }, [contentProp, variant]);
    const [isHovering, setIsHovering] = useState(false);
    const [popoverViewState, setPopoverViewState] = useState<PopoverViewState>("summary");
    const [expandedNaturalWidthForPosition, setExpandedNaturalWidthForPosition] = useState<number | null>(null);
    const [expandedWidthSourceForPosition, setExpandedWidthSourceForPosition] = useState<
      "expanded-keyhole" | "expanded-page" | null
    >(null);
    // Custom image src from behaviorConfig.onClick returning setImageExpanded: "<url>"
    const [customExpandedSrc, setCustomExpandedSrc] = useState<string | null>(null);
    // Tracks which state preceded expanded-page so Escape can navigate back correctly.
    // Lifted here (from DefaultPopoverContent) so onEscapeKeyDown on <PopoverContent> can read it.
    const prevBeforeExpandedPageRef = useRef<"summary" | "expanded-keyhole">("summary");

    // Set by sub-components (e.g. EvidenceTray search log) when they have an expanded
    // section that should consume Escape before the popover closes.
    const escapeInterceptRef = useRef<(() => void) | null>(null);

    // Ref kept in sync with popoverViewState so setViewStateWithHaptics can read
    // the current value inside callbacks without stale closure issues.
    // useLayoutEffect (not useEffect) ensures the ref is updated before any
    // synchronous reads in the same tick — React 18 automatic batching can call
    // setViewStateWithHaptics twice in one handler, and useEffect would leave
    // the ref stale until after paint.
    const popoverViewStateRef = useRef<PopoverViewState>("summary");
    useLayoutEffect(() => {
      popoverViewStateRef.current = popoverViewState;
    }, [popoverViewState]);
    const handleExpandedWidthChange = useCallback(
      (width: number | null, sourceOverride?: "expanded-keyhole" | "expanded-page" | null) => {
        const source = sourceOverride ?? popoverViewStateRef.current;
        if (source !== "expanded-keyhole" && source !== "expanded-page") {
          setExpandedNaturalWidthForPosition(null);
          setExpandedWidthSourceForPosition(null);
          return;
        }
        setExpandedNaturalWidthForPosition(width);
        setExpandedWidthSourceForPosition(source);
      },
      [],
    );

    // View-state setter that fires haptic feedback on mobile for expand/collapse
    // transitions. Replaces direct setPopoverViewState calls in user-event handlers.
    // closePopover still calls setPopoverViewState directly — a full dismiss is not
    // a collapse in the haptic sense (it's a close, not a step-back navigation).
    //
    // Haptics are gated behind experimentalHaptics prop (off by default).
    const setViewStateWithHaptics = useCallback(
      (newState: PopoverViewState) => {
        const prev = popoverViewStateRef.current;
        if (experimentalHaptics && isMobile) {
          // Haptic fires only on the initial expand from summary and the final
          // collapse back to summary. Intermediate transitions (expanded-keyhole ↔
          // expanded-page) are silent to avoid double-pulse when the user drills
          // deeper within an already-expanded state.
          const isExpanding = (newState === "expanded-page" || newState === "expanded-keyhole") && prev === "summary";
          const isCollapsing = newState === "summary" && (prev === "expanded-page" || prev === "expanded-keyhole");
          if (isExpanding) triggerHaptic("expand");
          else if (isCollapsing) triggerHaptic("collapse");
        }
        // Track which state we entered expanded-page from, so Escape can navigate back.
        // Lifted from DefaultPopoverContent's handleExpand to eliminate a ref mutation
        // that caused a React Compiler bailout in that file.
        if (newState === "expanded-page" && prev !== "expanded-page") {
          prevBeforeExpandedPageRef.current = prev === "expanded-keyhole" ? "expanded-keyhole" : "summary";
        }
        // Determine collapse direction for View Transition timing.
        // Full-page transitions are handled by an annotation-anchored VT marker
        // in InlineExpandedImage — the marker is positioned at the annotation rect
        // so the geometry morph tracks the annotation region, not the whole page.
        // When no annotation data exists, InlineExpandedImage falls back to the
        // container-level VT name (animatedShellRef), which produces the same
        // crossfade behavior as before.
        const ORDER: Record<PopoverViewState, number> = { summary: 0, "expanded-keyhole": 1, "expanded-page": 2 };
        const isCollapse = ORDER[newState] < ORDER[prev];
        const isPageExpand = !isCollapse && newState === "expanded-page";
        startEvidenceViewTransition(
          () => {
            if (newState === "summary") {
              setExpandedNaturalWidthForPosition(null);
              setExpandedWidthSourceForPosition(null);
            }
            setPopoverViewState(newState);
          },
          { isCollapse, isPageExpand, skipAnimation: prefersReducedMotion },
        );
      },
      [experimentalHaptics, isMobile, prefersReducedMotion],
    );

    // Lock body scroll only for expanded-page (full-viewport). Summary and
    // expanded-keyhole are small overlays where scroll should pass through to
    // the page behind — locking there "eats" scroll when the popover content
    // isn't scrollable, trapping users. See acquireScrollLock().
    useEffect(() => {
      if (!isHovering) return;
      if (popoverViewState !== "expanded-page") return;
      acquireScrollLock();
      return () => releaseScrollLock();
    }, [isHovering, popoverViewState]);

    // Dismiss the popover.
    // Keep view/layout state intact during the exit animation; resetting to
    // summary here causes a visible jump before fade-out.
    const closePopover = useCallback(() => {
      setIsHovering(false);
    }, []);

    const wasPopoverOpenBeforeTap = useRef(false);

    // Track last touch time for touch-to-click debouncing (prevents double-firing).
    // Note: This ref is per-component-instance, so debouncing is citation-specific.
    // Tapping Citation A then quickly tapping Citation B will NOT incorrectly debounce B,
    // because each CitationComponent instance has its own lastTouchTimeRef.
    const lastTouchTimeRef = useRef(0);

    // Track touch start coordinates for scroll-vs-tap detection.
    // If the finger moves more than TAP_SLOP_PX between touchstart and touchend,
    // the gesture is a scroll — not a tap — and should NOT open the popover.
    const touchStartXRef = useRef(0);
    const touchStartYRef = useRef(0);

    // Refs kept in sync with state/context via useLayoutEffect (runs before paint)
    // so event handlers always read the latest value without callback churn.
    // useLayoutEffect (not render-body assignment) avoids React Compiler bailouts.
    const isHoveringRef = useRef(isHovering);
    const isAnyOverlayOpenRef = useRef(isAnyOverlayOpen);
    useLayoutEffect(() => {
      isHoveringRef.current = isHovering;
      isAnyOverlayOpenRef.current = isAnyOverlayOpen;
    }, [isHovering, isAnyOverlayOpen]);

    // Ref for the popover content element (for mobile click-outside dismiss detection).
    // Object ref (not callback ref) so the React Compiler can optimize this component —
    // callback refs that mutate .current trigger "cannot modify local variables after render".
    const popoverContentRef = useRef<HTMLDivElement | null>(null);

    // A.5.1 + A.5.2: Keyboard-open tracking, focus trap, and conditional focus return.
    // Isolated into a custom hook because the React Compiler can't handle a ref that's
    // both read in an effect (focus trap) and mutated in callbacks (click/keydown handlers).
    // The hook has "use no memo" so the compiler skips it, and CitationComponent stays compilable.
    const { openedViaKeyboardRef, handleCloseAutoFocus } = useKeyboardOpenTracking(isHovering, popoverContentRef);

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

    // Lock the popover side (top/bottom) on open so the popover doesn't jump
    // between sides during scroll. Also isolated for compiler.
    const lockedSide = useLockedPopoverSide(isHovering, popoverPosition === "top" ? "top" : "bottom", triggerRef);

    // Isolated into separate hooks so the React Compiler can optimize CitationComponent
    // (setState in useLayoutEffect causes a compiler bailout for the entire component).
    const expandedPageSideOffset = useExpandedPageSideOffset(popoverViewState, triggerRef, lockedSide);
    const projectedSummaryKeyholeWidth = useMemo(() => {
      const dims = verification?.evidence?.dimensions;
      if (!dims) return null;
      const width = dims.width;
      const height = dims.height;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
      return width * (KEYHOLE_STRIP_HEIGHT_DEFAULT / height);
    }, [verification?.evidence?.dimensions]);
    const projectedPopoverWidthPx = useMemo(() => {
      if (!isHovering || typeof document === "undefined") return null;
      const viewportWidth = document.documentElement.clientWidth;
      if (popoverViewState === "summary") {
        return getSummaryPopoverWidthPx(projectedSummaryKeyholeWidth, viewportWidth);
      }

      if (expandedNaturalWidthForPosition === null) return null;

      const shouldProjectExpandedWidth =
        (popoverViewState === "expanded-keyhole" && expandedWidthSourceForPosition === "expanded-keyhole") ||
        (popoverViewState === "expanded-page" &&
          (expandedWidthSourceForPosition === "expanded-page" ||
            expandedWidthSourceForPosition === "expanded-keyhole"));

      if (shouldProjectExpandedWidth) {
        return getExpandedPopoverWidthPx(expandedNaturalWidthForPosition, viewportWidth);
      }
      return null;
    }, [
      isHovering,
      popoverViewState,
      projectedSummaryKeyholeWidth,
      expandedNaturalWidthForPosition,
      expandedWidthSourceForPosition,
    ]);
    const popoverAlignOffset = usePopoverAlignOffset(
      isHovering,
      popoverViewState,
      triggerRef,
      popoverContentRef,
      projectedPopoverWidthPx,
    );

    // Layer 3: hard viewport boundary guard. Observes the popover's actual
    // rendered rect and applies corrective CSS `translate` if any edge overflows.
    // If Layers 1–2 got it right, the guard is a no-op.
    useViewportBoundaryGuard(isHovering, popoverViewState, popoverContentRef);
    const citationKey = useMemo(() => getCitationKey(citation), [citation]);
    const citationInstanceId = useMemo(() => generateCitationInstanceId(citationKey), [citationKey]);

    // ========== TtC Timing ==========
    const { firstSeenAtRef } = useCitationTiming(
      citationKey,
      verification,
      disableTelemetry ? undefined : onTimingEvent,
    );
    const popoverOpenedAtRef = useRef<number | null>(null);
    const reviewedRef = useRef(false);

    // Stable ref for onTimingEvent to avoid re-triggering effects.
    // Synced in useLayoutEffect to avoid React Compiler bailout.
    const onTimingEventRef = useRef(onTimingEvent);
    useLayoutEffect(() => {
      onTimingEventRef.current = onTimingEvent;
    }, [onTimingEvent]);

    // ========== Popover Telemetry ==========
    // Track popover open/close for TtC telemetry events
    // biome-ignore lint/correctness/useExhaustiveDependencies: firstSeenAtRef/verification are stable refs or read at call-time — only isHovering transitions should trigger this effect
    useEffect(() => {
      if (disableTelemetry) {
        popoverOpenedAtRef.current = null;
        return;
      }
      if (isHovering && firstSeenAtRef.current != null) {
        popoverOpenedAtRef.current = performance.now();
        onTimingEventRef.current?.({
          event: "popover_opened",
          citationKey,
          timestamp: popoverOpenedAtRef.current,
          elapsedSinceSeenMs: popoverOpenedAtRef.current - firstSeenAtRef.current,
          verificationStatus: verification?.status ?? null,
        });
      } else if (!isHovering && popoverOpenedAtRef.current != null) {
        const now = performance.now();
        const dwellMs = now - popoverOpenedAtRef.current;

        onTimingEventRef.current?.({
          event: "popover_closed",
          citationKey,
          timestamp: now,
          elapsedSinceSeenMs: firstSeenAtRef.current != null ? now - firstSeenAtRef.current : null,
          popoverDurationMs: dwellMs,
          verificationStatus: verification?.status ?? null,
        });

        // Dwell threshold: if user spent ≥2s AND hasn't already been marked reviewed
        if (dwellMs >= REVIEW_DWELL_THRESHOLD_MS && !reviewedRef.current) {
          reviewedRef.current = true;
          onTimingEventRef.current?.({
            event: "citation_reviewed",
            citationKey,
            timestamp: now,
            elapsedSinceSeenMs: firstSeenAtRef.current != null ? now - firstSeenAtRef.current : null,
            popoverDurationMs: dwellMs,
            verificationStatus: verification?.status ?? null,
            userTtcMs: firstSeenAtRef.current != null ? now - firstSeenAtRef.current : undefined,
          });
        }

        popoverOpenedAtRef.current = null;
      }
    }, [isHovering, citationKey, disableTelemetry]);

    // Derive status from verification object
    const status = useMemo(() => getStatusFromVerification(verification), [verification]);
    const { isMiss, isPartialMatch, isVerified, isPending } = status;

    // Resolve the evidence snippet image source for spinner finalization logic.
    const resolvedImageSrc = verification?.evidence?.src ?? null;

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

    // 3-stage spinner: active (0–5s) → slow (5–15s) → stale (15s+)
    const spinnerStage = useSpinnerStage(isLoading, isPending, !!hasDefinitiveResult);
    const shouldShowSpinner = (isLoading || isPending) && !hasDefinitiveResult && spinnerStage !== "stale";

    // Low-priority prefetch: queue image downloads as soon as verification arrives.
    // Evidence crop (keyhole) and full-page image are both fetched at idle priority
    // so they're already cached when the user clicks to open the popover.
    // Data URIs are skipped — they're inline and don't need network fetching.
    // The normal-priority prefetch in DefaultPopoverContent still fires on popover
    // open, upgrading the browser's fetch priority if the request is still in-flight.
    //
    // Dependencies: resolved URL strings (not the verification object) so re-renders
    // with the same verification data don't re-fire.
    const prefetchEvidenceSrc = useMemo(() => resolveEvidenceSrc(verification), [verification]);
    const prefetchExpandedSrc = useMemo(
      () => resolveExpandedImage(verification, pageImages)?.src ?? null,
      [verification, pageImages],
    );
    useEffect(() => {
      if (prefetchMode === "lazy") return;

      const images: HTMLImageElement[] = [];

      if (prefetchEvidenceSrc && !prefetchEvidenceSrc.startsWith("data:")) {
        const img = new Image();
        img.fetchPriority = "low";
        img.src = prefetchEvidenceSrc;
        images.push(img);
      }

      if (prefetchExpandedSrc && !prefetchExpandedSrc.startsWith("data:")) {
        const img = new Image();
        img.fetchPriority = "low";
        img.src = prefetchExpandedSrc;
        images.push(img);
      }

      return () => {
        for (const img of images) {
          img.src = "";
        }
      };
    }, [prefetchMode, prefetchEvidenceSrc, prefetchExpandedSrc]);

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
            setViewStateWithHaptics("expanded-page");
            // If a custom image URL was provided, validate before storing
            if (typeof actions.setImageExpanded === "string" && isValidProofImageSrc(actions.setImageExpanded)) {
              setCustomExpandedSrc(actions.setImageExpanded);
            }
          }
        }
      },
      [closePopover, setViewStateWithHaptics],
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

        // Execute the requested default action
        switch (action) {
          case "showPopover":
            // Reset to summary on open (not on close) so exit animations retain
            // the geometry of the state the user was viewing.
            setPopoverViewState("summary");
            setExpandedNaturalWidthForPosition(null);
            setCustomExpandedSrc(null);
            setIsHovering(true);
            break;
          case "hidePopover":
            closePopover();
            break;
          case "expandImage":
            setViewStateWithHaptics("expanded-page");
            break;
        }

        eventHandlers?.onClickAfterDefault?.(citation, citationKey, e);
      },
      [
        behaviorConfig,
        eventHandlers,
        citation,
        citationKey,
        getBehaviorContext,
        applyBehaviorActions,
        closePopover,
        setViewStateWithHaptics,
      ],
    );

    // Click handler
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();

        // Mouse/touch click — not a keyboard open
        openedViaKeyboardRef.current = false;

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
      // openedViaKeyboardRef: stable ref identity, included so the compiler's
      // inferred deps match the manual deps (avoids "could not preserve" bailout).
      [isMobile, isHovering, handleTapAction, openedViaKeyboardRef],
    );

    // Keyboard handler for accessibility - Enter/Space triggers tap action
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();

          // Toggle popover visibility
          if (!isHovering) {
            openedViaKeyboardRef.current = true;
            handleTapAction(e, "showPopover");
          } else {
            handleTapAction(e, "hidePopover");
          }
        }
      },
      // openedViaKeyboardRef: stable ref identity, included for compiler dep tracking.
      [isHovering, handleTapAction, openedViaKeyboardRef],
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

    // Escape key handling is managed by PopoverContent via onEscapeKeyDown prop

    // Mobile click-outside dismiss handler
    //
    // On mobile, tapping outside the citation trigger or popover should dismiss the popover.
    // Desktop uses a document-level mousedown listener (below) for click-outside dismiss.
    //
    // Custom touch handling for the two-tap mobile interaction pattern (first tap
    // shows popover, second tap opens image). Outside-click dismiss is handled here
    // rather than in the generic Popover component so we can integrate overlay
    // awareness, tap-vs-scroll detection, and the two-tap flow.
    //
    // Event order when tapping the trigger while popover is open:
    // 1. handleOutsideTouch (capture phase, document) - checks .contains(), returns early
    // 2. handleTouchStart (bubble phase, trigger) - reads isHoveringRef.current
    // 3. handleTouchEnd/handleClick - determines first vs second tap action
    // The .contains() check in step 1 ensures we don't dismiss when tapping the trigger,
    // allowing the normal two-tap flow to proceed.
    //
    // Portal note: popoverContentRef works with portaled content because the
    // popover renders inside document.body and we hold a direct ref to that
    // DOM element, so .contains() correctly detects touches inside it.
    //
    // Cleanup: The listener only attaches when isMobile AND isHovering are both true.
    // It's automatically removed when either condition becomes false or on unmount.
    // This minimizes document-level listener churn since popovers open/close frequently.
    useEffect(() => {
      if (!isMobile || !isHovering) return;

      // Snapshot triggerRef at effect setup time — the trigger element is always mounted
      // and the ref is guaranteed non-null when effects run (after DOM commit + ref attach).
      // Reading triggerRef.current at handler call time is unsafe in React 18: the inline
      // ref function inside PopoverTrigger asChild is recreated every render, causing React
      // to briefly set triggerRef.current = null during the old-ref cleanup phase.
      //
      // Note: popoverContentRef.current is intentionally read at call time (not snapshotted)
      // because the popover content mounts asynchronously after useBlinkMotionStage's effect
      // runs setMounted(true). By handler call time, the ref is always populated.
      const triggerEl = triggerRef.current;

      // Track touch state to distinguish taps from scrolls/swipes.
      // Only dismiss on touchend if the finger didn't move significantly (< 10px).
      let startX = 0;
      let startY = 0;
      let moved = false;
      let outsideTarget = false;

      // TAP_SLOP_PX imported from constants.ts

      const isOutsidePopover = (target: EventTarget | null): boolean => {
        if (!(target instanceof Node)) return false;
        if (triggerEl?.contains(target)) return false;
        if (popoverContentRef.current?.contains(target)) return false;
        return true;
      };

      const handleTouchStart = (e: TouchEvent) => {
        if (isAnyOverlayOpenRef.current) return;
        const touch = e.touches[0];
        if (!touch) return;
        startX = touch.clientX;
        startY = touch.clientY;
        moved = false;
        outsideTarget = isOutsidePopover(e.target);
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (!outsideTarget || moved) return;
        const touch = e.touches[0];
        if (!touch) return;
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (dx * dx + dy * dy > TAP_SLOP_PX * TAP_SLOP_PX) {
          moved = true;
          // Marks the gesture as a scroll so touchend won't treat it as a tap.
          // Body scroll is not locked on mobile for summary/expanded-keyhole
          // (see the acquireScrollLock effect), so the page scrolls freely here
          // without needing an explicit dismiss.
        }
      };

      const handleTouchEnd = () => {
        if (outsideTarget && !moved && !isViewTransitioning()) {
          closePopover();
        }
        outsideTarget = false;
        moved = false;
      };

      // Reset state when the OS cancels a touch (notification shade, incoming call, etc.)
      const handleTouchCancel = () => {
        outsideTarget = false;
        moved = false;
      };

      // All passive — we never preventDefault(), allowing scroll to proceed freely.
      // Capture phase so we see touches before child handlers.
      document.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
      document.addEventListener("touchmove", handleTouchMove, { capture: true, passive: true });
      document.addEventListener("touchend", handleTouchEnd, { capture: true, passive: true });
      document.addEventListener("touchcancel", handleTouchCancel, { capture: true, passive: true });

      return () => {
        document.removeEventListener("touchstart", handleTouchStart, { capture: true });
        document.removeEventListener("touchmove", handleTouchMove, { capture: true });
        document.removeEventListener("touchend", handleTouchEnd, { capture: true });
        document.removeEventListener("touchcancel", handleTouchCancel, { capture: true });
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

      // Snapshot triggerRef at effect setup time — the trigger element is always mounted
      // and the ref is guaranteed non-null when effects run (after DOM commit + ref attach).
      // Reading triggerRef.current at handler call time is unsafe in React 18: the inline
      // ref function inside PopoverTrigger asChild is recreated every render, causing React
      // to briefly set triggerRef.current = null during the old-ref cleanup phase.
      //
      // Note: popoverContentRef.current is intentionally read at call time (not snapshotted)
      // because the popover content mounts asynchronously after useBlinkMotionStage's effect
      // runs setMounted(true). By handler call time, the ref is always populated.
      const triggerEl = triggerRef.current;

      const handleOutsideClick = (e: MouseEvent) => {
        // Suppress during View Transitions — flushSync can make the clicked
        // element display:none, making the target appear "outside".
        if (isViewTransitioning()) return;
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

        // Check if click is inside the trigger element.
        // Also check triggerRef.current as fallback — during React 18 render
        // cycles the snapshotted triggerEl can be from a previous DOM node.
        if (triggerEl?.contains(target) || triggerRef.current?.contains(target)) {
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
          // Record touch coordinates for scroll-vs-tap detection in handleTouchEnd.
          const touch = e.touches[0];
          if (touch) {
            touchStartXRef.current = touch.clientX;
            touchStartYRef.current = touch.clientY;
          }

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
    // Ignores touches that moved beyond TAP_SLOP_PX (scroll/swipe gestures).
    const handleTouchEnd = useCallback(
      (e: React.TouchEvent<HTMLSpanElement>) => {
        if (isMobile) {
          // Scroll-vs-tap detection: if the finger moved significantly, this is a scroll — bail out.
          // We still update lastTouchTimeRef so the synthetic click (fired ~300ms later by the
          // browser when preventDefault is NOT called) gets caught by TOUCH_CLICK_DEBOUNCE_MS.
          const touch = e.changedTouches[0];
          if (touch) {
            const dx = touch.clientX - touchStartXRef.current;
            const dy = touch.clientY - touchStartYRef.current;
            if (dx * dx + dy * dy > TAP_SLOP_PX * TAP_SLOP_PX) {
              lastTouchTimeRef.current = Date.now();
              return; // Scroll gesture — do not open/close popover
            }
          }

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
    // Extracted from inline JSX arrows so the React Compiler can cache them.
    // All three read refs (event-time, not render-time) — safe for useCallback.
    // Placed before the early return to satisfy the Rules of Hooks (consistent call order).
    const handlePopoverOpenChange = useCallback(
      (open: boolean) => {
        if (!open && !isAnyOverlayOpenRef.current) {
          if (popoverViewStateRef.current !== "summary") return;
          closePopover();
        }
      },
      [closePopover],
    );

    const handlePopoverEscapeKeyDown = useCallback(
      (e: KeyboardEvent) => {
        e.preventDefault();
        if (escapeInterceptRef.current) {
          escapeInterceptRef.current();
          return;
        }
        const vs = popoverViewStateRef.current;
        if (vs === "summary") {
          closePopover();
        } else if (vs === "expanded-page") {
          const prev = prevBeforeExpandedPageRef.current;
          setViewStateWithHaptics(prev);
          if (prev === "summary") setCustomExpandedSrc(null);
        } else {
          setViewStateWithHaptics("summary");
        }
      },
      [closePopover, setViewStateWithHaptics],
    );

    const handlePopoverBackdropClick = useCallback(
      (e: React.MouseEvent) => {
        if (isViewTransitioning()) return;
        if (e.target === e.currentTarget) closePopover();
      },
      [closePopover],
    );

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
      indicatorVariant,
      shouldShowSpinner,
      isVerified,
      isPartialMatch,
      isMiss,
      spinnerStage,
      isOpen: isHovering,
      popoverSide: lockedSide,
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
        faviconUrl={faviconUrl}
        additionalCount={additionalCount}
        indicatorProps={indicatorProps}
        isOpen={isHovering}
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

    // Shared trigger element props
    // All variants use neutral hover/active colors (shadcn-inspired grey palette)
    // Cursor is always pointer since click toggles popover/details
    const cursorClass = "cursor-pointer";

    // Generate unique IDs for ARIA attributes
    const popoverId = `citation-popover-${citationInstanceId}`;
    const statusDescId = `citation-status-${citationInstanceId}`;
    const statusDescription = shouldShowSpinner ? t("indicator.stillVerifying") : getStatusLabel(status, t);

    // Variants with their own hover styles don't need parent hover (would extend beyond bounds)
    const variantHasOwnHover = VARIANTS_WITH_OWN_HOVER.has(variant);

    const triggerProps = {
      "data-citation-id": citationKey,
      "data-citation-instance": citationInstanceId,
      className: cn(
        "relative inline-flex items-baseline",
        "px-0.5 -mx-0.5 rounded-sm",
        "transition-colors duration-75 active:scale-[0.98]",
        cursorClass,
        // Improved touch target size on mobile (minimum 44px recommended)
        // Using py-1.5 for better touch accessibility without breaking layout
        isMobile && "py-1.5 touch-manipulation",
        // Neutral hover/active for variants that don't handle their own hover styling
        ...(variantHasOwnHover ? [] : [getInteractionClasses(isHovering, variant)]),
        // Focus styles for keyboard accessibility
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
        className,
      ),
      // ARIA attributes for accessibility
      role: "button" as const,
      tabIndex: 0,
      "aria-expanded": isHovering,
      "aria-controls": shouldShowPopover ? popoverId : undefined,
      "aria-label": displayText ? t("aria.citationWithText", { displayText }) : t("aria.citation"),
      "aria-describedby": statusDescId,
      // Event handlers
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      onTouchStart: isMobile ? handleTouchStart : undefined,
      onTouchEndCapture: isMobile ? handleTouchEnd : undefined,
    };

    // Render with Popover
    if (shouldShowPopover) {
      const popoverContentElement = (
        <PopoverContentRenderer
          renderPopoverContent={renderPopoverContent}
          citation={citation}
          verification={verification ?? null}
          status={status}
          isLoading={isLoading || shouldShowSpinner}
          isVisible={isHovering}
          sourceLabel={sourceLabel}
          indicatorVariant={indicatorVariant}
          viewState={popoverViewState}
          onViewStateChange={setViewStateWithHaptics}
          expandedImageSrcOverride={customExpandedSrc}
          onExpandedWidthChange={handleExpandedWidthChange}
          pageImages={pageImages}
          prevBeforeExpandedPageRef={prevBeforeExpandedPageRef}
          downloadUrl={downloadUrl ?? undefined}
          escapeInterceptRef={escapeInterceptRef}
        />
      );

      // Image prefetching is handled imperatively inside DefaultPopoverContent
      // via `new Image().src` (see DefaultPopoverContent.tsx).
      //
      // Previous approaches that caused React 19 crashes:
      // 1. Rendering a hidden DefaultPopoverContent (prefetchElement) alongside
      //    the visible one — simultaneous unmount + mount corrupted the fiber
      //    effect linked list ("Cannot read properties of undefined ('destroy')").
      // 2. Wrapping portal content in DeferredMount (two-phase mount via
      //    useLayoutEffect) — the deferred fiber creation during portal mount
      //    caused hook-order violations when React tried to reconcile the
      //    portal's fiber tree across renders.

      return (
        <>
          {children}
          {/* Visually hidden live region — always mounted so screen readers detect content *changes* */}
          <span id={statusDescId} className="sr-only" aria-live="polite" aria-atomic="true">
            {statusDescription}
          </span>
          <Popover open={isHovering} onOpenChange={handlePopoverOpenChange}>
            <PopoverTrigger asChild>
              <span ref={setTriggerRef} {...triggerProps}>
                {citationContentNode}
              </span>
            </PopoverTrigger>
            <PopoverContent
              ref={popoverContentRef}
              id={popoverId}
              side={lockedSide}
              align="start"
              sideOffset={expandedPageSideOffset}
              alignOffset={popoverAlignOffset}
              onCloseAutoFocus={handleCloseAutoFocus}
              onEscapeKeyDown={handlePopoverEscapeKeyDown}
              style={
                popoverViewState === "expanded-page"
                  ? {
                      // Expanded-page keeps adaptive width when space allows and is
                      // clamped to viewport bounds via maxWidth + guard variable.
                      maxWidth: `var(${GUARD_MAX_WIDTH_VAR}, calc(100dvw - 2rem))`,
                      maxHeight: "calc(100dvh - 2rem)",
                      // The inner InlineExpandedImage handles its own scrolling (with hidden
                      // scrollbars). Override PopoverContent's default overflow behavior to
                      // prevent redundant outer scrollbars from appearing during transitions.
                      // Use longhand to avoid React shorthand/longhand conflict with Popover's overflowX.
                      overflowX: "hidden" as const,
                      overflowY: "hidden" as const,
                    }
                  : popoverViewState === "expanded-keyhole"
                    ? {
                        maxWidth: `var(${GUARD_MAX_WIDTH_VAR}, calc(100dvw - 2rem))`,
                        // The inner InlineExpandedImage handles scrolling, so hide outer
                        // overflow to avoid transient shell scrollbars during transitions.
                        // Use longhand to avoid React shorthand/longhand conflict with Popover's overflowX.
                        overflowX: "hidden" as const,
                        overflowY: "hidden" as const,
                      }
                    : undefined
              }
              onClick={handlePopoverBackdropClick}
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
        {/* Visually hidden live region — always mounted so screen readers detect content *changes* */}
        <span id={statusDescId} className="sr-only" aria-live="polite" aria-atomic="true">
          {statusDescription}
        </span>
        <span ref={setTriggerRef} {...triggerProps}>
          {citationContentNode}
        </span>
      </>
    );
  },
);

CitationComponent.displayName = "CitationComponent";

export const MemoizedCitationComponent = memo(CitationComponent);

// =============================================================================
// URL CITATION COMPONENT
// =============================================================================

/**
 * Pulsing dot indicator for pending state.
 * Uses DOT_COLORS.gray for consistency across components (gray for pending state).
 */
const PendingDot = () => (
  <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", DOT_COLORS.gray)} aria-hidden="true" />
);

/**
 * Green verified checkmark indicator.
 * Uses green-600 color to match DOT_COLORS.green for visual consistency.
 */
const VerifiedCheck = () => (
  <span aria-hidden="true">
    <CheckIcon className={cn("w-full h-full", "text-green-600 dark:text-green-500")} />
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
        "inline-flex items-center justify-center w-3.5 h-3.5 ml-1 transition-all",
        "text-gray-400 group-hover:text-blue-500 dark:text-gray-500 dark:group-hover:text-blue-400",
        !alwaysVisible && "opacity-30 group-hover:opacity-100 group-focus-within:opacity-100",
      )}
      aria-label={ariaLabel}
      title={title}
    >
      <ExternalLinkIcon className="w-full h-full" />
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
      <StatusIconWrapper className="text-amber-500 dark:text-amber-400" ariaLabel={t("indicator.partial")}>
        <CheckIcon className="w-full h-full" />
      </StatusIconWrapper>
    );
  }

  // Blocked: Lock icon
  if (isBlocked) {
    if (renderBlockedIndicator) return <>{renderBlockedIndicator(fetchStatus, errorMessage)}</>;
    return (
      <StatusIconWrapper className="text-amber-500 dark:text-amber-400" ariaLabel={statusLabel}>
        <LockIcon className="w-full h-full" />
      </StatusIconWrapper>
    );
  }

  // Error: X in circle icon (centered, not subscript)
  if (isError) {
    if (renderBlockedIndicator) return <>{renderBlockedIndicator(fetchStatus, errorMessage)}</>;
    return (
      <StatusIconWrapper className="text-red-500 dark:text-red-400" ariaLabel={statusLabel}>
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
              "bg-white dark:bg-gray-900",
              "border border-gray-200 dark:border-gray-700",
              "rounded-md",
              "text-gray-800 dark:text-gray-200",
              "no-underline cursor-pointer",
              "transition-all duration-120 ease-[cubic-bezier(0.2,0,0,1)]",
              "hover:border-gray-400 dark:hover:border-gray-500",
              "hover:bg-gray-50 dark:hover:bg-gray-800",
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
            aria-label={t("aria.linkToDomainStatus", { domain, status: statusLabel })}
          >
            {showFavicon && <DefaultFavicon url={url} faviconUrl={faviconUrl} isBroken={isBroken} />}
            <span
              className={cn(
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
            className={cn(
              "group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-sm cursor-pointer transition-colors no-underline mr-0.5",
              "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
              "hover:bg-gray-200 dark:hover:bg-gray-700",
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
            aria-label={t("aria.linkToDomainStatus", { domain, status: statusLabel })}
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
            className={cn(
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
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={t("aria.linkToDomainStatus", { domain, status: statusLabel })}
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
            "text-gray-500 dark:text-gray-400",
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
          aria-label={t("aria.linkToDomainStatus", { domain, status: statusLabel })}
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
