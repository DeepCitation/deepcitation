import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  projectEvidenceItemToImageRect,
  resolveGeometryProjection,
  selectEvidenceKeyholeScrollItem,
} from "../../drawing/evidenceGeometry.js";
import type { Verification } from "../../types/verification.js";
import { DOCUMENT_CANVAS_BG_CLASSES, DOCUMENT_IMAGE_EDGE_CLASSES } from "../constants.js";
import { AimOverlay } from "../debug/AimOverlay.js";
import { useDragToPan } from "../hooks/useDragToPan.js";
import { useTranslation } from "../i18n.js";
import {
  buildKeyholeMaskImage,
  KEYHOLE_FADE_WIDTH,
  KEYHOLE_SKIP_THRESHOLD,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  KEYHOLE_STRIP_HEIGHT_VAR,
  MIN_PAN_OVERFLOW_PX,
} from "../keyholeGeometry.js";
import { computeAnnotationScrollTarget } from "../overlayGeometry.js";
import { cn, isImageSource } from "../utils.js";
import { DC_EVIDENCE_VT_NAME } from "../viewTransition.js";
import { animateScrollLeft } from "./animateScrollLeft.js";
import { IDENTITY_RENDER_SCALE, resolveEvidenceSourceAnchorRatio } from "./resolvers.js";

/**
 * Displays a verification image as a "keyhole" strip — a fixed-height horizontal
 * window showing the image at 100% natural scale, cropped and centered on the
 * match region. CSS gradient fades indicate overflow on each edge.
 *
 * - **Never squashes or stretches** the image.
 * - **Drag to pan** horizontally and vertically (mouse and touch).
 * - **Click** to expand to full-size overlay.
 * - **Hover** shows a darkened overlay with magnifying glass icon.
 *
 * Falls back to horizontal centering when no bounding box data is available.
 */
export function EvidenceKeyhole({
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
  // Uses sourceMatchDeepItems[0] (specific cited word) with sourceContextDeepItem fallback.
  // renderScale converts item coords → image pixel coords, matching
  // the same transform used by computeAnnotationScrollTarget / toPercentRect in overlayGeometry.
  // For image sources (mimeType: "image/*"), coords are already in pixel space — default to identity.
  const anchorScrollData = useMemo(() => {
    if (!verification) return null;
    const anchorItem = selectEvidenceKeyholeScrollItem({
      sourceContextDeepItem: verification.document?.sourceContextDeepItem,
      sourceMatchDeepItems: verification.document?.sourceMatchDeepItems,
    });
    if (!anchorItem) return null;
    const renderScale =
      verification.document?.renderScale ?? (isImageSource(verification) ? IDENTITY_RENDER_SCALE : null);
    if (!renderScale) return null;
    const viewBoxOriginY = verification.document?.viewBoxOriginY;
    const geometrySpace = verification.document?.geometrySpace;
    const phraseItem = verification.document?.sourceContextDeepItem;
    return { anchorItem, renderScale, viewBoxOriginY, geometrySpace, phraseItem };
  }, [verification]);
  // Annotation anchor ratio in image space (0–1 on each axis), used by the
  // page-expand ghost animation to align the ghost over the annotation on the
  // expanded page. Mirrors InlineExpandedImage's sourceAnchorRatio logic.
  const sourceAnchorRatio = useMemo(() => resolveEvidenceSourceAnchorRatio(verification), [verification]);
  // Drag-to-pan hook for mouse interaction (xy enables vertical pan for width-fit tall images;
  // when no vertical overflow exists, scrollTop stays 0 — no visible effect on normal crops).
  const { containerRef, isDragging, handlers, scrollState, wasDraggingRef } = useDragToPan({ direction: "xy" });

  // Track image load to compute initial scroll position. `imageError` drives a
  // visible fallback instead of a permanently-blank strip when the crop fails
  // to load (broken/missing `evidence.src`, network error, expired URL).
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
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

  // Non-passive wheel listener: overflow-hidden removes native scroll, but the
  // browser still mutates scrollLeft/scrollTop on wheel events. Block that so
  // the drag-to-pan model owns all scroll mutations.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [containerRef]);

  // Reset per-image state when `src` changes. The same EvidenceKeyhole instance
  // can be reused for a new citation without unmounting; without this reset a
  // previously-errored image would flash the error overlay over the next —
  // potentially valid — crop, and the keyhole would skip its scroll init.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `src` is a trigger-only dependency — the effect resets state on src change rather than reading src
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setImageFitInfo(null);
    keyholeInitAppliedRef.current = false;
  }, [src]);

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

    // Zoom: the image must fill the strip — no squished thumbnails, no dead
    // space. Pick the larger of width-fill and height-fill so the image
    // covers both axes, then crop/scroll the overflow.
    //   - Tall page image (1094×1500): width-fill wins (0.35 vs 0.08),
    //     image fills width, strip crops a readable horizontal slice.
    //   - Wide snippet (1094×148): height-fill wins (0.81 vs 0.35),
    //     image fills height, strip scrolls horizontally.
    // Never upscale past native resolution.
    const widthFillZoom = img.naturalWidth > 0 ? containerWidth / img.naturalWidth : 1.0;
    const heightFillZoom = img.naturalHeight > 0 ? stripHeight / img.naturalHeight : 1.0;
    const zoom = Math.min(1.0, Math.max(widthFillZoom, heightFillZoom));

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
      // (e.g. 976×354) while bounding-box coordinates are in full-page space
      // (y ≈ 722 in a ~791-unit-tall page). Projecting a full-page coordinate
      // against a snippet-sized image lands outside the image in either space —
      // negative under the bottom-left flip, past the bottom under canonical.
      const anchorRect = projectEvidenceItemToImageRect({
        item: anchorItem,
        renderScale,
        imageNaturalWidth: img.naturalWidth,
        imageNaturalHeight: img.naturalHeight,
        viewBoxOriginY: anchorScrollData.viewBoxOriginY,
        geometrySpace: anchorScrollData.geometrySpace,
      });
      const isSnippet = !anchorRect || anchorRect.y < 0 || anchorRect.y > img.naturalHeight;

      if (isSnippet && anchorScrollData.phraseItem) {
        // Snippet mode: compute anchor position relative to the phraseMatch,
        // which the snippet is cropped around with constant padding (the crop
        // utility pads by (snippetW - phraseW) / 2 on each side).
        // The crop CAN be clamped at page edges, so the "padding = (snippetW -
        // phraseW) / 2" assumption is only correct in the un-clamped case. To
        // tolerate clamping errors, we CENTER the anchor in the viewport
        // (containerWidth / 2 of slack on each side) instead of start-aligning.
        const phrase = anchorScrollData.phraseItem;
        const phrasePixelH = phrase.height * renderScale.y;
        // Approximate phrase top padding within the snippet (assumes constant
        // padding crop). Clamp to 0 in case of edge clamping.
        const phrasePadY = Math.max(0, (img.naturalHeight - phrasePixelH) / 2);
        // Anchor offset below the phrase top. Bottom-left space counts upward
        // (higher y = higher on the page), canonical space counts downward.
        const { coordinateOrigin } = resolveGeometryProjection({
          geometrySpace: anchorScrollData.geometrySpace,
          viewBoxOriginY: anchorScrollData.viewBoxOriginY,
        });
        const anchorBelowPhraseTop =
          coordinateOrigin === "image"
            ? (anchorItem.y - phrase.y) * renderScale.y
            : (phrase.y - anchorItem.y) * renderScale.y;
        const anchorPixelYInSnippet = Math.max(0, phrasePadY + anchorBelowPhraseTop);
        const anchorPixelHInSnippet = anchorItem.height * renderScale.y;

        // Horizontal: anchor X in snippet. The phrase X padding gives the crop offset.
        const phrasePixelW = phrase.width * renderScale.x;
        const phrasePadX = Math.max(0, (img.naturalWidth - phrasePixelW) / 2);
        const anchorRightOfPhraseLeft = (anchorItem.x - phrase.x) * renderScale.x;
        const anchorPixelXInSnippet = Math.max(0, phrasePadX + anchorRightOfPhraseLeft);
        const anchorPixelWInSnippet = anchorItem.width * renderScale.x;

        // Scroll: CENTER the anchor in the viewport on both axes. The previous
        // start-aligned X computation put the anchor near the left edge of the
        // viewport, which combined with snippet-padding miscalculation could
        // push the anchor off-screen. Centering gives the anchor half the
        // viewport width of slack on each side, swallowing small computation
        // errors.
        const zoomedAnchorCenterY = (anchorPixelYInSnippet + anchorPixelHInSnippet / 2) * zoom;
        const scrollTop = Math.max(
          0,
          Math.min(zoomedAnchorCenterY - stripHeight / 2, img.naturalHeight * zoom - stripHeight),
        );
        const zoomedAnchorCenterX = (anchorPixelXInSnippet + anchorPixelWInSnippet / 2) * zoom;
        const scrollLeft = Math.max(
          0,
          Math.min(zoomedAnchorCenterX - containerWidth / 2, img.naturalWidth * zoom - containerWidth),
        );

        container.scrollLeft = scrollLeft;
        container.scrollTop = scrollTop;
      } else {
        // Full-page image mode: use standard coordinate transform with
        // center-aligned X (the default). The previous "start" alignment
        // pushed the anchor against the left viewport edge, which made
        // start-of-line anchors visually crowded against the keyhole's left
        // fade mask.
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
          "center",
          anchorScrollData.geometrySpace,
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
            {...(sourceAnchorRatio && {
              "data-dc-source-anchor-x": sourceAnchorRatio.x.toFixed(4),
              "data-dc-source-anchor-y": sourceAnchorRatio.y.toFixed(4),
            })}
            className={cn(DOCUMENT_CANVAS_BG_CLASSES, "relative overflow-hidden")}
            style={{
              viewTransitionName: DC_EVIDENCE_VT_NAME,
              height: stripHeightStyle,
              // Horizontal fade mask — indicates pannable content left/right.
              WebkitMaskImage: maskImage,
              maskImage,
              cursor: interactionCursor,
            }}
            {...handlers}
          >
            <div ref={imageWrapperRef} style={{ display: "inline-block", position: "relative" }}>
              <img
                ref={imageRef}
                src={src}
                alt={t("aria.verificationEvidence")}
                className={cn(
                  DOCUMENT_IMAGE_EDGE_CLASSES,
                  "block select-none transition-opacity duration-150",
                  imageLoaded ? "opacity-100" : "opacity-0",
                )}
                style={
                  imageFitInfo
                    ? { width: imageFitInfo.displayedWidth, height: imageFitInfo.displayedHeight, maxWidth: "none" }
                    : { maxWidth: "none" }
                }
                loading="eager"
                decoding="async"
                draggable={false}
                onDragStart={e => e.preventDefault()}
                onLoad={() => setImageLoaded(true)}
                // Error state is tracked in React: `imageLoaded` stays false
                // (image held at opacity-0) and the absolute error overlay
                // covers the strip. No imperative `display:none` needed — that
                // would collapse the inline-block wrapper and shift layout.
                onError={() => setImageError(true)}
              />
              {process.env.NODE_ENV !== "production" && sourceAnchorRatio && imageFitInfo ? (
                <AimOverlay
                  kind="focus"
                  label="focus-aim"
                  x={sourceAnchorRatio.x * imageFitInfo.displayedWidth}
                  y={sourceAnchorRatio.y * imageFitInfo.displayedHeight}
                />
              ) : null}
            </div>

            {/* Loading skeleton — covers the strip until the crop decodes, so the
                keyhole never opens as a blank canvas while the image is in flight. */}
            {!imageLoaded && !imageError && (
              <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                {/* Only the background shimmers — keeping the label static so the
                    pulse animation doesn't make the text harder to read. */}
                <div className="absolute inset-0 animate-pulse bg-dc-muted" />
                <span className="relative text-[11px] text-dc-subtle-foreground">{t("evidence.imageLoading")}</span>
              </div>
            )}

            {/* Error fallback — a failed/missing crop would otherwise leave the
                strip permanently blank with no indication of what went wrong. */}
            {imageError && (
              <div className="absolute inset-0 bg-dc-muted flex items-center justify-center">
                <span className="text-[11px] text-dc-subtle-foreground">{t("evidence.imageUnavailable")}</span>
              </div>
            )}
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
