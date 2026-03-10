/**
 * Default popover content — three-zone layout for citation popovers.
 *
 * Contains the popover view state types, popover content props, and the
 * DefaultPopoverContent component that renders success/partial/miss/fallback
 * states with Zone 1 (header), Zone 2 (claim), and Zone 3 (evidence).
 *
 * @packageDocumentation
 */

import { type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CitationStatus } from "../types/citation.js";
import { isUrlCitation } from "../types/citation.js";
import type { PageImage, Verification } from "../types/verification.js";
import { getStatusLabel } from "./citationStatus.js";
import {
  BLINK_ENTER_EASING,
  EASE_COLLAPSE,
  isValidProofImageSrc,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  POPOVER_CONTAINER_BASE_CLASSES,
  POPOVER_MORPH_COLLAPSE_MS,
  POPOVER_MORPH_EXPAND_MS,
  VT_EVIDENCE_COLLAPSE_MS,
  VT_EVIDENCE_DIP_OPACITY,
  VT_EVIDENCE_EXPAND_MS,
} from "./constants.js";
import { EvidenceTray, InlineExpandedImage, resolveEvidenceSrc, resolveExpandedImage } from "./EvidenceTray.js";
import { getExpandedPopoverWidth, getSummaryPopoverWidth } from "./expandedWidthPolicy.js";
import { HighlightedPhrase } from "./HighlightedPhrase.js";
import { useAnimatedHeight } from "./hooks/useAnimatedHeight.js";
import { useBlinkMotionStage } from "./hooks/useBlinkMotionStage.js";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { useTranslation } from "./i18n.js";
import { SpinnerIcon } from "./icons.js";
import { getBlinkContainerMotionStyle } from "./motion/blinkAnimation.js";
import { buildIntentSummary, type MatchSnippet } from "./searchSummaryUtils.js";
import type { BaseCitationProps, IndicatorVariant } from "./types.js";
import {
  getUrlAccessExplanation,
  mapSearchStatusToFetchStatus,
  mapUrlAccessStatusToFetchStatus,
  type UrlAccessExplanation,
} from "./urlAccessExplanation.js";
import { cn, isImageSource } from "./utils.js";
import { SourceContextHeader, StatusHeader } from "./VerificationLog.js";
import { DC_EVIDENCE_VT_NAME } from "./viewTransition.js";

// React 19.2's Activity component is disabled here because it triggers a fiber
// effect linked-list corruption bug during simultaneous mode transitions
// (hidden→visible) and popover unmounts. The crash manifests as
// "Cannot read/set properties of undefined (reading/setting 'destroy')" inside
// commitHookEffectListMount/Unmount → reconnectPassiveEffects.
// Using a Fragment pass-through preserves identical render output without the
// unstable Activity lifecycle. Image prefetching is handled imperatively
// via `new Image().src` in the useEffect below.
const Activity = ({ children }: { children: ReactNode }) => <>{children}</>;

// =============================================================================
// TYPES
// =============================================================================

/** Popover view state: summary (default), keyhole image expanded in viewer, or full proof page */
export type PopoverViewState = "summary" | "expanded-keyhole" | "expanded-page";

export interface PopoverContentProps {
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  /** Page images for the current attachment (used for expanded page view). */
  pageImages?: PageImage[];
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
  indicatorVariant?: IndicatorVariant;
  /** Current view state: summary or expanded */
  viewState?: PopoverViewState;
  /** Callback when view state changes */
  onViewStateChange?: (viewState: PopoverViewState) => void;
  /** Override the expanded image src (from behaviorConfig.onClick returning setImageExpanded: "<url>") */
  expandedImageSrcOverride?: string | null;
  /** Reports the expanded image's natural width (or null on collapse) so the parent can size PopoverContent. */
  onExpandedWidthChange?: (width: number | null, source?: "expanded-keyhole" | "expanded-page" | null) => void;
  /** Ref tracking which state preceded expanded-page, for correct Escape back-navigation. */
  prevBeforeExpandedPageRef?: RefObject<"summary" | "expanded-keyhole">;
  /**
   * Download URL for the source file. When provided, renders a download button in the popover header.
   */
  downloadUrl?: string;
  /**
   * Ref that sub-components set to a collapse function when they have an
   * expanded section (e.g. search log) that should consume Escape before the
   * popover closes. The parent's onEscapeKeyDown checks this ref first.
   */
  escapeInterceptRef?: React.MutableRefObject<(() => void) | null>;
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Renders a colored banner explaining why a URL could not be accessed.
 * Amber background for blocked states (potentially resolvable), red for errors.
 */
function UrlAccessExplanationSection({ explanation }: { explanation: UrlAccessExplanation }) {
  const t = useTranslation();
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
      aria-label={`${isAmber ? t("misc.warning") : t("misc.error")}: ${explanation.title}`}
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

/**
 * Display matched snippets inline within the popover for partial/displaced matches.
 * Shows 1-3 snippets with the matched portion highlighted.
 */
function PopoverSnippetZone({ snippets }: { snippets: MatchSnippet[] }) {
  const t = useTranslation();
  if (snippets.length === 0) return null;
  return (
    <div className="px-4 py-2 space-y-1.5 border-b border-gray-100 dark:border-gray-800">
      {snippets.slice(0, 3).map((snippet, idx) => {
        const before = snippet.contextText.slice(0, snippet.matchStart);
        const match = snippet.contextText.slice(snippet.matchStart, snippet.matchEnd);
        const after = snippet.contextText.slice(snippet.matchEnd);
        return (
          <div
            key={`snippet-${snippet.matchStart}-${snippet.matchEnd}-${snippet.page ?? idx}`}
            className="text-xs text-gray-600 dark:text-gray-300 font-mono leading-relaxed"
          >
            {before && <span className="text-gray-400 dark:text-gray-500">...{before}</span>}
            <strong className="text-gray-800 dark:text-gray-100 bg-amber-100/50 dark:bg-amber-900/30 px-0.5 rounded">
              {match}
            </strong>
            {after && <span className="text-gray-400 dark:text-gray-500">{after}...</span>}
            {snippet.page != null && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">
                ({t("location.page", { pageNumber: snippet.page })})
              </span>
            )}
            {!snippet.isProximate && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1 italic">
                {t("evidence.differentSection")}
              </span>
            )}
          </div>
        );
      })}
      {snippets.length > 3 && (
        <div className="text-[10px] text-gray-400 dark:text-gray-500 italic">
          {t("evidence.andMore", { count: snippets.length - 3 })}
        </div>
      )}
    </div>
  );
}

// Evidence source resolution uses resolveEvidenceSrc() from EvidenceTray.tsx —
// the single canonical resolver for evidence snippet / web capture images.

// =============================================================================
// EXTRACTED SUB-COMPONENTS
// =============================================================================

/**
 * Popover container that snaps to target layout between summary and expanded states.
 *
 * Previous versions used CSS `transition: width` to morph between states, but this
 * causes visible content reflow on every animation frame — text re-wraps, images
 * rescale through non-integer sizes, and flex layouts redistribute space. The
 * intermediate frames are never visually coherent for a content-heavy container.
 *
 * Layout snaps to target width to avoid text/image reflow artifacts during
 * view-state changes. Any visual motion should be handled by inner evidence/content
 * components rather than morphing the outer popover container.
 */
function PopoverLayoutShell({
  isExpanded,
  isFullPage,
  expandedNaturalWidth,
  summaryWidth,
  children,
}: {
  isExpanded: boolean;
  isFullPage: boolean;
  expandedNaturalWidth: number | null;
  summaryWidth: string;
  children: ReactNode;
}) {
  const { stage: blinkStage, prefersReducedMotion } = useBlinkMotionStage(isExpanded || isFullPage, "container");
  const shellMotion = getBlinkContainerMotionStyle(blinkStage, prefersReducedMotion);
  // This shell stays mounted when stepping expanded -> summary. Keep opacity at 1
  // on the exit stage to avoid a white flash while preserving subtle scale settle.
  const shellMotionWithoutExitFade =
    blinkStage === "exit"
      ? {
          ...shellMotion,
          opacity: 1,
        }
      : shellMotion;

  // Both expanded-keyhole and expanded-page size to the image once its width is known,
  // via getExpandedPopoverWidth() → max(320px, min(imageW + 26px, 100dvw - 2rem)).
  // Before the image reports its width: use the mid-width fallback (responsive clamp)
  // so the popover grows toward the image's actual width instead of snapping to full
  // viewport. Expanded-evidence stays at summaryWidth to avoid a jarring jump.
  const shellWidth =
    (isFullPage || isExpanded) && expandedNaturalWidth !== null
      ? getExpandedPopoverWidth(expandedNaturalWidth)
      : isFullPage
        ? getExpandedPopoverWidth(null)
        : summaryWidth;

  return (
    <Activity>
      <div
        className={POPOVER_CONTAINER_BASE_CLASSES}
        style={{
          width: shellWidth,
          maxWidth: "100%",
          ...shellMotionWithoutExitFade,
          ...(isFullPage && {
            display: "flex",
            flexDirection: "column" as const,
            overflowY: "hidden" as const,
            maxHeight: "inherit",
          }),
        }}
      >
        {children}
      </div>
    </Activity>
  );
}

/**
 * Highlighted phrase quote block with a colored left border.
 * Border color reflects verification status: green (success), amber (partial), red (miss).
 */
function ClaimQuote({
  fullPhrase,
  anchorText,
  isMiss,
  borderColor,
  maxWidth,
}: {
  fullPhrase: string;
  anchorText?: string;
  isMiss: boolean;
  borderColor: string;
  maxWidth?: string;
}) {
  return (
    <div
      className={cn(
        "mx-3 mt-1 mb-3 pl-3 pr-3 py-2 text-xs leading-relaxed break-words bg-gray-50 dark:bg-gray-800/50 border-l-[3px] max-w-prose",
        borderColor,
      )}
      style={maxWidth ? { maxWidth } : undefined}
    >
      <HighlightedPhrase fullPhrase={fullPhrase} anchorText={anchorText} isMiss={isMiss} />
    </div>
  );
}

/**
 * Wrapper that smoothly animates the height of its children when viewState changes.
 *
 * When the popover width snaps (e.g. summary → expanded), text inside ClaimQuote
 * rewraps instantly, changing its height. This wrapper intercepts the height change
 * using useLayoutEffect (before paint) and animates it with CSS transitions.
 *
 * When reduced motion is preferred, height changes are instant (0ms duration)
 * but the wrapper DOM stays mounted — no layout shift from conditional unmounting.
 */
function AnimatedHeightWrapper({
  viewState,
  children,
  expandDurationMs,
  collapseDurationMs,
}: {
  viewState: PopoverViewState;
  children: ReactNode;
  /** Override expand duration (ms). Defaults to POPOVER_MORPH_EXPAND_MS. Pass 0 for snap. */
  expandDurationMs?: number;
  /** Override collapse duration (ms). Defaults to POPOVER_MORPH_COLLAPSE_MS. Pass 0 for snap. */
  collapseDurationMs?: number;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const baseExpand = expandDurationMs ?? POPOVER_MORPH_EXPAND_MS;
  const baseCollapse = collapseDurationMs ?? POPOVER_MORPH_COLLAPSE_MS;

  // A.5.5: When reduced motion is preferred, pass 0ms durations so height changes
  // are instant but the wrapper DOM stays mounted (no layout shift from Fragment swap).
  useAnimatedHeight(
    wrapperRef,
    contentRef,
    viewState,
    prefersReducedMotion ? 0 : baseExpand,
    prefersReducedMotion ? 0 : baseCollapse,
    BLINK_ENTER_EASING,
    EASE_COLLAPSE,
  );

  // Extracted from inline JSX arrow so the React Compiler can cache it.
  // Only reads from the event parameter — zero closures captured.
  const handleTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName === "height") {
      e.currentTarget.style.height = "";
      e.currentTarget.style.overflow = "";
      e.currentTarget.style.transition = "";
    }
  }, []);

  return (
    <div ref={wrapperRef} onTransitionEnd={handleTransitionEnd}>
      <div ref={contentRef} style={{ display: "flow-root" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Zone 3: Triple always-render evidence display pattern.
 *
 * Renders three slots simultaneously, hiding inactive ones with display:none:
 * - Slot A (summary): EvidenceTray keyhole strip
 * - Slot B (expanded-keyhole): InlineExpandedImage with the keyhole's own image source
 * - Slot C (expanded-page): InlineExpandedImage fill=true
 *
 * This keeps the hook tree stable — React 19's StrictMode corrupts the fiber effect linked
 * list when conditionally swapping components with different hook counts inside a portal.
 */
function EvidenceZone({
  viewState,
  evidenceSrc,
  expandedImage,
  onViewStateChange,
  onRequestCollapseFromPage,
  onExpandToPage,
  expandCtaLabel,
  handlePageImageLoad,
  handleKeyholeImageLoad,
  prevBeforeExpandedPageRef,
  verification,
  summaryContent,
  keyholeInitialScroll,
  escapeInterceptRef,
}: {
  viewState: PopoverViewState;
  evidenceSrc: string | null;
  expandedImage: { src: string; renderScale?: { x: number; y: number } | null } | null;
  onViewStateChange?: (viewState: PopoverViewState) => void;
  onRequestCollapseFromPage?: () => void;
  /** When provided, renders an expanded-keyhole footer CTA (for example, "View page" or "View image"). */
  onExpandToPage?: () => void;
  /** Optional expanded-keyhole CTA label override. */
  expandCtaLabel?: string;
  handlePageImageLoad: (width: number, height: number) => void;
  handleKeyholeImageLoad: (width: number, height: number) => void;
  prevBeforeExpandedPageRef: RefObject<"summary" | "expanded-keyhole">;
  verification: Verification | null;
  summaryContent: ReactNode;
  /** Natural-pixel scroll position captured from the keyhole strip on last expand click. */
  keyholeInitialScroll?: { left: number; top: number } | null;
  escapeInterceptRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const slotBRef = useRef<HTMLDivElement>(null);
  const slotCRef = useRef<HTMLDivElement>(null);

  // Auto-focus InlineExpandedImage when entering an expanded view state.
  // Without this, focus stays on document.body (the clicked button is now hidden
  // via display:none), so InlineExpandedImage's onKeyDown — which has
  // stopPropagation + onCollapse for correct Escape step-back — never fires.
  // The document-level listener in Popover.tsx serves as a fallback, but routing
  // Escape through InlineExpandedImage's own handler is more reliable.
  useEffect(() => {
    if (viewState !== "expanded-keyhole" && viewState !== "expanded-page") return;
    const ref = viewState === "expanded-keyhole" ? slotBRef : slotCRef;
    const el = ref.current?.querySelector<HTMLElement>("[data-dc-inline-expanded]");
    el?.focus({ preventScroll: true });
  }, [viewState]);

  // Let Escape step back from expanded-page even if focus is on header controls.
  useEffect(() => {
    if (!escapeInterceptRef || viewState !== "expanded-page") return;
    const intercept = onRequestCollapseFromPage ?? null;
    escapeInterceptRef.current = intercept;
    return () => {
      if (escapeInterceptRef.current === intercept) {
        escapeInterceptRef.current = null;
      }
    };
  }, [viewState, onRequestCollapseFromPage, escapeInterceptRef]);

  // Extracted from inline JSX arrows so the React Compiler can cache them.
  const handleKeyholeCollapse = useCallback(() => {
    onViewStateChange?.("summary");
  }, [onViewStateChange]);

  const handlePageCollapse = useCallback(() => {
    if (onRequestCollapseFromPage) {
      onRequestCollapseFromPage();
    } else {
      onViewStateChange?.(prevBeforeExpandedPageRef.current);
    }
  }, [onRequestCollapseFromPage, onViewStateChange, prevBeforeExpandedPageRef]);

  return (
    <>
      {/* View Transitions CSS for evidence image morph between slots.
          Three strategies keyed by data attributes on <html>:

          1. Keyhole expand (default) — geometry-only morph, no cross-fade.
             Old snapshot hidden immediately so the new content is visible
             throughout the morph. Size change is small enough that the
             geometry morph alone provides smooth continuity.

          2. Page expand (data-dc-page-expand) — reverse-collapse cross-fade.
             Both old (keyhole strip) and new (full page scroll container)
             have visible content. Old fades out while new fades in, with
             the group morphing from keyhole bounds → scroll container bounds.
             The VT name is forced onto the scroll container (not the
             transparent annotation marker) during page expand so the NEW
             snapshot actually has image content.

          3. Collapse (data-dc-collapse) — opacity cross-fade.
             Quick exit where the opacity dip reinforces the "shrinking
             away" feel. Uses EASE_COLLAPSE (decisive deceleration). */}
      <style>{`
        /* Let clicks pass through VT pseudo-element overlay to the real DOM
           so users can click during a transition without being blocked. */
        ::view-transition { pointer-events: none; }

        ::view-transition-old(${DC_EVIDENCE_VT_NAME}) {
          animation: none;
          opacity: 0;
        }
        ::view-transition-new(${DC_EVIDENCE_VT_NAME}) {
          animation: none;
        }
        ::view-transition-group(${DC_EVIDENCE_VT_NAME}) {
          animation-duration: ${VT_EVIDENCE_EXPAND_MS}ms;
          animation-timing-function: ${EASE_COLLAPSE};
        }

        :root[data-dc-page-expand] ::view-transition-old(${DC_EVIDENCE_VT_NAME}) {
          animation: dc-evidence-fade-out ${VT_EVIDENCE_EXPAND_MS}ms ${EASE_COLLAPSE} both;
        }
        :root[data-dc-page-expand] ::view-transition-new(${DC_EVIDENCE_VT_NAME}) {
          animation: dc-evidence-fade-in ${VT_EVIDENCE_EXPAND_MS}ms ${EASE_COLLAPSE} both;
        }
        :root[data-dc-page-expand] ::view-transition-group(${DC_EVIDENCE_VT_NAME}) {
          animation-duration: ${VT_EVIDENCE_EXPAND_MS}ms;
          animation-timing-function: ${EASE_COLLAPSE};
        }

        :root[data-dc-collapse] ::view-transition-old(${DC_EVIDENCE_VT_NAME}) {
          animation: dc-evidence-fade-out ${VT_EVIDENCE_COLLAPSE_MS}ms ${EASE_COLLAPSE} both;
        }
        :root[data-dc-collapse] ::view-transition-new(${DC_EVIDENCE_VT_NAME}) {
          animation: dc-evidence-fade-in ${VT_EVIDENCE_COLLAPSE_MS}ms ${EASE_COLLAPSE} both;
        }
        :root[data-dc-collapse] ::view-transition-group(${DC_EVIDENCE_VT_NAME}) {
          animation-duration: ${VT_EVIDENCE_COLLAPSE_MS}ms;
          animation-timing-function: ${EASE_COLLAPSE};
        }

        @media (prefers-reduced-motion: reduce) {
          ::view-transition-group(${DC_EVIDENCE_VT_NAME}),
          ::view-transition-old(${DC_EVIDENCE_VT_NAME}),
          ::view-transition-new(${DC_EVIDENCE_VT_NAME}) {
            animation-duration: 0s !important;
          }
        }

        @keyframes dc-evidence-fade-out {
          0%   { opacity: 1; }
          30%  { opacity: ${VT_EVIDENCE_DIP_OPACITY}; }
          100% { opacity: 0; }
        }
        @keyframes dc-evidence-fade-in {
          0%   { opacity: 0; }
          60%  { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
      {/* Slot A: summary — EvidenceTray keyhole strip */}
      <div style={viewState !== "summary" ? { display: "none" } : undefined}>{summaryContent}</div>
      {/* Slot B: expanded-keyhole — always rendered (React 19 fiber stability),
          inactive states hidden with display:none (no top-to-bottom reveal). */}
      <div ref={slotBRef} style={viewState !== "expanded-keyhole" ? { display: "none" } : undefined}>
        {evidenceSrc && (
          <InlineExpandedImage
            src={evidenceSrc}
            onCollapse={handleKeyholeCollapse}
            onExpand={onExpandToPage}
            expandCtaLabel={expandCtaLabel}
            onNaturalSize={handleKeyholeImageLoad}
            verification={verification}
            initialScroll={keyholeInitialScroll ?? undefined}
          />
        )}
      </div>
      {/* Slot C: expanded-page — wrapper div always rendered for React 19 fiber
          stability (constant fiber position). InlineExpandedImage mounts inside once
          expandedImage is resolved. */}
      <div
        ref={slotCRef}
        className="flex flex-col flex-1 min-h-0"
        style={viewState !== "expanded-page" ? { display: "none" } : undefined}
      >
        {expandedImage?.src && (
          <InlineExpandedImage
            src={expandedImage.src}
            onCollapse={handlePageCollapse}
            verification={verification}
            fill
            onNaturalSize={handlePageImageLoad}
            renderScale={expandedImage.renderScale}
          />
        )}
      </div>
    </>
  );
}

/**
 * Loading/pending skeleton view.
 * Mirrors the resolved layout shape so the popover doesn't jump when verification arrives.
 */
function PopoverLoadingView({
  citation,
  verification,
  sourceLabel,
  downloadUrl,
}: {
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  sourceLabel?: string;
  downloadUrl?: string;
}) {
  const t = useTranslation();
  const anchorText = citation.anchorText?.toString();
  const fullPhrase = citation.fullPhrase;
  const searchStatus = verification?.status;
  const searchingPhrase = fullPhrase || anchorText;
  return (
    <div className={cn(POPOVER_CONTAINER_BASE_CLASSES, "min-w-[200px] max-w-[480px]")}>
      <SourceContextHeader
        citation={citation}
        verification={verification}
        status={searchStatus}
        sourceLabel={sourceLabel}
        downloadUrl={downloadUrl}
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
          {t("popover.searching")}
        </span>
        {searchingPhrase && (
          <p className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded font-mono text-[11px] break-words text-gray-700 dark:text-gray-300">
            &ldquo;{searchingPhrase.length > 80 ? `${searchingPhrase.slice(0, 80)}…` : searchingPhrase}&rdquo;
          </p>
        )}
        {!isUrlCitation(citation) && citation.pageNumber && citation.pageNumber > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isImageSource(verification)
              ? t("popover.searchingImage")
              : t("popover.lookingOnPage", { pageNumber: citation.pageNumber })}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Fallback text-only view for verified/partial-match citations without an evidence image.
 * Returns null when there is nothing meaningful to display.
 */
function PopoverFallbackView({
  citation,
  verification,
  sourceLabel,
  status,
  urlAccessExplanation,
  indicatorVariant = "icon",
  downloadUrl,
}: {
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  sourceLabel?: string;
  status: CitationStatus;
  urlAccessExplanation: UrlAccessExplanation | null;
  indicatorVariant?: IndicatorVariant;
  downloadUrl?: string;
}) {
  const t = useTranslation();
  const searchStatus = verification?.status;
  const statusLabel = indicatorVariant !== "none" ? getStatusLabel(status, t) : null;
  const hasSnippet = verification?.verifiedMatchSnippet;
  const pageNumber = verification?.document?.verifiedPageNumber;

  if (!hasSnippet && !statusLabel && !urlAccessExplanation) return null;

  return (
    <div className={cn(POPOVER_CONTAINER_BASE_CLASSES, "min-w-[180px] max-w-full")}>
      <SourceContextHeader
        citation={citation}
        verification={verification}
        status={searchStatus}
        sourceLabel={sourceLabel}
        downloadUrl={downloadUrl}
      />
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
            {hasSnippet}
          </q>
        )}
        {pageNumber && pageNumber > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isImageSource(verification) ? t("location.image") : t("location.page", { pageNumber })}
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function DefaultPopoverContent({
  citation,
  verification,
  pageImages,
  status,
  isLoading = false,
  isVisible = true,
  sourceLabel,
  indicatorVariant = "icon",
  viewState = "summary",
  onViewStateChange,
  expandedImageSrcOverride,
  onExpandedWidthChange,
  prevBeforeExpandedPageRef: propPrevBeforeExpandedPageRef,
  downloadUrl,
  escapeInterceptRef,
}: PopoverContentProps) {
  const t = useTranslation();
  // Resolve evidence src up-front so hasImage reflects only actually-renderable images.
  const evidenceSrc = useMemo(() => resolveEvidenceSrc(verification), [verification]);
  const hasImage = !!evidenceSrc || (pageImages != null && pageImages.length > 0);
  const expandCtaLabel = isImageSource(verification) ? t("action.viewImage") : undefined;
  const { isMiss, isPartialMatch, isPending, isVerified } = status;
  const searchStatus = verification?.status;

  // A.5.3 Track previous pending state so we can announce transitions to screen readers.
  // Uses a ref (not state) to track previous isPending — avoids setState-during-render
  // which the React Compiler doesn't support. DOM mutation of the aria-live region is an
  // external system sync (the correct useEffect use case), not React state.
  const prevIsPendingRef = useRef(isPending);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = liveRegionRef.current;
    if (!el) return;
    if (prevIsPendingRef.current && !isPending) {
      // Pending → resolved: announce the verification result
      if (isVerified && !isPartialMatch && !isMiss) {
        el.textContent = t("aria.announcement.verifiedExact");
      } else if (isMiss) {
        el.textContent = t("aria.announcement.notFound");
      } else if (isPartialMatch) {
        el.textContent = t("aria.announcement.partial");
      }
    } else if (!prevIsPendingRef.current && isPending) {
      // Resolved → pending (retry): clear so next resolution triggers a new announcement.
      el.textContent = "";
    }
    prevIsPendingRef.current = isPending;
  }, [isPending, isVerified, isPartialMatch, isMiss, t]);

  // Save/restore scroll position for back navigation

  // Resolve expanded image for the full-page viewer; allow caller to override the src
  const expandedImage = useMemo(() => {
    const resolved = resolveExpandedImage(verification, pageImages);
    if (!expandedImageSrcOverride || !isValidProofImageSrc(expandedImageSrcOverride)) return resolved;
    // Custom src provided: clear overlay metadata since dimensions belong to the original image
    return resolved
      ? { ...resolved, src: expandedImageSrcOverride, dimensions: null, highlightBox: null, renderScale: null }
      : { src: expandedImageSrcOverride };
  }, [verification, pageImages, expandedImageSrcOverride]);

  // Suppress page expand when page image dimensions are known and already fit within
  // the evidence view constraints (≤480px wide, ≤600px tall) — expanding adds no value.
  const canExpandToPage = !!expandedImage;

  // Content-adaptive summary width: pre-seed from verification dimensions to avoid
  // a width flash, then confirm/correct when the keyhole image actually renders.
  const [keyholeDisplayedWidth, setKeyholeDisplayedWidth] = useState<number | null>(() => {
    const dims = verification?.evidence?.dimensions;
    if (!dims || dims.height <= 0) return null;
    return dims.width * (KEYHOLE_STRIP_HEIGHT_DEFAULT / dims.height);
  });

  const summaryWidth = useMemo(() => getSummaryPopoverWidth(keyholeDisplayedWidth), [keyholeDisplayedWidth]);
  const keyholeNaturalWidthSeed = useMemo(() => {
    const width = verification?.evidence?.dimensions?.width;
    return typeof width === "number" && Number.isFinite(width) && width > 0 ? width : null;
  }, [verification?.evidence?.dimensions?.width]);
  const pageNaturalWidthSeed = useMemo(() => {
    const width = expandedImage?.dimensions?.width;
    return typeof width === "number" && Number.isFinite(width) && width > 0 ? width : null;
  }, [expandedImage?.dimensions?.width]);

  // Page image natural width — measured from onLoad, with seed fallback from verification metadata.
  // Derived value avoids a set-state-in-effect pattern that prevents React Compiler optimization.
  const [pageNaturalWidthMeasured, setPageNaturalWidthMeasured] = useState<number | null>(null);
  const pageNaturalWidth = pageNaturalWidthMeasured ?? pageNaturalWidthSeed;
  // Expanded-page shell width lock keyed to { width, src }. The derived value
  // auto-resets to null when viewState leaves "expanded-page" or when expandedImage.src
  // changes, eliminating two set-state-in-effect patterns the React Compiler flags.
  const [expandedPageShell, setExpandedPageShell] = useState<{ width: number; src: string } | null>(null);
  const expandedPageShellWidth =
    viewState === "expanded-page" && expandedPageShell?.src === expandedImage?.src
      ? (expandedPageShell?.width ?? null)
      : null;

  // Last measured expanded-keyhole natural width keyed by evidence src.
  // Keeping src+width together prevents stale widths from leaking across source changes.
  const [keyholeImageNatural, setKeyholeImageNatural] = useState<{ src: string; width: number } | null>(null);

  const handlePageImageLoad = useCallback(
    (width: number, _height: number) => {
      if (!Number.isFinite(width) || width <= 0) return;
      // In expanded-page mode, InlineExpandedImage reports zoomed size updates.
      // Ignore those for shell sizing; only lock once if width was previously unknown.
      if (viewState !== "expanded-page") {
        setPageNaturalWidthMeasured(width);
      }
      if (expandedImage?.src) {
        setExpandedPageShell(prev => (prev ? prev : { width, src: expandedImage.src }));
      }
    },
    // expandedImage (not expandedImage?.src) — compiler infers the whole object
    // because of the optional chaining property access pattern. Stable ref identity
    // means this rarely triggers extra re-creation.
    [viewState, expandedImage],
  );

  const keyholeImageNaturalWidth =
    evidenceSrc && keyholeImageNatural?.src === evidenceSrc ? keyholeImageNatural.width : null;

  // Expanded popover width — needed for both full-page and expanded-keyhole views.
  const expandedNaturalWidth = useMemo(() => {
    if (viewState === "expanded-page") {
      return expandedPageShellWidth ?? pageNaturalWidth ?? keyholeImageNaturalWidth ?? keyholeNaturalWidthSeed;
    }
    if (viewState === "expanded-keyhole") return keyholeImageNaturalWidth ?? keyholeNaturalWidthSeed;
    return null;
  }, [viewState, expandedPageShellWidth, pageNaturalWidth, keyholeImageNaturalWidth, keyholeNaturalWidthSeed]);

  // Notify parent when expandedNaturalWidth changes — calls only the prop callback,
  // not a React setter, so this useEffect is React Compiler-compatible.
  useEffect(() => {
    const source =
      viewState === "expanded-page" ? "expanded-page" : viewState === "expanded-keyhole" ? "expanded-keyhole" : null;
    onExpandedWidthChange?.(expandedNaturalWidth, source);
  }, [expandedNaturalWidth, onExpandedWidthChange, viewState]);

  const handleKeyholeImageLoad = useCallback(
    (width: number, _height: number) => {
      if (!evidenceSrc || !Number.isFinite(width) || width <= 0) return;
      setKeyholeImageNatural(prev =>
        prev?.src === evidenceSrc && prev.width === width ? prev : { src: evidenceSrc, width },
      );
    },
    [evidenceSrc],
  );

  // Scroll position captured from the keyhole strip, applied to InlineExpandedImage on expand.
  const [keyholeInitialScroll, setKeyholeInitialScroll] = useState<{ left: number; top: number } | null>(null);
  const handleKeyholeScrollCapture = useCallback((left: number, top: number) => {
    setKeyholeInitialScroll({ left, top });
  }, []);
  // Tracks which state we entered expanded-page from, so onCollapse can return there.
  const localPrevBeforeExpandedPageRef = useRef<"summary" | "expanded-keyhole">("summary");
  const prevBeforeExpandedPageRef = propPrevBeforeExpandedPageRef ?? localPrevBeforeExpandedPageRef;
  // Not wrapped in useCallback — the compiler auto-memoizes this with correct deps.
  // Manual useCallback conflicts with the compiler's inference of ref.current access
  // ("Differences in ref.current access"), causing a file-level bailout.
  const handleCollapseFromExpandedPage = () => {
    const target = prevBeforeExpandedPageRef.current;
    onViewStateChange?.(target);
  };

  // Toggles the keyhole expanded view. Clicking when already expanded collapses back to summary.
  const handleKeyholeClick = useCallback(() => {
    if (viewState === "expanded-keyhole") {
      onViewStateChange?.("summary");
      return;
    }
    if (!evidenceSrc) return;
    // Capture natural width synchronously from the currently visible keyhole image.
    // This removes the intermediate "same-width but re-positioned" frame by letting
    // expanded-keyhole sizing resolve in the same event batch as the view-state switch.
    if (typeof document !== "undefined") {
      const keyholeImg = document.querySelector("[data-dc-keyhole] img") as HTMLImageElement | null;
      const width = keyholeImg?.naturalWidth ?? 0;
      if (Number.isFinite(width) && width > 0) {
        setKeyholeImageNatural(prev =>
          prev?.src === evidenceSrc && prev.width === width ? prev : { src: evidenceSrc, width },
        );
        onExpandedWidthChange?.(width, "expanded-keyhole");
      }
    }
    onViewStateChange?.("expanded-keyhole");
  }, [viewState, evidenceSrc, onExpandedWidthChange, onViewStateChange]);

  const handleExpand = useCallback(() => {
    if (!canExpandToPage) return;
    // prevBeforeExpandedPageRef.current is now set by setViewStateWithHaptics in
    // Citation.tsx — no ref mutation needed here, which eliminates a React Compiler bailout.
    const expandedPageWidth =
      expandedPageShellWidth ?? pageNaturalWidth ?? keyholeImageNaturalWidth ?? keyholeNaturalWidthSeed;
    if (expandedPageWidth != null && expandedImage?.src) {
      setExpandedPageShell(prev => (prev ? prev : { width: expandedPageWidth, src: expandedImage.src }));
    }
    onExpandedWidthChange?.(expandedPageWidth, "expanded-page");
    onViewStateChange?.("expanded-page");
  }, [
    canExpandToPage,
    expandedPageShellWidth,
    // expandedImage (not expandedImage?.src) — compiler infers the whole object
    // because of the optional chaining property access pattern.
    expandedImage,
    keyholeImageNaturalWidth,
    keyholeNaturalWidthSeed,
    onExpandedWidthChange,
    onViewStateChange,
    pageNaturalWidth,
  ]);

  // Prefetch images imperatively when the popover becomes visible.
  // Keyhole image: preload as soon as the popover opens (user is hovering).
  // Page image: preload now so it's ready when the user clicks to expand.
  useEffect(() => {
    if (!isVisible) return;
    let disposed = false;
    let keyholePreload: HTMLImageElement | null = null;
    if (evidenceSrc) {
      const preloadSrc = evidenceSrc;
      keyholePreload = new Image();
      keyholePreload.onload = () => {
        if (disposed) return;
        const width = keyholePreload?.naturalWidth ?? 0;
        if (!Number.isFinite(width) || width <= 0) return;
        setKeyholeImageNatural(prev =>
          prev?.src === preloadSrc && prev.width === width ? prev : { src: preloadSrc, width },
        );
      };
      keyholePreload.src = preloadSrc;
    }
    const pageSrc = expandedImage?.src;
    if (pageSrc && isValidProofImageSrc(pageSrc)) new Image().src = pageSrc;
    return () => {
      disposed = true;
      if (keyholePreload) keyholePreload.onload = null;
    };
  }, [isVisible, evidenceSrc, expandedImage?.src]);

  // Get page info (document citations only)
  const expectedPage = !isUrlCitation(citation) ? citation.pageNumber : undefined;
  const foundPage = verification?.document?.verifiedPageNumber ?? undefined;

  // Get humanizing message for partial/not-found states (URL citations only)
  const anchorText = citation.anchorText?.toString();
  const fullPhrase = citation.fullPhrase;

  // Intent summary for document citations — snippet-based display for partial matches
  const intentSummary = useMemo(
    () => (!isUrlCitation(citation) ? buildIntentSummary(verification, verification?.searchAttempts ?? []) : null),
    [citation, verification],
  );
  const intentSnippets = intentSummary?.outcome === "related_found" ? intentSummary.snippets : [];

  // Get URL access explanation for blocked/error states (URL citations only)
  const urlAccessExplanation = useMemo(() => {
    if (!isUrlCitation(citation)) return null;
    const urlAccessStatus = verification?.url?.urlAccessStatus;
    const errorMsg = verification?.url?.urlVerificationError;
    const fetchStatus = urlAccessStatus
      ? mapUrlAccessStatusToFetchStatus(urlAccessStatus, errorMsg)
      : mapSearchStatusToFetchStatus(searchStatus);
    return getUrlAccessExplanation(fetchStatus, verification?.url?.urlVerificationError, t);
  }, [citation, verification, searchStatus, t]);

  // A.5.3 aria-live region for screen reader announcements on status transitions.
  // Always rendered (even when empty) so it's in the DOM before content changes —
  // screen readers only announce changes within an already-mounted aria-live container.
  // A newly-inserted container with pre-populated content is not reliably announced.
  // Content is mutated imperatively via liveRegionRef (external DOM sync via useEffect).
  const statusLiveRegion = <div ref={liveRegionRef} aria-live="polite" aria-atomic="true" className="sr-only" />;

  // Loading/pending state view — skeleton mirrors resolved layout shape
  if (isLoading || isPending) {
    return (
      <>
        {statusLiveRegion}
        <PopoverLoadingView
          citation={citation}
          verification={verification}
          sourceLabel={sourceLabel}
          downloadUrl={downloadUrl}
        />
      </>
    );
  }

  // ==========================================================================
  // THREE-ZONE LAYOUT: Success (green), Partial (amber), or Miss (red)
  // ==========================================================================
  if ((isVerified && !isPartialMatch && !isMiss && hasImage && verification) || isMiss || isPartialMatch) {
    const isExpanded = viewState === "expanded-keyhole" || viewState === "expanded-page";
    const isFullPage = viewState === "expanded-page";

    const claimBorderColor = isMiss
      ? "border-red-500 dark:border-red-400"
      : isPartialMatch
        ? "border-amber-500 dark:border-amber-400"
        : "border-green-500 dark:border-green-600";

    // Unified summaryContent: success shows keyhole with onImageClick; miss/partial shows
    // keyhole or search analysis depending on what's available.
    // When null (no image, no search attempts, no expandable page), EvidenceZone renders
    // an empty Slot A — only Zones 1 (header) and 2 (claim body) are populated.
    const summaryContent =
      (hasImage || ((isMiss || isPartialMatch) && (verification?.searchAttempts?.length || canExpandToPage))) &&
      verification ? (
        <EvidenceTray
          verification={verification}
          status={status}
          onExpand={canExpandToPage ? handleExpand : undefined}
          onImageClick={
            evidenceSrc
              ? (isMiss || isPartialMatch) && canExpandToPage
                ? handleExpand
                : handleKeyholeClick
              : canExpandToPage
                ? handleExpand
                : undefined
          }
          pageCtaLabel={expandCtaLabel}
          onScrollCapture={evidenceSrc ? handleKeyholeScrollCapture : undefined}
          pageImageSrc={expandedImage?.src}
          onKeyholeWidth={setKeyholeDisplayedWidth}
          escapeInterceptRef={escapeInterceptRef}
        />
      ) : null;

    return (
      <>
        {statusLiveRegion}
        <PopoverLayoutShell
          isExpanded={isExpanded}
          isFullPage={isFullPage}
          expandedNaturalWidth={expandedNaturalWidth}
          summaryWidth={summaryWidth}
        >
          <div style={viewState === "summary" ? { maxWidth: summaryWidth } : undefined}>
            {/* Zone 1: Metadata Header */}
            <SourceContextHeader
              citation={citation}
              verification={verification}
              status={searchStatus}
              sourceLabel={sourceLabel}
              onExpand={isFullPage ? undefined : canExpandToPage ? handleExpand : undefined}
              onClose={isFullPage ? handleCollapseFromExpandedPage : undefined}
              downloadUrl={downloadUrl}
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
            {/* Partial/miss-specific sections (absent in success) */}
            {(isMiss || isPartialMatch) && urlAccessExplanation && (
              <UrlAccessExplanationSection explanation={urlAccessExplanation} />
            )}
            {(isMiss || isPartialMatch) && !urlAccessExplanation && intentSnippets.length > 0 && (
              <PopoverSnippetZone snippets={intentSnippets} />
            )}

            {/* Snap claim-zone height (0ms) so full-page → summary does not
                create a top-to-bottom evidence reveal. The hook sees the real
                viewState change but bails out immediately at duration === 0. */}
            <AnimatedHeightWrapper viewState={viewState} expandDurationMs={0} collapseDurationMs={0}>
              {fullPhrase && (
                <ClaimQuote
                  fullPhrase={fullPhrase}
                  anchorText={anchorText}
                  isMiss={isMiss}
                  borderColor={claimBorderColor}
                  maxWidth={viewState === "summary" ? summaryWidth : undefined}
                />
              )}
            </AnimatedHeightWrapper>
          </div>
          {/* Zone 3: Evidence */}
          <EvidenceZone
            viewState={viewState}
            evidenceSrc={evidenceSrc}
            expandedImage={expandedImage}
            onViewStateChange={onViewStateChange}
            onRequestCollapseFromPage={handleCollapseFromExpandedPage}
            onExpandToPage={canExpandToPage ? handleExpand : undefined}
            expandCtaLabel={expandCtaLabel}
            handlePageImageLoad={handlePageImageLoad}
            handleKeyholeImageLoad={handleKeyholeImageLoad}
            prevBeforeExpandedPageRef={prevBeforeExpandedPageRef}
            verification={verification}
            summaryContent={summaryContent}
            keyholeInitialScroll={keyholeInitialScroll}
            escapeInterceptRef={escapeInterceptRef}
          />
        </PopoverLayoutShell>
      </>
    );
  }

  // ==========================================================================
  // FALLBACK: Text-only view (verified/partial match without image)
  // ==========================================================================
  return (
    <>
      {statusLiveRegion}
      <PopoverFallbackView
        citation={citation}
        verification={verification}
        sourceLabel={sourceLabel}
        status={status}
        urlAccessExplanation={urlAccessExplanation}
        indicatorVariant={indicatorVariant}
        downloadUrl={downloadUrl}
      />
    </>
  );
}
