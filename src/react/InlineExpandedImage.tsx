/**
 * Expanded page image viewer with zoom, pan, and annotation overlays.
 *
 * Replaces Zone 3 (evidence tray) when the keyhole is expanded in-place.
 * Renders the image at natural size with 2D drag-to-pan. Supports:
 * - Fit-to-screen zoom on narrow viewports
 * - Pinch-to-zoom on touch devices
 * - Trackpad pinch (Ctrl+wheel)
 * - Zoom slider controls
 * - Annotation overlays for matched text
 *
 * @packageDocumentation
 */

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { CitationAnnotationOverlay } from "./CitationAnnotationOverlay.js";
import {
  EXPANDED_IMAGE_SHELL_PX,
  EXPANDED_ZOOM_MAX,
  EXPANDED_ZOOM_MIN,
  EXPANDED_ZOOM_STEP,
  FOOTER_HINT_DURATION_MS,
} from "./constants.js";
import { formatCaptureDate } from "./dateUtils.js";
import { useDragToPan } from "./hooks/useDragToPan.js";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { useZoomControls } from "./hooks/useZoomControls.js";
import { SpinnerIcon, ZoomInIcon, ZoomOutIcon } from "./icons.js";
import { deriveOutcomeLabel } from "./outcomeLabel.js";
import { computeAnnotationOriginPercent, computeAnnotationScrollTarget } from "./overlayGeometry.js";
import { cn } from "./utils.js";

/** CSS to hide native scrollbars. */
const SCROLLBAR_HIDE: React.CSSProperties = {
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

/** Renders hint text that appears bold/dark for 2s, then transitions to muted gray. */
function FooterHint({ text }: { text: string }) {
  const [highlighted, setHighlighted] = useState(true);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setHighlighted(false);
      return;
    }
    const timer = setTimeout(() => setHighlighted(false), FOOTER_HINT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  return (
    <span
      className={cn(
        "font-bold transition-colors duration-500",
        highlighted ? "text-gray-900 dark:text-gray-200" : "text-gray-400 dark:text-gray-500",
      )}
    >
      {text}
    </span>
  );
}

/**
 * Replaces Zone 3 (evidence tray) when the keyhole is expanded in-place.
 * Renders the image at natural size with 2D drag-to-pan. The summary content
 * (Zone 1 header + Zone 2 quote) stays visible above — this component is
 * deliberately headerless. Click (without drag) to collapse.
 *
 * When `fill` is true (expanded-page mode), includes subtle zoom controls
 * (−/slider/+) for both desktop and mobile. Mobile defaults to fit-to-screen.
 * Supports pinch-to-zoom on touch devices and trackpad pinch (Ctrl+wheel).
 */
export function InlineExpandedImage({
  src,
  onCollapse,
  verification,
  status,
  fill = false,
  onNaturalSize,
  renderScale,
}: {
  src: string;
  onCollapse: () => void;
  verification?: Verification | null;
  status?: CitationStatus;
  /** When true, the component expands to fill its flex parent (for use inside flex-column containers). */
  fill?: boolean;
  /** Called after image load with natural pixel dimensions. */
  onNaturalSize?: (width: number, height: number) => void;
  /** Scale factors for converting DeepTextItem PDF coords to image pixels. */
  renderScale?: { x: number; y: number } | null;
}) {
  const { containerRef, isDragging, handlers: panHandlers, wasDragging } = useDragToPan({ direction: "xy" });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);

  // Zoom state via extracted hook
  const {
    zoom,
    setZoom,
    zoomRef,
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    clampZoom,
    zoomFloor,
    setZoomFloor,
  } = useZoomControls({
    min: EXPANDED_ZOOM_MIN,
    max: EXPANDED_ZOOM_MAX,
    step: EXPANDED_ZOOM_STEP,
  });

  // Container size as state (not ref) so that ResizeObserver updates trigger re-renders.
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const hasSetInitialZoom = useRef(false);

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

  // Reset imageLoaded synchronously when src changes (avoids a useEffect render cycle).
  const prevSrcRef = useRef(src);
  if (prevSrcRef.current !== src) {
    prevSrcRef.current = src;
    setImageLoaded(false);
    setNaturalWidth(null);
    setNaturalHeight(null);
    setZoom(1);
    setZoomFloor(EXPANDED_ZOOM_MIN);
    hasSetInitialZoom.current = false;
  }

  // Fit-to-screen: scale the page image to fit the available width.
  useEffect(() => {
    if (!fill || !imageLoaded || !naturalWidth || !naturalHeight || hasSetInitialZoom.current) return;
    if (!containerSize || containerSize.width <= 0 || containerSize.height <= 0) return;
    hasSetInitialZoom.current = true;
    const maxImageWidth =
      typeof window !== "undefined" ? window.innerWidth - 32 - EXPANDED_IMAGE_SHELL_PX : containerSize.width;
    const fitZoomW = maxImageWidth / naturalWidth;
    const fitZoom = Math.min(1, Math.max(0.1, fitZoomW));
    if (fitZoom < 1) setZoom(fitZoom);
    setZoomFloor(Math.min(EXPANDED_ZOOM_MIN, fitZoom));
    onNaturalSize?.(Math.round(naturalWidth * fitZoom), Math.round(naturalHeight * fitZoom));

    // Auto-scroll to annotation
    const phraseItem = verification?.document?.phraseMatchDeepItem;
    if (phraseItem && renderScale) {
      const effectiveZoom = fitZoom < 1 ? fitZoom : 1;
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container) return;
        const target = computeAnnotationScrollTarget(
          phraseItem,
          renderScale,
          naturalWidth,
          naturalHeight,
          effectiveZoom,
          container.clientWidth,
          container.clientHeight,
        );
        if (target) {
          container.scrollLeft = target.scrollLeft;
          container.scrollTop = target.scrollTop;
        }
      });
    }
  }, [
    fill,
    imageLoaded,
    naturalWidth,
    naturalHeight,
    containerSize,
    onNaturalSize,
    verification,
    renderScale,
    containerRef,
    setZoom,
    setZoomFloor,
  ]);

  // Trackpad pinch zoom (Ctrl+wheel)
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref object from useDragToPan — its identity never changes
  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.005;
      setZoom(z => clampZoom(z + delta));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fill, clampZoom, setZoom]);

  // Touch pinch-to-zoom (two-finger gesture).
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref object from useDragToPan — its identity never changes
  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;

    let initialDistance: number | null = null;
    let initialZoom = 1;

    const getTouchDistance = (touches: TouchList): number => {
      const [a, b] = [touches[0], touches[1]];
      if (!a || !b) return 0;
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dist = getTouchDistance(e.touches);
        if (dist < Number.EPSILON) return;
        initialDistance = dist;
        initialZoom = zoomRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initialDistance === null) return;
      e.preventDefault();
      const currentDistance = getTouchDistance(e.touches);
      const scale = currentDistance / initialDistance;
      setZoom(clampZoom(initialZoom * scale));
    };

    const onTouchEnd = () => {
      initialDistance = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [fill, clampZoom, setZoom, zoomRef]);

  // Compute effective image width for zoom
  const zoomedWidth = fill && naturalWidth ? naturalWidth * zoom : undefined;

  // Lock the outer container width while the range slider is being dragged
  const outerRef = useRef<HTMLDivElement>(null);
  const [sliderLockWidth, setSliderLockWidth] = useState<number | null>(null);
  useEffect(() => {
    if (sliderLockWidth === null) return;
    const unlock = () => setSliderLockWidth(null);
    document.addEventListener("pointerup", unlock, { once: true });
    return () => document.removeEventListener("pointerup", unlock);
  }, [sliderLockWidth]);

  const _isMiss = status?.isMiss;
  const searchAttempts = verification?.searchAttempts ?? [];
  const outcomeLabel = deriveOutcomeLabel(verification?.status, searchAttempts);
  const formatted = formatCaptureDate(verification?.verifiedAt);
  const dateStr = formatted?.display ?? "";

  const showZoomControls = fill && imageLoaded && naturalWidth !== null;

  // Compute transform-origin from annotation position (fill mode only).
  const annotationPhraseItem =
    fill && renderScale && naturalWidth && naturalHeight ? (verification?.document?.phraseMatchDeepItem ?? null) : null;
  const annotationOrigin = useMemo(() => {
    if (!annotationPhraseItem || !renderScale || !naturalWidth || !naturalHeight) return null;
    return computeAnnotationOriginPercent(annotationPhraseItem, renderScale, naturalWidth, naturalHeight);
  }, [annotationPhraseItem, renderScale, naturalWidth, naturalHeight]);

  const footerEl = (
    <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-b-sm border border-t-0 border-gray-200 dark:border-gray-700">
      <span>
        {outcomeLabel}
        <FooterHint text=" · Click to collapse" />
      </span>
      {dateStr && <span title={formatted?.tooltip ?? dateStr}>{dateStr}</span>}
    </div>
  );

  return (
    <div
      ref={outerRef}
      className={cn("mx-3 mb-3 animate-in fade-in-0 duration-150", fill && "flex-1 min-h-0 flex flex-col")}
      style={
        fill
          ? undefined
          : zoomedWidth !== undefined
            ? sliderLockWidth !== null
              ? { width: sliderLockWidth, minWidth: sliderLockWidth, maxWidth: sliderLockWidth }
              : { maxWidth: zoomedWidth }
            : naturalWidth !== null
              ? { maxWidth: naturalWidth }
              : undefined
      }
    >
      <div className={cn("relative", fill && "flex-1 min-h-0 flex flex-col")}>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: drag-to-pan area; keyboard exit handled by parent popover Escape */}
        <div
          ref={containerRef}
          data-dc-inline-expanded=""
          className={cn(
            "relative bg-gray-50 dark:bg-gray-900 select-none overflow-auto rounded-t-sm",
            fill && "flex-1 min-h-0",
          )}
          style={{
            ...(fill ? {} : { maxHeight: "min(600px, 80dvh)" }),
            overscrollBehavior: "none",
            cursor: isDragging ? "grabbing" : fill ? "grab" : "zoom-out",
            ...SCROLLBAR_HIDE,
          }}
          onDragStart={e => e.preventDefault()}
          onClick={e => {
            e.stopPropagation();
            if (wasDragging.current) {
              wasDragging.current = false;
              return;
            }
            onCollapse();
          }}
          {...panHandlers}
        >
          <style>{`[data-dc-inline-expanded]::-webkit-scrollbar { display: none; }`}</style>
          <div
            key={src}
            className={cn("animate-in fade-in-0 duration-150", fill && annotationOrigin && "zoom-in-95")}
            style={
              annotationOrigin
                ? { transformOrigin: `${annotationOrigin.xPercent}% ${annotationOrigin.yPercent}%` }
                : undefined
            }
          >
            {!imageLoaded && (
              <div className="flex items-center justify-center h-24">
                <span className="size-5 animate-spin text-gray-400">
                  <SpinnerIcon />
                </span>
              </div>
            )}
            <div
              style={{
                position: "relative",
                display: "inline-block",
                ...(zoomedWidth !== undefined ? { width: zoomedWidth } : {}),
              }}
            >
              <img
                src={src}
                alt="Verification evidence"
                className={cn("block", !imageLoaded && "hidden")}
                style={zoomedWidth !== undefined ? { width: zoomedWidth, maxWidth: "none" } : { maxWidth: "none" }}
                onLoad={e => {
                  const w = e.currentTarget.naturalWidth;
                  const h = e.currentTarget.naturalHeight;
                  setImageLoaded(true);
                  setNaturalWidth(w);
                  setNaturalHeight(h);
                  if (!fill) onNaturalSize?.(w, h);
                }}
                draggable={false}
              />
              {imageLoaded &&
                renderScale &&
                naturalWidth &&
                naturalHeight &&
                verification?.document?.phraseMatchDeepItem && (
                  <CitationAnnotationOverlay
                    phraseMatchDeepItem={verification.document.phraseMatchDeepItem}
                    renderScale={renderScale}
                    imageNaturalWidth={naturalWidth}
                    imageNaturalHeight={naturalHeight}
                    highlightColor={verification.highlightColor}
                    anchorTextDeepItem={verification.document.anchorTextMatchDeepItems?.[0]}
                    anchorText={verification.verifiedAnchorText}
                    fullPhrase={verification.verifiedFullPhrase}
                  />
                )}
            </div>
          </div>
          {fill && footerEl}
        </div>

        {showZoomControls && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              zIndex: 1,
              pointerEvents: "auto",
            }}
          >
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: zoom controls are auxiliary UI, main interaction is drag-to-pan */}
            <div
              className="flex items-center gap-0.5 bg-black/40 backdrop-blur-sm text-white/80 rounded-full px-1 py-0.5 shadow-sm"
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleZoomOut();
                }}
                disabled={zoom <= zoomFloor}
                className="size-6 flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"
                aria-label="Zoom out"
              >
                <span className="size-3.5">
                  <ZoomOutIcon />
                </span>
              </button>
              <input
                type="range"
                min={Math.round(zoomFloor * 100)}
                max={EXPANDED_ZOOM_MAX * 100}
                step={5}
                value={Math.round(zoom * 100)}
                onChange={e => {
                  e.stopPropagation();
                  setZoom(clampZoom(Number(e.target.value) / 100));
                }}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => {
                  e.stopPropagation();
                  if (outerRef.current) setSliderLockWidth(outerRef.current.offsetWidth);
                }}
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                className="w-16 h-1 appearance-none bg-white/30 rounded-full cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                  [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0
                  [&::-moz-range-thumb]:cursor-pointer"
                aria-label="Zoom level"
                aria-valuetext={`${Math.round(zoom * 100)}%`}
              />
              <span className="min-w-[4ch] text-center font-mono tabular-nums select-none text-[11px] leading-none">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleZoomIn();
                }}
                disabled={zoom >= EXPANDED_ZOOM_MAX}
                className="size-6 flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"
                aria-label="Zoom in"
              >
                <span className="size-3.5">
                  <ZoomInIcon />
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
      {!fill && footerEl}
    </div>
  );
}
