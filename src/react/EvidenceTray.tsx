/**
 * Evidence tray components — keyhole viewer, expanded image, and related
 * display logic for the citation popover "proof zone".
 *
 * Contains all evidence-display components that were previously in
 * CitationComponent.tsx: image resolution, keyhole viewer, evidence tray,
 * expanded page viewer, search analysis, and supporting utilities.
 *
 * @packageDocumentation
 */

import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { shouldHighlightAnchorText } from "../drawing/citationDrawing.js";
import type { DeepTextItem, ScreenBox } from "../types/boxes.js";
import type { CitationStatus } from "../types/citation.js";
import type { SearchAttempt } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { CitationAnnotationOverlay } from "./CitationAnnotationOverlay.js";
import { computeKeyholeOffset } from "./computeKeyholeOffset.js";
import {
  buildKeyholeMaskImage,
  CONTENT_STAGGER_DELAY_MS,
  EASE_COLLAPSE,
  EASE_EXPAND,
  EVIDENCE_TRAY_BORDER_DASHED,
  EVIDENCE_TRAY_BORDER_SOLID,
  EXPANDED_IMAGE_SHELL_PX,
  EXPANDED_MIN_READABLE_ZOOM,
  EXPANDED_ZOOM_MAX,
  EXPANDED_ZOOM_MIN,
  EXPANDED_ZOOM_STEP,
  HITBOX_EXTEND_8x14,
  isValidProofImageSrc,
  KEYHOLE_EXPANDED_HEIGHT,
  KEYHOLE_FADE_WIDTH,
  KEYHOLE_SKIP_THRESHOLD,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  KEYHOLE_STRIP_HEIGHT_VAR,
  KEYHOLE_WHEEL_ZOOM_SENSITIVITY,
  KEYHOLE_WIDTH_FIT_THRESHOLD,
  KEYHOLE_ZOOM_MAX,
  KEYHOLE_ZOOM_MIN,
  MISS_TRAY_THUMBNAIL_HEIGHT,
  TERTIARY_ACTION_BASE_CLASSES,
  TERTIARY_ACTION_HOVER_CLASSES,
  TERTIARY_ACTION_IDLE_CLASSES,
  WHEEL_ZOOM_SENSITIVITY,
  ZOOM_HINT_DELAY_MS,
  ZOOM_HINT_SESSION_KEY,
} from "./constants.js";
import { formatCaptureDate } from "./dateUtils.js";
import { useDragToPan } from "./hooks/useDragToPan.js";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { useWheelZoom } from "./hooks/useWheelZoom.js";
import { ChevronRightIcon, SpinnerIcon } from "./icons.js";
import { handleImageError } from "./imageUtils.js";
import { computeAnnotationOriginPercent, computeAnnotationScrollTarget } from "./overlayGeometry.js";
import { buildIntentSummary, countUniqueSearchTexts } from "./searchSummaryUtils.js";
import { cn } from "./utils.js";
import { VerificationLogTimeline } from "./VerificationLog.js";
import { ZoomToolbar } from "./ZoomToolbar.js";

// =============================================================================
// MODULE-LEVEL UTILITIES
// =============================================================================

/**
 * Tolerance factor for coordinate scaling sanity checks.
 * PDF text coordinates are extracted at a different resolution than the proof image,
 * so converting between coordinate spaces introduces floating-point rounding errors.
 * A 5% tolerance (1.05×) absorbs these rounding differences — empirically sufficient
 * to avoid false rejections while still catching genuinely out-of-bounds coordinates
 * that would indicate a dimension mismatch between the PDF and proof image.
 */
const SCALING_TOLERANCE = 1.05;

/** Threshold (px) for considering the viewport "drifted" from the annotation. */
/** Scroll drift threshold for locate dirty-bit detection (px).
 *  15px absorbs sub-pixel rendering jitter and browser smooth-scroll overshoot
 *  while being small enough to catch intentional user panning. */
const DRIFT_THRESHOLD_PX = 15;

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

/**
 * Normalizes a webPageScreenshotBase64 field to a usable data URI.
 * The field may arrive as raw base64 or as a complete data URI; both forms are accepted.
 * @throws {Error} If the input is invalid (empty, not a string, or malformed)
 * @internal Exported for testing purposes only
 */
// biome-ignore lint/style/useComponentExportOnlyModules: Utility function exported for testing
export function normalizeScreenshotSrc(raw: string): string {
  // Validate input is a non-empty string
  if (!raw || typeof raw !== "string") {
    throw new Error("normalizeScreenshotSrc: Invalid screenshot data - expected non-empty string");
  }

  // Already a data URI - return as-is
  if (raw.startsWith("data:")) {
    return raw;
  }

  // Validate base64 format (basic check - should only contain valid base64 chars + max 2 padding chars)
  // This prevents injection of malicious strings that would bypass isValidProofImageSrc()
  const BASE64_VALIDATION_PREFIX_LENGTH = 100;
  if (!/^[A-Za-z0-9+/]+(={0,2})?$/.test(raw.slice(0, BASE64_VALIDATION_PREFIX_LENGTH))) {
    throw new Error("normalizeScreenshotSrc: Invalid base64 format detected");
  }

  return `data:image/jpeg;base64,${raw}`;
}

/**
 * Resolves the evidence crop image (keyhole source) from verification data.
 * Prefers the document verification image; falls back to the URL page screenshot.
 * Returns `null` when no valid source is available.
 */
// biome-ignore lint/style/useComponentExportOnlyModules: Utility function used by CitationDrawer
export function resolveEvidenceSrc(verification: Verification | null | undefined): string | null {
  if (verification?.document?.verificationImageSrc) {
    const s = verification.document.verificationImageSrc;
    return isValidProofImageSrc(s) ? s : null;
  }
  const raw = verification?.url?.webPageScreenshotBase64;
  if (!raw) return null;
  try {
    const s = normalizeScreenshotSrc(raw);
    return isValidProofImageSrc(s) ? s : null;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Failed to normalize screenshot src:", e);
    }
    return null;
  }
}

/**
 * Single resolver for the best available full-page image from verification data.
 * Tries in order:
 * 1. matchPage from verification.pages (best: has image, dimensions, highlight, textItems)
 * 2. proof.proofImageUrl (good: CDN image, no overlay data)
 * 2b. First non-match page from verification.pages (for not_found: pages were searched but none matched)
 * 3. url.webPageScreenshotBase64 (URL citations: full page screenshot)
 * 4. document.verificationImageSrc (baseline: keyhole image at full size)
 *
 * Each source is validated with isValidProofImageSrc() before use, blocking SVG data URIs
 * (which can contain scripts), javascript: URIs, and untrusted hosts. Localhost is allowed
 * for development. Invalid sources are skipped and the next tier is tried.
 */
// biome-ignore lint/style/useComponentExportOnlyModules: exported for testing
export function resolveExpandedImage(verification: Verification | null | undefined): ExpandedImageSource | null {
  if (!verification) return null;

  // 1. Best: matching page from verification.pages array
  const matchPage = verification.pages?.find(p => p.isMatchPage);
  if (matchPage?.source && isValidProofImageSrc(matchPage.source)) {
    return {
      src: matchPage.source,
      dimensions: matchPage.dimensions,
      highlightBox: matchPage.highlightBox ?? null,
      renderScale: matchPage.renderScale ?? null,
      textItems: matchPage.textItems ?? [],
    };
  }

  // 2. Good: CDN-hosted proof image
  if (verification.proof?.proofImageUrl && isValidProofImageSrc(verification.proof.proofImageUrl)) {
    return {
      src: verification.proof.proofImageUrl,
      dimensions: null,
      highlightBox: null,
      textItems: [],
    };
  }

  // 2b. Non-match page fallback (for not_found — pages exist but none is a match)
  const anyPage = verification.pages?.[0];
  if (anyPage?.source && isValidProofImageSrc(anyPage.source)) {
    return {
      src: anyPage.source,
      dimensions: anyPage.dimensions,
      highlightBox: null,
      renderScale: anyPage.renderScale ?? null,
      textItems: anyPage.textItems ?? [],
    };
  }

  // 3. URL screenshot — base64-encoded page screenshot (URL citations)
  const urlScreenshot = verification.url?.webPageScreenshotBase64;
  if (urlScreenshot) {
    try {
      const src = normalizeScreenshotSrc(urlScreenshot);
      if (isValidProofImageSrc(src)) {
        return { src, dimensions: null, highlightBox: null, textItems: [] };
      }
    } catch {
      // Malformed base64 — fall through to next candidate
    }
  }

  // 4. Baseline: keyhole verification image at full size
  if (verification.document?.verificationImageSrc && isValidProofImageSrc(verification.document.verificationImageSrc)) {
    return {
      src: verification.document.verificationImageSrc,
      dimensions: verification.document.verificationImageDimensions ?? null,
      highlightBox: null,
      textItems: [],
    };
  }

  return null;
}

// =============================================================================
// VERIFICATION IMAGE COMPONENT — "Keyhole" Crop & Fade
// =============================================================================

/**
 * Resolves the best available highlight bounding box from verification data.
 * Tries in order: matching page highlightBox → anchorTextMatchDeepItems → phraseMatchDeepItem.
 *
 * When the highlight coordinates come from source PDF space, they need to be scaled
 * to the verification image pixel space using the ratio of image dimensions to page dimensions.
 */
function resolveHighlightBox(
  verification: Verification,
): { x: number; y: number; width: number; height: number } | null {
  // 1. Prefer highlightBox from matching verification page (already in image coordinates)
  const matchPage = verification.pages?.find(p => p.isMatchPage);
  if (matchPage?.highlightBox) {
    return {
      x: matchPage.highlightBox.x,
      y: matchPage.highlightBox.y,
      width: matchPage.highlightBox.width,
      height: matchPage.highlightBox.height,
    };
  }

  const imgDims = verification.document?.verificationImageDimensions;

  // Helper: scale a DeepTextItem from PDF space to image pixel space.
  // If the scaled result falls outside the image bounds, assumes coordinates
  // are already in image space and returns them unscaled.
  const scaleItem = (item: { x: number; y: number; width: number; height: number }) => {
    if (imgDims && matchPage?.dimensions && matchPage.dimensions.width > 0) {
      const scaleX = imgDims.width / matchPage.dimensions.width;
      const scaleY =
        imgDims.height && matchPage.dimensions.height > 0 ? imgDims.height / matchPage.dimensions.height : scaleX;
      const scaledX = item.x * scaleX;
      const scaledWidth = item.width * scaleX;
      // Sanity check: if scaled coords are within image bounds, use them
      if (scaledX >= 0 && scaledX + scaledWidth <= imgDims.width * SCALING_TOLERANCE) {
        return { x: scaledX, y: item.y * scaleY, width: scaledWidth, height: item.height * scaleY };
      }
    }
    // Assume image coordinates if scaling is unavailable or produces out-of-bounds values
    return { x: item.x, y: item.y, width: item.width, height: item.height };
  };

  // 2. Anchor text match deep items (may be in PDF space, scale if we have dimensions)
  const anchorItem = verification.document?.anchorTextMatchDeepItems?.[0];
  if (anchorItem) return scaleItem(anchorItem);

  // 3. Phrase match deep item
  const phraseItem = verification.document?.phraseMatchDeepItem;
  if (phraseItem) return scaleItem(phraseItem);

  return null;
}

/** CSS to hide native scrollbars on the keyhole strip. */
const KEYHOLE_SCROLLBAR_HIDE: React.CSSProperties = {
  scrollbarWidth: "none", // Firefox
  msOverflowStyle: "none", // IE/Edge
};

/**
 * "Scroll to zoom" hint badge — appears after a hover dwell, auto-dismisses
 * after first wheel zoom event. Shows once per session via sessionStorage.
 */
function ZoomHint({
  isHovering,
  hasZoomed,
  enabled = true,
}: {
  isHovering: boolean;
  hasZoomed: boolean;
  enabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(ZOOM_HINT_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Show after hover dwell
  useEffect(() => {
    if (!enabled || dismissed || hasZoomed || !isHovering) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), ZOOM_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, isHovering, dismissed, hasZoomed]);

  // Dismiss permanently on first zoom
  useEffect(() => {
    if (hasZoomed && !dismissed) {
      setDismissed(true);
      setVisible(false);
      try {
        sessionStorage.setItem(ZOOM_HINT_SESSION_KEY, "1");
      } catch {
        /* quota exceeded — harmless */
      }
    }
  }, [hasZoomed, dismissed]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="absolute bottom-2 right-2 text-[10px] text-white/90 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5 pointer-events-none select-none animate-in fade-in-0 duration-150"
    >
      Scroll to zoom
    </div>
  );
}

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
  verification,
  onImageClick,
  onKeyholeWidth,
  expanded = false,
}: {
  verification: Verification;
  onImageClick?: () => void;
  onKeyholeWidth?: (width: number) => void;
  /** When true, the keyhole grows to KEYHOLE_EXPANDED_HEIGHT in-place. */
  expanded?: boolean;
}) {
  // Resolve highlight region from verification data
  const highlightBox = useMemo(() => resolveHighlightBox(verification), [verification]);

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

  // --- Keyhole zoom state ---
  const [keyholeZoom, setKeyholeZoom] = useState(1.0);
  const [hasZoomed, setHasZoomed] = useState(false);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const keyholeZoomRef = useRef(keyholeZoom);
  useEffect(() => {
    keyholeZoomRef.current = keyholeZoom;
  });

  const clampKeyholeZoom = useCallback(
    (z: number) => Math.max(KEYHOLE_ZOOM_MIN, Math.min(KEYHOLE_ZOOM_MAX, Math.round(z * 100) / 100)),
    [],
  );
  const clampKeyholeZoomRaw = useCallback((z: number) => Math.max(KEYHOLE_ZOOM_MIN, Math.min(KEYHOLE_ZOOM_MAX, z)), []);

  const { isHovering, gestureAnchorRef } = useWheelZoom({
    enabled: imageLoaded,
    sensitivity: KEYHOLE_WHEEL_ZOOM_SENSITIVITY,
    containerRef: containerRef as React.RefObject<HTMLElement | null>,
    wrapperRef: imageWrapperRef,
    zoom: keyholeZoom,
    clampZoomRaw: clampKeyholeZoomRaw,
    clampZoom: clampKeyholeZoom,
    onZoomCommit: (z: number) => {
      setKeyholeZoom(z);
      if (!hasZoomed) setHasZoomed(true);
    },
  });

  // Scroll correction after zoom commit — runs before paint so the
  // anchor point stays visually stable when the image resizes.
  // keyholeZoomRef still holds the OLD zoom during useLayoutEffect
  // (useEffect hasn't updated it yet), giving us the ratio we need.
  // biome-ignore lint/correctness/useExhaustiveDependencies: gestureAnchorRef and containerRef are stable ref objects
  useLayoutEffect(() => {
    const wrapper = imageWrapperRef.current;
    if (wrapper) wrapper.style.transform = "";

    const anchor = gestureAnchorRef.current;
    const el = containerRef.current;
    if (!anchor || !el) {
      gestureAnchorRef.current = null;
      return;
    }

    const oldZoom = keyholeZoomRef.current;
    if (oldZoom > 0) {
      const ratio = keyholeZoom / oldZoom;
      el.scrollLeft = (anchor.mx + anchor.sx) * ratio - anchor.mx;
      el.scrollTop = (anchor.my + anchor.sy) * ratio - anchor.my;
    }
    gestureAnchorRef.current = null;
  }, [keyholeZoom]);

  // Set initial scroll position after image loads.
  // useLayoutEffect guarantees refs are populated and runs before paint,
  // so the strip appears at the correct offset without a flash of misposition.
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef and imageRef are stable refs that never change identity; useLayoutEffect guarantees the DOM nodes they point to are ready
  useLayoutEffect(() => {
    if (!imageLoaded) return;
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
      const effectiveWidth = Math.min(containerWidth, img.naturalWidth);
      const effectiveHeight = img.naturalHeight * (effectiveWidth / img.naturalWidth);

      setImageFitInfo({ displayedWidth: effectiveWidth, imageFitsCompletely: false, isWidthFit: true });
      if (effectiveWidth > 0) onKeyholeWidth?.(effectiveWidth);

      // Vertical centering: scroll to the highlight region or center of image
      if (highlightBox) {
        const displayScale = effectiveWidth / img.naturalWidth;
        const highlightCenterY = highlightBox.y * displayScale + (highlightBox.height * displayScale) / 2;
        container.scrollTop = Math.max(0, highlightCenterY - stripHeight / 2);
      } else {
        container.scrollTop = Math.max(0, (effectiveHeight - stripHeight) / 2);
      }
      container.scrollLeft = 0;
    } else {
      // Height-fit mode (default): detect whether the image nearly fits within the keyhole.
      // Uses KEYHOLE_SKIP_THRESHOLD (1.5) so images up to 50% taller than the strip
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

      // Scale highlight box from image-natural coordinates to displayed coordinates.
      // resolveHighlightBox() returns coords in the verificationImage's natural pixel
      // space, but the scroll container operates in the displayed (strip-height-scaled)
      // space. Without this, the centering algorithm sees the highlight as far off-screen.
      const displayScale = img.naturalWidth > 0 ? displayedWidth / img.naturalWidth : 1;
      const scaledHighlight = highlightBox
        ? { x: highlightBox.x * displayScale, width: highlightBox.width * displayScale }
        : null;

      const { scrollLeft } = computeKeyholeOffset(displayedWidth, containerWidth, scaledHighlight);
      container.scrollLeft = scrollLeft;
    }

    // Trigger scroll event so useDragToPan updates fade state for initial position
    container.dispatchEvent(new Event("scroll"));
  }, [imageLoaded, highlightBox]);

  // Compute fade mask based on scroll state
  const maskImage = useMemo(
    () => buildKeyholeMaskImage(scrollState.canScrollLeft, scrollState.canScrollRight, KEYHOLE_FADE_WIDTH),
    [scrollState.canScrollLeft, scrollState.canScrollRight],
  );

  const rawUrlScreenshot = verification.url?.webPageScreenshotBase64;
  let normalizedUrlScreenshot: string | undefined;
  if (rawUrlScreenshot) {
    try {
      normalizedUrlScreenshot = normalizeScreenshotSrc(rawUrlScreenshot);
    } catch {
      /* malformed */
    }
  }
  const rawImageSrc = verification.document?.verificationImageSrc ?? normalizedUrlScreenshot;
  const imageSrc = isValidProofImageSrc(rawImageSrc) ? rawImageSrc : null;
  if (!imageSrc) return null;

  const stripHeightStyle = `var(${KEYHOLE_STRIP_HEIGHT_VAR}, ${KEYHOLE_STRIP_HEIGHT_DEFAULT}px)`;
  const effectiveHeight = expanded ? `${KEYHOLE_EXPANDED_HEIGHT}px` : stripHeightStyle;
  // Scale maxWidth proportionally when expanded so the image isn't clipped.
  const expandRatio = expanded ? KEYHOLE_EXPANDED_HEIGHT / KEYHOLE_STRIP_HEIGHT_DEFAULT : 1;
  const isWidthFit = imageFitInfo?.isWidthFit ?? false;
  const isPannable =
    scrollState.canScrollLeft || scrollState.canScrollRight || scrollState.canScrollUp || scrollState.canScrollDown;
  // When the image fits entirely in the keyhole, expanding would show nothing new — suppress affordances.
  const canExpand = !imageFitInfo?.imageFitsCompletely && !!onImageClick;

  return (
    <div className="relative">
      {/* Keyhole strip container — clickable to expand, draggable to pan.
          maxWidth clamps to the image's rendered width so no blank space appears to the right. */}
      <div
        className="relative group/keyhole"
        style={
          imageFitInfo && !isWidthFit
            ? { maxWidth: imageFitInfo.displayedWidth * keyholeZoom * expandRatio }
            : undefined
        }
      >
        <button
          type="button"
          className="block relative w-full"
          title={
            !canExpand && !expanded && !isPannable && imageFitInfo?.imageFitsCompletely
              ? "Already full size"
              : undefined
          }
          style={{
            cursor: isDragging
              ? "grabbing"
              : expanded
                ? "zoom-out"
                : canExpand
                  ? "zoom-in"
                  : isPannable
                    ? "grab"
                    : "default",
          }}
          onKeyDown={e => {
            const el = containerRef.current;
            if (!el) return;
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              el.scrollTo({ left: el.scrollLeft - Math.max(el.clientWidth * 0.5, 80), behavior: "smooth" });
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              el.scrollTo({ left: el.scrollLeft + Math.max(el.clientWidth * 0.5, 80), behavior: "smooth" });
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
            if (canExpand || expanded) {
              onImageClick?.();
            }
          }}
          aria-label={
            [
              isPannable && "Drag or click arrows to pan",
              (canExpand || expanded) && (expanded ? "click to collapse" : "click to view full size"),
            ]
              .filter(Boolean)
              .join(", ") || "Verification image"
          }
        >
          <div
            ref={containerRef}
            data-dc-keyhole=""
            className={
              isWidthFit || keyholeZoom > 1 || expanded ? "overflow-auto" : "overflow-x-auto overflow-y-hidden"
            }
            style={{
              height: effectiveHeight,
              transition: `height 200ms ${expanded ? EASE_EXPAND : EASE_COLLAPSE}`,
              // Fade mask only applies in height-fit mode (horizontal overflow).
              // In width-fit mode, there's no horizontal overflow so mask is "none" automatically.
              WebkitMaskImage: maskImage,
              maskImage,
              ...KEYHOLE_SCROLLBAR_HIDE,
              cursor: isDragging
                ? "grabbing"
                : expanded
                  ? "zoom-out"
                  : canExpand
                    ? "zoom-in"
                    : isPannable
                      ? "grab"
                      : "default",
              // Hover ring affordance signals zoom interactivity
              ...(isHovering && !isDragging
                ? { boxShadow: "inset 0 0 0 2px rgba(96, 165, 250, 0.2)", borderRadius: "2px" }
                : {}),
            }}
            {...handlers}
          >
            {/* Hide webkit scrollbar via inline style tag scoped to this container */}
            <style>{`[data-dc-keyhole]::-webkit-scrollbar { display: none; }`}</style>
            <div ref={imageWrapperRef} style={{ display: "inline-block", position: "relative" }}>
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Citation verification"
                className={isWidthFit ? "block select-none" : "block w-auto max-w-none select-none"}
                style={
                  isWidthFit
                    ? { width: imageFitInfo?.displayedWidth, height: "auto", maxWidth: "none" }
                    : {
                        height: keyholeZoom === 1 ? effectiveHeight : `calc(${effectiveHeight} * ${keyholeZoom})`,
                      }
                }
                loading="eager"
                decoding="async"
                draggable={false}
                onLoad={() => setImageLoaded(true)}
                onError={handleImageError}
              />
            </div>
          </div>

          {/* Left pan hint — clicking pans the image left */}
          {scrollState.canScrollLeft && (
            <div
              aria-hidden="true"
              className="absolute left-0 top-0 h-full min-w-[44px] flex items-center justify-center opacity-0 group-hover/keyhole:opacity-100 transition-opacity duration-150 cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                const el = containerRef.current;
                if (!el) return;
                el.scrollTo({ left: el.scrollLeft - Math.max(el.clientWidth * 0.5, 80), behavior: "smooth" });
              }}
            >
              <span className="text-sm font-bold text-white bg-black/50 w-7 h-7 flex items-center justify-center rounded-full leading-none">
                ←
              </span>
            </div>
          )}

          {/* Right pan hint — clicking pans the image right */}
          {scrollState.canScrollRight && (
            <div
              aria-hidden="true"
              className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center opacity-0 group-hover/keyhole:opacity-100 transition-opacity duration-150 cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                const el = containerRef.current;
                if (!el) return;
                el.scrollTo({ left: el.scrollLeft + Math.max(el.clientWidth * 0.5, 80), behavior: "smooth" });
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

          {/* Zoom hint badge — shows once per session on hover dwell.
              Only shown when the image has meaningful zoom range (> 2×). */}
          <ZoomHint isHovering={isHovering} hasZoomed={hasZoomed} enabled={KEYHOLE_ZOOM_MAX / keyholeZoom > 2} />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// EVIDENCE TRAY COMPONENTS
// =============================================================================

/**
 * Minimal footer for the evidence tray: date on the left, "View page ›" CTA on the right.
 * For miss states, an optional "› N searches" toggle sits between the date and CTA.
 */
function EvidenceTrayFooter({
  verifiedAt,
  onPageClick,
  searchCount,
  isSearchLogOpen,
  onToggleSearchLog,
  locationLabel,
}: {
  verifiedAt?: Date | string | null;
  /** When provided, renders a "View page" CTA button */
  onPageClick?: () => void;
  /** Number of unique search texts (toggle hidden when 0 or absent) */
  searchCount?: number;
  /** Whether the search log is currently expanded */
  isSearchLogOpen?: boolean;
  /** Toggle callback — when provided and searchCount > 0, renders the toggle */
  onToggleSearchLog?: () => void;
  /** Location label to append after search count (e.g. "page 1", "full document") */
  locationLabel?: string;
}) {
  const formatted = formatCaptureDate(verifiedAt);
  const dateStr = formatted?.display ?? "";
  const showToggle = onToggleSearchLog && searchCount != null && searchCount > 0;

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
                className="size-3 shrink-0 transition-transform duration-150"
                style={isSearchLogOpen ? { transform: "rotate(90deg)" } : undefined}
              >
                <ChevronRightIcon />
              </span>
              <span>
                {searchCount} search{searchCount === 1 ? "" : "es"}
                {locationLabel && <> · {locationLabel}</>}
              </span>
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
          >
            <span>View page</span>
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
        <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">(p.{snippet.page})</span>
      )}
      {!snippet.isProximate && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1 italic">(different section)</span>
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
  const intentSummary = useMemo(() => buildIntentSummary(verification, searchAttempts), [verification, searchAttempts]);

  // Primary message based on outcome
  const primaryMessage =
    intentSummary?.outcome === "not_found"
      ? "Text not found in document"
      : intentSummary?.outcome === "related_found"
        ? "Similar text found"
        : null;

  // Snippets for related_found outcome (limit to 3)
  const snippets = intentSummary?.snippets?.slice(0, 3) ?? [];

  return (
    <div className="px-3 py-2 space-y-1.5">
      {/* Primary message */}
      {primaryMessage && <div className="text-[11px] text-gray-600 dark:text-gray-300">{primaryMessage}</div>}

      {/* Snippets for related_found */}
      {snippets.length > 0 && (
        <div className="space-y-1">
          {snippets.map((snippet, idx) => (
            <MatchSnippetDisplay key={`snippet-${idx}-${snippet.matchStart}`} snippet={snippet} />
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
 * @param proofImageSrc - Full-page proof image for miss states only. Ignored when
 *   `hasImage` is truthy (verified/partial path renders the keyhole image instead).
 */
export function EvidenceTray({
  verification,
  status,
  onExpand,
  onImageClick,
  proofImageSrc,
  onKeyholeWidth,
  keyholeExpanded = false,
}: {
  verification: Verification | null;
  status: CitationStatus;
  onExpand?: () => void;
  onImageClick?: () => void;
  proofImageSrc?: string;
  onKeyholeWidth?: (width: number) => void;
  /** When true, the keyhole image is expanded in-place. */
  keyholeExpanded?: boolean;
}) {
  const hasImage = verification?.document?.verificationImageSrc || verification?.url?.webPageScreenshotBase64;
  const isMiss = status.isMiss;
  const searchAttempts = verification?.searchAttempts ?? [];
  const borderClass = isMiss ? EVIDENCE_TRAY_BORDER_DASHED : EVIDENCE_TRAY_BORDER_SOLID;
  const prefersReducedMotion = usePrefersReducedMotion();

  // Tray-level click: keyhole click if available, else page expansion
  const trayAction = onImageClick ?? onExpand;

  // Search log toggle state (miss states only)
  const [showSearchLog, setShowSearchLog] = useState(false);
  const searchCount = useMemo(() => (isMiss ? countUniqueSearchTexts(searchAttempts) : 0), [isMiss, searchAttempts]);

  // Footer element — shared across top/bottom placement
  const footerEl = (
    <EvidenceTrayFooter
      verifiedAt={verification?.verifiedAt}
      onPageClick={onExpand}
      searchCount={isMiss ? searchCount : undefined}
      isSearchLogOpen={showSearchLog}
      onToggleSearchLog={isMiss ? () => setShowSearchLog(prev => !prev) : undefined}
    />
  );

  // Shared inner content
  const content = (
    <>
      {/* Content: image or search analysis.
          Keys prevent React from reusing fibers across component-type swaps. */}
      {hasImage && verification ? (
        <AnchorTextFocusedImage
          key="keyhole"
          verification={verification}
          onImageClick={onImageClick}
          onKeyholeWidth={onKeyholeWidth}
          expanded={keyholeExpanded}
        />
      ) : isMiss && (searchAttempts.length > 0 || isValidProofImageSrc(proofImageSrc)) ? (
        <div key="miss-analysis">
          {isValidProofImageSrc(proofImageSrc) && (
            <div className="overflow-hidden" style={{ height: MISS_TRAY_THUMBNAIL_HEIGHT }}>
              <img
                src={proofImageSrc}
                className="w-full h-full object-cover object-center"
                draggable={false}
                alt="Searched page"
              />
            </div>
          )}
          {searchAttempts.length > 0 && (
            <SearchAnalysisSummary searchAttempts={searchAttempts} verification={verification} />
          )}
          {footerEl}
          {searchAttempts.length > 0 && (
            <div
              className="grid transition-[grid-template-rows]"
              style={{
                gridTemplateRows: showSearchLog ? "1fr" : "0fr",
                ...(prefersReducedMotion
                  ? { transitionDuration: "0ms" }
                  : {
                      transitionDuration: showSearchLog ? "200ms" : "120ms",
                      transitionTimingFunction: showSearchLog ? EASE_EXPAND : EASE_COLLAPSE,
                    }),
              }}
            >
              <div className="overflow-hidden" style={{ minHeight: 0 }}>
                <div className="border-t border-gray-200 dark:border-gray-700">
                  <VerificationLogTimeline
                    searchAttempts={searchAttempts}
                    fullPhrase={verification?.citation?.fullPhrase ?? verification?.verifiedFullPhrase ?? undefined}
                    anchorText={verification?.citation?.anchorText ?? verification?.verifiedAnchorText ?? undefined}
                    status="not_found"
                    onCollapse={() => setShowSearchLog(false)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Footer — placed after the miss block for non-miss states */}
      {!isMiss && footerEl}
    </>
  );

  return (
    <div className="m-3">
      {trayAction ? (
        /* Interactive: clickable with hover CTA */
        <div
          role="button"
          tabIndex={0}
          onClick={e => {
            e.stopPropagation();
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
          aria-label="Expand to full page"
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

/**
 * Apply a CSS transform to the image wrapper during a zoom gesture.
 * Uses `transform-origin: 0 0` with translate+scale so the content point under
 * the anchor (midpoint/cursor) stays visually stable without updating origin per-frame.
 *
 * Formula: Cx = anchor.mx + anchor.sx (content-space X under anchor)
 *          Cy = anchor.my + anchor.sy (content-space Y under anchor)
 *          s  = gestureZoom / committedZoom (gesture scale factor)
 *          transform: translate(Cx*(1-s), Cy*(1-s)) scale(s)
 */
function applyGestureTransform(
  wrapper: HTMLDivElement,
  gestureZoom: number,
  committedZoom: number,
  anchor: { mx: number; my: number; sx: number; sy: number },
): void {
  const s = gestureZoom / committedZoom;
  const cx = anchor.mx + anchor.sx;
  const cy = anchor.my + anchor.sy;
  wrapper.style.transform = `translate(${cx * (1 - s)}px, ${cy * (1 - s)}px) scale(${s})`;
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
  fill = false,
  onNaturalSize,
  renderScale,
  highlightItem,
  anchorItem,
  initialOverlayHidden = false,
  showOverlay,
}: {
  src: string;
  onCollapse: () => void;
  verification?: Verification | null;
  /** When true, the component expands to fill its flex parent (for use inside flex-column containers). */
  fill?: boolean;
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
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const { containerRef, isDragging, handlers: panHandlers, wasDraggingRef } = useDragToPan({ direction: "xy" });
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
  // Zoom state — only active when fill=true (expanded-page mode).
  // 1.0 = natural pixel size. < 1.0 = fit-to-screen (shrunk to container).
  const [zoom, setZoom] = useState(1);
  // Ref mirror of zoom for touch event handlers (avoids stale closures in pinch gesture).
  // Updated in an effect (not during render) to avoid a React Compiler bailout.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  });
  // Dynamic zoom floor: on narrow viewports the fit-to-screen zoom may be below
  // EXPANDED_ZOOM_MIN (e.g. 29% for a 1700px image on a 550px viewport).
  // This floor feeds into the slider min, zoom-out disabled check, and clampZoom
  // so the user can't zoom below the level that fits the viewport width.
  const [zoomFloor, setZoomFloor] = useState(EXPANDED_ZOOM_MIN);
  // Container size as state (not ref) so that ResizeObserver updates trigger re-renders.
  // This ensures the initial-zoom effect re-fires once the container is measured.
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  // Viewport width as state so the fit-to-screen effect re-runs on window resize.
  // The effect uses window.innerWidth to compute maxImageWidth; without this reactive
  // dependency, the popover's expanded width stays stale after viewport changes.
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 0));
  useEffect(() => {
    if (!fill) return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fill]);
  // Tracks whether zoom was changed by explicit user interaction (slider/wheel/pinch).
  // When true, viewport resizes keep the user's zoom level instead of re-fitting.
  const hasManualZoomRef = useRef(false);
  // Auto-locate only once per image load; resizing should not keep re-centering/pulling view.
  const hasAutoScrolledToAnnotationRef = useRef(false);

  // ---------------------------------------------------------------------------
  // GPU-accelerated gesture zoom refs
  // During pinch/wheel gestures, CSS transform: scale() is applied to the wrapper
  // div (GPU-composited, zero layout reflow). On gesture end, the final zoom is
  // committed to React state → width reflow → transform removed in one paint frame.
  // ---------------------------------------------------------------------------
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  // Touch pinch gesture zoom (separate from wheel zoom hook).
  const touchGestureZoomRef = useRef<number | null>(null);
  // Touch pinch anchor — used by applyGestureTransform and useLayoutEffect for scroll correction.
  const touchGestureAnchorRef = useRef<{ mx: number; my: number; sx: number; sy: number } | null>(null);

  // Effective annotation items: override props take precedence, then verification.document, then null.
  const effectivePhraseItem = highlightItem ?? verification?.document?.phraseMatchDeepItem ?? null;
  const effectiveAnchorItem = anchorItem ?? verification?.document?.anchorTextMatchDeepItems?.[0] ?? null;

  // Anchor-aware scroll/zoom target: when anchor text is highlighted, center on it
  // instead of the (potentially wider) full phrase box.
  const anchorHighlightActive =
    effectiveAnchorItem &&
    shouldHighlightAnchorText(verification?.verifiedAnchorText, verification?.verifiedFullPhrase);
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

  // Reset all image state when src changes — spinner, dimensions, zoom, overlay.
  // Uses a useEffect (not render-time setState) to avoid a React Compiler bailout
  // from multiple setState calls in the render body. The one-frame delay is
  // imperceptible since InlineExpandedImage is typically hidden (display:none) in
  // the triple-always-render pattern during view-state transitions.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref identities are stable; initialOverlayHidden is the reset target value, not a reactive dependency
  useEffect(() => {
    setImageLoaded(false);
    setNaturalWidth(null);
    setNaturalHeight(null);
    setZoom(1);
    setZoomFloor(EXPANDED_ZOOM_MIN);
    setOverlayHidden(initialOverlayHidden);
    hasManualZoomRef.current = false;
    hasAutoScrolledToAnnotationRef.current = false;
    lastReportedSizeRef.current = null;
    touchGestureZoomRef.current = null;
    touchGestureAnchorRef.current = null;
    expandedWheelAnchorRef.current = null;
  }, [src]);

  // ---------------------------------------------------------------------------
  // Locate dirty bit — tracks whether the viewport has drifted from the annotation.
  // Starts false (on-target after initial snap). Set true when user pans away.
  // Set false again when handleScrollToAnnotation re-centers.
  // Declared before the fit-to-screen effect which references setLocateDirty and
  // annotationScrollTarget to satisfy the React Compiler's declaration-order requirement.
  // ---------------------------------------------------------------------------
  const [locateDirty, setLocateDirty] = useState(false);
  // Ref storing the expected scroll position after a programmatic scroll.
  // Used by the scroll listener to detect user-initiated drift.
  const annotationScrollTarget = useRef<{ left: number; top: number } | null>(null);
  // Guard: true while a programmatic smooth-scroll is in progress.
  // Prevents intermediate scroll events during the animation from marking dirty.
  const isAnimatingScroll = useRef(false);

  // Fit-to-screen: scale the page image to fit both the available width AND height.
  // Width uses the VIEWPORT (minus popover margins + shell padding) because the
  // container still reflects the previous evidence-width popover before the morph.
  // Height uses containerSize.height from the ResizeObserver — the flex layout
  // (flex-1 min-h-0 under a maxHeight-constrained column) has already allocated
  // exactly the vertical space remaining after header zones and margins.
  useEffect(() => {
    if (!fill || !imageLoaded || !naturalWidth || !naturalHeight) return;
    if (!containerSize || containerSize.width <= 0 || containerSize.height <= 0) return;
    // Max image width the popover can provide: viewport - 2rem outer margin - shell px.
    // Uses viewportWidth state (tracked via resize listener) so the effect re-runs on resize.
    const maxImageWidth = viewportWidth > 0 ? viewportWidth - 32 - EXPANDED_IMAGE_SHELL_PX : containerSize.width;
    const fitZoomW = maxImageWidth / naturalWidth;
    // fitZoom = the zoom that fits the page width to the container (minimum usable zoom).
    const fitZoom = Math.min(1, Math.max(0.1, fitZoomW));
    // readableZoom = initial zoom clamped to a readable minimum (65%).
    // On narrow viewports where fitZoomW < 0.65, this starts zoomed in for legibility
    // with horizontal panning (already handled by overflow:auto + useDragToPan xy).
    const readableZoom = Math.min(1, Math.max(EXPANDED_MIN_READABLE_ZOOM, fitZoomW));
    if (!hasManualZoomRef.current) {
      setZoom(prevZoom => (Math.abs(prevZoom - readableZoom) < 0.005 ? prevZoom : readableZoom));
    }
    // zoomFloor uses fitZoom (not readableZoom) so the user can still zoom OUT
    // to fit-to-screen via the slider, below the readable minimum.
    setZoomFloor(Math.min(EXPANDED_ZOOM_MIN, fitZoom));
    const effectiveZoom = hasManualZoomRef.current ? zoomRef.current : readableZoom;
    // Report zoomed dimensions so the popover sizes to the displayed image,
    // not the natural pixel width (which could be e.g. 1700px for a PDF page).
    const reportedW = Math.round(naturalWidth * effectiveZoom);
    const reportedH = Math.round(naturalHeight * effectiveZoom);
    const last = lastReportedSizeRef.current;
    if (!last || last.w !== reportedW || last.h !== reportedH) {
      lastReportedSizeRef.current = { w: reportedW, h: reportedH };
      onNaturalSize?.(reportedW, reportedH);
    }

    // Auto-scroll to annotation: after fit-to-screen zoom is computed, scroll
    // the container so the annotation is centered in view.
    // Uses rAF to wait for the DOM to reflow at the new zoom level.
    // Prefers anchor text position when it will be highlighted.
    if (hasAutoScrolledToAnnotationRef.current || hasManualZoomRef.current) return;

    let rafId: number | undefined;
    const scrollItem = scrollTarget ?? effectivePhraseItem;
    if (scrollItem && renderScale) {
      hasAutoScrolledToAnnotationRef.current = true;
      rafId = requestAnimationFrame(() => {
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
          container.scrollLeft = target.scrollLeft;
          container.scrollTop = target.scrollTop;
          // Record snap position for dirty-bit detection
          annotationScrollTarget.current = { left: target.scrollLeft, top: target.scrollTop };
          setLocateDirty(false);
        }
      });
    }
    return () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, [
    fill,
    imageLoaded,
    naturalWidth,
    naturalHeight,
    containerSize,
    viewportWidth,
    onNaturalSize,
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
      annotationScrollTarget.current = { left: target.scrollLeft, top: target.scrollTop };
      isAnimatingScroll.current = true;
      setLocateDirty(false);
      container.scrollTo({ left: target.scrollLeft, top: target.scrollTop, behavior: "smooth" });
    }
  }, [scrollTarget, effectivePhraseItem, containerRef, renderScale, naturalWidth, naturalHeight]);

  // Scroll listener for locate dirty-bit detection.
  // Compares current scroll position against the stored annotation target.
  // During programmatic smooth-scrolls (isAnimatingScroll), we wait for the
  // scroll to arrive near the target before enabling drift detection.
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
  // GPU-accelerated Ctrl+wheel zoom (expanded page requires Ctrl — bare scroll pans).
  // Uses useWheelZoom hook: CSS transform during gesture, commits on 150ms debounce.
  // ---------------------------------------------------------------------------
  const { gestureAnchorRef: expandedWheelAnchorRef } = useWheelZoom({
    enabled: fill && imageLoaded,
    sensitivity: WHEEL_ZOOM_SENSITIVITY,
    containerRef: containerRef as React.RefObject<HTMLElement | null>,
    wrapperRef: imageWrapperRef,
    zoom,
    clampZoomRaw,
    clampZoom,
    onZoomCommit: (z: number) => {
      hasManualZoomRef.current = true;
      setZoom(z);
    },
    requireCtrl: true,
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
        if (dist < Number.EPSILON) return; // fingers at same point — avoid division by zero
        initialDistance = dist;
        initialZoom = zoomRef.current;
        const wrapper = imageWrapperRef.current;
        if (wrapper) {
          wrapper.style.willChange = "transform";
          wrapper.style.transformOrigin = "0 0";
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initialDistance === null) return;
      e.preventDefault(); // prevent native scroll while pinching

      const wrapper = imageWrapperRef.current;
      if (!wrapper) return;

      const currentDistance = getTouchDistance(e.touches);
      const scale = currentDistance / initialDistance;
      // Raw clamp (no rounding) for continuous GPU scaling during gesture
      const newZoom = clampZoomRaw(initialZoom * scale);

      // Update gesture state
      touchGestureZoomRef.current = newZoom;

      // Update anchor to current midpoint + scroll (follows fingers)
      const mid = getTouchMidpoint(e.touches);
      const rect = el.getBoundingClientRect();
      touchGestureAnchorRef.current = {
        mx: mid.x - rect.left,
        my: mid.y - rect.top,
        sx: el.scrollLeft,
        sy: el.scrollTop,
      };

      // Apply transform directly to DOM — zero React renders during gesture
      applyGestureTransform(wrapper, newZoom, zoomRef.current, touchGestureAnchorRef.current);
    };

    const onTouchEnd = () => {
      initialDistance = null;
      const wrapper = imageWrapperRef.current;
      const finalZoom = touchGestureZoomRef.current;
      if (finalZoom !== null) {
        touchGestureZoomRef.current = null;
        hasManualZoomRef.current = true;
        setZoom(clampZoom(finalZoom));
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
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [fill, clampZoom, clampZoomRaw]);

  // ---------------------------------------------------------------------------
  // Gesture commit: runs after React renders the new zoom → width change.
  // useLayoutEffect fires after DOM mutations but before browser paint, so we can:
  // 1. Remove the CSS transform (layout already reflects the new width)
  // 2. Compute scroll correction from the gesture anchor
  // Both happen in the same paint frame — no visual flash.
  // ---------------------------------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef/imageWrapperRef/expandedWheelAnchorRef are stable ref objects — their identity never changes
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
    // zoomRef.current still holds the OLD committed zoom (useEffect hasn't fired yet).
    const oldZoom = zoomRef.current;
    if (oldZoom > 0) {
      const ratio = zoom / oldZoom;
      el.scrollLeft = (anchor.mx + anchor.sx) * ratio - anchor.mx;
      el.scrollTop = (anchor.my + anchor.sy) * ratio - anchor.my;
    }
    touchGestureAnchorRef.current = null;
    expandedWheelAnchorRef.current = null;
  }, [zoom]);

  // Compute effective image width for zoom
  const zoomedWidth = fill && naturalWidth ? naturalWidth * zoom : undefined;

  // Lock the outer container width while the range slider is being dragged so
  // the absolutely-positioned zoom controls don't shift under the user's cursor.
  // When maxWidth shrinks (zoom-out), the container's right edge moves left,
  // pulling the controls along. minWidth >= maxWidth overrides the shrink.
  const outerRef = useRef<HTMLDivElement>(null);
  const [sliderLockWidth, setSliderLockWidth] = useState<number | null>(null);
  useEffect(() => {
    if (sliderLockWidth === null) return;
    const unlock = () => setSliderLockWidth(null);
    document.addEventListener("pointerup", unlock, { once: true });
    return () => document.removeEventListener("pointerup", unlock);
  }, [sliderLockWidth]);

  // Show zoom controls in fill mode when image has loaded
  const showZoomControls = fill && imageLoaded && naturalWidth !== null;
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

  const footerEl = (
    <div className="bg-white dark:bg-gray-900 rounded-b-sm border border-t-0 border-gray-200 dark:border-gray-700">
      <EvidenceTrayFooter verifiedAt={verification?.verifiedAt} />
    </div>
  );

  return (
    <div
      ref={outerRef}
      className={cn(
        "relative mx-3 mb-3",
        !fill && "animate-in fade-in-0 duration-150",
        fill && "flex-1 min-h-0 flex flex-col",
      )}
      style={
        fill
          ? undefined // fill mode: container fills popover width, image scrolls inside
          : zoomedWidth
            ? sliderLockWidth
              ? { width: sliderLockWidth, minWidth: sliderLockWidth, maxWidth: sliderLockWidth }
              : { maxWidth: zoomedWidth }
            : naturalWidth
              ? { maxWidth: naturalWidth }
              : undefined
      }
    >
      {/* Wrapper: relative so zoom controls can be positioned absolutely over the scroll area */}
      <div className={cn("relative", fill && "flex-1 min-h-0 flex flex-col")}>
        {/* Scrollable image area — click (no drag) collapses */}
        <div
          ref={containerRef}
          data-dc-inline-expanded=""
          role="button"
          tabIndex={0}
          aria-label="Expanded verification image, click or press Enter to collapse"
          className={cn(
            "relative bg-gray-50 dark:bg-gray-900 select-none overflow-auto rounded-t-sm",
            fill && "flex-1 min-h-0",
          )}
          style={{
            ...(fill ? {} : { maxHeight: "min(600px, 80dvh)" }),
            overscrollBehavior: "none",
            cursor: isDragging ? "grabbing" : "zoom-out",
            ...KEYHOLE_SCROLLBAR_HIDE,
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
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onCollapse();
            }
          }}
          {...panHandlers}
        >
          <style>{`[data-dc-inline-expanded]::-webkit-scrollbar { display: none; }`}</style>
          {/* Keyed on src: remounts with a fade-in whenever the image swaps (evidence ↔ page).
              In fill mode with an annotation, the scale animation originates from the annotation
              position via transform-origin, creating a "zoom from annotation" visual effect. */}
          <div
            key={src}
            className={cn(
              "animate-in fade-in-0",
              fill && annotationOrigin
                ? "zoom-in-95 duration-[180ms]"
                : fill
                  ? "zoom-in-[0.97] duration-150"
                  : "duration-150",
              fill && "fill-mode-backwards",
            )}
            style={{
              ...(annotationOrigin
                ? { transformOrigin: `${annotationOrigin.xPercent}% ${annotationOrigin.yPercent}%` }
                : undefined),
              ...(fill && !prefersReducedMotion
                ? { animationDelay: `${CONTENT_STAGGER_DELAY_MS}ms`, animationTimingFunction: EASE_EXPAND }
                : undefined),
            }}
          >
            {!imageLoaded && (
              <div className="flex items-center justify-center h-24">
                <span className="size-5 animate-spin text-gray-400">
                  <SpinnerIcon />
                </span>
              </div>
            )}
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
                src={isValidProofImageSrc(src) ? src : undefined}
                alt="Verification evidence"
                className={cn("block", !imageLoaded && "hidden")}
                style={zoomedWidth !== undefined ? { width: zoomedWidth, maxWidth: "none" } : { maxWidth: "none" }}
                onLoad={e => {
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
                    onDismiss={fill ? () => setOverlayHidden(true) : undefined}
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
              hasManualZoomRef.current = true;
              setZoom(clampZoom(z));
            }}
            zoomFloor={zoomFloor}
            zoomStep={EXPANDED_ZOOM_STEP}
            showLocate={showScrollToAnnotation}
            onLocate={handleScrollToAnnotation}
            locateDirty={locateDirty}
            onSliderGrab={() => {
              if (outerRef.current) setSliderLockWidth(outerRef.current.offsetWidth);
            }}
          />
        )}
      </div>
      {/* In non-fill mode, footer stays outside the scroll area so it's always visible */}
      {!fill && footerEl}
    </div>
  );
}
