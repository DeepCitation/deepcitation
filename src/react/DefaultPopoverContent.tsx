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
import type { Citation, CitationStatus } from "../types/citation.js";
import type { SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { getStatusLabel } from "./citationStatus.js";
import {
  EASE_COLLAPSE,
  EASE_EXPAND,
  isValidProofImageSrc,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  POPOVER_CONTAINER_BASE_CLASSES,
  POPOVER_MORPH_COLLAPSE_MS,
  POPOVER_MORPH_EXPAND_MS,
} from "./constants.js";
import { EvidenceTray, InlineExpandedImage, normalizeScreenshotSrc, resolveExpandedImage } from "./EvidenceTray.js";
import { getExpandedPopoverWidth, getSummaryPopoverWidth } from "./expandedWidthPolicy.js";
import { HighlightedPhrase } from "./HighlightedPhrase.js";
import { useAnimatedHeight } from "./hooks/useAnimatedHeight.js";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { SpinnerIcon } from "./icons.js";
import { buildIntentSummary, type MatchSnippet } from "./searchSummaryUtils.js";
import type { BaseCitationProps, IndicatorVariant } from "./types.js";
import {
  getUrlAccessExplanation,
  mapSearchStatusToFetchStatus,
  mapUrlAccessStatusToFetchStatus,
  type UrlAccessExplanation,
} from "./urlAccessExplanation.js";
import { isValidProofUrl } from "./urlUtils.js";
import { cn, isImageSource, isUrlCitation } from "./utils.js";
import { SourceContextHeader, StatusHeader } from "./VerificationLog.js";

// React 19.2's Activity component is disabled here because it triggers a fiber
// effect linked-list corruption bug during simultaneous mode transitions
// (hidden→visible) and Radix popover unmounts. The crash manifests as
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
  onExpandedWidthChange?: (width: number | null) => void;
  /** Ref tracking which state preceded expanded-page, for correct Escape back-navigation. */
  prevBeforeExpandedPageRef?: RefObject<"summary" | "expanded-keyhole">;
  /**
   * Callback when the user clicks the download button in the popover header.
   * The button only renders when this prop is provided.
   */
  onSourceDownload?: (citation: Citation) => void;
}

// =============================================================================
// PRIVATE HELPERS
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

/**
 * Renders a colored banner explaining why a URL could not be accessed.
 * Amber background for blocked states (potentially resolvable), red for errors.
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

/**
 * Display matched snippets inline within the popover for partial/displaced matches.
 * Shows 1-3 snippets with the matched portion highlighted.
 */
function PopoverSnippetZone({ snippets }: { snippets: MatchSnippet[] }) {
  if (snippets.length === 0) return null;
  return (
    <div className="px-4 py-2 space-y-1.5 border-b border-gray-100 dark:border-gray-800">
      {snippets.slice(0, 3).map(snippet => {
        const before = snippet.contextText.slice(0, snippet.matchStart);
        const match = snippet.contextText.slice(snippet.matchStart, snippet.matchEnd);
        const after = snippet.contextText.slice(snippet.matchEnd);
        return (
          <div
            key={`snippet-${snippet.matchStart}-${snippet.matchEnd}`}
            className="text-xs text-gray-600 dark:text-gray-300 font-mono leading-relaxed"
          >
            {before && <span className="text-gray-400 dark:text-gray-500">...{before}</span>}
            <strong className="text-gray-800 dark:text-gray-100 bg-amber-100/50 dark:bg-amber-900/30 px-0.5 rounded">
              {match}
            </strong>
            {after && <span className="text-gray-400 dark:text-gray-500">{after}...</span>}
            {snippet.page != null && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">(p.{snippet.page})</span>
            )}
            {!snippet.isProximate && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1 italic">(different section)</span>
            )}
          </div>
        );
      })}
      {snippets.length > 3 && (
        <div className="text-[10px] text-gray-400 dark:text-gray-500 italic">...and {snippets.length - 3} more</div>
      )}
    </div>
  );
}

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
 * The industry standard (Linear, Notion, Vercel) is to snap content-heavy containers
 * to their target layout and rely on component-level transitions (image onLoad,
 * spinner staging, stagger delays) for visual orchestration.
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
        className={cn(POPOVER_CONTAINER_BASE_CLASSES, "animate-in fade-in-0 duration-150")}
        style={{
          width: shellWidth,
          maxWidth: "100%",
          ...(isFullPage && {
            display: "flex",
            flexDirection: "column" as const,
            height: "100%",
            overflowY: "hidden" as const,
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
}: {
  fullPhrase: string;
  anchorText?: string;
  isMiss: boolean;
  borderColor: string;
}) {
  return (
    <div
      className={cn(
        "mx-3 mt-1 mb-3 pl-3 pr-3 py-2 text-xs leading-relaxed break-words bg-gray-50 dark:bg-gray-800/50 border-l-[3px] max-w-prose",
        borderColor,
      )}
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
function AnimatedHeightWrapper({ viewState, children }: { viewState: PopoverViewState; children: ReactNode }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // A.5.5: When reduced motion is preferred, pass 0ms durations so height changes
  // are instant but the wrapper DOM stays mounted (no layout shift from Fragment swap).
  useAnimatedHeight(
    wrapperRef,
    contentRef,
    viewState,
    prefersReducedMotion ? 0 : POPOVER_MORPH_EXPAND_MS,
    prefersReducedMotion ? 0 : POPOVER_MORPH_COLLAPSE_MS,
    EASE_EXPAND,
    EASE_COLLAPSE,
  );

  return (
    <div
      ref={wrapperRef}
      onTransitionEnd={e => {
        if (e.propertyName === "height") {
          e.currentTarget.style.height = "";
          e.currentTarget.style.overflow = "";
          e.currentTarget.style.transition = "";
        }
      }}
    >
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
  onExpandToPage,
  handlePageImageLoad,
  handleKeyholeImageLoad,
  prevBeforeExpandedPageRef,
  verification,
  summaryContent,
}: {
  viewState: PopoverViewState;
  evidenceSrc: string | null;
  expandedImage: { src: string; renderScale?: { x: number; y: number } | null } | null;
  onViewStateChange?: (viewState: PopoverViewState) => void;
  /** When provided, renders a "View page ›" CTA in the expanded-keyhole footer. */
  onExpandToPage?: () => void;
  handlePageImageLoad: (width: number, height: number) => void;
  handleKeyholeImageLoad: (width: number, height: number) => void;
  prevBeforeExpandedPageRef: RefObject<"summary" | "expanded-keyhole">;
  verification: Verification | null;
  summaryContent: ReactNode;
}) {
  // Track previous view state to detect re-entry from expanded-page.
  // When returning to any keyhole state (summary or expanded-keyhole), apply a brief
  // fade-in so the swap doesn't feel like the UI "snaps" backward.
  // Using setState-during-render (React-approved pattern) instead of ref so the
  // React Compiler can optimize this component (refs read during render cause a bailout).
  const [prevViewState, setPrevViewState] = useState<PopoverViewState>(viewState);
  if (prevViewState !== viewState) {
    setPrevViewState(viewState);
  }
  const isReenteringKeyhole =
    (viewState === "summary" || viewState === "expanded-keyhole") && prevViewState === "expanded-page";

  return (
    <>
      {/* Slot A: summary — EvidenceTray keyhole strip */}
      <div
        style={viewState !== "summary" ? { display: "none" } : undefined}
        className={isReenteringKeyhole ? "animate-in fade-in-0 duration-100" : undefined}
      >
        {summaryContent}
      </div>
      {/* Slot B: expanded-keyhole — InlineExpandedImage with the keyhole's own image source */}
      {evidenceSrc && (
        <div style={viewState !== "expanded-keyhole" ? { display: "none" } : undefined}>
          <InlineExpandedImage
            src={evidenceSrc}
            onCollapse={() => onViewStateChange?.("summary")}
            onExpand={onExpandToPage}
            onNaturalSize={handleKeyholeImageLoad}
            verification={verification}
          />
        </div>
      )}
      {/* Slot C: expanded-page — always rendered for React 19 fiber stability */}
      {expandedImage?.src && (
        <div
          className="flex-1 min-h-0 flex flex-col"
          style={viewState !== "expanded-page" ? { display: "none" } : undefined}
        >
          <InlineExpandedImage
            src={expandedImage.src}
            onCollapse={() => onViewStateChange?.(prevBeforeExpandedPageRef.current)}
            verification={verification}
            fill
            onNaturalSize={handlePageImageLoad}
            renderScale={expandedImage.renderScale}
          />
        </div>
      )}
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
  onSourceDownload,
}: {
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  sourceLabel?: string;
  onSourceDownload?: (citation: Citation) => void;
}) {
  const anchorText = citation.anchorText?.toString();
  const fullPhrase = citation.fullPhrase;
  const searchStatus = verification?.status;
  const searchingPhrase = fullPhrase || anchorText;
  return (
    <div className={`${POPOVER_CONTAINER_BASE_CLASSES} min-w-[200px] max-w-[480px]`}>
      <SourceContextHeader
        citation={citation}
        verification={verification}
        status={searchStatus}
        sourceLabel={sourceLabel}
        onSourceDownload={onSourceDownload}
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
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isImageSource(verification) ? "Searching image\u2026" : `Looking on p.${citation.pageNumber}`}
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
  onSourceDownload,
}: {
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  sourceLabel?: string;
  status: CitationStatus;
  urlAccessExplanation: UrlAccessExplanation | null;
  indicatorVariant?: IndicatorVariant;
  onSourceDownload?: (citation: Citation) => void;
}) {
  const searchStatus = verification?.status;
  const statusLabel = indicatorVariant !== "none" ? getStatusLabel(status) : null;
  const hasSnippet = verification?.verifiedMatchSnippet;
  const pageNumber = verification?.document?.verifiedPageNumber;

  if (!hasSnippet && !statusLabel && !urlAccessExplanation) return null;

  return (
    <div className={`${POPOVER_CONTAINER_BASE_CLASSES} min-w-[180px] max-w-full`}>
      <SourceContextHeader
        citation={citation}
        verification={verification}
        status={searchStatus}
        sourceLabel={sourceLabel}
        onSourceDownload={onSourceDownload}
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
            {isImageSource(verification) ? "Image" : `Page ${pageNumber}`}
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
  onSourceDownload,
}: PopoverContentProps) {
  const hasImage = verification?.document?.verificationImageSrc || verification?.url?.webPageScreenshotBase64;
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
        el.textContent = "Citation verified — exact match found";
      } else if (isMiss) {
        el.textContent = "Verification complete — citation not found in source";
      } else if (isPartialMatch) {
        el.textContent = "Verification complete — partial match found";
      }
    } else if (!prevIsPendingRef.current && isPending) {
      // Resolved → pending (retry): clear so next resolution triggers a new announcement.
      el.textContent = "";
    }
    prevIsPendingRef.current = isPending;
  }, [isPending, isVerified, isPartialMatch, isMiss]);

  // Save/restore scroll position for back navigation

  // Resolve expanded image for the full-page viewer; allow caller to override the src
  const expandedImage = useMemo(() => {
    const resolved = resolveExpandedImage(verification);
    if (!expandedImageSrcOverride || !isValidProofImageSrc(expandedImageSrcOverride)) return resolved;
    // Custom src provided: clear overlay metadata since dimensions belong to the original image
    return resolved
      ? { ...resolved, src: expandedImageSrcOverride, dimensions: null, highlightBox: null, renderScale: null }
      : { src: expandedImageSrcOverride };
  }, [verification, expandedImageSrcOverride]);

  // Suppress page expand when page image dimensions are known and already fit within
  // the evidence view constraints (≤480px wide, ≤600px tall) — expanding adds no value.
  const canExpandToPage = !!expandedImage;

  // Content-adaptive summary width: pre-seed from verification dimensions to avoid
  // a width flash, then confirm/correct when the keyhole image actually renders.
  const [keyholeDisplayedWidth, setKeyholeDisplayedWidth] = useState<number | null>(() => {
    const dims = verification?.document?.verificationImageDimensions;
    if (!dims || dims.height <= 0) return null;
    return dims.width * (KEYHOLE_STRIP_HEIGHT_DEFAULT / dims.height);
  });

  const summaryWidth = useMemo(() => getSummaryPopoverWidth(keyholeDisplayedWidth), [keyholeDisplayedWidth]);

  // Page image natural width — set from onLoad, persists across viewState transitions
  // (triple always-render keeps the image mounted so onLoad fires once and state is stable).
  const [pageNaturalWidth, setPageNaturalWidth] = useState<number | null>(null);

  // Keyhole image natural width when expanded — set from onLoad in expanded-keyhole state.
  const [keyholeImageNaturalWidth, setKeyholeImageNaturalWidth] = useState<number | null>(null);

  // Expanded popover width — needed for both full-page and expanded-keyhole views.
  const expandedNaturalWidth = useMemo(() => {
    if (viewState === "expanded-page") return pageNaturalWidth;
    if (viewState === "expanded-keyhole") return keyholeImageNaturalWidth;
    return null;
  }, [viewState, pageNaturalWidth, keyholeImageNaturalWidth]);

  // Notify parent when expandedNaturalWidth changes — calls only the prop callback,
  // not a React setter, so this useEffect is React Compiler-compatible.
  useEffect(() => {
    onExpandedWidthChange?.(expandedNaturalWidth);
  }, [expandedNaturalWidth, onExpandedWidthChange]);

  const handlePageImageLoad = useCallback((width: number, _height: number) => {
    setPageNaturalWidth(width);
  }, []);

  const handleKeyholeImageLoad = useCallback((width: number, _height: number) => {
    setKeyholeImageNaturalWidth(width);
  }, []);

  // Resolve the evidence image src — used by handleKeyholeClick and the prefetch effect.
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

  // Toggles the keyhole expanded view. Clicking when already expanded collapses back to summary.
  const handleKeyholeClick = useCallback(() => {
    if (viewState === "expanded-keyhole") {
      onViewStateChange?.("summary");
      return;
    }
    if (!evidenceSrc) return;
    onViewStateChange?.("expanded-keyhole");
  }, [viewState, evidenceSrc, onViewStateChange]);

  // Tracks which state we entered expanded-page from, so onCollapse can return there.
  const localPrevBeforeExpandedPageRef = useRef<"summary" | "expanded-keyhole">("summary");
  const prevBeforeExpandedPageRef = propPrevBeforeExpandedPageRef ?? localPrevBeforeExpandedPageRef;

  // biome-ignore lint/correctness/useExhaustiveDependencies: prevBeforeExpandedPageRef is a stable ref identity — including it causes a React Compiler bailout (value modification after hook)
  const handleExpand = useCallback(() => {
    if (!canExpandToPage) return;
    if (viewState !== "expanded-page") {
      prevBeforeExpandedPageRef.current = viewState === "expanded-keyhole" ? "expanded-keyhole" : "summary";
    }
    onViewStateChange?.("expanded-page");
  }, [canExpandToPage, onViewStateChange, viewState]);

  // Prefetch images imperatively when the popover becomes visible.
  // Keyhole image: preload as soon as the popover opens (user is hovering).
  // Page image: preload now so it's ready when the user clicks to expand.
  useEffect(() => {
    if (!isVisible) return;
    if (evidenceSrc) new Image().src = evidenceSrc;
    const pageSrc = expandedImage?.src;
    if (pageSrc && isValidProofImageSrc(pageSrc)) new Image().src = pageSrc;
  }, [isVisible, evidenceSrc, expandedImage?.src]);

  // Get page info (document citations only)
  const expectedPage = !isUrlCitation(citation) ? citation.pageNumber : undefined;
  const foundPage = verification?.document?.verifiedPageNumber ?? undefined;

  // Get humanizing message for partial/not-found states (URL citations only)
  const anchorText = citation.anchorText?.toString();
  const fullPhrase = citation.fullPhrase;
  const humanizingMessage = useMemo(
    () =>
      isUrlCitation(citation)
        ? getHumanizingMessage(searchStatus, anchorText, expectedPage ?? undefined, foundPage)
        : null,
    [citation, searchStatus, anchorText, expectedPage, foundPage],
  );

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
    return getUrlAccessExplanation(fetchStatus, verification?.url?.urlVerificationError);
  }, [citation, verification, searchStatus]);

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
          onSourceDownload={onSourceDownload}
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
    const validProofUrl =
      isFullPage && verification?.proof?.proofUrl ? isValidProofUrl(verification.proof.proofUrl) : null;

    const claimBorderColor = isMiss
      ? "border-red-500 dark:border-red-400"
      : isPartialMatch
        ? "border-amber-500 dark:border-amber-400"
        : "border-green-500 dark:border-green-600";

    // Unified summaryContent: success shows keyhole with onImageClick; miss/partial shows
    // keyhole or search analysis depending on what's available.
    const summaryContent =
      (hasImage || (isMiss && (verification?.searchAttempts?.length || canExpandToPage))) && verification ? (
        <EvidenceTray
          verification={verification}
          status={status}
          onExpand={canExpandToPage ? handleExpand : undefined}
          onImageClick={hasImage ? handleKeyholeClick : undefined}
          proofImageSrc={expandedImage?.src}
          onKeyholeWidth={setKeyholeDisplayedWidth}
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
          {/* Zone 1: Metadata Header */}
          <SourceContextHeader
            citation={citation}
            verification={verification}
            status={searchStatus}
            sourceLabel={sourceLabel}
            onExpand={isFullPage ? undefined : canExpandToPage ? handleExpand : undefined}
            onClose={isFullPage ? () => onViewStateChange?.(prevBeforeExpandedPageRef.current) : undefined}
            proofUrl={validProofUrl}
            onSourceDownload={onSourceDownload}
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
          {(isMiss || isPartialMatch) && !urlAccessExplanation && intentSnippets.length === 0 && humanizingMessage && (
            <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border-b border-gray-100 dark:border-gray-800">
              {humanizingMessage}
            </div>
          )}
          <AnimatedHeightWrapper viewState={viewState}>
            {fullPhrase && (
              <ClaimQuote fullPhrase={fullPhrase} anchorText={anchorText} isMiss={isMiss} borderColor={claimBorderColor} />
            )}
          </AnimatedHeightWrapper>
          {/* Zone 3: Evidence */}
          <EvidenceZone
            viewState={viewState}
            evidenceSrc={evidenceSrc}
            expandedImage={expandedImage}
            onViewStateChange={onViewStateChange}
            onExpandToPage={canExpandToPage ? handleExpand : undefined}
            handlePageImageLoad={handlePageImageLoad}
            handleKeyholeImageLoad={handleKeyholeImageLoad}
            prevBeforeExpandedPageRef={prevBeforeExpandedPageRef}
            verification={verification}
            summaryContent={summaryContent}
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
        onSourceDownload={onSourceDownload}
      />
    </>
  );
}
