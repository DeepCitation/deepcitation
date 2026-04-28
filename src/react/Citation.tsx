import type React from "react";
import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CitationStatus } from "../types/citation.js";
import type { FileDownload, PageImage, Verification } from "../types/verification.js";
import { getCitationKey } from "../utils/citationKey.js";
import { CitationErrorBoundary } from "./CitationErrorBoundary.js";
import { useCitationOverlay } from "./CitationOverlayContext.js";
import type { CitationStatusIndicatorProps, SpinnerStage } from "./CitationStatusIndicator.js";
import { CitationTriggerContent } from "./CitationTriggerContent.js";
import {
  getDefaultContent,
  getInteractionClasses,
  getTriggerText,
  VARIANTS_WITH_OWN_HOVER,
} from "./CitationTriggerContent.utils.js";
import { getStatusFromVerification, getStatusLabel } from "./citationStatus.js";
import {
  GUARD_MAX_WIDTH_VAR,
  isValidProofImageSrc,
  SPINNER_TIMEOUT_MS,
  TAP_SLOP_PX,
  TOUCH_CLICK_DEBOUNCE_MS,
} from "./constants.js";
import { DefaultPopoverContent, type PopoverViewState } from "./DefaultPopoverContent.js";
import { type EvidenceKeyholeRenderProps, resolveEvidenceSrc, resolveExpandedImage } from "./EvidenceTray.js";
import { useIsTouchDevice } from "./hooks/useIsTouchDevice.js";
import { usePopoverPosition } from "./hooks/usePopoverPosition.js";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { useTranslation } from "./i18n.js";
import { PopoverContent } from "./Popover.js";
import { Popover, PopoverTrigger } from "./PopoverPrimitives.js";
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
  DownloadInfo,
  IndicatorVariant,
} from "./types.js";
import { cn, generateCitationInstanceId } from "./utils.js";
import { isViewTransitioning } from "./viewTransition.js";

// Re-export types for convenience
export type {
  CitationContent,
  CitationVariant,
  IndicatorVariant,
} from "./types.js";

/** Tracks which deprecation warnings have already been emitted (dev-mode only). */
const deprecationWarned = new Set<string>();

type ActivePopoverListener = (activeInstanceId: string) => void;

const activePopoverListeners = new Set<ActivePopoverListener>();

function announceActivePopover(citationInstanceId: string): void {
  for (const listener of activePopoverListeners) {
    listener(citationInstanceId);
  }
}

function subscribeToActivePopover(listener: ActivePopoverListener): () => void {
  activePopoverListeners.add(listener);
  return () => {
    activePopoverListeners.delete(listener);
  };
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
   * - `sourceMatch`: Descriptive text (e.g., "Revenue Growth")
   * - `number`: Citation number (e.g., "1", "2", "3")
   * - `indicator`: Only the status icon, no text
   * - `source`: Source name (e.g., "Wikipedia")
   *
   * Defaults based on variant:
   * - `text` → `sourceMatch`
   * - `linter` → `sourceMatch`
   * - `chip` → `sourceMatch`
   * - `brackets` → `sourceMatch`
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
  /** Portal the popover to document.body so clipped host containers cannot crop it. */
  popoverPortalToBody?: boolean;
  /** Custom render function for popover content */
  renderPopoverContent?: (props: {
    citation: BaseCitationProps["citation"];
    verification: Verification | null;
    status: CitationStatus;
  }) => React.ReactNode;
  /**
   * Optional host-supplied renderer for the popover summary keyhole strip.
   * Use this to swap the default JPEG keyhole for an alternative (e.g. a live
   * PDF mini-viewer that draws highlights from the actual document). Returning
   * `null`, `undefined`, or `false` falls back to the default JPEG keyhole.
   *
   * Wrap in `useCallback` to keep stable identity across parent renders;
   * inline arrows defeat the popover's `memo` and re-create internal callbacks
   * each render.
   *
   * Ignored when `renderPopoverContent` is provided (the host already controls
   * the entire popover body).
   */
  renderEvidenceKeyhole?: (props: EvidenceKeyholeRenderProps) => React.ReactNode;
  /**
   * Optional host-supplied renderer for the expanded-page slot. When provided,
   * `canExpandToPage` becomes true even without pre-rendered JPEG page images.
   * Called with `{ onCollapse }` when the popover transitions to expanded-page state.
   */
  renderExpandedPage?: (props: {
    onCollapse: () => void;
    onDisplayedSizeChange?: (width: number, height: number) => void;
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
  /**
   * Custom action buttons rendered in the popover header alongside the download button.
   * Each action appears as an icon-only button following the same reveal-on-hover pattern.
   */
  customPopoverActions?: import("./types.js").PopoverAction[];
}

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
  // The popover may portal into a scroll container inside <main> (not just
  // document.body), so we walk from the popover up to body, inerting siblings
  // at each level. This keeps the popover's ancestor chain interactive while
  // making everything else inert.
  useEffect(() => {
    if (!isHovering || !openedViaKeyboardRef.current) return;
    const inerted: Element[] = [];
    // Defer with rAF so the portal is in the DOM before we scan.
    const rafId = requestAnimationFrame(() => {
      const popoverEl = popoverContentRef.current;
      if (!popoverEl) return; // portal not mounted — nothing to trap
      // Walk from popover up to body, inerting siblings at each level.
      let current: Element | null = popoverEl;
      while (current && current !== document.body) {
        const parentEl: Element | null = current.parentElement;
        if (!parentEl) break;
        for (const sibling of Array.from(parentEl.children) as Element[]) {
          if (sibling === current) continue;
          if (!sibling.hasAttribute("inert")) {
            sibling.setAttribute("inert", "");
            inerted.push(sibling);
          }
        }
        current = parentEl;
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
  renderEvidenceKeyhole,
  renderExpandedPage,
  citation,
  verification,
  status,
  isLoading,
  isVisible,
  sourceTitle,
  claimText,
  indicatorVariant,
  viewState,
  onViewStateChange,
  expandedImageSrcOverride,
  onExpandedWidthChange,
  pageImages,
  availablePages,
  prevBeforeExpandedPageRef,
  download,
  escapeInterceptRef,
  customPopoverActions,
}: {
  renderPopoverContent?: CitationComponentProps["renderPopoverContent"];
  renderEvidenceKeyhole?: CitationComponentProps["renderEvidenceKeyhole"];
  renderExpandedPage?: CitationComponentProps["renderExpandedPage"];
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  status: CitationStatus;
  isLoading: boolean;
  isVisible: boolean;
  sourceTitle?: string;
  claimText?: string;
  indicatorVariant: IndicatorVariant;
  viewState: PopoverViewState;
  onViewStateChange: (viewState: PopoverViewState) => void;
  expandedImageSrcOverride: string | null;
  onExpandedWidthChange?: (width: number | null, source?: "expanded-keyhole" | "expanded-page" | null) => void;
  pageImages?: PageImage[];
  availablePages?: number[];
  prevBeforeExpandedPageRef: React.RefObject<"summary" | "expanded-keyhole">;
  download?: DownloadInfo;
  escapeInterceptRef?: React.MutableRefObject<(() => void) | null>;
  customPopoverActions?: import("./types.js").PopoverAction[];
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
        sourceTitle={sourceTitle}
        claimText={claimText}
        indicatorVariant={indicatorVariant}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        expandedImageSrcOverride={expandedImageSrcOverride}
        onExpandedWidthChange={onExpandedWidthChange}
        pageImages={pageImages}
        availablePages={availablePages}
        prevBeforeExpandedPageRef={prevBeforeExpandedPageRef}
        download={download}
        escapeInterceptRef={escapeInterceptRef}
        customPopoverActions={customPopoverActions}
        renderEvidenceKeyhole={renderEvidenceKeyhole}
        renderExpandedPage={renderExpandedPage}
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
      fallbackText,
      claimText,
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
      popoverPortalToBody = false,
      renderPopoverContent,
      renderEvidenceKeyhole,
      renderExpandedPage,
      additionalCount,
      faviconUrl,
      indicatorVariant = "icon",
      sourceTitle,
      onTimingEvent,
      originalDownload,
      convertedDownload,
      pageImagesByAttachmentId,
      experimentalHaptics = false,
      disableTelemetry = false,
      prefetch: prefetchMode = "eager",
      customPopoverActions,
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

    const pageImages = useMemo(() => {
      const attachmentId = verification?.attachmentId;
      if (!attachmentId || !pageImagesByAttachmentId) return undefined;
      return pageImagesByAttachmentId[attachmentId];
    }, [pageImagesByAttachmentId, verification]);

    const availablePages = useMemo(
      () => (pageImages ? Array.from(new Set(pageImages.map(p => p.pageNumber))).sort((a, b) => a - b) : undefined),
      [pageImages],
    );

    const download = useMemo(() => {
      const dl = originalDownload ?? convertedDownload;
      const url = dl?.link.url;
      if (!url) return undefined;
      return { url, filename: dl?.filename ?? undefined };
    }, [originalDownload, convertedDownload]);

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
    // Increments each time the popover opens (false → true) so the error
    // boundary gets a fresh key on re-open without remounting on close.
    const errorBoundaryKeyRef = useRef(0);
    const prevIsHoveringRef = useRef(false);
    if (isHovering && !prevIsHoveringRef.current) errorBoundaryKeyRef.current += 1;
    prevIsHoveringRef.current = isHovering;
    // Custom image src from behaviorConfig.onClick returning setImageExpanded: "<url>"
    const [customExpandedSrc, setCustomExpandedSrc] = useState<string | null>(null);
    const clearCustomExpandedSrc = useCallback(() => setCustomExpandedSrc(null), []);

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

    // Composed popover positioning — replaces 5 individual hooks + width projection
    const popover = usePopoverPosition({
      isOpen: isHovering,
      triggerRef,
      popoverContentRef,
      preferredSide: popoverPosition === "top" ? "top" : "bottom",
      experimentalHaptics,
      isMobile,
      prefersReducedMotion,
      onDismiss: closePopover,
      onCollapseToSummary: clearCustomExpandedSrc,
      evidenceDimensions: verification?.evidence?.dimensions,
    });
    // Aliases — existing code reads viewState.current, viewState.transition, etc.
    const viewState = {
      current: popover.viewState,
      ref: popover.viewStateRef,
      transition: popover.transition,
      onEscapeKeyDown: popover.onEscapeKeyDown,
      escapeInterceptRef: popover.escapeInterceptRef,
      prevBeforeExpandedPageRef: popover.prevBeforeExpandedPageRef,
      expandedNaturalWidth: popover.expandedNaturalWidth,
      expandedWidthSource: popover.expandedWidthSource,
      onExpandedWidthChange: popover.onExpandedWidthChange,
      resetToSummary: popover.resetToSummary,
    };
    const lockedSide = popover.side;
    const expandedPageSideOffset = popover.sideOffset;
    const popoverAlignOffset = popover.alignOffset;
    const citationKey = useMemo(() => getCitationKey(citation), [citation]);
    const citationInstanceId = useMemo(() => generateCitationInstanceId(citationKey), [citationKey]);

    useEffect(() => {
      return subscribeToActivePopover(activeInstanceId => {
        if (activeInstanceId !== citationInstanceId) {
          closePopover();
        }
      });
    }, [citationInstanceId, closePopover]);

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
      verification?.status === "found_source_match_only" ||
      verification?.status === "found_context_missed_source_match" ||
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
      return getTriggerText(citation, resolvedContent, fallbackText, claimText);
    }, [citation, resolvedContent, fallbackText, claimText]);

    // Behavior context for custom handlers
    const getBehaviorContext = useCallback(
      (): CitationBehaviorContext => ({
        citation,
        citationKey,
        verification: verification ?? null,
        isTooltipExpanded: isHovering,
        isImageExpanded: viewState.current !== "summary",
        hasImage: !!resolvedImageSrc,
      }),
      [citation, citationKey, verification, isHovering, viewState.current, resolvedImageSrc],
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
            announceActivePopover(citationInstanceId);
            setIsHovering(true);
            viewState.transition("expanded-page");
            // If a custom image URL was provided, validate before storing
            if (typeof actions.setImageExpanded === "string" && isValidProofImageSrc(actions.setImageExpanded)) {
              setCustomExpandedSrc(actions.setImageExpanded);
            }
          }
        }
      },
      // biome-ignore lint/correctness/useExhaustiveDependencies: both viewState and viewState.transition are intentionally listed for hook stability
      [citationInstanceId, closePopover, viewState.transition, viewState],
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
    // - getBehaviorContext: Captures current state (citation, verification, isHovering, viewState)
    //   and is itself a useCallback that updates when those values change
    // - applyBehaviorActions: Handles setImageExpanded by updating viewState
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

        // Before-default hook — callers can suppress the default popover toggle
        // by returning `false` (e.g. when single-click drives a separate
        // interaction and the popover belongs on double-click / long-press).
        // Suppressing skips the paired onClickAfterDefault so consumers don't
        // observe a "default ran" signal when it didn't.
        if (eventHandlers?.onClickBeforeDefault && e.type !== "keydown") {
          const shouldContinue = eventHandlers.onClickBeforeDefault(
            citation,
            citationKey,
            e as React.MouseEvent | React.TouchEvent,
          );
          if (shouldContinue === false) return;
        }

        // Execute the requested default action
        switch (action) {
          case "showPopover":
            // Reset to summary on open (not on close) so exit animations retain
            // the geometry of the state the user was viewing.
            viewState.resetToSummary();
            setCustomExpandedSrc(null);
            announceActivePopover(citationInstanceId);
            setIsHovering(true);
            break;
          case "hidePopover":
            closePopover();
            break;
          case "expandImage":
            announceActivePopover(citationInstanceId);
            viewState.transition("expanded-page");
            break;
        }

        eventHandlers?.onClickAfterDefault?.(citation, citationKey, e);
      },
      [
        behaviorConfig,
        eventHandlers,
        citation,
        citationInstanceId,
        citationKey,
        getBehaviorContext,
        applyBehaviorActions,
        closePopover,
        viewState.transition,
        viewState.resetToSummary,
        // biome-ignore lint/correctness/useExhaustiveDependencies: viewState methods and viewState itself are both intentionally listed for hook stability
        viewState,
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

    // Double-click handler — independent of the single-click popover toggle.
    // Fires `eventHandlers.onDoubleClick` when present. Consumers typically
    // pair this with `onClickBeforeDefault` returning `false` so single-click
    // engages a separate interaction (spotlight/zoom) and the popover opens
    // only on double-click or long-press.
    const handleDoubleClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        if (!eventHandlers?.onDoubleClick) return;
        e.preventDefault(); // prevents browser text-selection on double-click
        e.stopPropagation();
        eventHandlers.onDoubleClick(citation, citationKey, e);
      },
      [eventHandlers, citation, citationKey],
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

    // Mouse click-outside dismiss handler
    //
    // Clicking outside the citation trigger or popover should dismiss the popover.
    // Keep this active even in mobile/touch mode for hybrid environments and
    // desktop browser surfaces that report coarse pointer capability.
    //
    // Touch has its own handler above with tap-vs-scroll detection; this mouse
    // path covers actual clicks without interfering with trigger/popup clicks.
    //
    // On hybrid touch/mouse devices, a tap can fire both touchend and a synthetic
    // mousedown — closePopover() is idempotent so the double-call is harmless.
    //
    // Note: We still check isAnyOverlayOpenRef to keep the popover open when image overlay is shown.
    useEffect(() => {
      if (!isHovering) return;

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
    }, [isHovering, closePopover]);

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
          if (viewState.ref.current !== "summary") {
            viewState.transition("summary");
            return;
          }
          closePopover();
        }
      },
      // biome-ignore lint/correctness/useExhaustiveDependencies: both viewState and viewState.transition are intentionally listed for hook stability (matches the pattern at the action handler above)
      [closePopover, viewState.transition, viewState],
    );

    const handlePopoverBackdropClick = useCallback(
      (e: React.MouseEvent) => {
        if (isViewTransitioning()) return;
        if (e.target === e.currentTarget) closePopover();
      },
      [closePopover],
    );

    const isInlineVariant = variant === "text" || variant === "linter";

    // Early return for miss with fallback display (only when showing sourceMatch)
    // Inline variants inherit color (dimmed via opacity), others use explicit gray.
    if (fallbackText !== null && fallbackText !== undefined && resolvedContent === "sourceMatch" && isMiss) {
      const fallbackClasses = isInlineVariant ? "opacity-50" : "text-dc-subtle-foreground";
      return <span className={cn(fallbackClasses, className)}>{fallbackText}</span>;
    }

    const statusClasses = cn(
      // Found status (text color) - verified or partial match, for brackets variant
      (isVerified || isPartialMatch) &&
        variant === "brackets" &&
        "text-dc-primary hover:text-dc-primary/80 hover:underline",
      // Miss state: opacity dims the inherited/explicit color
      isMiss && "opacity-70",
      // Explicit gray only for non-inline variants (inline variants inherit from parent)
      isMiss && !isInlineVariant && "text-dc-foreground",
      // Pending/spinner: muted color for non-inline variants only.
      // Inline variants inherit color; the spinner icon signals loading.
      // (Linter handles pending color in its own inline styles.)
      shouldShowSpinner && !isInlineVariant && "text-dc-subtle-foreground",
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
      <CitationTriggerContent
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
      ((verification && (resolvedImageSrc || verification.sourceSnippet)) ||
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
        "relative inline [box-decoration-break:clone] [-webkit-box-decoration-break:clone]",
        "px-0.5 -mx-0.5 rounded-sm",
        "transition-colors duration-[80ms] active:scale-[0.98]",
        cursorClass,
        // Improved touch target size on mobile (minimum 44px recommended)
        // Using py-1.5 for better touch accessibility without breaking layout
        isMobile && "py-1.5 touch-manipulation",
        // Neutral hover/active for variants that don't handle their own hover styling
        ...(variantHasOwnHover ? [] : [getInteractionClasses(isHovering, variant)]),
        // Focus styles for keyboard accessibility
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-ring/40",
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
      onDoubleClick: eventHandlers?.onDoubleClick ? handleDoubleClick : undefined,
      onKeyDown: handleKeyDown,
      onTouchStart: isMobile ? handleTouchStart : undefined,
      onTouchEndCapture: isMobile ? handleTouchEnd : undefined,
    };

    // Render with Popover
    if (shouldShowPopover) {
      const popoverContentElement = (
        <PopoverContentRenderer
          renderPopoverContent={renderPopoverContent}
          renderEvidenceKeyhole={renderEvidenceKeyhole}
          renderExpandedPage={renderExpandedPage}
          citation={citation}
          verification={verification ?? null}
          status={status}
          isLoading={isLoading || shouldShowSpinner}
          isVisible={isHovering}
          sourceTitle={sourceTitle}
          claimText={claimText}
          indicatorVariant={indicatorVariant}
          viewState={viewState.current}
          onViewStateChange={viewState.transition}
          expandedImageSrcOverride={customExpandedSrc}
          onExpandedWidthChange={viewState.onExpandedWidthChange}
          pageImages={pageImages}
          availablePages={availablePages}
          prevBeforeExpandedPageRef={viewState.prevBeforeExpandedPageRef}
          download={download}
          escapeInterceptRef={viewState.escapeInterceptRef}
          customPopoverActions={customPopoverActions}
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
            {/* Error boundary above PopoverContent (not inside it) so that hook lifecycle
                errors thrown by PopoverContent itself — e.g. during ThemeProvider-triggered
                full-tree re-renders — are caught here rather than propagating to the app.
                key increments on each open (not on close) so a transient crash never
                permanently hides the popover without remounting the subtree on every close. */}
            <CitationErrorBoundary fallback={null} key={errorBoundaryKeyRef.current}>
              <PopoverContent
                ref={popoverContentRef}
                id={popoverId}
                aria-label={t("aria.citationVerificationStatus")}
                side={lockedSide}
                align="start"
                sideOffset={expandedPageSideOffset}
                alignOffset={popoverAlignOffset}
                portalToBody={popoverPortalToBody || viewState.current === "expanded-page"}
                onCloseAutoFocus={handleCloseAutoFocus}
                onEscapeKeyDown={viewState.onEscapeKeyDown}
                style={
                  viewState.current === "expanded-page"
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
                    : viewState.current === "expanded-keyhole"
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
            </CitationErrorBoundary>
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

// === URL CITATION COMPONENT ===
// Extracted to ./UrlCitationComponent.tsx — re-exported for backward compatibility.
export { MemoizedUrlCitationComponent, UrlCitationComponent } from "./UrlCitationComponent.js";
