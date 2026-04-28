import type React from "react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type HighlightColor, isStrategyOverride, shouldHighlightSourceMatch } from "../../drawing/citationDrawing.js";
import type { DeepTextItem } from "../../types/boxes.js";
import type { Verification } from "../../types/verification.js";
import { CitationAnnotationOverlay } from "../CitationAnnotationOverlay.js";
import { getStatusFromVerification } from "../citationStatus.js";
import {
  DOCUMENT_CANVAS_BG_CLASSES,
  EXPANDED_PAGE_CANVAS_PADDING_PX,
  EXPANDED_ZOOM_MAX,
  EXPANDED_ZOOM_MIN,
  EXPANDED_ZOOM_STEP,
  HIDE_SCROLLBAR_STYLE,
  WHEEL_ZOOM_SENSITIVITY,
} from "../constants.js";
import { useDragToPan } from "../hooks/useDragToPan.js";
import { applyGestureTransform, useWheelZoom, type WheelZoomAnchor } from "../hooks/useWheelZoom.js";
import { useTranslation } from "../i18n.js";
import { computeAnnotationOriginPercent, computeAnnotationScrollTarget, toPercentRect } from "../overlayGeometry.js";
import { cn, isImageSource } from "../utils.js";
import { DC_EVIDENCE_VT_NAME } from "../viewTransition.js";
import { ZoomToolbar } from "../ZoomToolbar.js";
import { computeExpandedPageFittedZoom } from "./expandedPageViewportGeometry.js";
import { IDENTITY_RENDER_SCALE } from "./resolvers.js";

const DRIFT_THRESHOLD_PX = 15;

function normalizeWheelDelta(event: WheelEvent): { x: number; y: number } {
  const pageHeight = typeof window !== "undefined" ? window.innerHeight : 768;
  const multiplier = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? pageHeight : 1;
  return {
    x: event.deltaX * multiplier,
    y: event.deltaY * multiplier,
  };
}

export interface ExpandedPageViewportRenderProps {
  scale: number;
}

export interface ExpandedPageViewportProps {
  width: number | null;
  height: number | null;
  renderScale?: { x: number; y: number } | null;
  verification?: Verification | null;
  onCollapse: () => void;
  children: (props: ExpandedPageViewportRenderProps) => ReactNode;
  footer?: ReactNode;
  contentKey?: React.Key;
  className?: string;
  ariaLabel?: string;
  highlightItem?: DeepTextItem | null;
  anchorItem?: DeepTextItem | null;
  initialOverlayHidden?: boolean;
  showOverlay?: boolean;
  initialScroll?: { left: number; top: number } | null;
  expectedDimensions?: { width: number; height: number } | null;
  onDisplayedSizeChange?: (width: number, height: number) => void;
  isDark?: boolean;
}

export function ExpandedPageViewport({
  width,
  height,
  renderScale,
  verification,
  onCollapse,
  children,
  footer,
  contentKey,
  className,
  ariaLabel,
  highlightItem,
  anchorItem,
  initialOverlayHidden = false,
  showOverlay,
  initialScroll,
  expectedDimensions,
  onDisplayedSizeChange,
  isDark,
}: ExpandedPageViewportProps) {
  const t = useTranslation();
  const { containerRef, isDragging, handlers: panHandlers, wasDraggingRef } = useDragToPan({ direction: "xy" });
  const contentWrapperRef = useRef<HTMLDivElement | null>(null);
  const touchGestureZoomRef = useRef<number | null>(null);
  const touchGestureAnchorRef = useRef<WheelZoomAnchor | null>(null);
  const wheelAnchorRef = useRef<WheelZoomAnchor | null>(null);
  const hasAutoScrolledRef = useRef(false);
  const annotationScrollTargetRef = useRef<{ left: number; top: number } | null>(null);
  const isAnimatingScrollRef = useRef(false);
  const prevContainerVisibleRef = useRef(false);
  const lastReportedSizeRef = useRef<{ w: number; h: number } | null>(null);
  const contentKeyRef = useRef(contentKey);

  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [overlayHidden, setOverlayHidden] = useState(initialOverlayHidden);
  const [locateDirty, setLocateDirty] = useState(false);
  const [locatePulseKey, setLocatePulseKey] = useState(0);
  const [pageExpandReady, setPageExpandReady] = useState(false);

  const contentReady = width != null && height != null && width > 0 && height > 0;
  const effectivePhraseItem = highlightItem ?? verification?.document?.sourceContextDeepItem ?? null;
  const effectiveAnchorItems = anchorItem ? [anchorItem] : (verification?.document?.sourceMatchDeepItems ?? null);
  const effectiveRenderScale = renderScale ?? (isImageSource(verification) ? IDENTITY_RENDER_SCALE : null);
  const viewBoxOriginY = verification?.document?.viewBoxOriginY;
  const effectiveOverlayHidden = showOverlay !== undefined ? !showOverlay : overlayHidden;

  const overlayHighlightColor = useMemo((): HighlightColor => {
    const s = getStatusFromVerification(verification);
    return s.isMiss ? "red" : s.isPartialMatch ? "amber" : "green";
  }, [verification]);

  const vAnchor = verification?.verifiedSourceMatch;
  const vPhrase = verification?.verifiedSourceContext;
  const anchorHighlightActive =
    effectiveAnchorItems?.[0] &&
    (shouldHighlightSourceMatch(vAnchor, vPhrase) ||
      (isStrategyOverride(vAnchor, vPhrase) && shouldHighlightSourceMatch(vAnchor, effectivePhraseItem?.text)));
  const scrollTarget = anchorHighlightActive ? effectiveAnchorItems[0] : effectivePhraseItem;

  const fittedZoom = useMemo(() => {
    return computeExpandedPageFittedZoom({
      contentReady,
      width,
      containerWidth: containerSize?.width ?? null,
    });
  }, [contentReady, width, containerSize]);

  const zoom = manualZoom ?? fittedZoom?.readable ?? 1;
  const zoomFloor = fittedZoom?.floor ?? EXPANDED_ZOOM_MIN;
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    contentKeyRef.current = contentKey;
    setOverlayHidden(initialOverlayHidden);
    setManualZoom(null);
    setLocateDirty(false);
    setLocatePulseKey(0);
    setPageExpandReady(false);
    hasAutoScrolledRef.current = false;
    annotationScrollTargetRef.current = null;
    touchGestureZoomRef.current = null;
    touchGestureAnchorRef.current = null;
    wheelAnchorRef.current = null;
    lastReportedSizeRef.current = null;
  }, [contentKey, initialOverlayHidden]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref from useDragToPan
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        const wasVisible = prevContainerVisibleRef.current;
        prevContainerVisibleRef.current = true;
        if (!wasVisible) {
          hasAutoScrolledRef.current = false;
          setPageExpandReady(false);
        }
        setContainerSize({ width: rect.width, height: rect.height });
      } else {
        prevContainerVisibleRef.current = false;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!contentReady || !containerSize || containerSize.width <= 0 || containerSize.height <= 0) return;
    const reportedW = Math.round(width * zoom) + EXPANDED_PAGE_CANVAS_PADDING_PX * 2;
    const reportedH = Math.round(height * zoom);
    const last = lastReportedSizeRef.current;
    if (!last || last.w !== reportedW || last.h !== reportedH) {
      lastReportedSizeRef.current = { w: reportedW, h: reportedH };
      onDisplayedSizeChange?.(reportedW, reportedH);
    }
  }, [contentReady, width, height, containerSize, zoom, onDisplayedSizeChange]);

  const clampZoom = useCallback(
    (z: number) => Math.max(zoomFloor, Math.min(EXPANDED_ZOOM_MAX, Math.round(z * 100) / 100)),
    [zoomFloor],
  );
  const clampZoomRaw = useCallback((z: number) => Math.max(zoomFloor, Math.min(EXPANDED_ZOOM_MAX, z)), [zoomFloor]);

  const handleScrollToAnnotation = useCallback(() => {
    const el = containerRef.current;
    const item = scrollTarget ?? effectivePhraseItem;
    if (!el || !item || !effectiveRenderScale || !contentReady) return;
    setOverlayHidden(false);
    const target = computeAnnotationScrollTarget(
      item,
      effectiveRenderScale,
      width,
      height,
      zoomRef.current,
      el.clientWidth,
      el.clientHeight,
      undefined,
      viewBoxOriginY,
    );
    if (!target) return;
    const sl = target.scrollLeft + EXPANDED_PAGE_CANVAS_PADDING_PX;
    const st = target.scrollTop + EXPANDED_PAGE_CANVAS_PADDING_PX;
    annotationScrollTargetRef.current = { left: sl, top: st };
    isAnimatingScrollRef.current = true;
    setLocateDirty(false);
    el.scrollTo({ left: sl, top: st, behavior: "auto" });
    requestAnimationFrame(() => {
      isAnimatingScrollRef.current = false;
    });
  }, [
    containerRef,
    scrollTarget,
    effectivePhraseItem,
    effectiveRenderScale,
    contentReady,
    width,
    height,
    viewBoxOriginY,
  ]);

  useEffect(() => {
    if (!contentReady || !containerSize || hasAutoScrolledRef.current || manualZoom !== null) return;
    const item = scrollTarget ?? effectivePhraseItem;
    if (!item || !effectiveRenderScale) {
      if (initialScroll) {
        const el = containerRef.current;
        if (el) {
          // Force layout so the first scroll write lands after display:none → visible.
          void el.scrollHeight;
          el.scrollLeft = initialScroll.left * zoom + EXPANDED_PAGE_CANVAS_PADDING_PX;
          el.scrollTop = initialScroll.top * zoom + EXPANDED_PAGE_CANVAS_PADDING_PX;
        }
      }
      setPageExpandReady(true);
      return;
    }
    hasAutoScrolledRef.current = true;
    setPageExpandReady(false);
    let settleRafId = 0;
    const rafId = requestAnimationFrame(() => {
      handleScrollToAnnotation();
      settleRafId = requestAnimationFrame(() => setPageExpandReady(true));
    });
    return () => {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(settleRafId);
    };
  }, [
    contentReady,
    containerSize,
    manualZoom,
    scrollTarget,
    effectivePhraseItem,
    effectiveRenderScale,
    initialScroll,
    zoom,
    containerRef,
    handleScrollToAnnotation,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is stable
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const target = annotationScrollTargetRef.current;
      if (!target) return;
      const dx = Math.abs(el.scrollLeft - target.left);
      const dy = Math.abs(el.scrollTop - target.top);
      if (isAnimatingScrollRef.current) {
        if (dx < DRIFT_THRESHOLD_PX && dy < DRIFT_THRESHOLD_PX) isAnimatingScrollRef.current = false;
        return;
      }
      if (dx > DRIFT_THRESHOLD_PX || dy > DRIFT_THRESHOLD_PX) setLocateDirty(true);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      isAnimatingScrollRef.current = false;
      annotationScrollTargetRef.current = null;
    };
  }, []);

  useWheelZoom({
    enabled: contentReady,
    sensitivity: WHEEL_ZOOM_SENSITIVITY,
    containerRef: containerRef as React.RefObject<HTMLElement | null>,
    wrapperRef: contentWrapperRef,
    zoom,
    clampZoomRaw,
    clampZoom,
    gestureAnchorRef: wheelAnchorRef,
    requireCtrl: true,
    onZoomCommit: setManualZoom,
  });

  // Trackpad/mouse-wheel pan for the expanded page.
  //
  // The expanded viewer lives inside PopoverContent, whose wheel passthrough
  // forwards unhandled vertical scroll to the host page. Mixed-axis trackpad
  // gestures often include a small deltaY alongside the user's intended deltaX;
  // if the popover sees that first, horizontal panning can be lost. Own normal
  // wheel panning here and leave Ctrl-wheel for useWheelZoom above.
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is stable
  useEffect(() => {
    if (!contentReady) return;
    const el = containerRef.current;
    if (!el) return;

    const onWheelPan = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      if (event.deltaX === 0 && event.deltaY === 0) return;

      const { x, y } = normalizeWheelDelta(event);
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const nextLeft = Math.max(0, Math.min(maxLeft, el.scrollLeft + x));
      const nextTop = Math.max(0, Math.min(maxTop, el.scrollTop + y));

      if (Math.abs(nextLeft - el.scrollLeft) <= 0.5 && Math.abs(nextTop - el.scrollTop) <= 0.5) return;

      event.preventDefault();
      event.stopPropagation();
      el.scrollLeft = nextLeft;
      el.scrollTop = nextTop;
    };

    el.addEventListener("wheel", onWheelPan, { passive: false });
    return () => el.removeEventListener("wheel", onWheelPan);
  }, [contentReady]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable and zoom is mirrored via zoomRef
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let initialDistance: number | null = null;
    let initialZoom = 1;
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
      if (e.touches.length !== 2) return;
      const dist = getTouchDistance(e.touches);
      if (dist < Number.EPSILON || !Number.isFinite(dist)) return;
      initialDistance = dist;
      initialZoom = zoomRef.current;
      const wrapper = contentWrapperRef.current;
      if (wrapper) {
        wrapper.style.willChange = "transform";
        wrapper.style.transformOrigin = "0 0";
      }
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
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initialDistance === null) return;
      e.preventDefault();
      const wrapper = contentWrapperRef.current;
      if (!wrapper || !touchGestureAnchorRef.current) return;
      const newZoom = clampZoomRaw(initialZoom * (getTouchDistance(e.touches) / initialDistance));
      touchGestureZoomRef.current = newZoom;
      applyGestureTransform(wrapper, newZoom, zoomRef.current, touchGestureAnchorRef.current);
    };

    const onTouchEnd = () => {
      if (gestureCleanedUp) return;
      initialDistance = null;
      const wrapper = contentWrapperRef.current;
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
      touchGestureZoomRef.current = null;
      touchGestureAnchorRef.current = null;
    };
  }, [clampZoom, clampZoomRaw]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable
  useLayoutEffect(() => {
    const wrapper = contentWrapperRef.current;
    if (wrapper) wrapper.style.transform = "";

    const anchor = touchGestureAnchorRef.current ?? wheelAnchorRef.current;
    const el = containerRef.current;
    if (!anchor || !el || !contentReady) {
      touchGestureAnchorRef.current = null;
      wheelAnchorRef.current = null;
      return;
    }
    const startZoom = anchor.startZoom;
    if (startZoom > 0) {
      const ratio = zoom / startZoom;
      const wx = anchor.mx + anchor.sx - (anchor.wrapperOffsetLeft ?? 0);
      const wy = anchor.my + anchor.sy - (anchor.wrapperOffsetTop ?? 0);
      const newZoomedWidth = width * zoom;
      const availableWidth = el.clientWidth - EXPANDED_PAGE_CANVAS_PADDING_PX * 2;
      const newMarginLeft = newZoomedWidth < availableWidth ? Math.round((availableWidth - newZoomedWidth) / 2) : 0;
      const rawLeft = EXPANDED_PAGE_CANVAS_PADDING_PX + newMarginLeft + wx * ratio - anchor.mx;
      const rawTop = EXPANDED_PAGE_CANVAS_PADDING_PX + wy * ratio - anchor.my;
      el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, rawLeft));
      el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, rawTop));
    }
    touchGestureAnchorRef.current = null;
    wheelAnchorRef.current = null;
  }, [zoom, contentReady, width]);

  const marginLeft = useMemo(() => {
    if (!contentReady || !containerSize) return 0;
    const zoomedW = width * zoom;
    const availableWidth = containerSize.width - EXPANDED_PAGE_CANVAS_PADDING_PX * 2;
    return zoomedW < availableWidth ? Math.round((availableWidth - zoomedW) / 2) : 0;
  }, [contentReady, containerSize, width, zoom]);

  const shellStyle = useMemo<React.CSSProperties>(() => {
    if (!contentReady) return { position: "relative", minWidth: "100%", minHeight: "100%" };
    return {
      position: "relative",
      width: Math.max(containerSize?.width ?? 0, width * zoom + EXPANDED_PAGE_CANVAS_PADDING_PX * 2),
      height: Math.max(containerSize?.height ?? 0, height * zoom + EXPANDED_PAGE_CANVAS_PADDING_PX * 2),
    };
  }, [contentReady, width, height, zoom, containerSize]);

  const annotationOriginItem = contentReady && effectiveRenderScale ? (scrollTarget ?? effectivePhraseItem) : null;
  const annotationOrigin =
    annotationOriginItem && effectiveRenderScale && contentReady
      ? computeAnnotationOriginPercent(
          annotationOriginItem,
          effectiveRenderScale,
          width,
          height,
          undefined,
          viewBoxOriginY,
        )
      : null;
  const annotationVtRect =
    effectivePhraseItem && effectiveRenderScale && (contentReady || expectedDimensions)
      ? toPercentRect(
          effectivePhraseItem,
          effectiveRenderScale,
          contentReady ? width : (expectedDimensions?.width ?? 0),
          contentReady ? height : (expectedDimensions?.height ?? 0),
          undefined,
          viewBoxOriginY,
        )
      : null;
  const pageExpandTargetReady = !!annotationVtRect && contentReady && pageExpandReady;
  const annotationTargetNaturalWidth =
    effectivePhraseItem && effectiveRenderScale ? effectivePhraseItem.width * effectiveRenderScale.x : null;
  const annotationTargetNaturalHeight =
    effectivePhraseItem && effectiveRenderScale ? effectivePhraseItem.height * effectiveRenderScale.y : null;

  const handleOverlayDismiss = useCallback(() => {
    setOverlayHidden(true);
    setLocateDirty(true);
    setLocatePulseKey(prev => prev + 1);
  }, []);

  const showLocate = contentReady && !!(scrollTarget ?? effectivePhraseItem) && !!effectiveRenderScale;

  return (
    <div className={cn("relative flex flex-col flex-1 min-h-0 min-w-0 w-full mx-3 mb-3", className)}>
      <div className="relative flex flex-col flex-1 min-h-0 min-w-0 w-full">
        <div
          ref={containerRef}
          data-dc-inline-expanded=""
          {...(!(scrollTarget ?? effectivePhraseItem) ? { "data-dc-no-annotation": "" } : {})}
          role="button"
          tabIndex={0}
          aria-label={ariaLabel ?? t("aria.expandedImageViewer")}
          className={cn(
            "relative select-none overflow-auto rounded-t-sm flex-1 min-h-0 min-w-0 w-full",
            DOCUMENT_CANVAS_BG_CLASSES,
          )}
          style={{
            ...(!annotationVtRect ? { viewTransitionName: DC_EVIDENCE_VT_NAME } : {}),
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
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onCollapse();
              return;
            }
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
          <div style={shellStyle}>
            <div
              key={contentKey}
              ref={contentWrapperRef}
              style={{
                position: contentReady ? "absolute" : "relative",
                left: contentReady ? marginLeft + EXPANDED_PAGE_CANVAS_PADDING_PX : undefined,
                top: contentReady ? EXPANDED_PAGE_CANVAS_PADDING_PX : undefined,
                width: contentReady ? width * zoom : undefined,
                height: contentReady ? height * zoom : undefined,
                overflow: contentReady ? "hidden" : undefined,
                ...(annotationOrigin
                  ? { transformOrigin: `${annotationOrigin.xPercent}% ${annotationOrigin.yPercent}%` }
                  : undefined),
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: contentReady ? width : undefined,
                  height: contentReady ? height : undefined,
                  transformOrigin: "0 0",
                  transform: contentReady ? `scale(${zoom})` : undefined,
                }}
              >
                {children({ scale: zoom })}
                {contentReady && effectivePhraseItem && effectiveRenderScale && !effectiveOverlayHidden && (
                  <CitationAnnotationOverlay
                    sourceContextDeepItem={effectivePhraseItem}
                    renderScale={effectiveRenderScale}
                    imageNaturalWidth={width}
                    imageNaturalHeight={height}
                    highlightColor={overlayHighlightColor}
                    sourceMatchDeepItems={verification?.status === "not_found" ? undefined : effectiveAnchorItems}
                    sourceMatch={verification?.verifiedSourceMatch}
                    sourceContext={verification?.verifiedSourceContext}
                    onDismiss={handleOverlayDismiss}
                    isDark={isDark}
                    viewBoxOriginY={viewBoxOriginY}
                  />
                )}
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
          </div>
          {footer}
        </div>
        {contentReady && (
          <ZoomToolbar
            zoom={zoom}
            onZoomChange={z => setManualZoom(clampZoom(z))}
            zoomFloor={zoomFloor}
            zoomStep={EXPANDED_ZOOM_STEP}
            showLocate={showLocate}
            onLocate={handleScrollToAnnotation}
            locateDirty={locateDirty}
            locatePulseKey={locatePulseKey}
          />
        )}
      </div>
    </div>
  );
}
