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
import type { SearchAttempt, SearchStatus } from "../types/search.js";
import type { Verification } from "../types/verification.js";
import { CitationAnnotationOverlay } from "./CitationAnnotationOverlay.js";
import { computeKeyholeOffset } from "./computeKeyholeOffset.js";
import {
  buildKeyholeMaskImage,
  EVIDENCE_TRAY_BORDER_DASHED,
  EVIDENCE_TRAY_BORDER_SOLID,
  EXPANDED_IMAGE_SHELL_PX,
  EXPANDED_ZOOM_MAX,
  EXPANDED_ZOOM_MIN,
  EXPANDED_ZOOM_STEP,
  FOOTER_HINT_DURATION_MS,
  isValidProofImageSrc,
  KEYHOLE_FADE_WIDTH,
  KEYHOLE_SKIP_THRESHOLD,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  KEYHOLE_STRIP_HEIGHT_VAR,
  MISS_TRAY_THUMBNAIL_HEIGHT,
  WHEEL_ZOOM_SENSITIVITY,
} from "./constants.js";
import { formatCaptureDate } from "./dateUtils.js";
import { useDragToPan } from "./hooks/useDragToPan.js";
import { useIsTouchDevice } from "./hooks/useIsTouchDevice.js";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { LocateIcon, SpinnerIcon, ZoomInIcon, ZoomOutIcon } from "./icons.js";
import { deriveOutcomeLabel } from "./outcomeLabel.js";
import { computeAnnotationOriginPercent, computeAnnotationScrollTarget } from "./overlayGeometry.js";
import { buildIntentSummary } from "./searchSummaryUtils.js";
import { cn, isImageSource } from "./utils.js";
import { getStatusColorScheme, PagePill, VerificationLogTimeline } from "./VerificationLog.js";

// =============================================================================
// MODULE-LEVEL UTILITIES
// =============================================================================

/**
 * Module-level handler for hiding broken images.
 * Performance fix: avoids creating new function references on every render.
 */
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
  (e.target as HTMLImageElement).style.display = "none";
};

/**
 * Tolerance factor for coordinate scaling sanity checks.
 * PDF text coordinates are extracted at a different resolution than the proof image,
 * so converting between coordinate spaces introduces floating-point rounding errors.
 * A 5% tolerance (1.05×) absorbs these rounding differences — empirically sufficient
 * to avoid false rejections while still catching genuinely out-of-bounds coordinates
 * that would indicate a dimension mismatch between the PDF and proof image.
 */
const SCALING_TOLERANCE = 1.05;

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
  if (!/^[A-Za-z0-9+/]+(={0,2})?$/.test(raw.slice(0, 100))) {
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
  } catch {
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
function resolveHighlightBox(verification: Verification): { x: number; width: number } | null {
  // 1. Prefer highlightBox from matching verification page (already in image coordinates)
  const matchPage = verification.pages?.find(p => p.isMatchPage);
  if (matchPage?.highlightBox) {
    return { x: matchPage.highlightBox.x, width: matchPage.highlightBox.width };
  }

  const imgDims = verification.document?.verificationImageDimensions;

  // Helper: scale a DeepTextItem from PDF space to image pixel space.
  // If the scaled result falls outside the image bounds, assumes coordinates
  // are already in image space and returns them unscaled.
  const scaleItem = (item: { x: number; width: number }) => {
    if (imgDims && matchPage?.dimensions && matchPage.dimensions.width > 0) {
      const scale = imgDims.width / matchPage.dimensions.width;
      const scaledX = item.x * scale;
      const scaledWidth = item.width * scale;
      // Sanity check: if scaled coords are within image bounds, use them
      if (scaledX >= 0 && scaledX + scaledWidth <= imgDims.width * SCALING_TOLERANCE) {
        return { x: scaledX, width: scaledWidth };
      }
    }
    // Assume image coordinates if scaling is unavailable or produces out-of-bounds values
    return { x: item.x, width: item.width };
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

// =============================================================================
// FOOTER HINT (shared bold-then-muted hint for evidence tray / expanded image)
// =============================================================================

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
  onFitStateChange,
  onAlreadyFullSize,
}: {
  verification: Verification;
  onImageClick?: () => void;
  /** Called after image load to report whether the image fits entirely within the keyhole. */
  onFitStateChange?: (fitsCompletely: boolean) => void;
  /** Called when the user clicks but the image already fits — lets parent show a flash hint. */
  onAlreadyFullSize?: () => void;
}) {
  // Resolve highlight region from verification data
  const highlightBox = useMemo(() => resolveHighlightBox(verification), [verification]);

  // Drag-to-pan hook for mouse interaction
  const { containerRef, isDragging, handlers, scrollState, wasDragging } = useDragToPan();

  // Track image load to compute initial scroll position
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFitInfo, setImageFitInfo] = useState<{ displayedWidth: number; imageFitsCompletely: boolean } | null>(
    null,
  );
  const imageRef = useRef<HTMLImageElement>(null);

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

    // Detect whether the image nearly fits within the keyhole (minimal cropping).
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
    }

    const { scrollLeft } = computeKeyholeOffset(displayedWidth, containerWidth, highlightBox);
    container.scrollLeft = scrollLeft;

    // Trigger scroll event so useDragToPan updates fade state for initial position
    container.dispatchEvent(new Event("scroll"));
  }, [imageLoaded, highlightBox]);

  // Notify parent when fit state is determined (after image loads)
  useEffect(() => {
    if (imageFitInfo !== null) onFitStateChange?.(imageFitInfo.imageFitsCompletely);
  }, [imageFitInfo, onFitStateChange]);

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
  const isPannable = scrollState.canScrollLeft || scrollState.canScrollRight;
  // When the image fits entirely in the keyhole, expanding would show nothing new — suppress affordances.
  const canExpand = !imageFitInfo?.imageFitsCompletely && !!onImageClick;

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
          title={!canExpand && !isPannable && imageFitInfo?.imageFitsCompletely ? "Already full size" : undefined}
          style={{ cursor: isDragging ? "grabbing" : canExpand ? "zoom-in" : isPannable ? "grab" : "default" }}
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
            // Suppress click if user was dragging
            if (wasDragging.current) {
              wasDragging.current = false;
              e.stopPropagation();
              return;
            }
            if (canExpand) {
              e.stopPropagation();
              onImageClick?.();
            } else if (imageFitInfo?.imageFitsCompletely) {
              // Image already fits — flash a hint instead of silently doing nothing.
              e.stopPropagation();
              onAlreadyFullSize?.();
            }
          }}
          aria-label={
            [isPannable && "Drag or click arrows to pan", canExpand && "click to view full size"]
              .filter(Boolean)
              .join(", ") || "Verification image"
          }
        >
          <div
            ref={containerRef}
            data-dc-keyhole=""
            className="overflow-x-auto overflow-y-hidden"
            style={{
              height: stripHeightStyle,
              WebkitMaskImage: maskImage,
              maskImage,
              ...KEYHOLE_SCROLLBAR_HIDE,
              cursor: isDragging ? "grabbing" : canExpand ? "zoom-in" : isPannable ? "grab" : "default",
            }}
            {...handlers}
          >
            {/* Hide webkit scrollbar via inline style tag scoped to this container */}
            <style>{`[data-dc-keyhole]::-webkit-scrollbar { display: none; }`}</style>
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Citation verification"
              className="block h-full w-auto max-w-none select-none"
              style={{ height: stripHeightStyle }}
              loading="eager"
              decoding="async"
              draggable={false}
              onLoad={() => setImageLoaded(true)}
              onError={handleImageError}
            />
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
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// EVIDENCE TRAY COMPONENTS
// =============================================================================

/**
 * Footer for the evidence tray showing outcome label + verification date + optional page pill.
 * When `onPageClick` is provided, renders a compact PagePill on the right side.
 */
function EvidenceTrayFooter({
  status,
  searchAttempts,
  verifiedAt,
  hint,
  pageNumber,
  onPageClick,
  isImage,
}: {
  status?: SearchStatus | null;
  searchAttempts?: SearchAttempt[];
  verifiedAt?: Date | string | null;
  hint?: { text: string; key: string | number };
  /** Page number for the page pill (omit or 0 to hide) */
  pageNumber?: number;
  /** When provided, renders a clickable page pill that triggers page expansion */
  onPageClick?: () => void;
  /** When true, pill shows "Image" instead of "p.X" */
  isImage?: boolean;
}) {
  const formatted = formatCaptureDate(verifiedAt);
  const dateStr = formatted?.display ?? "";

  const outcomeLabel = deriveOutcomeLabel(status, searchAttempts);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-gray-400 dark:text-gray-500">
      <span>
        {outcomeLabel}
        {hint && <FooterHint key={hint.key} text={hint.text} />}
      </span>
      <div className="flex items-center gap-1.5">
        {onPageClick && (
          <PagePill
            pageNumber={pageNumber}
            colorScheme={getStatusColorScheme(status)}
            onClick={onPageClick}
            isImage={isImage}
          />
        )}
        {dateStr && <span title={formatted?.tooltip ?? dateStr}>{dateStr}</span>}
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
 * Collapsed "View search log" at bottom for detailed audit trail.
 */
export function SearchAnalysisSummary({
  searchAttempts,
  verification,
}: {
  searchAttempts: SearchAttempt[];
  verification?: Verification | null;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const intentSummary = useMemo(() => buildIntentSummary(verification, searchAttempts), [verification, searchAttempts]);

  // Format verified date for compact display
  const formatted = formatCaptureDate(verification?.verifiedAt);
  const dateStr = formatted?.display ?? "";

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
      {primaryMessage && (
        <div className="text-[11px] text-gray-600 dark:text-gray-300">
          {primaryMessage}
          {dateStr && <span className="text-gray-400 dark:text-gray-500"> · {dateStr}</span>}
        </div>
      )}

      {/* Snippets for related_found */}
      {snippets.length > 0 && (
        <div className="space-y-1">
          {snippets.map((snippet, idx) => (
            <MatchSnippetDisplay key={`snippet-${idx}-${snippet.matchStart}`} snippet={snippet} />
          ))}
        </div>
      )}

      {/* Expandable search log */}
      {searchAttempts.length > 0 && (
        <button
          type="button"
          className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer transition-colors"
          onClick={e => {
            e.stopPropagation();
            setShowDetails(s => !s);
          }}
          aria-expanded={showDetails}
          aria-label={showDetails ? "Collapse search log" : "Expand search log"}
        >
          <svg
            className={cn("size-2.5 shrink-0 transition-transform duration-150", showDetails && "rotate-90")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span>View search log</span>
        </button>
      )}
      {showDetails && (
        <div className="mt-1">
          <VerificationLogTimeline searchAttempts={searchAttempts} status={verification?.status} />
        </div>
      )}
    </div>
  );
}

/**
 * Evidence tray — the "proof zone" at the bottom of the summary popover.
 * For verified/partial: Shows keyhole image with "Expand" hover CTA.
 * For not-found: Shows search analysis summary with "Verify manually" hover CTA.
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
}: {
  verification: Verification | null;
  status: CitationStatus;
  onExpand?: () => void;
  onImageClick?: () => void;
  proofImageSrc?: string;
}) {
  const hasImage = verification?.document?.verificationImageSrc || verification?.url?.webPageScreenshotBase64;
  const isMiss = status.isMiss;
  const searchAttempts = verification?.searchAttempts ?? [];
  const borderClass = isMiss ? EVIDENCE_TRAY_BORDER_DASHED : EVIDENCE_TRAY_BORDER_SOLID;
  const [keyholeImageFits, setKeyholeImageFits] = useState(false);
  const isTouch = useIsTouchDevice();
  const tapOrClick = isTouch ? "Tap" : "Click";

  // Incremented each time the user clicks an already-full-size keyhole.
  // The changing key forces FooterHint to remount, restarting its 2s highlight timer.
  const [fullSizeFlashKey, setFullSizeFlashKey] = useState(0);
  const handleAlreadyFullSize = useCallback(() => setFullSizeFlashKey(k => k + 1), []);

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
          onFitStateChange={setKeyholeImageFits}
          onAlreadyFullSize={handleAlreadyFullSize}
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
        </div>
      ) : null}

      {/* Footer: outcome + date (skip for miss — compressed summary has this info) */}
      {!isMiss && (
        <EvidenceTrayFooter
          status={verification?.status}
          searchAttempts={searchAttempts}
          verifiedAt={verification?.verifiedAt}
          hint={
            fullSizeFlashKey > 0
              ? { text: " · Already full size", key: `flash-${fullSizeFlashKey}` }
              : !!onImageClick && !keyholeImageFits
                ? { text: ` · ${tapOrClick} to expand`, key: "expand" }
                : undefined
          }
          pageNumber={verification?.pages?.[0]?.pageNumber}
          onPageClick={onExpand}
          isImage={isImageSource(verification)}
        />
      )}
    </>
  );

  // Mirror the keyhole button's click logic:
  // - Keyhole present + fits completely → flash "already full size" hint
  // - Keyhole present + expandable → expand keyhole image
  // - No keyhole → fall back to page expansion
  const trayAction = onImageClick ? (keyholeImageFits ? handleAlreadyFullSize : onImageClick) : onExpand;

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
          aria-label={
            onImageClick
              ? keyholeImageFits
                ? "Verification image (already at full size)"
                : `${tapOrClick} to expand verification image`
              : "Expand to full page"
          }
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
}) {
  const { containerRef, isDragging, handlers: panHandlers, wasDragging } = useDragToPan({ direction: "xy" });
  const isTouch = useIsTouchDevice();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  // Zoom state — only active when fill=true (expanded-page mode).
  // 1.0 = natural pixel size. < 1.0 = fit-to-screen (shrunk to container).
  const [zoom, setZoom] = useState(1);
  // Ref mirror of zoom for touch event handlers (avoids stale closures in pinch gesture)
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // Dynamic zoom floor: on narrow viewports the fit-to-screen zoom may be below
  // EXPANDED_ZOOM_MIN (e.g. 29% for a 1700px image on a 550px viewport).
  // This floor feeds into the slider min, zoom-out disabled check, and clampZoom
  // so the user can't zoom below the level that fits the viewport width.
  const [zoomFloor, setZoomFloor] = useState(EXPANDED_ZOOM_MIN);
  // Container size as state (not ref) so that ResizeObserver updates trigger re-renders.
  // This ensures the initial-zoom effect re-fires once the container is measured.
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const hasSetInitialZoom = useRef(false);

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

  // Reset imageLoaded synchronously when src changes (avoids a useEffect render cycle).
  // This ensures the spinner shows while the new image loads after an evidence ↔ page swap.
  // Also reset zoom to 1 so each page starts at default scale.
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

  // Fit-to-screen: scale the page image to fit both the available width AND height.
  // Width uses the VIEWPORT (minus popover margins + shell padding) because the
  // container still reflects the previous evidence-width popover before the morph.
  // Height uses containerSize.height from the ResizeObserver — the flex layout
  // (flex-1 min-h-0 under a maxHeight-constrained column) has already allocated
  // exactly the vertical space remaining after header zones and margins.
  useEffect(() => {
    if (!fill || !imageLoaded || !naturalWidth || !naturalHeight || hasSetInitialZoom.current) return;
    if (!containerSize || containerSize.width <= 0 || containerSize.height <= 0) return;
    hasSetInitialZoom.current = true;
    // Max image width the popover can provide: viewport - 2rem outer margin - shell px.
    const maxImageWidth =
      typeof window !== "undefined" ? window.innerWidth - 32 - EXPANDED_IMAGE_SHELL_PX : containerSize.width;
    const fitZoomW = maxImageWidth / naturalWidth;
    // Width-only zoom: fill the popover horizontally; tall images scroll vertically
    // inside the overflow-auto container (same pattern as keyhole's horizontal scroll).
    const fitZoom = Math.min(1, Math.max(0.1, fitZoomW));
    if (fitZoom < 1) setZoom(fitZoom);
    setZoomFloor(Math.min(EXPANDED_ZOOM_MIN, fitZoom));
    // Report zoomed dimensions so the popover sizes to the displayed image,
    // not the natural pixel width (which could be e.g. 1700px for a PDF page).
    onNaturalSize?.(Math.round(naturalWidth * fitZoom), Math.round(naturalHeight * fitZoom));

    // Auto-scroll to annotation: after fit-to-screen zoom is computed, scroll
    // the container so the annotation is centered in view.
    // Uses rAF to wait for the DOM to reflow at the new zoom level.
    // Prefers anchor text position when it will be highlighted.
    let rafId: number | undefined;
    const scrollItem = scrollTarget ?? effectivePhraseItem;
    if (scrollItem && renderScale) {
      const effectiveZoom = fitZoom < 1 ? fitZoom : 1;
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

  const handleZoomIn = useCallback(() => {
    setZoom(z => clampZoom(z + EXPANDED_ZOOM_STEP));
  }, [clampZoom]);
  const handleZoomOut = useCallback(() => {
    setZoom(z => clampZoom(z - EXPANDED_ZOOM_STEP));
  }, [clampZoom]);

  // Scroll the container so the annotation is centered in view (re-center after pan/zoom).
  // Prefers anchor text position when it will be highlighted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref object from useDragToPan — its identity never changes
  const handleScrollToAnnotation = useCallback(() => {
    const scrollItem = scrollTarget ?? effectivePhraseItem;
    if (!containerRef.current || !scrollItem || !renderScale || !naturalWidth || !naturalHeight) return;
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
    if (target) container.scrollTo({ left: target.scrollLeft, top: target.scrollTop, behavior: "smooth" });
  }, [scrollTarget, effectivePhraseItem, renderScale, naturalWidth, naturalHeight]);

  // Trackpad pinch zoom (Ctrl+wheel) — prevents default browser zoom.
  // Batches rapid wheel events with rAF so we apply at most one setZoom per
  // animation frame, avoiding excessive React re-renders during fast pinches.
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref object from useDragToPan — its identity never changes
  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;
    let pendingDelta = 0;
    let rafId: number | null = null;
    const flushZoom = () => {
      rafId = null;
      const d = pendingDelta;
      pendingDelta = 0;
      setZoom(z => clampZoom(z + d));
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // deltaY is negative for zoom-in, positive for zoom-out on trackpads
      pendingDelta += -e.deltaY * WHEEL_ZOOM_SENSITIVITY;
      if (rafId === null) rafId = requestAnimationFrame(flushZoom);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [fill, clampZoom]);

  // Touch pinch-to-zoom with midpoint anchoring (two-finger gesture).
  // Zooms centered on the midpoint between the two fingers so the content under the
  // pinch stays visually stable. After computing the new zoom, the container's scroll
  // position is adjusted so the content-space point under the pinch midpoint maps back
  // to the same viewport position.
  //
  // Uses zoomRef to read current zoom so listeners can be registered once (on mount /
  // fill change) rather than re-added on every zoom change during a pinch gesture.
  //
  // After setZoom(), the DOM hasn't reflowed yet so the image width is still the old
  // value. We store the target scroll in a ref and apply it in a useLayoutEffect that
  // fires after React renders the new width. This ensures scroll correction happens in
  // the same frame as the size change, preventing any visible jump.
  const pinchScrollTarget = useRef<{ left: number; top: number } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref object from useDragToPan — its identity never changes
  useLayoutEffect(() => {
    if (!pinchScrollTarget.current) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollLeft = pinchScrollTarget.current.left;
    el.scrollTop = pinchScrollTarget.current.top;
    pinchScrollTarget.current = null;
  }, [zoom]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref object from useDragToPan — its identity never changes
  useEffect(() => {
    if (!fill) return;
    const el = containerRef.current;
    if (!el) return;

    let initialDistance: number | null = null;
    let initialZoom = 1;
    let pendingZoom: number | null = null;
    let rafId: number | null = null;

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

    const flushPinchZoom = () => {
      rafId = null;
      if (pendingZoom !== null) {
        setZoom(pendingZoom);
        pendingZoom = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dist = getTouchDistance(e.touches);
        if (dist < Number.EPSILON) return; // fingers at same point — avoid division by zero
        initialDistance = dist;
        initialZoom = zoomRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initialDistance === null) return;
      e.preventDefault(); // prevent native scroll while pinching

      const currentDistance = getTouchDistance(e.touches);
      const scale = currentDistance / initialDistance;
      const oldZoom = zoomRef.current;
      const newZoom = clampZoom(initialZoom * scale);

      // Compute midpoint-anchored scroll correction.
      // The pinch midpoint in viewport coords should map to the same content point
      // before and after the zoom change.
      const mid = getTouchMidpoint(e.touches);
      const rect = el.getBoundingClientRect();
      // Content-space point currently under the pinch midpoint
      const contentX = mid.x - rect.left + el.scrollLeft;
      const contentY = mid.y - rect.top + el.scrollTop;
      // After zoom, that content point has scaled — adjust scroll so it maps back
      const ratio = newZoom / oldZoom;
      pinchScrollTarget.current = {
        left: contentX * ratio - (mid.x - rect.left),
        top: contentY * ratio - (mid.y - rect.top),
      };

      // Batch: store the latest zoom and schedule a single setZoom per frame
      pendingZoom = newZoom;
      if (rafId === null) rafId = requestAnimationFrame(flushPinchZoom);
    };

    const onTouchEnd = () => {
      initialDistance = null;
      // Flush any pending zoom immediately on gesture end so the final
      // position is applied without waiting for the next frame.
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        flushPinchZoom();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [fill, clampZoom]);

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

  const searchAttempts = verification?.searchAttempts ?? [];
  const outcomeLabel = deriveOutcomeLabel(verification?.status, searchAttempts);
  const formatted = formatCaptureDate(verification?.verifiedAt);
  const dateStr = formatted?.display ?? "";

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
    <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-b-sm border border-t-0 border-gray-200 dark:border-gray-700">
      <span>
        {outcomeLabel}
        <FooterHint text={` · ${isTouch ? "Tap" : "Click"} to collapse`} />
      </span>
      {dateStr && <span title={formatted?.tooltip ?? dateStr}>{dateStr}</span>}
    </div>
  );

  return (
    <div
      ref={outerRef}
      className={cn("relative mx-3 mb-3 animate-in fade-in-0 duration-150", fill && "flex-1 min-h-0 flex flex-col")}
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
            if (wasDragging.current) {
              wasDragging.current = false;
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
            {/* Relative wrapper: positions annotation overlay exactly over the image */}
            <div
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
              {imageLoaded && renderScale && naturalWidth && naturalHeight && effectivePhraseItem && (
                <CitationAnnotationOverlay
                  phraseMatchDeepItem={effectivePhraseItem}
                  renderScale={renderScale}
                  imageNaturalWidth={naturalWidth}
                  imageNaturalHeight={naturalHeight}
                  highlightColor={verification?.highlightColor}
                  anchorTextDeepItem={effectiveAnchorItem}
                  anchorText={verification?.verifiedAnchorText}
                  fullPhrase={verification?.verifiedFullPhrase}
                />
              )}
            </div>
          </div>
          {/* In fill mode, footer sits inside the scroll area right below the page image */}
          {fill && footerEl}
        </div>

        {/* Floating zoom controls — positioned absolutely over the scroll container
            so they stay visible regardless of horizontal/vertical scroll position.
            Contains −/slider/+ with percentage label. Supports drag on slider. */}
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
            <div
              role="toolbar"
              aria-label="Zoom controls"
              className="flex items-center gap-0.5 bg-black/40 backdrop-blur-sm text-white/80 rounded-full px-1 py-0.5 shadow-sm"
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
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
              {/* Range slider — draggable zoom control */}
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
              {showScrollToAnnotation && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleScrollToAnnotation();
                  }}
                  data-dc-scroll-to-annotation=""
                  className="size-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                  aria-label="Scroll to annotation"
                >
                  <span className="size-3.5">
                    <LocateIcon />
                  </span>
                </button>
              )}
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
      {/* In non-fill mode, footer stays outside the scroll area so it's always visible */}
      {!fill && footerEl}
    </div>
  );
}
