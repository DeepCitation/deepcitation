import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { AmendmentRow } from "../../analysis/narrative.js";
import { buildSearchNarrative } from "../../analysis/narrative.js";
import type { CitationStatus } from "../../types/citation.js";
import type { LlmSearchAttempt } from "../../types/llmAttempt.js";
import type { SearchAttempt } from "../../types/search.js";
import type { Verification } from "../../types/verification.js";
import {
  BLINK_ENTER_EASING,
  BLINK_EXIT_EASING,
  EVIDENCE_LIST_COLLAPSE_TOTAL_MS,
  EVIDENCE_LIST_EXPAND_STEP_MS,
  EVIDENCE_LIST_EXPAND_TOTAL_MS,
  EVIDENCE_TRAY_BORDER_DASHED,
  EVIDENCE_TRAY_BORDER_SOLID,
  isValidProofImageSrc,
  TERTIARY_ACTION_BASE_CLASSES,
  TERTIARY_ACTION_HOVER_CLASSES,
  TERTIARY_ACTION_IDLE_CLASSES,
} from "../constants.js";
import { formatCaptureDate } from "../dateUtils.js";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";
import { type TranslateFunction, tPlural, useLocale, useTranslation } from "../i18n.js";
import { ChevronRightIcon } from "../icons.js";
import { cn } from "../utils.js";
import { VerificationLogTimeline } from "../VerificationLog.js";
import { primeEvidencePageExpandSource } from "../viewTransition.js";
import { EvidenceKeyhole } from "./EvidenceKeyhole.js";
import { resolveEvidenceSrc } from "./resolvers.js";
import { SearchAnalysisSummary } from "./SearchAnalysisSummary.js";
import {
  type EvidenceListMotionStage,
  resolveEvidenceListOpacity,
  resolveEvidenceListPaddingTop,
  resolveEvidenceListRevealRatio,
  resolveEvidenceListTransform,
  resolveEvidenceListTransition,
  searchLogAnimReducer,
} from "./searchLogAnimation.js";

const EMPTY_SEARCH_ATTEMPTS: SearchAttempt[] = [];

/**
 * Flatten LLM-level search attempts into a single SearchAttempt[] array,
 * inserting AmendmentRow markers at the boundaries between passes.
 */
function flattenLlmAttempts(
  llmAttempts: LlmSearchAttempt[],
  t: TranslateFunction,
): { flatAttempts: SearchAttempt[]; amendmentMarkers: Map<number, AmendmentRow> } {
  const flatAttempts: SearchAttempt[] = [];
  const amendmentMarkers = new Map<number, AmendmentRow>();

  for (let i = 0; i < llmAttempts.length; i++) {
    const attempt = llmAttempts[i];
    if (i > 0 && attempt.amendments && attempt.amendments.length > 0) {
      amendmentMarkers.set(flatAttempts.length, {
        kind: "amendment",
        key: `amendment-${i}`,
        descriptions: attempt.amendments.map(a => t("llmAttempt.changedField", { field: a.field })),
        reason: attempt.amendmentReason,
        isFalsePositiveRejection: llmAttempts[i - 1]?.partialRejectedAsFalsePositive === true,
      });
    }
    flatAttempts.push(...(attempt.verification?.searchAttempts ?? []));
  }

  return { flatAttempts, amendmentMarkers };
}

/**
 * Minimal footer for the evidence tray: date on the left, CTA on the right.
 * For miss states, an optional "› N searches" toggle sits between the date and CTA.
 */
export function EvidenceTrayFooter({
  verifiedAt,
  onPageClick,
  pageNumberForCta,
  pageCtaLabel,
  searchCount,
  isSearchLogOpen,
  onToggleSearchLog,
}: {
  verifiedAt?: Date | string | null;
  /** When provided, renders a footer CTA button */
  onPageClick?: () => void;
  /** Optional page number to include in the CTA label (drawer context). */
  pageNumberForCta?: number | null;
  /** Optional CTA label override (for example, "View image"). */
  pageCtaLabel?: string;
  /** Number of grouped search attempts (toggle hidden when 0 or absent) */
  searchCount?: number;
  /** Whether the search log is currently expanded */
  isSearchLogOpen?: boolean;
  /** Toggle callback — when provided and searchCount > 0, renders the toggle */
  onToggleSearchLog?: () => void;
}) {
  const t = useTranslation();
  const locale = useLocale();
  const formatted = formatCaptureDate(verifiedAt, { locale });
  const dateStr = formatted?.display ?? "";
  const showToggle = onToggleSearchLog && searchCount != null && searchCount > 0;
  const hasPageForCta = pageNumberForCta != null && pageNumberForCta > 0;
  const resolvedPageCtaLabel =
    pageCtaLabel ?? (hasPageForCta ? t("aria.viewPageNum", { pageNumber: pageNumberForCta }) : t("aria.viewPage"));

  return (
    <div className="px-3 py-2 min-h-[44px] flex items-center text-[11px] text-dc-subtle-foreground">
      <div className="flex items-center justify-between w-full">
        <span className="flex items-center gap-1">
          {showToggle && (
            <button
              type="button"
              className={cn(
                "relative flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-medium rounded-dc-md border border-dc-border cursor-pointer",
                TERTIARY_ACTION_BASE_CLASSES,
                TERTIARY_ACTION_IDLE_CLASSES,
                TERTIARY_ACTION_HOVER_CLASSES,
              )}
              onClick={e => {
                e.stopPropagation();
                onToggleSearchLog();
              }}
            >
              <span
                className="size-3 shrink-0"
                style={{
                  transform: isSearchLogOpen ? "rotate(90deg)" : undefined,
                  transitionProperty: "transform",
                  transitionDuration: `${isSearchLogOpen ? EVIDENCE_LIST_EXPAND_TOTAL_MS : EVIDENCE_LIST_COLLAPSE_TOTAL_MS}ms`,
                  transitionTimingFunction: isSearchLogOpen ? BLINK_ENTER_EASING : BLINK_EXIT_EASING,
                }}
              >
                <ChevronRightIcon />
              </span>
              <span>{tPlural(t, "evidence.searchAttempts", searchCount, { count: searchCount })}</span>
            </button>
          )}
          {showToggle && dateStr && <span aria-hidden="true">·</span>}
          {dateStr && <span title={formatted?.tooltip ?? dateStr}>{dateStr}</span>}
        </span>
        {onPageClick && (
          <button
            type="button"
            className={cn(
              "flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-medium rounded-dc-md border border-dc-border cursor-pointer ml-auto",
              TERTIARY_ACTION_BASE_CLASSES,
              TERTIARY_ACTION_IDLE_CLASSES,
              TERTIARY_ACTION_HOVER_CLASSES,
            )}
            onClick={e => {
              e.stopPropagation();
              onPageClick();
            }}
            aria-label={resolvedPageCtaLabel}
          >
            <span>{resolvedPageCtaLabel}</span>
            <span className="size-3 shrink-0">
              <ChevronRightIcon />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Props passed to a host-supplied keyhole renderer. Mirrors the props
 * `EvidenceKeyhole` consumes so the host can either delegate to it or render
 * an alternative (e.g. a live PDF mini-viewer).
 *
 * Accessibility: the host takes over the entire keyhole strip and is
 * responsible for the ARIA contract the default keyhole provides (button
 * role, aria-label, focus order). Wrap interactive content in a `<button>`
 * and call `onImageClick` on activation; failing to do so degrades keyboard
 * and screen-reader UX.
 */
export interface EvidenceKeyholeRenderProps {
  verification: Verification | null;
  /** JPEG fallback src — `resolveEvidenceSrc(verification)` for hits, or the
   *  miss/partial page image when no evidence crop is available. Empty string
   *  when neither is present (the host is expected to render purely from
   *  out-of-band data, e.g. a cached PDF blob). */
  fallbackSrc: string;
  onImageClick?: () => void;
  onPageExpand?: () => void;
  onKeyholeWidth?: (width: number) => void;
  onScrollCapture?: (left: number, top: number) => void;
}

/**
 * Evidence tray — the "proof zone" at the bottom of the summary popover.
 * For verified/partial: Shows keyhole image with hover expand icon + footer with CTA.
 * For not-found: Shows search analysis summary + footer with log toggle + CTA.
 * When `onExpand` is provided, the tray is clickable. Otherwise, it's informational only.
 *
 * @param pageImageSrc - Full-page page image used as keyhole source for miss states
 *   when no evidence crop is available from verification.
 */

export function EvidenceTray({
  verification,
  status,
  onExpand,
  onImageClick,
  pageImageSrc,
  pageNumberForCta,
  pageCtaLabel,
  onKeyholeWidth,
  onScrollCapture,
  escapeInterceptRef,
  renderEvidenceKeyhole,
}: {
  verification: Verification | null;
  status: CitationStatus;
  onExpand?: () => void;
  onImageClick?: () => void;
  pageImageSrc?: string;
  /** Optional page number shown in "View page N" CTA for drawer context. */
  pageNumberForCta?: number | null;
  /** Optional footer CTA label override (for example, "View image"). */
  pageCtaLabel?: string;
  onKeyholeWidth?: (width: number) => void;
  /** Called with natural-pixel scroll coords when the keyhole is clicked to expand. */
  onScrollCapture?: (left: number, top: number) => void;
  /** Ref the parent reads in its Escape handler — set to a collapse fn when the search log is open. */
  escapeInterceptRef?: React.MutableRefObject<(() => void) | null>;
  /**
   * Optional host-supplied renderer that replaces the default
   * `<EvidenceKeyhole src=...>` strip. When provided and returns non-null,
   * its return value is rendered instead of the JPEG keyhole. Falls back to
   * the default when the function is absent or returns null/undefined.
   */
  renderEvidenceKeyhole?: (props: EvidenceKeyholeRenderProps) => React.ReactNode;
}) {
  const t = useTranslation();
  const resolvedEvidenceSrc = useMemo(() => resolveEvidenceSrc(verification), [verification]);
  const isMiss = status.isMiss;
  const isPartialMatch = status.isPartialMatch;
  const searchAttempts = verification?.searchAttempts ?? EMPTY_SEARCH_ATTEMPTS;
  const llmAttempts = verification?.llmAttempts;
  const hasLlmHistory = llmAttempts != null && llmAttempts.length > 0;
  const borderClass = isMiss ? EVIDENCE_TRAY_BORDER_DASHED : EVIDENCE_TRAY_BORDER_SOLID;
  const prefersReducedMotion = usePrefersReducedMotion();

  const isImpreciseLocation = verification?.isImpreciseLocation === true;

  // Tray-level click: keyhole click if available, else page expansion
  const trayAction = onImageClick ?? onExpand;

  // Suppress tray-level clicks that result from drag-release (e.g. panning the keyhole
  // then releasing the mouse over "View page ›"). The browser fires click at the lowest
  // common ancestor of the mousedown and mouseup targets — which is this tray div — so we
  // must gate the action here.
  const trayMouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const trayRootRef = useRef<HTMLDivElement>(null);
  const pageExpandSourceRef = useRef<HTMLElement | null>(null);

  const handlePageExpand = useCallback(() => {
    primeEvidencePageExpandSource(pageExpandSourceRef.current);
    onExpand?.();
  }, [onExpand]);

  // Search log toggle state (miss and partial states)
  const [showSearchLog, setShowSearchLog] = useState(false);
  const [searchLogAnim, dispatchSearchLog] = useReducer(searchLogAnimReducer, {
    mounted: false,
    stage: "idle" as EvidenceListMotionStage,
  });
  const isSearchLogMounted = searchLogAnim.mounted;
  const searchLogStage = searchLogAnim.stage;
  const searchLogMountedRef = useRef(isSearchLogMounted);
  const searchLogEnterRafRef = useRef<number>(0);
  const searchLogExitRafRef = useRef<number>(0);
  const searchLogSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchLogExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    searchLogMountedRef.current = isSearchLogMounted;
  }, [isSearchLogMounted]);

  // Sync escape intercept ref: when search log is open, Escape should collapse
  // the log instead of closing the popover.
  useEffect(() => {
    if (!escapeInterceptRef) return;
    const collapseFn = showSearchLog ? () => setShowSearchLog(false) : null;
    escapeInterceptRef.current = collapseFn;
    return () => {
      if (escapeInterceptRef.current === collapseFn) {
        escapeInterceptRef.current = null;
      }
    };
  }, [showSearchLog, escapeInterceptRef]);

  // Search-log enter/exit animation sequence. Uses dispatchSearchLog (single dispatch)
  // instead of multiple setState calls to satisfy the React Compiler.
  useEffect(() => {
    const clearScheduled = () => {
      cancelAnimationFrame(searchLogEnterRafRef.current);
      searchLogEnterRafRef.current = 0;
      cancelAnimationFrame(searchLogExitRafRef.current);
      searchLogExitRafRef.current = 0;
      if (searchLogSettleTimerRef.current) {
        clearTimeout(searchLogSettleTimerRef.current);
        searchLogSettleTimerRef.current = null;
      }
      if (searchLogExitTimerRef.current) {
        clearTimeout(searchLogExitTimerRef.current);
        searchLogExitTimerRef.current = null;
      }
    };

    clearScheduled();

    if (prefersReducedMotion) {
      dispatchSearchLog({ type: "instant", show: showSearchLog });
      return clearScheduled;
    }

    if (showSearchLog) {
      dispatchSearchLog({ type: "enter" });
      // Two RAFs guarantee a painted frame at enter-a before we begin the 95% reveal.
      searchLogEnterRafRef.current = requestAnimationFrame(() => {
        searchLogEnterRafRef.current = requestAnimationFrame(() => {
          dispatchSearchLog({ type: "stage", stage: "enter-b" });
          searchLogSettleTimerRef.current = setTimeout(() => {
            dispatchSearchLog({ type: "stage", stage: "steady" });
            searchLogSettleTimerRef.current = null;
          }, EVIDENCE_LIST_EXPAND_STEP_MS);
        });
      });
      return clearScheduled;
    }

    if (!searchLogMountedRef.current) {
      dispatchSearchLog({ type: "stage", stage: "idle" });
      return clearScheduled;
    }

    dispatchSearchLog({ type: "stage", stage: "exit-a" });
    // Match expand behavior: force one painted 70% frame before collapsing to 0%.
    searchLogExitRafRef.current = requestAnimationFrame(() => {
      searchLogExitRafRef.current = requestAnimationFrame(() => {
        dispatchSearchLog({ type: "stage", stage: "exit-b" });
      });
    });
    searchLogExitTimerRef.current = setTimeout(() => {
      dispatchSearchLog({ type: "unmount" });
      searchLogExitTimerRef.current = null;
    }, EVIDENCE_LIST_COLLAPSE_TOTAL_MS);

    return clearScheduled;
  }, [showSearchLog, prefersReducedMotion]);

  const searchLogViewportRef = useRef<HTMLDivElement>(null);
  const [searchLogContentHeight, setSearchLogContentHeight] = useState(0);
  useLayoutEffect(() => {
    if (!isSearchLogMounted) return;
    const viewport = searchLogViewportRef.current;
    if (!viewport) return;

    const resolvedMaxHeight = Number.parseFloat(window.getComputedStyle(viewport).maxHeight);
    const maxHeightLimit = Number.isFinite(resolvedMaxHeight) ? resolvedMaxHeight : viewport.scrollHeight;
    const nextHeight = Math.max(0, Math.min(viewport.scrollHeight, maxHeightLimit));
    setSearchLogContentHeight(prev => (Math.abs(prev - nextHeight) > 0.5 ? nextHeight : prev));
  }, [isSearchLogMounted]);
  const searchLogMotionStyle = useMemo<React.CSSProperties>(() => {
    const revealRatio = resolveEvidenceListRevealRatio(searchLogStage);
    const revealHeightPx = Math.round(searchLogContentHeight * revealRatio);
    if (prefersReducedMotion) {
      return {
        display: "block",
        overflow: "hidden",
        maxHeight: `${Math.max(0, revealHeightPx)}px`,
        opacity: showSearchLog ? 1 : 0,
        paddingTop: "0px",
        transform: "translate3d(0, 0, 0)",
        transition: "none",
      };
    }
    return {
      display: "block",
      overflow: "hidden",
      maxHeight: `${Math.max(0, revealHeightPx)}px`,
      opacity: resolveEvidenceListOpacity(searchLogStage),
      paddingTop: resolveEvidenceListPaddingTop(searchLogStage),
      transform: resolveEvidenceListTransform(searchLogStage),
      transition: resolveEvidenceListTransition(searchLogStage),
      willChange: searchLogStage === "steady" ? undefined : "transform, padding-top, max-height, opacity",
    };
  }, [searchLogContentHeight, searchLogStage, prefersReducedMotion, showSearchLog]);
  const searchNarrative = useMemo(() => {
    if (!(isMiss || isPartialMatch)) return null;

    if (hasLlmHistory && llmAttempts) {
      const { flatAttempts, amendmentMarkers } = flattenLlmAttempts(llmAttempts, t);
      if (flatAttempts.length === 0) return null;

      const narrative = buildSearchNarrative(
        flatAttempts,
        verification?.status ?? "not_found",
        verification?.citation?.type === "document" ? verification.citation.pageNumber : undefined,
        verification?.citation?.type === "document" ? verification.citation.lineIds?.[0] : undefined,
        t,
      );

      if (amendmentMarkers.size > 0) {
        const merged: typeof narrative.rows = [];
        for (let i = 0; i <= narrative.rows.length; i++) {
          const marker = amendmentMarkers.get(i);
          if (marker) merged.push(marker);
          if (i < narrative.rows.length) merged.push(narrative.rows[i]);
        }
        return { ...narrative, rows: merged };
      }

      return narrative;
    }

    if (searchAttempts.length === 0) return null;

    return buildSearchNarrative(
      searchAttempts,
      verification?.status ?? "not_found",
      verification?.citation?.type === "document" ? verification.citation.pageNumber : undefined,
      verification?.citation?.type === "document" ? verification.citation.lineIds?.[0] : undefined,
      t,
    );
  }, [
    isMiss,
    isPartialMatch,
    hasLlmHistory,
    llmAttempts,
    searchAttempts,
    verification?.status,
    verification?.citation,
    t,
  ]);

  // Footer element — shared across top/bottom placement
  const footerEl = (
    <EvidenceTrayFooter
      verifiedAt={verification?.verifiedAt}
      onPageClick={onExpand ? handlePageExpand : undefined}
      pageNumberForCta={pageNumberForCta}
      pageCtaLabel={pageCtaLabel}
      searchCount={isMiss || isPartialMatch ? searchNarrative?.groupedAttemptCount : undefined}
      isSearchLogOpen={showSearchLog}
      onToggleSearchLog={isMiss || isPartialMatch ? () => setShowSearchLog(prev => !prev) : undefined}
    />
  );

  const fallbackSrc =
    resolvedEvidenceSrc ?? ((isMiss || isPartialMatch) && isValidProofImageSrc(pageImageSrc) ? pageImageSrc : "");
  const customKeyhole = renderEvidenceKeyhole
    ? renderEvidenceKeyhole({
        verification,
        fallbackSrc,
        onImageClick,
        onPageExpand: onExpand ? handlePageExpand : undefined,
        onKeyholeWidth,
        onScrollCapture,
      })
    : null;
  // false is what `cond && <X/>` returns when cond is false — treat it as "use the default".
  const hasCustomKeyhole = customKeyhole != null && customKeyhole !== false;

  let keyholeNode: React.ReactNode = null;
  if (hasCustomKeyhole) {
    // Internal wrapper holds the page-expand source ref so the view-transition
    // pipeline can morph from the host's content without exposing a ref to the
    // public API. The host's renderer remains responsible for its own sizing.
    keyholeNode = (
      <div
        ref={el => {
          pageExpandSourceRef.current = el;
        }}
        data-dc-page-expand-source=""
      >
        {customKeyhole}
      </div>
    );
  } else if (fallbackSrc) {
    keyholeNode = (
      <EvidenceKeyhole
        key={fallbackSrc}
        src={fallbackSrc}
        verification={resolvedEvidenceSrc ? verification : null}
        onImageClick={onImageClick}
        onPageExpand={onExpand ? handlePageExpand : undefined}
        onKeyholeWidth={onKeyholeWidth}
        onScrollCapture={onScrollCapture}
        pageExpandSourceRef={pageExpandSourceRef}
      />
    );
  }

  // Shared inner content
  const content = (
    <>
      {keyholeNode}
      {/* Imprecise location note: verified citation but input lacked page/line precision */}
      {isImpreciseLocation && (
        <div className="px-3 py-1.5 text-[11px] text-dc-subtle-foreground italic">
          {t("evidence.impreciseLocation")}
        </div>
      )}
      {/* Miss/partial: search analysis and collapsible search log (only when there are search attempts) */}
      {(isMiss || isPartialMatch) && searchAttempts.length > 0 ? (
        <div key="analysis">
          <SearchAnalysisSummary searchAttempts={searchAttempts} verification={verification} />
          {footerEl}
          {isSearchLogMounted && searchNarrative ? (
            <div style={searchLogMotionStyle}>
              <div className="overflow-hidden" style={{ minHeight: 0 }}>
                <div className="border-t border-dc-border">
                  <div
                    ref={searchLogViewportRef}
                    className="max-h-[min(44dvh,420px)] overflow-y-auto overscroll-contain"
                  >
                    <VerificationLogTimeline
                      narrative={searchNarrative}
                      sourceContext={
                        verification?.citation?.sourceContext ?? verification?.verifiedSourceContext ?? undefined
                      }
                      sourceMatch={
                        verification?.citation?.sourceMatch ?? verification?.verifiedSourceMatch ?? undefined
                      }
                      onCollapse={() => setShowSearchLog(false)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Footer — for success states and miss/partial without search attempts
          (miss/partial with searchAttempts render footer inside the analysis block above) */}
      {(!(isMiss || isPartialMatch) || searchAttempts.length === 0) && footerEl}
    </>
  );

  return (
    <div ref={trayRootRef} className="mx-3 mb-3">
      {trayAction ? (
        /* Interactive: clickable with hover CTA */
        <div
          role="button"
          tabIndex={0}
          onMouseDown={e => {
            trayMouseDownPosRef.current = { x: e.clientX, y: e.clientY };
          }}
          onClick={e => {
            e.stopPropagation();
            const md = trayMouseDownPosRef.current;
            trayMouseDownPosRef.current = null;
            // If the cursor moved more than 5px between mousedown and click, this is a
            // drag-release (e.g. panning keyhole → mouse up on footer). Suppress action.
            if (md && Math.max(Math.abs(e.clientX - md.x), Math.abs(e.clientY - md.y)) > 5) {
              return;
            }
            trayAction();
          }}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              trayAction();
            }
          }}
          className={cn(
            "w-full rounded-xs overflow-hidden text-left cursor-pointer relative",
            "transition-opacity",
            borderClass,
          )}
          aria-label={onImageClick ? t("action.viewImage") : t("action.expandFullPage")}
        >
          {/* aria-hidden: interior is decorative — the button's aria-label describes the action.
              This also avoids nested interactive elements (footer CTA) inside a role="button". */}
          <div aria-hidden="true">{content}</div>
        </div>
      ) : (
        /* Informational: non-clickable display */
        <div className={cn("w-full rounded-xs overflow-hidden text-left", borderClass)}>{content}</div>
      )}
    </div>
  );
}
