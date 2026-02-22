/**
 * Evidence tray components — keyhole viewer and related display logic
 * for the citation popover "proof zone".
 *
 * Sub-components extracted for better composability:
 * - InlineExpandedImage → ./InlineExpandedImage.tsx (canonical)
 * - SearchAnalysisSummary → ./SearchAnalysisSummary.tsx (canonical)
 *
 * @packageDocumentation
 */

import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DeepTextItem, ScreenBox } from "../types/boxes.js";
import type { CitationStatus } from "../types/citation.js";
import type { SearchAttempt, SearchStatus } from "../types/search.js";
import type { Verification, VerificationPage } from "../types/verification.js";
import { computeKeyholeOffset } from "./computeKeyholeOffset.js";
import {
  buildKeyholeMaskImage,
  EVIDENCE_TRAY_BORDER_DASHED,
  EVIDENCE_TRAY_BORDER_SOLID,
  FOOTER_HINT_DURATION_MS,
  isValidProofImageSrc,
  KEYHOLE_FADE_WIDTH,
  KEYHOLE_SKIP_THRESHOLD,
  KEYHOLE_STRIP_HEIGHT_DEFAULT,
  KEYHOLE_STRIP_HEIGHT_VAR,
  MISS_TRAY_THUMBNAIL_HEIGHT,
} from "./constants.js";
import { formatCaptureDate } from "./dateUtils.js";
import { useDragToPan } from "./hooks/useDragToPan.js";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";
import { handleImageError } from "./imageUtils.js";
import { deriveOutcomeLabel } from "./outcomeLabel.js";
import { SearchAnalysisSummary } from "./SearchAnalysisSummary.js";
import { cn } from "./utils.js";

// =============================================================================
// MODULE-LEVEL UTILITIES
// =============================================================================

/**
 * Tolerance factor for coordinate scaling sanity checks.
 * PDF text coordinates are extracted at a different resolution than the proof image,
 * so converting between coordinate spaces introduces floating-point rounding errors.
 * A 5% tolerance (1.05x) absorbs these rounding differences — empirically sufficient
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
 * Tries in order: matching page highlightBox -> anchorTextMatchDeepItems -> phraseMatchDeepItem.
 */
function resolveHighlightBox(verification: Verification): { x: number; width: number } | null {
  const matchPage = verification.pages?.find(p => p.isMatchPage);
  if (matchPage?.highlightBox) {
    return { x: matchPage.highlightBox.x, width: matchPage.highlightBox.width };
  }

  const imgDims = verification.document?.verificationImageDimensions;

  const scaleItem = (item: { x: number; width: number }) => {
    if (imgDims && matchPage?.dimensions && matchPage.dimensions.width > 0) {
      const scale = imgDims.width / matchPage.dimensions.width;
      const scaledX = item.x * scale;
      const scaledWidth = item.width * scale;
      if (scaledX >= 0 && scaledX + scaledWidth <= imgDims.width * SCALING_TOLERANCE) {
        return { x: scaledX, width: scaledWidth };
      }
    }
    return { x: item.x, width: item.width };
  };

  const anchorItem = verification.document?.anchorTextMatchDeepItems?.[0];
  if (anchorItem) return scaleItem(anchorItem);

  const phraseItem = verification.document?.phraseMatchDeepItem;
  if (phraseItem) return scaleItem(phraseItem);

  return null;
}

/** CSS to hide native scrollbars on the keyhole strip. */
const KEYHOLE_SCROLLBAR_HIDE: React.CSSProperties = {
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

// =============================================================================
// FOOTER HINT (shared bold-then-muted hint for evidence tray)
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
  page,
  onViewPageClick,
}: {
  verification: Verification;
  onImageClick?: () => void;
  /** Called after image load to report whether the image fits entirely within the keyhole. */
  onFitStateChange?: (fitsCompletely: boolean) => void;
  /** Called when the user clicks but the image already fits — lets parent show a flash hint. */
  onAlreadyFullSize?: () => void;
  page?: VerificationPage | null;
  onViewPageClick?: (page: VerificationPage) => void;
}) {
  const showViewPageButton = page?.source && onViewPageClick;

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef and imageRef are stable refs that never change identity; useLayoutEffect guarantees the DOM nodes they point to are ready
  useLayoutEffect(() => {
    if (!imageLoaded) return;
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return;

    const stripHeight = container.clientHeight;
    const displayedWidth =
      img.naturalHeight > 0 ? img.naturalWidth * (stripHeight / img.naturalHeight) : img.naturalWidth;
    const containerWidth = container.clientWidth;

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
  const canExpand = !imageFitInfo?.imageFitsCompletely && !!onImageClick;

  return (
    <div className="relative">
      <div
        className="relative group/keyhole"
        style={imageFitInfo ? { maxWidth: imageFitInfo.displayedWidth } : undefined}
      >
        <button
          type="button"
          className="block relative w-full"
          style={{ cursor: isDragging ? "grabbing" : isPannable ? "grab" : canExpand ? "zoom-in" : "default" }}
          onClick={e => {
            e.preventDefault();
            if (wasDragging.current) {
              wasDragging.current = false;
              e.stopPropagation();
              return;
            }
            if (canExpand) {
              e.stopPropagation();
              onImageClick?.();
            } else if (imageFitInfo?.imageFitsCompletely) {
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
              cursor: isDragging ? "grabbing" : isPannable ? "grab" : canExpand ? "zoom-in" : "default",
            }}
            {...handlers}
          >
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

          {scrollState.canScrollLeft && (
            // biome-ignore lint/a11y/useKeyWithClickEvents: pan hints are inside a <button>; keyboard access is provided by the parent element
            <div
              className="absolute left-0 top-0 h-full min-w-[44px] flex items-center justify-center opacity-0 group-hover/keyhole:opacity-100 transition-opacity duration-150 cursor-pointer"
              aria-label="Pan image left"
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

          {scrollState.canScrollRight && (
            // biome-ignore lint/a11y/useKeyWithClickEvents: pan hints are inside a <button>; keyboard access is provided by the parent element
            <div
              className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center opacity-0 group-hover/keyhole:opacity-100 transition-opacity duration-150 cursor-pointer"
              aria-label="Pan image right"
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

      {showViewPageButton && (
        <div className="flex items-center justify-end px-2 bg-gray-100 dark:bg-gray-800 rounded-b-md border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onViewPageClick(page);
            }}
            className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-150 cursor-pointer min-h-[44px] px-2"
            aria-label="View full page"
          >
            <span>View page</span>
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// EVIDENCE TRAY FOOTER
// =============================================================================

/**
 * Footer for the evidence tray showing outcome label + verification date.
 */
function EvidenceTrayFooter({
  status,
  searchAttempts,
  verifiedAt,
  hint,
}: {
  status?: SearchStatus | null;
  searchAttempts?: SearchAttempt[];
  verifiedAt?: Date | string | null;
  hint?: { text: string; key: string | number };
}) {
  const formatted = formatCaptureDate(verifiedAt);
  const dateStr = formatted?.display ?? "";

  const outcomeLabel = deriveOutcomeLabel(status, searchAttempts);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-500">
      <span>
        {outcomeLabel}
        {hint && <FooterHint key={hint.key} text={hint.text} />}
      </span>
      {dateStr && <span title={formatted?.tooltip ?? dateStr}>{dateStr}</span>}
    </div>
  );
}

// =============================================================================
// EVIDENCE TRAY (main component)
// =============================================================================

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

  const [fullSizeFlashKey, setFullSizeFlashKey] = useState(0);
  const handleAlreadyFullSize = useCallback(() => setFullSizeFlashKey(k => k + 1), []);

  const content = (
    <>
      {hasImage && verification ? (
        <AnchorTextFocusedImage
          verification={verification}
          onImageClick={onImageClick}
          onFitStateChange={setKeyholeImageFits}
          onAlreadyFullSize={handleAlreadyFullSize}
        />
      ) : isMiss && searchAttempts.length > 0 ? (
        <>
          {isValidProofImageSrc(proofImageSrc) && (
            <div className="overflow-hidden" style={{ height: MISS_TRAY_THUMBNAIL_HEIGHT }}>
              <img
                src={proofImageSrc}
                className="w-full h-full object-cover object-top"
                draggable={false}
                alt="Searched page"
              />
            </div>
          )}
          <SearchAnalysisSummary searchAttempts={searchAttempts} verification={verification} />
        </>
      ) : null}

      {!isMiss && (
        <EvidenceTrayFooter
          status={verification?.status}
          searchAttempts={searchAttempts}
          verifiedAt={verification?.verifiedAt}
          hint={
            fullSizeFlashKey > 0
              ? { text: " · Already full size", key: `flash-${fullSizeFlashKey}` }
              : !!onImageClick && !keyholeImageFits
                ? { text: " · Click to expand", key: "expand" }
                : undefined
          }
        />
      )}
    </>
  );

  const trayAction = onImageClick ? (keyholeImageFits ? handleAlreadyFullSize : onImageClick) : onExpand;

  return (
    <div className="m-3">
      {trayAction ? (
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
                : "Click to expand verification image"
              : "Expand to full page"
          }
        >
          {content}
        </div>
      ) : (
        <div className={cn("w-full rounded-xs overflow-hidden text-left", borderClass)}>{content}</div>
      )}
    </div>
  );
}
