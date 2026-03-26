import type React from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Verification } from "../../types/verification.js";
import { computeKeyholeOffset } from "../computeKeyholeOffset.js";
import {
  buildKeyholeMaskImage,
  DOCUMENT_CANVAS_BG_CLASSES,
  DOCUMENT_IMAGE_EDGE_CLASSES,
  EXPANDED_MIN_READABLE_ZOOM,
  HIDE_SCROLLBAR_STYLE,
  KEYHOLE_FADE_WIDTH,
  KEYHOLE_SKIP_THRESHOLD,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  KEYHOLE_STRIP_HEIGHT_VAR,
  KEYHOLE_WIDTH_FIT_THRESHOLD,
  MIN_PAN_OVERFLOW_PX,
} from "../constants.js";
import { useDragToPan } from "../hooks/useDragToPan.js";
import { useTranslation } from "../i18n.js";
import { handleImageError } from "../imageUtils.js";
import { computeAnnotationScrollTarget } from "../overlayGeometry.js";
import { cn, isImageSource } from "../utils.js";
import { DC_EVIDENCE_VT_NAME } from "../viewTransition.js";
import { animateScrollLeft } from "./animateScrollLeft.js";

const IDENTITY_RENDER_SCALE = { x: 1, y: 1 } as const;

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
  pageExpandSourceRef,
}: {
  src: string;
  verification?: Verification | null;
  onImageClick?: () => void;
  /** Skip-to-page callback when keyhole already fits — goes straight to expanded-page. */
  onPageExpand?: () => void;
  onKeyholeWidth?: (width: number) => void;
  /** Called with natural-pixel scroll coords just before onImageClick fires. */
  onScrollCapture?: (left: number, top: number) => void;
  /** Exposes the visible summary keyhole node for page-expand transitions. */
  pageExpandSourceRef?: React.MutableRefObject<HTMLElement | null>;
}) {
  const t = useTranslation();
  // Anchor item and renderScale for scroll positioning.
  // Uses anchorTextMatchDeepItems[0] (specific cited word) with phraseMatchDeepItem fallback.
  // renderScale converts item coords → image pixel coords, matching
  // the same transform used by computeAnnotationScrollTarget / toPercentRect in overlayGeometry.
  // For image sources (mimeType: "image/*"), coords are already in pixel space — default to identity.
  const anchorScrollData = useMemo(() => {
    if (!verification) return null;
    const anchorItem =
      verification.document?.anchorTextMatchDeepItems?.[0] ?? verification.document?.phraseMatchDeepItem;
    if (!anchorItem) return null;
    const renderScale =
      verification.document?.renderScale ?? (isImageSource(verification) ? IDENTITY_RENDER_SCALE : null);
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
      // computeAnnotationScrollTarget uses the same coord transform as the overlay.
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

      // Set initial scroll position using the same coord transform as the overlay.
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
            ref={el => {
              containerRef.current = el;
              if (pageExpandSourceRef) {
                pageExpandSourceRef.current = el;
              }
            }}
            data-dc-keyhole=""
            data-dc-page-expand-source=""
            data-dc-page-expand-source-kind="summary-keyhole"
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
                src={src}
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
              className="absolute left-0 top-0 h-full min-w-[44px] flex items-center justify-center opacity-0 group-hover/keyhole:opacity-100 transition-opacity duration-120 cursor-pointer"
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
              className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center opacity-0 group-hover/keyhole:opacity-100 transition-opacity duration-120 cursor-pointer"
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
