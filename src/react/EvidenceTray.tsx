/**
 * Evidence tray components — keyhole viewer, expanded image, and related
 * display logic for the citation popover "proof zone".
 *
 * Contains all evidence-display components that were previously in
 * Citation.tsx: image resolution, keyhole viewer, evidence tray,
 * expanded page viewer, search analysis, and supporting utilities.
 *
 * @packageDocumentation
 */

import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { isStrategyOverride, shouldHighlightAnchorText } from "../drawing/citationDrawing.js";
import type { DeepTextItem, ScreenBox } from "../types/boxes.js";
import type { CitationStatus } from "../types/citation.js";
import type { SearchAttempt } from "../types/search.js";
import type { PageImage, Verification } from "../types/verification.js";
import { CitationAnnotationOverlay } from "./CitationAnnotationOverlay.js";
import { computeKeyholeOffset } from "./computeKeyholeOffset.js";
import {
  BLINK_ENTER_EASING,
  BLINK_EXIT_EASING,
  buildKeyholeMaskImage,
  DOCUMENT_CANVAS_BG_CLASSES,
  DOCUMENT_IMAGE_EDGE_CLASSES,
  EVIDENCE_LIST_COLLAPSE_TOTAL_MS,
  EVIDENCE_LIST_EXPAND_STEP_MS,
  EVIDENCE_LIST_EXPAND_TOTAL_MS,
  EVIDENCE_TRAY_BORDER_DASHED,
  EVIDENCE_TRAY_BORDER_SOLID,
  EXPANDED_IMAGE_SHELL_PX,
  EXPANDED_MIN_READABLE_ZOOM,
  EXPANDED_ZOOM_MAX,
  EXPANDED_ZOOM_MIN,
  EXPANDED_ZOOM_STEP,
  HIDE_SCROLLBAR_STYLE,
  HITBOX_EXTEND_8x14,
  isValidProofImageSrc,
  KEYHOLE_FADE_WIDTH,
  KEYHOLE_SKIP_THRESHOLD,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  KEYHOLE_STRIP_HEIGHT_VAR,
  KEYHOLE_WIDTH_FIT_THRESHOLD,
  MIN_PAN_OVERFLOW_PX,
  POPOVER_MORPH_EXPAND_MS,
  TERTIARY_ACTION_BASE_CLASSES,
  TERTIARY_ACTION_HOVER_CLASSES,
  TERTIARY_ACTION_IDLE_CLASSES,
  WHEEL_ZOOM_SENSITIVITY,
} from "./constants.js";
import { formatCaptureDate } from "./dateUtils.js";
import { useDragToPan } from "./hooks/useDragToPan.js";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { applyGestureTransform, useWheelZoom, type WheelZoomAnchor } from "./hooks/useWheelZoom.js";
import { tPlural, useLocale, useTranslation } from "./i18n.js";
import { ChevronRightIcon, SpinnerIcon } from "./icons.js";
import { handleImageError } from "./imageUtils.js";
import { computeAnnotationOriginPercent, computeAnnotationScrollTarget, toPercentRect } from "./overlayGeometry.js";
import { getUniqueSearchAttemptCount } from "./searchAttemptGrouping.js";
import { buildIntentSummary } from "./searchSummaryUtils.js";
import { cn } from "./utils.js";
import { VerificationLogTimeline } from "./VerificationLog.js";
import { DC_EVIDENCE_VT_NAME } from "./viewTransition.js";
import { ZoomToolbar } from "./ZoomToolbar.js";

// =============================================================================
// MODULE-LEVEL UTILITIES
// =============================================================================

/** Threshold (px) for considering the viewport "drifted" from the annotation. */
/** Scroll drift threshold for locate dirty-bit detection (px).
 *  15px absorbs sub-pixel rendering jitter while being small enough
 *  to catch intentional user panning. */
const DRIFT_THRESHOLD_PX = 15;

/** Grey canvas padding (px) around the page image in expanded-page (fill) mode.
 *  Creates a document-viewer-like gutter so the image sits in a visible container. */
const CANVAS_PADDING_PX = 16;

function getSearchSummaryPrimaryMessage(
  outcome: string | null | undefined,
  t: (key: import("./i18n.js").MessageKey) => string,
): string | null {
  if (outcome === "not_found") return t("evidence.textNotFound");
  if (outcome === "related_found") return t("evidence.similarTextFound");
  return null;
}

/**
 * Scroll an element to a target scrollLeft over `POPOVER_MORPH_EXPAND_MS` using
 * an ease-out curve. Much faster than `behavior: "smooth"` (~500-800ms browser default).
 * Returns a cancel function to abort the in-flight animation.
 */
function animateScrollLeft(el: HTMLElement, targetLeft: number): () => void {
  const start = el.scrollLeft;
  const delta = targetLeft - start;
  let cancelled = false;
  if (delta === 0) return () => {};
  const t0 = performance.now();
  const step = (now: number) => {
    if (cancelled) return;
    const elapsed = now - t0;
    if (elapsed >= POPOVER_MORPH_EXPAND_MS) {
      el.scrollLeft = targetLeft;
      return;
    }
    // ease-out: 1 - (1 - t)^3
    const t = elapsed / POPOVER_MORPH_EXPAND_MS;
    el.scrollLeft = start + delta * (1 - (1 - t) ** 3);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return () => {
    cancelled = true;
  };
}

// Evidence list expand/collapse uses an inlined motion state machine instead of
// useBlinkMotionStage because it needs proportional height reveal (measuring
// actual scrollHeight via searchLogViewportRef) and per-stage CSS property
// transitions (paddingTop, transform, willChange) that the generic hook doesn't support.
type EvidenceListMotionStage = "idle" | "enter-a" | "enter-b" | "steady" | "exit-a" | "exit-b";

function resolveEvidenceListRevealRatio(stage: EvidenceListMotionStage): number {
  if (stage === "idle") return 0;
  if (stage === "enter-a") return 0.2;
  if (stage === "enter-b") return 0.95;
  if (stage === "exit-a") return 0.7;
  if (stage === "exit-b") return 0;
  return 1;
}

function resolveEvidenceListOpacity(stage: EvidenceListMotionStage): number {
  if (stage === "idle") return 0;
  if (stage === "enter-a") return 0.72;
  if (stage === "enter-b") return 0.88;
  if (stage === "exit-a") return 0.65;
  if (stage === "exit-b") return 0.06;
  return 1;
}

function resolveEvidenceListPaddingTop(stage: EvidenceListMotionStage): string {
  if (stage === "enter-a") return "4px";
  if (stage === "enter-b" || stage === "exit-a") return "2px";
  return "0px";
}

function resolveEvidenceListTransform(stage: EvidenceListMotionStage): string {
  if (stage === "enter-a") return "translate3d(0, 1px, 0)";
  if (stage === "enter-b" || stage === "exit-a") return "translate3d(0, 0.5px, 0)";
  return "translate3d(0, 0, 0)";
}

function resolveEvidenceListTransition(stage: EvidenceListMotionStage): string {
  if (stage === "enter-a" || stage === "idle" || stage === "exit-a") return "none";
  if (stage === "enter-b") {
    return `max-height ${EVIDENCE_LIST_EXPAND_STEP_MS}ms ${BLINK_ENTER_EASING}, opacity ${EVIDENCE_LIST_EXPAND_STEP_MS}ms ${BLINK_ENTER_EASING}, padding-top ${EVIDENCE_LIST_EXPAND_STEP_MS}ms ${BLINK_ENTER_EASING}, transform ${EVIDENCE_LIST_EXPAND_STEP_MS}ms ${BLINK_ENTER_EASING}`;
  }
  if (stage === "steady") {
    const settleMs = Math.max(16, EVIDENCE_LIST_EXPAND_TOTAL_MS - EVIDENCE_LIST_EXPAND_STEP_MS);
    return `max-height ${settleMs}ms ${BLINK_ENTER_EASING}, opacity ${settleMs}ms ${BLINK_ENTER_EASING}, padding-top ${settleMs}ms ${BLINK_ENTER_EASING}, transform ${settleMs}ms ${BLINK_ENTER_EASING}`;
  }
  return `max-height ${EVIDENCE_LIST_COLLAPSE_TOTAL_MS}ms ${BLINK_EXIT_EASING}, opacity ${EVIDENCE_LIST_COLLAPSE_TOTAL_MS}ms ${BLINK_EXIT_EASING}, padding-top ${EVIDENCE_LIST_COLLAPSE_TOTAL_MS}ms ${BLINK_EXIT_EASING}, transform ${EVIDENCE_LIST_COLLAPSE_TOTAL_MS}ms ${BLINK_EXIT_EASING}`;
}

// Combined reducer for search-log animation state — a single dispatch replaces
// the multiple setState calls that the React Compiler flagged as cascading renders.
type SearchLogAnimState = { mounted: boolean; stage: EvidenceListMotionStage };
type SearchLogAnimAction =
  | { type: "instant"; show: boolean }
  | { type: "enter" }
  | { type: "stage"; stage: EvidenceListMotionStage }
  | { type: "unmount" };

function searchLogAnimReducer(state: SearchLogAnimState, action: SearchLogAnimAction): SearchLogAnimState {
  switch (action.type) {
    case "instant":
      return { mounted: action.show, stage: action.show ? "steady" : "idle" };
    case "enter":
      return { mounted: true, stage: "enter-a" };
    case "stage":
      return { ...state, stage: action.stage };
    case "unmount":
      return { mounted: false, stage: "idle" };
  }
}

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

function toExpandedImageSource(
  page: PageImage,
  overrides?: {
    highlightBox?: ScreenBox | null;
    renderScale?: { x: number; y: number } | null;
    textItems?: DeepTextItem[] | null;
  },
): ExpandedImageSource {
  return {
    src: page.imageUrl,
    dimensions: page.dimensions,
    highlightBox: overrides?.highlightBox ?? page.highlightBox ?? null,
    renderScale: overrides?.renderScale ?? page.renderScale ?? null,
    textItems: overrides?.textItems ?? page.textItems ?? [],
  };
}

/**
 * Resolves the evidence crop image (keyhole source) from verification data.
 * Returns `verification.evidence.src` when present and valid, otherwise `null`.
 */
// biome-ignore lint/style/useComponentExportOnlyModules: Utility function used by CitationDrawer
export function resolveEvidenceSrc(verification: Verification | null | undefined): string | null {
  const snippetSrc = verification?.evidence?.src;
  if (!snippetSrc) return null;
  return isValidProofImageSrc(snippetSrc) ? snippetSrc : null;
}

/** Check whether a PageImage represents the verification match page. */
function isMatchPageImage(page: PageImage, verification: Verification | null | undefined): boolean {
  if (page.isMatchPage) return true;
  const matchNum = Number(verification?.document?.verifiedPageNumber);
  return Number.isFinite(matchNum) && page.pageNumber === matchNum;
}

/** Extract verification.document overrides for toExpandedImageSource (highlightBox, renderScale, textItems). */
function documentOverrides(doc: Verification["document"]) {
  return doc
    ? {
        highlightBox: doc.highlightBox ?? null,
        renderScale: doc.renderScale ?? null,
        textItems: doc.textItems ?? null,
      }
    : undefined;
}

/**
 * Single resolver for the best available full-page image from verification data.
 * Tries in order:
 * 1. match page from pageImages (best: has image + dimensions)
 * 2. first page fallback from pageImages (for not_found or unknown page)
 *
 * Note: evidence.src is intentionally excluded — it is the keyhole crop, not a
 * full-page image. Using it here would make "View page" re-show the same image as the keyhole.
 * URL full-page screenshots are now in attachment.pageImages (not on the verification object).
 *
 * Each source is validated with isValidProofImageSrc() before use, blocking SVG data URIs
 * (which can contain scripts), javascript: URIs, and untrusted hosts. Localhost is allowed
 * for development. Invalid sources are skipped and the next tier is tried.
 */
// biome-ignore lint/style/useComponentExportOnlyModules: exported for testing
export function resolveExpandedImage(
  verification: Verification | null | undefined,
  pageImages?: PageImage[] | null,
): ExpandedImageSource | null {
  if (!verification) return null;

  // Two-pass priority: isMatchPage flag always wins over pageNumber match,
  // regardless of array ordering. A single-pass find(isMatchPageImage) would
  // pick whichever condition matches first positionally.
  const matchPageNumber = verification.document?.verifiedPageNumber;
  const matchPage =
    pageImages?.find(p => p.isMatchPage) ??
    (matchPageNumber ? pageImages?.find(p => p.pageNumber === matchPageNumber) : undefined);
  if (matchPage?.imageUrl && isValidProofImageSrc(matchPage.imageUrl)) {
    return toExpandedImageSource(matchPage, documentOverrides(verification.document));
  }

  // Fallback: first available page image
  const anyPage = pageImages?.[0];
  if (anyPage?.imageUrl && isValidProofImageSrc(anyPage.imageUrl)) {
    return toExpandedImageSource(anyPage);
  }

  return null;
}

/**
 * Resolve an expanded image for a specific page number.
 * Falls back to resolveExpandedImage() when an exact page image isn't present.
 */
// biome-ignore lint/style/useComponentExportOnlyModules: resolveExpandedImageForPage calls internal helpers in this file (toExpandedImageSource, resolveExpandedImage) and cannot be cleanly extracted
export function resolveExpandedImageForPage(
  verification: Verification | null | undefined,
  pageNumber: number | null | undefined,
  pageImages?: PageImage[] | null,
): ExpandedImageSource | null {
  const normalizedPage = Number(pageNumber);
  if (pageImages && Number.isFinite(normalizedPage) && normalizedPage > 0) {
    const exactPage = pageImages.find(p => Number(p.pageNumber) === normalizedPage && isValidProofImageSrc(p.imageUrl));
    if (exactPage) {
      return isMatchPageImage(exactPage, verification)
        ? toExpandedImageSource(exactPage, documentOverrides(verification?.document))
        : toExpandedImageSource(exactPage);
    }
  }
  return resolveExpandedImage(verification, pageImages);
}

// =============================================================================
// VERIFICATION IMAGE COMPONENT — "Keyhole" Crop & Fade
// =============================================================================

// =============================================================================
// ANCHOR TEXT FOCUSED IMAGE (Keyhole viewer)
// =============================================================================

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
  src,
  verification,
  onImageClick,
  onPageExpand,
  onKeyholeWidth,
  onScrollCapture,
}: {
  src: string;
  verification?: Verification | null;
  onImageClick?: () => void;
  /** Skip-to-page callback when keyhole already fits — goes straight to expanded-page. */
  onPageExpand?: () => void;
  onKeyholeWidth?: (width: number) => void;
  /** Called with natural-pixel scroll coords just before onImageClick fires. */
  onScrollCapture?: (left: number, top: number) => void;
}) {
  const t = useTranslation();
  // Anchor item and renderScale for scroll positioning.
  // Uses anchorTextMatchDeepItems[0] (specific cited word) with phraseMatchDeepItem fallback.
  // renderScale is required to convert PDF point coords → image pixel coords, matching
  // the same transform used by computeAnnotationScrollTarget / toPercentRect in overlayGeometry.
  const anchorScrollData = useMemo(() => {
    if (!verification) return null;
    const anchorItem =
      verification.document?.anchorTextMatchDeepItems?.[0] ?? verification.document?.phraseMatchDeepItem;
    if (!anchorItem) return null;
    const renderScale = verification.document?.renderScale ?? null;
    if (!renderScale) return null;
    return { anchorItem, renderScale };
  }, [verification]);
  // Drag-to-pan hook for mouse interaction (xy enables vertical pan for width-fit tall images;
  // when no vertical overflow exists, scrollTop stays 0 — no visible effect on normal crops).
  const { containerRef, isDragging, handlers, scrollState, wasDraggingRef } = useDragToPan({ direction: "xy" });

  // Track image load to compute initial scroll position
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFitInfo, setImageFitInfo] = useState<{
    displayedWidth: number;
    imageFitsCompletely: boolean;
    isWidthFit?: boolean;
  } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const imageWrapperRef = useRef<HTMLDivElement>(null);
  /** Cancel handle for the current `animateScrollLeft` rAF loop (if any). */
  const cancelPanRef = useRef<(() => void) | null>(null);
  const keyholeInitAppliedRef = useRef(false);

  // Set initial scroll position after image loads.
  // useLayoutEffect guarantees refs are populated and runs before paint,
  // so the strip appears at the correct offset without a flash of misposition.
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef and imageRef are stable refs that never change identity; useLayoutEffect guarantees the DOM nodes they point to are ready
  useLayoutEffect(() => {
    if (!imageLoaded) return;
    if (keyholeInitAppliedRef.current) return;
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return;

    // The image renders at natural aspect ratio constrained by strip height.
    // Its displayed width = naturalWidth * (stripHeight / naturalHeight).
    const stripHeight = container.clientHeight;
    const displayedWidth =
      img.naturalHeight > 0 ? img.naturalWidth * (stripHeight / img.naturalHeight) : img.naturalWidth;
    const containerWidth = container.clientWidth;

    // Width-fit mode: when the image at height-fit scale is too narrow to read
    // (a tiny sliver for tall images like full-page screenshots), switch to
    // width-fit mode — fill the container width and scroll vertically instead.
    const isWidthFit = displayedWidth < containerWidth * KEYHOLE_WIDTH_FIT_THRESHOLD && img.naturalHeight > stripHeight;

    if (isWidthFit) {
      // Apply a readable-minimum zoom: width-fit scale can be tiny for large full-page
      // screenshots (e.g. 800×1200 in a 280px strip → 0.35). Clamp to 50% so the
      // content is legible. When the readable scale exceeds the container width the image
      // overflows both axes — the existing overflow-auto + xy drag-to-pan handles it.
      const widthFitScale = Math.min(containerWidth, img.naturalWidth) / img.naturalWidth;
      const readableScale = Math.max(widthFitScale, EXPANDED_MIN_READABLE_ZOOM);
      const effectiveWidth = img.naturalWidth * readableScale;
      const effectiveHeight = img.naturalHeight * readableScale;

      setImageFitInfo({ displayedWidth: effectiveWidth, imageFitsCompletely: false, isWidthFit: true });
      // Report the visible footprint (container width), not the overflowing image width.
      onKeyholeWidth?.(Math.min(effectiveWidth, containerWidth));

      // Center on the anchor text (both axes); fall back to image center.
      // computeAnnotationScrollTarget uses the same PDF→pixel transform as the overlay
      // (item.x * renderScale.x, flipping Y), with readableScale as zoom.
      const widthFitTarget =
        anchorScrollData &&
        computeAnnotationScrollTarget(
          anchorScrollData.anchorItem,
          anchorScrollData.renderScale,
          img.naturalWidth,
          img.naturalHeight,
          readableScale,
          containerWidth,
          stripHeight,
        );
      if (widthFitTarget) {
        container.scrollLeft = widthFitTarget.scrollLeft;
        container.scrollTop = widthFitTarget.scrollTop;
      } else {
        container.scrollLeft = Math.max(0, (effectiveWidth - containerWidth) / 2);
        container.scrollTop = Math.max(0, (effectiveHeight - stripHeight) / 2);
      }
    } else {
      // Height-fit mode (default): detect whether the image nearly fits within the keyhole.
      // Uses KEYHOLE_SKIP_THRESHOLD (2.0) so images up to 100% taller than the strip
      // are treated as "fits" — expanding would reveal almost nothing new.
      // displayedWidth <= containerWidth → image is narrow enough to show in full horizontally.
      // When both are true, the keyhole already reveals nearly everything — expand adds no value.
      if (displayedWidth > 0) {
        const imageFitsCompletely =
          img.naturalHeight > 0 &&
          img.naturalHeight <= stripHeight * KEYHOLE_SKIP_THRESHOLD &&
          displayedWidth <= containerWidth;
        setImageFitInfo({ displayedWidth, imageFitsCompletely });
        onKeyholeWidth?.(displayedWidth);
      }

      // Set initial scroll position using the same PDF→pixel transform as the overlay:
      //   pixelX = item.x * renderScale.x  (crop starts at x=0 in PDF space)
      //   pixelY = img.naturalHeight - item.y * renderScale.y  (Y-axis flip)
      // For a crop strip, pixelY is typically negative (the crop covers different page rows),
      // so scrollTop clamps to 0 — correct for the horizontal-only keyhole.
      // Falls back to centering the image when renderScale is unavailable.
      const displayScale = img.naturalWidth > 0 ? displayedWidth / img.naturalWidth : 1;
      const heightFitTarget =
        anchorScrollData &&
        computeAnnotationScrollTarget(
          anchorScrollData.anchorItem,
          anchorScrollData.renderScale,
          img.naturalWidth,
          img.naturalHeight,
          displayScale,
          containerWidth,
          stripHeight,
        );
      if (heightFitTarget) {
        container.scrollLeft = heightFitTarget.scrollLeft;
      } else {
        const { scrollLeft } = computeKeyholeOffset(displayedWidth, containerWidth, null);
        container.scrollLeft = scrollLeft;
      }
    }

    // Trigger scroll event so useDragToPan updates fade state for initial position
    container.dispatchEvent(new Event("scroll"));
    keyholeInitAppliedRef.current = true;
  }, [imageLoaded, anchorScrollData]);

  // Compute fade mask based on scroll state
  const maskImage = useMemo(
    () => buildKeyholeMaskImage(scrollState.canScrollLeft, scrollState.canScrollRight, KEYHOLE_FADE_WIDTH),
    [scrollState.canScrollLeft, scrollState.canScrollRight],
  );

  const imageSrc = src;

  const stripHeightStyle = `var(${KEYHOLE_STRIP_HEIGHT_VAR}, ${KEYHOLE_STRIP_HEIGHT_DEFAULT}px)`;
  const isWidthFit = imageFitInfo?.isWidthFit ?? false;
  const isPannable =
    scrollState.canScrollLeft || scrollState.canScrollRight || scrollState.canScrollUp || scrollState.canScrollDown;

  // Suppress arrow buttons for negligible horizontal overflow (e.g. sub-pixel rounding).
  // Fades (top/bottom gradients) are left as-is — they're passive visual hints, not clickable.
  const totalOverflowX = scrollState.scrollWidth - scrollState.clientWidth;
  const showLeftArrow = scrollState.canScrollLeft && totalOverflowX > MIN_PAN_OVERFLOW_PX;
  const showRightArrow = scrollState.canScrollRight && totalOverflowX > MIN_PAN_OVERFLOW_PX;

  // When the image fits entirely in the keyhole, expanding would show nothing new — suppress affordances.
  const canExpand = !imageFitInfo?.imageFitsCompletely && !!onImageClick;
  // When keyhole fits completely but a full-page view exists, skip straight to expanded-page.
  const canExpandToPage = !canExpand && !!imageFitInfo?.imageFitsCompletely && !!onPageExpand;
  const interactionCursor = isDragging
    ? "grabbing"
    : canExpand || canExpandToPage
      ? "zoom-in"
      : isPannable
        ? "grab"
        : "default";
  let keyholeAriaLabel = t("aria.keyhole.image");
  if (isPannable && canExpand) {
    keyholeAriaLabel = t("aria.keyhole.panAndExpand");
  } else if (isPannable) {
    keyholeAriaLabel = t("aria.keyhole.panOnly");
  } else if (canExpand) {
    keyholeAriaLabel = t("aria.keyhole.expandImage");
  } else if (canExpandToPage) {
    keyholeAriaLabel = t("aria.keyhole.expandPage");
  }

  const getDisplayedScale = useCallback(
    (img: HTMLImageElement, stripHeight: number): number => {
      if (imageFitInfo?.isWidthFit && img.naturalWidth > 0) {
        return imageFitInfo.displayedWidth / img.naturalWidth;
      }
      if (img.naturalHeight > 0) {
        return stripHeight / img.naturalHeight;
      }
      return 1;
    },
    [imageFitInfo],
  );

  return (
    <div className="relative">
      {/* Keyhole strip container — clickable to expand, draggable to pan.
          maxWidth clamps to the image's rendered width so no blank space appears to the right. */}
      <div
        className="relative group/keyhole"
        style={imageFitInfo && !isWidthFit ? { maxWidth: imageFitInfo.displayedWidth } : undefined}
      >
        <button
          type="button"
          className="block relative w-full"
          title={
            !canExpand && !canExpandToPage && !isPannable && imageFitInfo?.imageFitsCompletely
              ? t("evidence.alreadyFullSize")
              : undefined
          }
          onDragStart={e => e.preventDefault()}
          style={{
            cursor: interactionCursor,
          }}
          onKeyDown={e => {
            const el = containerRef.current;
            if (!el) return;
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              cancelPanRef.current?.();
              cancelPanRef.current = animateScrollLeft(el, el.scrollLeft - Math.max(el.clientWidth * 0.5, 80));
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              cancelPanRef.current?.();
              cancelPanRef.current = animateScrollLeft(el, el.scrollLeft + Math.max(el.clientWidth * 0.5, 80));
            }
          }}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            // Suppress click if user was dragging
            if (wasDraggingRef.current) {
              wasDraggingRef.current = false;
              return;
            }
            if (canExpand) {
              // Capture scroll position in natural-pixel coords before handing off to expanded view
              const img = imageRef.current;
              const container = containerRef.current;
              if (onScrollCapture && img && container) {
                const stripHeight = container.clientHeight;
                const displayedScale = getDisplayedScale(img, stripHeight);
                const ds = displayedScale > 0 ? displayedScale : 1;
                onScrollCapture(container.scrollLeft / ds, container.scrollTop / ds);
              }
              onImageClick?.();
            } else if (canExpandToPage) {
              // Keyhole already shows everything — skip to full page view
              onPageExpand?.();
            }
          }}
          aria-label={keyholeAriaLabel}
        >
          <div
            ref={containerRef}
            data-dc-keyhole=""
            className={cn(
              DOCUMENT_CANVAS_BG_CLASSES,
              isWidthFit ? "overflow-auto" : "overflow-x-auto overflow-y-hidden",
            )}
            style={{
              viewTransitionName: DC_EVIDENCE_VT_NAME,
              height: stripHeightStyle,
              // Fade mask only applies in height-fit mode (horizontal overflow).
              // In width-fit mode, there's no horizontal overflow so mask is "none" automatically.
              WebkitMaskImage: maskImage,
              maskImage,
              ...HIDE_SCROLLBAR_STYLE,
              cursor: interactionCursor,
            }}
            {...handlers}
          >
            {/* Hide webkit scrollbar via inline style tag scoped to this container */}
            <style>{`[data-dc-keyhole]::-webkit-scrollbar { display: none; }`}</style>
            <div ref={imageWrapperRef} style={{ display: "inline-block", position: "relative" }}>
              <img
                ref={imageRef}
                src={imageSrc}
                alt={t("aria.verificationEvidence")}
                className={cn(
                  DOCUMENT_IMAGE_EDGE_CLASSES,
                  isWidthFit ? "block select-none" : "block w-auto max-w-none select-none",
                )}
                style={
                  isWidthFit
                    ? { width: imageFitInfo?.displayedWidth, height: "auto", maxWidth: "none" }
                    : {
                        height: stripHeightStyle,
                      }
                }
                loading="eager"
                decoding="async"
                draggable={false}
                onDragStart={e => e.preventDefault()}
                onLoad={() => setImageLoaded(true)}
                onError={handleImageError}
              />
            </div>
          </div>

          {/* Left pan hint — clicking pans the image left */}
          {showLeftArrow && (
            <div
              aria-hidden="true"
              className="absolute left-0 top-0 h-full min-w-[44px] flex items-center justify-center opacity-0 group-hover/keyhole:opacity-100 transition-opacity duration-150 cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                const el = containerRef.current;
                if (!el) return;
                cancelPanRef.current?.();
                cancelPanRef.current = animateScrollLeft(el, el.scrollLeft - Math.max(el.clientWidth * 0.5, 80));
              }}
            >
              <span className="text-sm font-bold text-white bg-black/50 w-7 h-7 flex items-center justify-center rounded-full leading-none">
                ←
              </span>
            </div>
          )}

          {/* Right pan hint — clicking pans the image right */}
          {showRightArrow && (
            <div
              aria-hidden="true"
              className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center opacity-0 group-hover/keyhole:opacity-100 transition-opacity duration-150 cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                const el = containerRef.current;
                if (!el) return;
                cancelPanRef.current?.();
                cancelPanRef.current = animateScrollLeft(el, el.scrollLeft + Math.max(el.clientWidth * 0.5, 80));
              }}
            >
              <span className="text-sm font-bold text-white bg-black/50 w-7 h-7 flex items-center justify-center rounded-full leading-none">
                →
              </span>
            </div>
          )}

          {/* Top vertical fade — indicates scrollable content above */}
          {scrollState.canScrollUp && (
            <div
              aria-hidden="true"
              className="absolute top-0 left-0 w-full pointer-events-none"
              style={{
                height: KEYHOLE_FADE_WIDTH,
                background: "linear-gradient(to bottom, rgba(0,0,0,0.12), transparent)",
              }}
            />
          )}

          {/* Bottom vertical fade — indicates scrollable content below */}
          {scrollState.canScrollDown && (
            <div
              aria-hidden="true"
              className="absolute bottom-0 left-0 w-full pointer-events-none"
              style={{
                height: KEYHOLE_FADE_WIDTH,
                background: "linear-gradient(to top, rgba(0,0,0,0.12), transparent)",
              }}
            />
          )}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// EVIDENCE TRAY COMPONENTS
// =============================================================================

/**
 * Minimal footer for the evidence tray: date on the left, CTA on the right.
 * For miss states, an optional "› N searches" toggle sits between the date and CTA.
 */
function EvidenceTrayFooter({
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
    <div className="px-3 py-2 min-h-[44px] flex items-center text-[11px] text-gray-400 dark:text-gray-500">
      <div className="flex items-center justify-between w-full">
        <span className="flex items-center gap-1">
          {showToggle && (
            <button
              type="button"
              className={cn(
                "relative flex items-center gap-0.5 text-[11px] font-medium cursor-pointer",
                TERTIARY_ACTION_BASE_CLASSES,
                TERTIARY_ACTION_IDLE_CLASSES,
                TERTIARY_ACTION_HOVER_CLASSES,
                HITBOX_EXTEND_8x14,
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
              "flex items-center gap-0.5 text-[11px] font-medium cursor-pointer ml-auto",
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
 * Display a single match snippet with the matched text highlighted.
 * Shows surrounding context text with the match portion bolded.
 */
function MatchSnippetDisplay({ snippet }: { snippet: import("./searchSummaryUtils.js").MatchSnippet }) {
  const t = useTranslation();
  const before = snippet.contextText.slice(0, snippet.matchStart);
  const match = snippet.contextText.slice(snippet.matchStart, snippet.matchEnd);
  const after = snippet.contextText.slice(snippet.matchEnd);

  return (
    <div className="text-xs text-gray-600 dark:text-gray-300 font-mono leading-relaxed">
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
}

/**
 * Search analysis summary for not-found / partial evidence tray.
 * Intent-centric display: clean message for misses, snippet-based for partial matches.
 */
export function SearchAnalysisSummary({
  searchAttempts,
  verification,
}: {
  searchAttempts: SearchAttempt[];
  verification?: Verification | null;
}) {
  const t = useTranslation();
  const intentSummary = useMemo(() => buildIntentSummary(verification, searchAttempts), [verification, searchAttempts]);
  const primaryMessage = getSearchSummaryPrimaryMessage(intentSummary?.outcome, t);

  // Snippets for related_found outcome (limit to 3)
  const snippets = intentSummary?.snippets?.slice(0, 3) ?? [];

  return (
    <div className="px-3 py-2 space-y-1.5">
      {/* Primary message */}
      {primaryMessage && <div className="text-[11px] text-gray-600 dark:text-gray-300">{primaryMessage}</div>}

      {/* Snippets for related_found */}
      {snippets.length > 0 && (
        <div className="space-y-1">
          {snippets.map(snippet => (
            <MatchSnippetDisplay
              key={`snippet-${snippet.page ?? "na"}-${snippet.matchStart}-${snippet.matchEnd}`}
              snippet={snippet}
            />
          ))}
        </div>
      )}
    </div>
  );
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
}) {
  const t = useTranslation();
  const resolvedEvidenceSrc = useMemo(() => resolveEvidenceSrc(verification), [verification]);
  const isMiss = status.isMiss;
  const isPartialMatch = status.isPartialMatch;
  const searchAttempts = verification?.searchAttempts ?? [];
  const borderClass = isMiss ? EVIDENCE_TRAY_BORDER_DASHED : EVIDENCE_TRAY_BORDER_SOLID;
  const prefersReducedMotion = usePrefersReducedMotion();

  // Tray-level click: keyhole click if available, else page expansion
  const trayAction = onImageClick ?? onExpand;

  // Suppress tray-level clicks that result from drag-release (e.g. panning the keyhole
  // then releasing the mouse over "View page ›"). The browser fires click at the lowest
  // common ancestor of the mousedown and mouseup targets — which is this tray div — so we
  // must gate the action here.
  const trayMouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const trayRootRef = useRef<HTMLDivElement>(null);

  const handlePageExpand = useCallback(() => {
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
  const searchCount = useMemo(
    () => ((isMiss || isPartialMatch) && searchAttempts.length > 0 ? getUniqueSearchAttemptCount(searchAttempts) : 0),
    [isMiss, isPartialMatch, searchAttempts],
  );

  // Footer element — shared across top/bottom placement
  const footerEl = (
    <EvidenceTrayFooter
      verifiedAt={verification?.verifiedAt}
      onPageClick={onExpand ? handlePageExpand : undefined}
      pageNumberForCta={pageNumberForCta}
      pageCtaLabel={pageCtaLabel}
      searchCount={isMiss || isPartialMatch ? searchCount : undefined}
      isSearchLogOpen={showSearchLog}
      onToggleSearchLog={isMiss || isPartialMatch ? () => setShowSearchLog(prev => !prev) : undefined}
    />
  );

  // Shared inner content
  const content = (
    <>
      {/* Content: keyhole image (verified/partial AND miss with page image) or search analysis.
          Keys prevent React from reusing fibers across component-type swaps. */}
      {resolvedEvidenceSrc ? (
        <AnchorTextFocusedImage
          key={resolvedEvidenceSrc}
          src={resolvedEvidenceSrc}
          verification={verification}
          onImageClick={onImageClick}
          onPageExpand={onExpand}
          onKeyholeWidth={onKeyholeWidth}
          onScrollCapture={onScrollCapture}
        />
      ) : (isMiss || isPartialMatch) && isValidProofImageSrc(pageImageSrc) ? (
        <AnchorTextFocusedImage
          key={pageImageSrc}
          src={pageImageSrc}
          onImageClick={onImageClick}
          onPageExpand={onExpand}
          onKeyholeWidth={onKeyholeWidth}
          onScrollCapture={onScrollCapture}
        />
      ) : null}
      {/* Miss/partial: search analysis and collapsible search log (only when there are search attempts) */}
      {(isMiss || isPartialMatch) && searchAttempts.length > 0 ? (
        <div key="analysis">
          <SearchAnalysisSummary searchAttempts={searchAttempts} verification={verification} />
          {footerEl}
          {isSearchLogMounted ? (
            <div style={searchLogMotionStyle}>
              <div className="overflow-hidden" style={{ minHeight: 0 }}>
                <div className="border-t border-gray-200 dark:border-gray-700">
                  <div
                    ref={searchLogViewportRef}
                    className="max-h-[min(44dvh,420px)] overflow-y-auto overscroll-contain"
                  >
                    <VerificationLogTimeline
                      searchAttempts={searchAttempts}
                      fullPhrase={verification?.citation?.fullPhrase ?? verification?.verifiedFullPhrase ?? undefined}
                      anchorText={verification?.citation?.anchorText ?? verification?.verifiedAnchorText ?? undefined}
                      status={verification?.status ?? "not_found"}
                      expectedPage={
                        verification?.citation?.type === "document" ? verification.citation.pageNumber : undefined
                      }
                      expectedLine={
                        verification?.citation?.type === "document" ? verification.citation.lineIds?.[0] : undefined
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

// applyGestureTransform imported from ./hooks/useWheelZoom.js — shared by wheel zoom and touch pinch.

/**
 * Replaces Zone 3 (evidence tray) when the keyhole is expanded in-place.
 * Renders the image at natural size with 2D drag-to-pan. The summary content
 * (Zone 1 header + Zone 2 quote) stays visible above — this component is
 * deliberately headerless. Click (without drag) to collapse.
 *
 * When `fill` is true (expanded-page mode), includes subtle zoom controls
 * (−/slider/+) for both desktop and mobile. Mobile defaults to fit-to-screen.
 * Supports pinch-to-zoom on touch devices and scroll-to-zoom on desktop.
 */
export function InlineExpandedImage({
  src,
  onCollapse,
  verification,
  fill = false,
  onExpand,
  pageNumberForCta,
  expandCtaLabel,
  onNaturalSize,
  renderScale,
  highlightItem,
  anchorItem,
  initialOverlayHidden = false,
  showOverlay,
  initialScroll,
  expectedDimensions,
}: {
  src: string;
  onCollapse: () => void;
  verification?: Verification | null;
  /** When true, the component expands to fill its flex parent (for use inside flex-column containers). */
  fill?: boolean;
  /** When provided, renders a CTA in the non-fill footer (defaults to "View page"). */
  onExpand?: () => void;
  /** Optional page number shown in "View page N" CTA for non-fill mode. */
  pageNumberForCta?: number | null;
  /** Optional non-fill footer CTA label override (for example, "View image"). */
  expandCtaLabel?: string;
  /** Called after image load with natural pixel dimensions. */
  onNaturalSize?: (width: number, height: number) => void;
  /** Scale factors for converting DeepTextItem PDF coords to image pixels. */
  renderScale?: { x: number; y: number } | null;
  /** Override phraseMatchDeepItem from verification.document (for direct DeepTextItem injection). */
  highlightItem?: DeepTextItem | null;
  /** Override anchorTextMatchDeepItems[0] from verification.document (for direct DeepTextItem injection). */
  anchorItem?: DeepTextItem | null;
  /** When true, the annotation overlay starts hidden (e.g. drawer context where overlay is unwanted). */
  initialOverlayHidden?: boolean;
  /**
   * When provided, externally controls overlay visibility (overrides internal overlayHidden state).
   * true = show overlay, false = hide overlay. Used by the header panel indicator row.
   */
  showOverlay?: boolean;
  /**
   * Initial scroll position in natural-pixel coordinates (zoom=1.0 space).
   * Applied once on image load in expanded-keyhole mode (fill=false) to continue
   * where the keyhole strip was scrolled to. A new object reference = re-apply.
   */
  initialScroll?: { left: number; top: number };
  /**
   * Expected natural dimensions of the image (from verification metadata).
   * Used to render a correctly-proportioned skeleton placeholder while loading.
   */
  expectedDimensions?: { width: number; height: number } | null;
}) {
  const t = useTranslation();
  const { containerRef, isDragging, handlers: panHandlers, wasDraggingRef } = useDragToPan({ direction: "xy" });
  const expandedImgRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  // Dedup guard: avoids redundant onNaturalSize calls when the computed
  // zoomed dimensions haven't actually changed (e.g. during window resize).
  const lastReportedSizeRef = useRef<{ w: number; h: number } | null>(null);
  // When true, the CSS annotation overlay (spotlight + brackets) is hidden so the
  // user can view the underlying page image unfettered. The backend-drawn annotations
  // on the image itself remain visible. Only applies in fill (expanded-page) mode.
  const [overlayHidden, setOverlayHidden] = useState(initialOverlayHidden);
  // When showOverlay is provided by parent (header panel mode), it overrides internal state.
  const effectiveOverlayHidden = showOverlay !== undefined ? !showOverlay : overlayHidden;
  // Manual zoom override: null = use fitted zoom (automatic), number = user-selected zoom.
  // Replaces the previous zoom + hasManualZoomRef pattern to avoid setState in effects.
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  // Container size as state (not ref) so that ResizeObserver updates trigger re-renders.
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  // Viewport width as state so the fit-to-screen calculation re-derives on window resize.
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 0));
  useEffect(() => {
    if (!fill) return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fill]);

  // Derived fit-to-screen zoom — pure calculation from measurements, no effect needed.
  const fittedZoom = useMemo(() => {
    if (!fill || !imageLoaded || !naturalWidth || !naturalHeight) return null;
    if (!containerSize || containerSize.width <= 0 || containerSize.height <= 0) return null;
    const pad = CANVAS_PADDING_PX * 2;
    const maxImageWidth =
      viewportWidth > 0 ? viewportWidth - 32 - EXPANDED_IMAGE_SHELL_PX - pad : containerSize.width - pad;
    const fitZoomW = maxImageWidth / naturalWidth;
    return {
      // readableZoom: initial zoom clamped to readable minimum (50%).
      readable: Math.min(1, Math.max(EXPANDED_MIN_READABLE_ZOOM, fitZoomW)),
      // floor: minimum zoom level (fit-to-screen). Can be below readable for zoom-out via slider.
      floor: Math.min(EXPANDED_ZOOM_MIN, Math.min(1, Math.max(0.1, fitZoomW))),
    };
  }, [fill, imageLoaded, naturalWidth, naturalHeight, containerSize, viewportWidth]);

  // Derived zoom and zoomFloor — single source of truth, no setState needed.
  const zoom = manualZoom ?? fittedZoom?.readable ?? 1;
  const zoomFloor = fittedZoom?.floor ?? EXPANDED_ZOOM_MIN;

  // Ref mirror of zoom for touch event handlers (avoids stale closures in pinch gesture).
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Auto-locate only once per image load; resizing should not keep re-centering/pulling view.
  const hasAutoScrolledToAnnotationRef = useRef(false);
  // Tracks the last initialScroll object that was applied — reference equality prevents
  // double-application within the same expand session while still re-applying on each new click.
  const lastAppliedInitialScrollRef = useRef<{ left: number; top: number } | null>(null);

  // ---------------------------------------------------------------------------
  // GPU-accelerated gesture zoom refs
  // During pinch/wheel gestures, CSS transform: scale() is applied to the wrapper
  // div (GPU-composited, zero layout reflow). On gesture end, the final zoom is
  // committed to React state → width reflow → transform removed in one paint frame.
  // ---------------------------------------------------------------------------
  const animatedShellRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  // Touch pinch gesture zoom (separate from wheel zoom hook).
  const touchGestureZoomRef = useRef<number | null>(null);
  // Touch pinch anchor — used by applyGestureTransform and useLayoutEffect for scroll correction.
  const touchGestureAnchorRef = useRef<WheelZoomAnchor | null>(null);
  // Wheel zoom gesture anchor — declared here (before the src-reset effect) and
  // passed into useWheelZoom so the hook writes to this ref. Avoids a temporal
  // dead zone reference that the React Compiler flags as "used before declaration".
  const expandedWheelAnchorRef = useRef<WheelZoomAnchor | null>(null);

  // Effective annotation items: override props take precedence, then verification.document, then null.
  const effectivePhraseItem = highlightItem ?? verification?.document?.phraseMatchDeepItem ?? null;
  const effectiveAnchorItem = anchorItem ?? verification?.document?.anchorTextMatchDeepItems?.[0] ?? null;

  // Anchor-aware scroll/zoom target: when anchor text is highlighted, center on it
  // instead of the (potentially wider) full phrase box.
  const vAnchor = verification?.verifiedAnchorText;
  const vPhrase = verification?.verifiedFullPhrase;
  const anchorHighlightActive =
    effectiveAnchorItem &&
    (shouldHighlightAnchorText(vAnchor, vPhrase) ||
      (isStrategyOverride(vAnchor, vPhrase) && shouldHighlightAnchorText(vAnchor, effectivePhraseItem?.text)));
  const scrollTarget = anchorHighlightActive ? effectiveAnchorItem : effectivePhraseItem;

  // Track container size via ResizeObserver (both width and height for fit-to-screen).
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref object from useDragToPan — its identity never changes
  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fill]);

  // Reset state when src changes — render-time adjustment (no effect needed).
  // This avoids the React Compiler's "setState in effect" bailout.
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    setNaturalWidth(null);
    setNaturalHeight(null);
    setManualZoom(null);
    setOverlayHidden(initialOverlayHidden);
    setImageLoaded(false);
  }

  // Reset refs + sync-detect cached images on src change.
  // useLayoutEffect (not useEffect) is critical: when a View Transition wraps the
  // viewState change in flushSync, layout effects fire before the VT captures its
  // "new" snapshot. Detecting the cached image synchronously lets the VT snapshot
  // include the real content (not a spinner) at the correct scroll position.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref identities are stable; fill/onNaturalSize are read but not reactive triggers — only src change should fire this
  useLayoutEffect(() => {
    hasAutoScrolledToAnnotationRef.current = false;
    lastReportedSizeRef.current = null;
    touchGestureZoomRef.current = null;
    touchGestureAnchorRef.current = null;
    expandedWheelAnchorRef.current = null;
    lastAppliedInitialScrollRef.current = null;

    // Sync-detect cached images: if the browser already has the decoded pixels
    // (same src was just displayed in the keyhole strip), skip the onLoad
    // roundtrip so the View Transition captures the real image, not a spinner.
    const img = expandedImgRef.current;
    if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImageLoaded(true);
      setNaturalWidth(img.naturalWidth);
      setNaturalHeight(img.naturalHeight);
      if (!fill) onNaturalSize?.(img.naturalWidth, img.naturalHeight);
    }
  }, [src]);

  // Apply initial scroll position from the keyhole — expanded-keyhole mode (fill=false) only.
  // useLayoutEffect + forced reflow ensures the scroll position is set before the View
  // Transition captures its "new" snapshot. Reading scrollHeight forces the browser to
  // compute scroll geometry for the container even though it transitioned from display:none
  // in this same commit. Without the forced reflow, the write would be a no-op.
  // Reference-equality check prevents re-applying the same position after the user pans away.
  useLayoutEffect(() => {
    if (fill || !imageLoaded || !initialScroll) return;
    if (lastAppliedInitialScrollRef.current === initialScroll) return;
    lastAppliedInitialScrollRef.current = initialScroll;
    const { left, top } = initialScroll;
    const el = containerRef.current;
    if (!el) return;
    // Force synchronous reflow so geometry is available even after display:none removal.
    void el.scrollHeight;
    el.scrollLeft = left;
    el.scrollTop = top;
  }, [fill, imageLoaded, initialScroll, containerRef]);

  // ---------------------------------------------------------------------------
  // Locate dirty bit — tracks whether the viewport has drifted from the annotation.
  // Starts false (on-target after initial snap). Set true when user pans away.
  // Set false again when handleScrollToAnnotation re-centers.
  // Declared before the fit-to-screen effect which references setLocateDirty and
  // annotationScrollTarget to satisfy the React Compiler's declaration-order requirement.
  // ---------------------------------------------------------------------------
  const [locateDirty, setLocateDirty] = useState(false);
  const [locatePulseKey, setLocatePulseKey] = useState(0);
  // Ref storing the expected scroll position after a programmatic scroll.
  // Used by the scroll listener to detect user-initiated drift.
  const annotationScrollTarget = useRef<{ left: number; top: number } | null>(null);
  // Guard: true while a programmatic re-center scroll is in progress.
  // Prevents intermediate scroll events from marking dirty.
  const isAnimatingScroll = useRef(false);

  // Report zoomed dimensions to the parent (side effect only — no setState).
  // zoom/zoomFloor are derived during render; this effect handles the external callback.
  useEffect(() => {
    if (!fill || !imageLoaded || !naturalWidth || !naturalHeight) return;
    if (!containerSize || containerSize.width <= 0 || containerSize.height <= 0) return;
    const pad = CANVAS_PADDING_PX * 2;
    const reportedW = Math.round(naturalWidth * zoom) + pad;
    const reportedH = Math.round(naturalHeight * zoom);
    const last = lastReportedSizeRef.current;
    if (!last || last.w !== reportedW || last.h !== reportedH) {
      lastReportedSizeRef.current = { w: reportedW, h: reportedH };
      onNaturalSize?.(reportedW, reportedH);
    }
  }, [fill, imageLoaded, naturalWidth, naturalHeight, containerSize, zoom, onNaturalSize]);

  // Auto-scroll to annotation on first fit — runs once per image load.
  // Uses rAF to wait for the DOM to reflow at the new zoom level.
  useEffect(() => {
    if (!fill || !imageLoaded || !naturalWidth || !naturalHeight) return;
    if (!containerSize || containerSize.width <= 0 || containerSize.height <= 0) return;
    if (hasAutoScrolledToAnnotationRef.current || manualZoom !== null) return;

    const scrollItem = scrollTarget ?? effectivePhraseItem;
    if (!scrollItem || !renderScale) return;

    hasAutoScrolledToAnnotationRef.current = true;
    const effectiveZoom = zoom;
    const rafId = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const target = computeAnnotationScrollTarget(
        scrollItem,
        renderScale,
        naturalWidth,
        naturalHeight,
        effectiveZoom,
        container.clientWidth,
        container.clientHeight,
      );
      if (target) {
        const sl = target.scrollLeft + CANVAS_PADDING_PX;
        const st = target.scrollTop + CANVAS_PADDING_PX;
        container.scrollLeft = sl;
        container.scrollTop = st;
        annotationScrollTarget.current = { left: sl, top: st };
        setLocateDirty(false);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    fill,
    imageLoaded,
    naturalWidth,
    naturalHeight,
    containerSize,
    manualZoom,
    zoom,
    scrollTarget,
    effectivePhraseItem,
    renderScale,
    containerRef,
  ]);

  // Clamp helper — shared by buttons, slider, pinch, and wheel.
  // Uses zoomFloor (not EXPANDED_ZOOM_MIN) so the lower bound respects the
  // fit-to-screen zoom on narrow viewports where it may be < 50%.
  const clampZoom = useCallback(
    (z: number) => {
      return Math.max(zoomFloor, Math.min(EXPANDED_ZOOM_MAX, Math.round(z * 100) / 100));
    },
    [zoomFloor],
  );

  // Raw clamp without rounding — used during gestures for continuous scaling.
  // Rounding to 1% steps during a 60fps gesture creates visible stepping;
  // the final commit via clampZoom() still snaps to the nearest percent.
  const clampZoomRaw = useCallback((z: number) => Math.max(zoomFloor, Math.min(EXPANDED_ZOOM_MAX, z)), [zoomFloor]);

  // Scroll the container so the annotation is centered in view (re-center after pan/zoom).
  // Prefers anchor text position when it will be highlighted.
  const handleScrollToAnnotation = useCallback(() => {
    const scrollItem = scrollTarget ?? effectivePhraseItem;
    if (!containerRef.current || !scrollItem || !renderScale || !naturalWidth || !naturalHeight) return;
    // Restore the overlay when re-centering on the annotation
    setOverlayHidden(false);
    const container = containerRef.current;
    const target = computeAnnotationScrollTarget(
      scrollItem,
      renderScale,
      naturalWidth,
      naturalHeight,
      zoomRef.current,
      container.clientWidth,
      container.clientHeight,
    );
    if (target) {
      // Offset by canvas padding — image starts at CANVAS_PADDING_PX inside the shell.
      const sl = target.scrollLeft + CANVAS_PADDING_PX;
      const st = target.scrollTop + CANVAS_PADDING_PX;
      annotationScrollTarget.current = { left: sl, top: st };
      isAnimatingScroll.current = true;
      setLocateDirty(false);
      // Use immediate programmatic scrolling for recenter actions. Browser-defined
      // "smooth" timing is too slow/variable for this secondary control.
      container.scrollTo({ left: sl, top: st, behavior: "auto" });
      // Ensure guard clears even if no scroll event fires (already at target).
      requestAnimationFrame(() => {
        isAnimatingScroll.current = false;
      });
    }
  }, [scrollTarget, effectivePhraseItem, containerRef, renderScale, naturalWidth, naturalHeight]);

  // Scroll listener for locate dirty-bit detection.
  // Compares current scroll position against the stored annotation target.
  // During programmatic re-centers (isAnimatingScroll), we wait briefly for
  // the target write before enabling drift detection.
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref object from useDragToPan — its identity never changes
  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const target = annotationScrollTarget.current;
      if (!target) return;
      const dx = Math.abs(el.scrollLeft - target.left);
      const dy = Math.abs(el.scrollTop - target.top);
      if (isAnimatingScroll.current) {
        // Still animating — check if we've arrived near the target
        if (dx < DRIFT_THRESHOLD_PX && dy < DRIFT_THRESHOLD_PX) {
          isAnimatingScroll.current = false;
        }
        return;
      }
      // Not animating: if scroll has drifted beyond threshold, mark dirty
      if (dx > DRIFT_THRESHOLD_PX || dy > DRIFT_THRESHOLD_PX) {
        setLocateDirty(true);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      isAnimatingScroll.current = false;
      annotationScrollTarget.current = null;
    };
  }, [fill]);

  // ---------------------------------------------------------------------------
  // GPU-accelerated wheel zoom (scroll-to-zoom).
  // Drag-to-pan is handled separately by useDragToPan.
  // Uses useWheelZoom hook: CSS transform during gesture, commits on 150ms debounce.
  // ---------------------------------------------------------------------------
  useWheelZoom({
    enabled: fill && imageLoaded,
    sensitivity: WHEEL_ZOOM_SENSITIVITY,
    containerRef: containerRef as React.RefObject<HTMLElement | null>,
    wrapperRef: imageWrapperRef,
    zoom,
    clampZoomRaw,
    clampZoom,
    gestureAnchorRef: expandedWheelAnchorRef,
    onZoomCommit: (z: number) => {
      setManualZoom(z);
    },
  });

  // ---------------------------------------------------------------------------
  // GPU-accelerated touch pinch-to-zoom (two-finger gesture).
  // Same pattern: CSS transform during gesture, commit on touchEnd.
  // Anchor updates continuously to follow the midpoint between fingers.
  // ---------------------------------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef/imageWrapperRef are stable ref objects — their identity never changes
  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;

    let initialDistance: number | null = null;
    let initialZoom = 1;
    // Guard against queued touchend events firing after effect cleanup.
    // removeEventListener prevents new events but already-queued callbacks can
    // still run. Setting this flag in the cleanup function prevents stale
    // touchGestureZoomRef/imageWrapperRef accesses after the refs are cleared.
    let gestureCleanedUp = false;

    const getTouchDistance = (touches: TouchList): number => {
      const [a, b] = [touches[0], touches[1]];
      if (!a || !b) return 0;
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getTouchMidpoint = (touches: TouchList): { x: number; y: number } => {
      const [a, b] = [touches[0], touches[1]];
      if (!a || !b) return { x: 0, y: 0 };
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dist = getTouchDistance(e.touches);
        if (dist < Number.EPSILON || !Number.isFinite(dist)) return;
        initialDistance = dist;
        initialZoom = zoomRef.current;
        const wrapper = imageWrapperRef.current;
        if (wrapper) {
          wrapper.style.willChange = "transform";
          wrapper.style.transformOrigin = "0 0";
        }
        // Capture anchor BEFORE any transform is applied. getBoundingClientRect()
        // here reflects true layout position (no transform yet), so wrapperOffsetLeft/Top
        // are correct. Capturing once and keeping fixed prevents the feedback loop
        // where each frame re-reads a rect already shifted by the previous transform.
        const rect = el.getBoundingClientRect();
        const mid = getTouchMidpoint(e.touches);
        const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : rect;
        touchGestureAnchorRef.current = {
          mx: mid.x - rect.left,
          my: mid.y - rect.top,
          sx: el.scrollLeft,
          sy: el.scrollTop,
          startZoom: initialZoom,
          wrapperOffsetLeft: wrapperRect.left - rect.left + el.scrollLeft,
          wrapperOffsetTop: wrapperRect.top - rect.top + el.scrollTop,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initialDistance === null) return;
      e.preventDefault(); // prevent native scroll while pinching

      const wrapper = imageWrapperRef.current;
      if (!wrapper || !touchGestureAnchorRef.current) return;

      const currentDistance = getTouchDistance(e.touches);
      const scale = currentDistance / initialDistance;
      // Raw clamp (no rounding) for continuous GPU scaling during gesture
      const newZoom = clampZoomRaw(initialZoom * scale);

      touchGestureZoomRef.current = newZoom;

      // Use the anchor captured at gesture start — fixed origin, no drift
      applyGestureTransform(wrapper, newZoom, zoomRef.current, touchGestureAnchorRef.current);
    };

    const onTouchEnd = () => {
      if (gestureCleanedUp) return;
      initialDistance = null;
      const wrapper = imageWrapperRef.current;
      const finalZoom = touchGestureZoomRef.current;
      if (finalZoom !== null) {
        touchGestureZoomRef.current = null;
        setManualZoom(clampZoom(finalZoom));
      }
      if (wrapper) {
        wrapper.style.transform = "";
        wrapper.style.willChange = "";
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      gestureCleanedUp = true;
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      // Clear gesture refs so a remount doesn't read stale anchor data.
      touchGestureZoomRef.current = null;
      touchGestureAnchorRef.current = null;
    };
  }, [fill, clampZoom, clampZoomRaw]);

  // ---------------------------------------------------------------------------
  // Gesture commit: runs after React renders the new zoom → width change.
  // useLayoutEffect fires after DOM mutations but before browser paint, so we can:
  // 1. Remove the CSS transform (layout already reflects the new width)
  // 2. Compute scroll correction from the gesture anchor
  // Both happen in the same paint frame — no visual flash.
  // ---------------------------------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef/imageWrapperRef/expandedWheelAnchorRef/touchGestureAnchorRef are stable ref objects
  useLayoutEffect(() => {
    const wrapper = imageWrapperRef.current;
    // Always clear any residual transform when zoom commits
    if (wrapper) wrapper.style.transform = "";

    // Pick whichever gesture anchor is active (touch pinch or wheel zoom hook)
    const anchor = touchGestureAnchorRef.current ?? expandedWheelAnchorRef.current;
    const el = containerRef.current;
    if (!anchor || !el) {
      touchGestureAnchorRef.current = null;
      expandedWheelAnchorRef.current = null;
      return;
    }

    // Compute scroll correction: keep the anchor point visually stable.
    // wx/wy = wrapper-relative content coords under the anchor at gesture start.
    // ratio  = new zoom / start zoom — how much content coords have scaled.
    // newMarginLeft = centering margin at the new zoom level.
    // canvasPad    = shell padding offset (fill mode only).
    // Final scroll = canvasPad + margin + scaled wrapper-coord − viewport-local anchor offset.
    const startZoom = anchor.startZoom;
    if (startZoom > 0) {
      const ratio = zoom / startZoom;
      const wx = anchor.mx + anchor.sx - (anchor.wrapperOffsetLeft ?? 0);
      const wy = anchor.my + anchor.sy - (anchor.wrapperOffsetTop ?? 0);

      const cPad = fill ? CANVAS_PADDING_PX : 0;
      const newZoomedWidth = naturalWidth ? naturalWidth * zoom : 0;
      const newAvailableWidth = el.clientWidth - cPad * 2;
      const newMarginLeft =
        newZoomedWidth > 0 && newZoomedWidth < newAvailableWidth
          ? Math.round((newAvailableWidth - newZoomedWidth) / 2)
          : 0;

      // Clamp to scrollable bounds — prevents overshoot during rapid zoom changes.
      const rawLeft = cPad + newMarginLeft + wx * ratio - anchor.mx;
      const rawTop = cPad + wy * ratio - anchor.my;
      el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, rawLeft));
      el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, rawTop));
    }
    touchGestureAnchorRef.current = null;
    expandedWheelAnchorRef.current = null;
  }, [zoom]);

  // Compute effective image width for zoom
  const zoomedWidth = fill && naturalWidth ? naturalWidth * zoom : undefined;

  // Centering margin is currently always 0 (padding logic removed; kept as a
  // named constant so the JSX spread below reads clearly).
  const centeringMarginLeft = 0;

  // Show zoom controls in fill mode when image has loaded
  const showZoomControls = fill && imageLoaded && naturalWidth !== null;
  // Locate button shows when we are capable of drawing an overlay (annotation + renderScale exist).
  // Stays visible even when the overlay is currently dismissed (effectiveOverlayHidden).
  const showScrollToAnnotation = showZoomControls && !!effectivePhraseItem && !!renderScale;

  // Compute transform-origin from annotation position (fill mode only).
  // Prefers anchor text center when it will be highlighted.
  // Inline computation (no useMemo) — computeAnnotationOriginPercent is pure
  // arithmetic, cheaper than the overhead of a hook in this effect-heavy component.
  const annotationOriginItem =
    fill && renderScale && naturalWidth && naturalHeight ? (scrollTarget ?? effectivePhraseItem) : null;
  const annotationOrigin =
    annotationOriginItem && renderScale && naturalWidth && naturalHeight
      ? computeAnnotationOriginPercent(annotationOriginItem, renderScale, naturalWidth, naturalHeight)
      : null;

  // Annotation rect as CSS percentages — used as the View Transition anchor
  // in fill mode so the VT geometry morph tracks the annotation region instead
  // of the whole page container. When null, falls back to container-level VT.
  const annotationVtRect =
    fill && effectivePhraseItem && renderScale && naturalWidth && naturalHeight
      ? toPercentRect(effectivePhraseItem, renderScale, naturalWidth, naturalHeight)
      : null;

  const handleExpandToPage = useCallback(() => {
    onExpand?.();
  }, [onExpand]);

  const handleCollapse = useCallback(() => {
    onCollapse();
  }, [onCollapse]);

  const handleOverlayDismiss = useCallback(() => {
    setOverlayHidden(true);
    // Emphasize the locate button so the user sees where to restore the overlay.
    // locateDirty makes it prominent (blue, high opacity); locatePulseKey fires
    // the scale+color pulse animation to draw the eye.
    setLocateDirty(true);
    setLocatePulseKey(prev => prev + 1);
  }, []);

  const footerEl = (
    <div className="bg-white dark:bg-gray-900 rounded-b-sm border border-t-0 border-gray-200 dark:border-gray-700">
      <EvidenceTrayFooter
        verifiedAt={verification?.verifiedAt}
        onPageClick={fill ? undefined : handleExpandToPage}
        pageNumberForCta={pageNumberForCta}
        pageCtaLabel={expandCtaLabel}
      />
    </div>
  );

  return (
    <div
      className={cn("relative mx-3 mb-3", fill && "flex flex-col flex-1 min-h-0")}
      style={
        fill
          ? undefined // fill mode: container fills popover width, image scrolls inside
          : zoomedWidth
            ? { maxWidth: zoomedWidth }
            : naturalWidth
              ? { maxWidth: naturalWidth }
              : undefined
      }
    >
      {/* Wrapper: relative so zoom controls can be positioned absolutely over the scroll area */}
      <div className={cn("relative", fill && "flex flex-col flex-1 min-h-0")}>
        {/* Scrollable image area — click (no drag) collapses */}
        <div
          ref={containerRef}
          data-dc-inline-expanded=""
          role="button"
          tabIndex={0}
          aria-label={t("aria.expandedImageViewer")}
          className={cn(
            "relative select-none overflow-auto rounded-t-sm",
            DOCUMENT_CANVAS_BG_CLASSES,
            // Top+sides border completes the box started by the footer's border-t-0.
            // Matches EvidenceTray's EVIDENCE_TRAY_BORDER_SOLID so the transition is seamless.
            !fill && "border border-b-0 border-gray-200 dark:border-gray-700",
            fill && "flex-1 min-h-0",
          )}
          style={{
            // VT name placement depends on transition direction:
            //
            // COLLAPSE (or no annotation data): VT name goes to the annotation
            // marker (if available) so the geometry morph tracks the annotation
            // region → keyhole strip. Falls back here when no marker exists.
            //
            // PAGE EXPAND: VT name STAYS on this scroll container even when an
            // annotation marker exists. This ensures the NEW VT snapshot has
            // visible image content (the full page). Without this, the transparent
            // marker produces an invisible NEW snapshot and the VT animation has
            // nothing to show. The data-dc-page-expand attribute is set on <html>
            // synchronously before the VT callback, so reading it during the
            // flushSync render is deterministic and safe.
            ...(!annotationVtRect ||
            (typeof document !== "undefined" && "dcPageExpand" in document.documentElement.dataset)
              ? { viewTransitionName: DC_EVIDENCE_VT_NAME }
              : {}),
            ...(fill ? {} : { maxHeight: "min(600px, 80dvh)" }),
            overscrollBehavior: "none",
            cursor: isDragging ? "move" : "zoom-out",
            ...HIDE_SCROLLBAR_STYLE,
          }}
          onDragStart={e => e.preventDefault()}
          onClick={e => {
            e.stopPropagation();
            if (wasDraggingRef.current) {
              wasDraggingRef.current = false;
              return;
            }
            handleCollapse();
          }}
          onKeyDown={e => {
            if (e.key === "Escape") {
              // Collapse the expanded image and stop event propagation.
              // preventDefault() prevents the browser's default Escape action.
              // stopPropagation() prevents the native event from reaching the
              // document-level listener in Popover.tsx.  Without this, React 18
              // flushes the viewState→"summary" update synchronously (discrete
              // event batch), and by the time the document handler fires, the
              // ref reads "summary" — hitting the "close popover" branch instead
              // of the "step back" branch.
              e.preventDefault();
              e.stopPropagation();
              handleCollapse();
              return;
            }
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              handleCollapse();
              return;
            }
            // A.5.4 Arrow key panning for expanded-page: Shift = large pan (200px), default = 50px.
            const el = containerRef.current;
            if (!el) return;
            const step = e.shiftKey ? 200 : 50;
            switch (e.key) {
              case "ArrowLeft":
                el.scrollLeft -= step;
                e.preventDefault();
                break;
              case "ArrowRight":
                el.scrollLeft += step;
                e.preventDefault();
                break;
              case "ArrowUp":
                el.scrollTop -= step;
                e.preventDefault();
                break;
              case "ArrowDown":
                el.scrollTop += step;
                e.preventDefault();
                break;
            }
          }}
          {...panHandlers}
        >
          <style>{`[data-dc-inline-expanded]::-webkit-scrollbar { display: none; }`}</style>
          {/* Keyed on src: remounts on image swaps (evidence ↔ page).
              In fill mode with an annotation, the scale animation originates from the annotation
              position via transform-origin, creating a "zoom from annotation" visual effect. */}
          <div
            key={src}
            ref={animatedShellRef}
            style={{
              // VT name lives on containerRef (above) or the annotation marker (below).
              // Not on this shell — its unconstrained height would overshoot.
              ...(annotationOrigin
                ? { transformOrigin: `${annotationOrigin.xPercent}% ${annotationOrigin.yPercent}%` }
                : undefined),
              // Canvas padding: inline-block + min-width:100% so the shell fills
              // the container when the image is small but expands when it overflows,
              // keeping grey padding on all four sides of the page image.
              ...(fill ? { display: "block" } : undefined),
            }}
          >
            {!imageLoaded &&
              (expectedDimensions ? (
                <div
                  className="animate-pulse rounded bg-gray-200 dark:bg-gray-700"
                  style={{
                    width: "100%",
                    aspectRatio: `${expectedDimensions.width} / ${expectedDimensions.height}`,
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-24">
                  <span className="size-5 animate-spin text-gray-400">
                    <SpinnerIcon />
                  </span>
                </div>
              ))}
            {/* Relative wrapper: positions annotation overlay exactly over the image.
                During pinch/wheel gestures, CSS transform: scale() is applied to this div
                (via imageWrapperRef) so both the image and overlay scale together on the GPU. */}
            <div
              ref={imageWrapperRef}
              style={{
                position: "relative",
                display: "inline-block",
                ...(zoomedWidth !== undefined ? { width: zoomedWidth } : {}),
                ...(centeringMarginLeft > 0 ? { marginLeft: centeringMarginLeft } : {}),
              }}
            >
              <img
                ref={expandedImgRef}
                src={isValidProofImageSrc(src) ? src : undefined}
                alt={t("aria.verificationEvidence")}
                className={cn("block", DOCUMENT_IMAGE_EDGE_CLASSES, !imageLoaded && "hidden")}
                style={zoomedWidth !== undefined ? { width: zoomedWidth, maxWidth: "none" } : { maxWidth: "none" }}
                onLoad={e => {
                  if (imageLoaded) return; // Already sync-detected from cache
                  const w = e.currentTarget.naturalWidth;
                  const h = e.currentTarget.naturalHeight;
                  setImageLoaded(true);
                  setNaturalWidth(w);
                  setNaturalHeight(h);
                  // In fill mode, defer reporting to the fit-to-screen effect so the
                  // popover gets zoomed (displayed) dimensions, not the natural pixel
                  // width which would make the popover expand to nearly full viewport.
                  if (!fill) onNaturalSize?.(w, h);
                }}
                onError={e => {
                  setImageLoaded(true); // exit spinner so the component doesn't hang
                  handleImageError(e); // hide broken-image browser icon
                }}
                draggable={false}
              />
              {imageLoaded &&
                renderScale &&
                naturalWidth &&
                naturalHeight &&
                effectivePhraseItem &&
                !effectiveOverlayHidden && (
                  <CitationAnnotationOverlay
                    phraseMatchDeepItem={effectivePhraseItem}
                    renderScale={renderScale}
                    imageNaturalWidth={naturalWidth}
                    imageNaturalHeight={naturalHeight}
                    highlightColor={verification?.highlightColor}
                    anchorTextDeepItem={effectiveAnchorItem}
                    anchorText={verification?.verifiedAnchorText}
                    fullPhrase={verification?.verifiedFullPhrase}
                    onDismiss={fill ? handleOverlayDismiss : undefined}
                  />
                )}
              {/* View Transition anchor: positioned at the annotation rect so the
                  VT geometry morph tracks the annotation region between views.
                  The keyhole strip's VT name covers the evidence crop; this marker
                  covers the corresponding region on the full page. The browser
                  morphs between the two rects, creating a "fly to position" effect.
                  During PAGE EXPAND, the VT name stays on the scroll container
                  (above) so the NEW snapshot has visible content — the marker is
                  rendered but without a VT name. During COLLAPSE, the marker gets
                  the VT name so the geometry tracks annotation → keyhole. */}
              {annotationVtRect && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    ...annotationVtRect,
                    // VT name only during collapse — page expand keeps it on the scroll container.
                    ...(typeof document !== "undefined" && "dcPageExpand" in document.documentElement.dataset
                      ? {}
                      : { viewTransitionName: DC_EVIDENCE_VT_NAME }),
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </div>
          {/* In fill mode, footer sits inside the scroll area right below the page image */}
          {fill && footerEl}
        </div>

        {showZoomControls && (
          <ZoomToolbar
            zoom={zoom}
            onZoomChange={z => {
              setManualZoom(clampZoom(z));
            }}
            zoomFloor={zoomFloor}
            zoomStep={EXPANDED_ZOOM_STEP}
            showLocate={showScrollToAnnotation}
            onLocate={handleScrollToAnnotation}
            locateDirty={locateDirty}
            locatePulseKey={locatePulseKey}
          />
        )}
      </div>
      {/* In non-fill mode, footer stays outside the scroll area so it's always visible */}
      {!fill && footerEl}
    </div>
  );
}
