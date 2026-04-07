import type React from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Verification } from "../../types/verification.js";
import {
  buildKeyholeMaskImage,
  DOCUMENT_CANVAS_BG_CLASSES,
  DOCUMENT_IMAGE_EDGE_CLASSES,
  HIDE_SCROLLBAR_STYLE,
  KEYHOLE_ANCHOR_FILL_TARGET,
  KEYHOLE_FADE_WIDTH,
  KEYHOLE_SKIP_THRESHOLD,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  KEYHOLE_STRIP_HEIGHT_VAR,
  MIN_PAN_OVERFLOW_PX,
} from "../constants.js";
import { useDragToPan } from "../hooks/useDragToPan.js";
import { useTranslation } from "../i18n.js";
import { handleImageError } from "../imageUtils.js";
import { computeAnnotationScrollTarget, START_ALIGNMENT_INSET_PX } from "../overlayGeometry.js";
import { cn, isImageSource } from "../utils.js";
import { DC_EVIDENCE_VT_NAME } from "../viewTransition.js";
import { animateScrollLeft } from "./animateScrollLeft.js";
import { IDENTITY_RENDER_SCALE } from "./resolvers.js";

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
    const viewBoxOriginY = verification.document?.viewBoxOriginY;
    const phraseItem = verification.document?.phraseMatchDeepItem;
    return { anchorItem, renderScale, viewBoxOriginY, phraseItem };
  }, [verification]);
  // Drag-to-pan hook for mouse interaction (xy enables vertical pan for width-fit tall images;
  // when no vertical overflow exists, scrollTop stays 0 — no visible effect on normal crops).
  const { containerRef, isDragging, handlers, scrollState, wasDraggingRef } = useDragToPan({ direction: "xy" });

  // Track image load to compute initial scroll position
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFitInfo, setImageFitInfo] = useState<{
    displayedWidth: number;
    displayedHeight: number;
    imageFitsCompletely: boolean;
    zoom: number;
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

    const stripHeight = container.clientHeight;
    const containerWidth = container.clientWidth;

    // Compute zoom-to-fit anchor text: scale down so the anchor text fills
    // ~70% of the keyhole width, giving useful context. Clamp:
    //   max = 1.0 (never upscale — expanding reveals more content)
    //   min = 1/renderScale.y (≈ 12pt readability: 1 image px per screen px)
    let zoom = 1.0;
    if (anchorScrollData) {
      const { renderScale } = anchorScrollData;
      const anchorWidthPx = anchorScrollData.anchorItem.width * renderScale.x;
      if (anchorWidthPx > 0) {
        const fitZoom = (containerWidth * KEYHOLE_ANCHOR_FILL_TARGET) / anchorWidthPx;
        const minZoom = renderScale.y > 0 ? 1 / renderScale.y : 1.0;
        zoom = Math.min(1.0, Math.max(minZoom, fitZoom));
      }
    }

    const displayedWidth = img.naturalWidth * zoom;
    const displayedHeight = img.naturalHeight * zoom;

    // Image fits completely when it doesn't overflow the container in either axis.
    // KEYHOLE_SKIP_THRESHOLD (2.0) gives slack — images up to 2× strip height still
    // count as "fits" since expanding would reveal little new content.
    const imageFitsCompletely =
      displayedWidth <= containerWidth &&
      displayedHeight > 0 &&
      displayedHeight <= stripHeight * KEYHOLE_SKIP_THRESHOLD;

    setImageFitInfo({ displayedWidth, displayedHeight, imageFitsCompletely, zoom });
    onKeyholeWidth?.(Math.min(displayedWidth, containerWidth));

    // Scroll to center on the anchor text (both axes); fall back to top-left.
    if (anchorScrollData) {
      const { anchorItem, renderScale } = anchorScrollData;

      // Detect snippet mode: the verify API may return a cropped evidence image
      // (e.g. 976×354) while bounding-box coordinates are in full-page PDF space
      // (y ≈ 722 in a ~791-unit-tall page). The Y-flip formula
      // `imageH - y*scale` goes negative when imageH is the snippet, not the
      // full page. Detect this by checking whether the anchor's converted pixelY
      // would land outside the image bounds.
      const testPixelY = img.naturalHeight - (anchorItem.y - (anchorScrollData.viewBoxOriginY ?? 0)) * renderScale.y;
      const isSnippet = testPixelY < 0 || testPixelY > img.naturalHeight;

      if (isSnippet && anchorScrollData.phraseItem) {
        // Snippet mode: compute anchor position relative to the phraseMatch,
        // which the snippet is roughly centered on. This avoids needing the
        // full-page image dimensions.
        const phrase = anchorScrollData.phraseItem;
        const phrasePixelH = phrase.height * renderScale.y;
        // Approximate phrase center Y within the snippet (assumes centered crop)
        const phrasePadY = (img.naturalHeight - phrasePixelH) / 2;
        // Anchor offset below phrase top (PDF Y-flip: higher y = higher on page)
        const anchorBelowPhraseTop = (phrase.y - anchorItem.y) * renderScale.y;
        const anchorPixelYInSnippet = Math.max(0, phrasePadY + anchorBelowPhraseTop);
        const anchorPixelHInSnippet = anchorItem.height * renderScale.y;

        // Horizontal: anchor X in snippet. The phrase X padding gives the crop offset.
        const phrasePixelW = phrase.width * renderScale.x;
        const phrasePadX = (img.naturalWidth - phrasePixelW) / 2;
        const anchorRightOfPhraseLeft = (anchorItem.x - phrase.x) * renderScale.x;
        const anchorPixelXInSnippet = Math.max(0, phrasePadX + anchorRightOfPhraseLeft);

        // Scroll: same centering logic as computeAnnotationScrollTarget
        const zoomedCenterY = (anchorPixelYInSnippet + anchorPixelHInSnippet / 2) * zoom;
        const scrollTop = Math.max(
          0,
          Math.min(zoomedCenterY - stripHeight / 2, img.naturalHeight * zoom - stripHeight),
        );
        const zoomedStartX = anchorPixelXInSnippet * zoom;
        const scrollLeft = Math.max(
          0,
          Math.min(zoomedStartX - START_ALIGNMENT_INSET_PX, img.naturalWidth * zoom - containerWidth),
        );

        container.scrollLeft = scrollLeft;
        container.scrollTop = scrollTop;
      } else {
        // Full-page image mode: use standard coordinate transform
        const target = computeAnnotationScrollTarget(
          anchorItem,
          renderScale,
          img.naturalWidth,
          img.naturalHeight,
          zoom,
          containerWidth,
          stripHeight,
          undefined,
          anchorScrollData.viewBoxOriginY,
          "start",
        );
        if (target) {
          container.scrollLeft = target.scrollLeft;
          container.scrollTop = target.scrollTop;
        }
      }
    } else {
      container.scrollLeft = 0;
      container.scrollTop = 0;
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

  return (
    <div className="relative">
      {/* Keyhole strip container — clickable to expand, draggable to pan.
          maxWidth clamps to the image's rendered width so no blank space appears to the right. */}
      <div
        className="relative group/keyhole"
        style={imageFitInfo ? { maxWidth: imageFitInfo.displayedWidth } : undefined}
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
                // Scale is 1.0 — scroll positions are already in natural pixel coords
                onScrollCapture(container.scrollLeft, container.scrollTop);
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
            className={cn(DOCUMENT_CANVAS_BG_CLASSES, "overflow-x-auto overflow-y-hidden")}
            style={{
              viewTransitionName: DC_EVIDENCE_VT_NAME,
              height: stripHeightStyle,
              // Horizontal fade mask — indicates pannable content left/right.
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
                className={cn(DOCUMENT_IMAGE_EDGE_CLASSES, "block select-none")}
                style={
                  imageFitInfo
                    ? { width: imageFitInfo.displayedWidth, height: imageFitInfo.displayedHeight }
                    : { maxWidth: "none" }
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
            ></div>
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
            ></div>
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
