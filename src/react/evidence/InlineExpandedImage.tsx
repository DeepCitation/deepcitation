import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type HighlightColor, isStrategyOverride, shouldHighlightAnchorText } from "../../drawing/citationDrawing.js";
import type { DeepTextItem } from "../../types/boxes.js";
import type { Verification } from "../../types/verification.js";
import { CitationAnnotationOverlay } from "../CitationAnnotationOverlay.js";
import { getStatusFromVerification } from "../citationStatus.js";
import {
  DOCUMENT_CANVAS_BG_CLASSES,
  DOCUMENT_IMAGE_EDGE_CLASSES,
  EXPANDED_IMAGE_SHELL_PX,
  EXPANDED_MIN_READABLE_ZOOM,
  EXPANDED_ZOOM_MAX,
  EXPANDED_ZOOM_MIN,
  EXPANDED_ZOOM_STEP,
  HIDE_SCROLLBAR_STYLE,
  isValidProofImageSrc,
  WHEEL_ZOOM_SENSITIVITY,
} from "../constants.js";
import { useDragToPan } from "../hooks/useDragToPan.js";
import { applyGestureTransform, useWheelZoom, type WheelZoomAnchor } from "../hooks/useWheelZoom.js";
import { useTranslation } from "../i18n.js";
import { SpinnerIcon } from "../icons.js";
import { handleImageError } from "../imageUtils.js";
import { computeAnnotationOriginPercent, computeAnnotationScrollTarget, toPercentRect } from "../overlayGeometry.js";
import { useImageDarkness } from "../useImageDarkness.js";
import { cn, isImageSource } from "../utils.js";
import { DC_EVIDENCE_VT_NAME, primeEvidencePageExpandSource } from "../viewTransition.js";
import { ZoomToolbar } from "../ZoomToolbar.js";
import { EvidenceTrayFooter } from "./EvidenceTray.js";
import { IDENTITY_RENDER_SCALE, resolveEvidenceSourceAnchorRatio } from "./resolvers.js";
import { useRetryPendingRender } from "./useRetryPendingRender.js";

/** Scroll drift threshold for locate dirty-bit detection (px). */
const DRIFT_THRESHOLD_PX = 15;

/** Grey canvas padding (px) around the page image in expanded-page (fill) mode. */
const CANVAS_PADDING_PX = 16;

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
  /** Override: injects a single anchor item in place of the server-provided array. */
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
  const {
    effectiveSrc: retrySrc,
    isRetrying,
    onImageLoaded: onRetryImageLoaded,
  } = useRetryPendingRender(src, expectedDimensions);
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

  // Overlay bracket color derived from verification status (green/amber/red).
  // Memoized: getStatusFromVerification walks searchAttempts, and this component
  // re-renders at 60fps during zoom/pan — verification is stable across those renders.
  const overlayHighlightColor = useMemo((): HighlightColor => {
    const s = getStatusFromVerification(verification);
    return s.isMiss ? "red" : s.isPartialMatch ? "amber" : "green";
  }, [verification]);

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
  const effectiveAnchorItems = anchorItem ? [anchorItem] : (verification?.document?.anchorTextMatchDeepItems ?? null);

  // The server always provides coordinates in PDF convention (bottom-up Y) for both
  // PDFs and images. For images, renderScale is 1:1 (pixel coords) — the server sets
  // this in generateImageVerificationImage, but it may be absent in the frontend data.
  // Default to identity when the source is an image and renderScale is missing.
  const effectiveRenderScale = renderScale ?? (isImageSource(verification) ? IDENTITY_RENDER_SCALE : null);

  // viewBoxOriginY corrects highlight Y-offset on PDF pages where CropBox doesn't start at y=0.
  const viewBoxOriginY = verification?.document?.viewBoxOriginY;

  // Detect dark page content so the overlay can flip to a light color.
  const isDarkContent = useImageDarkness(
    expandedImgRef.current,
    imageLoaded,
    effectivePhraseItem,
    effectiveRenderScale,
    "pdf",
    viewBoxOriginY,
  );

  // Anchor-aware scroll/zoom target: when anchor text is highlighted, center on it
  // instead of the (potentially wider) full phrase box.
  const vAnchor = verification?.verifiedAnchorText;
  const vPhrase = verification?.verifiedFullPhrase;
  const anchorHighlightActive =
    effectiveAnchorItems?.[0] &&
    (shouldHighlightAnchorText(vAnchor, vPhrase) ||
      (isStrategyOverride(vAnchor, vPhrase) && shouldHighlightAnchorText(vAnchor, effectivePhraseItem?.text)));
  const scrollTarget = anchorHighlightActive ? effectiveAnchorItems[0] : effectivePhraseItem;
  const sourceAnchorRatio = useMemo(
    () => (!fill ? resolveEvidenceSourceAnchorRatio(verification) : null),
    [fill, verification],
  );

  // Track container size via ResizeObserver (both width and height for fit-to-screen).
  // When the container transitions from display:none (zero) to visible (positive),
  // reset the auto-scroll guard so annotation scroll + pageExpandReady re-settle.
  const prevContainerVisibleRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef and prevContainerVisibleRef are stable refs — identity never changes
  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        const wasVisible = prevContainerVisibleRef.current;
        prevContainerVisibleRef.current = true;
        if (!wasVisible) {
          // Container just became visible (display:none → visible).
          // Reset scroll guards so the auto-scroll effect re-runs and
          // pageExpandReady reflects the freshly settled annotation position.
          hasAutoScrolledToAnnotationRef.current = false;
          setPageExpandReady(false);
        }
        setContainerSize({ width: rect.width, height: rect.height });
      } else {
        prevContainerVisibleRef.current = false;
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
    setPageExpandReady(false);
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
      if (onRetryImageLoaded(img.naturalWidth, img.naturalHeight)) return; // Placeholder cached — poll
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
  const [pageExpandReady, setPageExpandReady] = useState(false);
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
    if (!scrollItem || !effectiveRenderScale) return;

    hasAutoScrolledToAnnotationRef.current = true;
    setPageExpandReady(false);
    const effectiveZoom = zoom;
    let settleRafId = 0;
    const rafId = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const target = computeAnnotationScrollTarget(
        scrollItem,
        effectiveRenderScale,
        naturalWidth,
        naturalHeight,
        effectiveZoom,
        container.clientWidth,
        container.clientHeight,
        undefined,
        viewBoxOriginY,
      );
      if (target) {
        const sl = target.scrollLeft + CANVAS_PADDING_PX;
        const st = target.scrollTop + CANVAS_PADDING_PX;
        container.scrollLeft = sl;
        container.scrollTop = st;
        annotationScrollTarget.current = { left: sl, top: st };
        setLocateDirty(false);
        settleRafId = requestAnimationFrame(() => {
          setPageExpandReady(true);
        });
      }
    });
    return () => {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(settleRafId);
    };
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
    effectiveRenderScale,
    containerRef,
    viewBoxOriginY,
  ]);

  useEffect(() => {
    if (!fill || !imageLoaded) return;
    const scrollItem = scrollTarget ?? effectivePhraseItem;
    if (manualZoom !== null || !scrollItem || !effectiveRenderScale) {
      // No annotation to auto-scroll to. If a keyhole viewport position is
      // available (miss/not_found with page preview), scroll the expanded page
      // to show the same region the user was viewing in the keyhole. This must
      // happen before the ghost target is computed via rAF polling so the
      // viewport-based fallback target reflects the correct scroll position.
      //
      // Guard on manualZoom === null (not a ref-equality one-shot) so the scroll
      // re-applies when zoom settles from the initial fallback (1) to the real
      // fittedZoom — the ResizeObserver that measures containerSize may not have
      // fired yet on the first effect run after display:none → visible.
      // Once the user sets manualZoom (pinch/wheel), we stop overriding.
      if (initialScroll && manualZoom === null) {
        const el = containerRef.current;
        if (el) {
          void el.scrollHeight; // Force reflow after display:none → visible
          el.scrollLeft = initialScroll.left * zoom + CANVAS_PADDING_PX;
          el.scrollTop = initialScroll.top * zoom + CANVAS_PADDING_PX;
        }
      }
      setPageExpandReady(true);
    }
  }, [
    fill,
    imageLoaded,
    manualZoom,
    scrollTarget,
    effectivePhraseItem,
    effectiveRenderScale,
    initialScroll,
    zoom,
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
    if (!containerRef.current || !scrollItem || !effectiveRenderScale || !naturalWidth || !naturalHeight) return;
    // Restore the overlay when re-centering on the annotation
    setOverlayHidden(false);
    const container = containerRef.current;
    const target = computeAnnotationScrollTarget(
      scrollItem,
      effectiveRenderScale,
      naturalWidth,
      naturalHeight,
      zoomRef.current,
      container.clientWidth,
      container.clientHeight,
      undefined,
      viewBoxOriginY,
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
  }, [
    scrollTarget,
    effectivePhraseItem,
    containerRef,
    effectiveRenderScale,
    naturalWidth,
    naturalHeight,
    viewBoxOriginY,
  ]);

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
    requireCtrl: true,
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

  // Show zoom controls in fill mode when image has loaded
  const showZoomControls = fill && imageLoaded && naturalWidth !== null;
  // Locate button shows when we are capable of drawing an overlay (annotation + renderScale exist).
  // Stays visible even when the overlay is currently dismissed (effectiveOverlayHidden).
  const showScrollToAnnotation = showZoomControls && !!effectivePhraseItem && !!effectiveRenderScale;

  // Compute transform-origin from annotation position (fill mode only).
  // Prefers anchor text center when it will be highlighted.
  // Inline computation (no useMemo) — computeAnnotationOriginPercent is pure
  // arithmetic, cheaper than the overhead of a hook in this effect-heavy component.
  const annotationOriginItem =
    fill && effectiveRenderScale && naturalWidth && naturalHeight ? (scrollTarget ?? effectivePhraseItem) : null;
  const annotationOrigin =
    annotationOriginItem && effectiveRenderScale && naturalWidth && naturalHeight
      ? computeAnnotationOriginPercent(
          annotationOriginItem,
          effectiveRenderScale,
          naturalWidth,
          naturalHeight,
          undefined,
          viewBoxOriginY,
        )
      : null;
  // VT geometry target: always use the full phrase rect so the View Transition
  // morph envelope matches the visible overlay size on both expand and collapse.
  // (scrollTarget may be the smaller anchor text — fine for scroll centering,
  // but the VT rect must cover the full phrase to avoid starting from a smaller box.)
  const annotationTargetItem = fill && effectiveRenderScale ? effectivePhraseItem : null;
  const annotationTargetNaturalWidth =
    annotationTargetItem && effectiveRenderScale ? annotationTargetItem.width * effectiveRenderScale.x : null;
  const annotationTargetNaturalHeight =
    annotationTargetItem && effectiveRenderScale ? annotationTargetItem.height * effectiveRenderScale.y : null;

  // Annotation rect as CSS percentages — used as the View Transition anchor
  // in fill mode so the VT geometry morph tracks the annotation region instead
  // of the whole page container. When null, falls back to container-level VT.
  const annotationBaseDimensions =
    naturalWidth && naturalHeight
      ? { width: naturalWidth, height: naturalHeight }
      : expectedDimensions && expectedDimensions.width > 0 && expectedDimensions.height > 0
        ? expectedDimensions
        : null;
  const annotationVtRect =
    fill && annotationTargetItem && effectiveRenderScale && annotationBaseDimensions
      ? toPercentRect(
          annotationTargetItem,
          effectiveRenderScale,
          annotationBaseDimensions.width,
          annotationBaseDimensions.height,
          undefined,
          viewBoxOriginY,
        )
      : null;
  const pageExpandTargetReady = !!fill && !!annotationVtRect && !!imageLoaded && pageExpandReady;

  const handleExpandToPage = useCallback(() => {
    primeEvidencePageExpandSource(containerRef.current);
    onExpand?.();
  }, [onExpand, containerRef]);

  const handleOverlayDismiss = useCallback(() => {
    setOverlayHidden(true);
    // Emphasize the locate button so the user sees where to restore the overlay.
    // locateDirty makes it prominent (blue, high opacity); locatePulseKey fires
    // the scale+color pulse animation to draw the eye.
    setLocateDirty(true);
    setLocatePulseKey(prev => prev + 1);
  }, []);

  const footerEl = (
    <div className="bg-dc-background rounded-b-sm border border-t-0 border-dc-border">
      <EvidenceTrayFooter
        verifiedAt={verification?.verifiedAt}
        onPageClick={fill || !onExpand ? undefined : handleExpandToPage}
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
          {...(fill && !(scrollTarget ?? effectivePhraseItem)
            ? { "data-dc-no-annotation": "" }
            : !fill && onExpand
              ? {
                  "data-dc-page-expand-source": "",
                  "data-dc-page-expand-source-kind": "expanded-keyhole" as const,
                  ...(sourceAnchorRatio && {
                    "data-dc-source-anchor-x": sourceAnchorRatio.x.toFixed(4),
                    "data-dc-source-anchor-y": sourceAnchorRatio.y.toFixed(4),
                  }),
                }
              : {})}
          role="button"
          tabIndex={0}
          aria-label={t("aria.expandedImageViewer")}
          className={cn(
            "relative select-none overflow-auto rounded-t-sm",
            DOCUMENT_CANVAS_BG_CLASSES,
            // Top+sides border completes the box started by the footer's border-t-0.
            // Matches EvidenceTray's EVIDENCE_TRAY_BORDER_SOLID so the transition is seamless.
            !fill && "border border-b-0 border-dc-border",
            fill && "flex-1 min-h-0",
          )}
          style={{
            // VT name placement depends on transition direction:
            //
            // COLLAPSE (or no annotation data): VT name goes to the annotation
            // marker (if available) so the geometry morph tracks the annotation
            // region → keyhole strip. Falls back here when no marker exists.
            //
            ...(!annotationVtRect ? { viewTransitionName: DC_EVIDENCE_VT_NAME } : {}),
            ...(fill ? {} : { maxHeight: "min(600px, 80dvh)" }),
            overscrollBehavior: "none",
            cursor: isDragging ? "grabbing" : "zoom-out",
            ...HIDE_SCROLLBAR_STYLE,
          }}
          onDragStart={e => e.preventDefault()}
          onClick={e => {
            e.stopPropagation();
            if (wasDraggingRef.current) {
              wasDraggingRef.current = false;
              return;
            }
            onCollapse();
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
              onCollapse();
              return;
            }
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onCollapse();
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
              (expectedDimensions && expectedDimensions.width > 0 && expectedDimensions.height > 0 ? (
                <div
                  className="animate-pulse rounded bg-dc-muted"
                  style={{
                    width: "100%",
                    aspectRatio: `${expectedDimensions.width} / ${expectedDimensions.height}`,
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-24">
                  <span className="size-5 animate-spin text-dc-subtle-foreground">
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
              }}
            >
              <img
                ref={expandedImgRef}
                src={isValidProofImageSrc(retrySrc) ? retrySrc : undefined}
                alt={t("aria.verificationEvidence")}
                className={cn("block", DOCUMENT_IMAGE_EDGE_CLASSES, !imageLoaded && "hidden")}
                style={zoomedWidth !== undefined ? { width: zoomedWidth, maxWidth: "none" } : { maxWidth: "none" }}
                onLoad={e => {
                  if (imageLoaded) return; // Already sync-detected from cache
                  const w = e.currentTarget.naturalWidth;
                  const h = e.currentTarget.naturalHeight;
                  if (onRetryImageLoaded(w, h)) return; // Placeholder detected — hook is polling
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
                effectiveRenderScale &&
                naturalWidth &&
                naturalHeight &&
                effectivePhraseItem &&
                !effectiveOverlayHidden && (
                  <CitationAnnotationOverlay
                    phraseMatchDeepItem={effectivePhraseItem}
                    renderScale={effectiveRenderScale}
                    imageNaturalWidth={naturalWidth}
                    imageNaturalHeight={naturalHeight}
                    highlightColor={overlayHighlightColor}
                    anchorTextDeepItems={verification?.status === "not_found" ? undefined : effectiveAnchorItems}
                    anchorText={verification?.verifiedAnchorText}
                    fullPhrase={verification?.verifiedFullPhrase}
                    onDismiss={fill ? handleOverlayDismiss : undefined}
                    isDark={isDarkContent}
                    viewBoxOriginY={viewBoxOriginY}
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
                  data-dc-page-expand-target=""
                  data-dc-page-expand-ready={pageExpandTargetReady ? "true" : "false"}
                  {...(annotationTargetNaturalWidth && annotationTargetNaturalHeight
                    ? {
                        "data-dc-target-natural-width": annotationTargetNaturalWidth,
                        "data-dc-target-natural-height": annotationTargetNaturalHeight,
                      }
                    : {})}
                  style={{
                    position: "absolute",
                    ...annotationVtRect,
                    viewTransitionName: DC_EVIDENCE_VT_NAME,
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
