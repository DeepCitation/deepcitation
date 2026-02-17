/**
 * PrefetchedPopoverImage
 *
 * Uses React 19.2's Activity component to pre-render popover images before
 * they're visible. This ensures images are already decoded and ready to display
 * when the user hovers over a citation, eliminating the empty popover flash.
 *
 * The Activity component allows React to:
 * - Pre-render the image in "hidden" mode while the user isn't hovering
 * - Instantly reveal the already-rendered content when switching to "visible"
 * - Defer updates to hidden content so they don't block visible UI
 *
 * Falls back to a simple Fragment wrapper if Activity is not available (React < 19.2).
 *
 * @see https://react.dev/blog/2025/10/01/react-19-2
 */
import React, { memo } from "react";

// Re-export utilities from prefetchCache for backward compatibility
export {
  clearPrefetchCache,
  prefetchImages,
  usePrefetchImage,
} from "./prefetchCache.js";

// React 19.2+ Activity component for prefetching - falls back to Fragment if unavailable
const Activity =
  (
    React as {
      Activity?: React.ComponentType<{
        mode: "visible" | "hidden";
        children: React.ReactNode;
      }>;
    }
  ).Activity ?? (({ children }: { mode: "visible" | "hidden"; children: React.ReactNode }) => <>{children}</>);

interface PrefetchedPopoverImageProps {
  /** Whether the popover (and image) should be visible */
  isVisible: boolean;
  /** Base64 image source (data URI) */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Optional click handler for the image */
  onClick?: () => void;
  /** Optional className for the container */
  className?: string;
  /** Image style constraints */
  imageStyle?: React.CSSProperties;
}

/**
 * Renders an image that's pre-rendered in the background before being shown.
 *
 * Uses React 19.2's Activity component to keep the image rendered but hidden,
 * so when the user hovers, the image appears instantly without a loading flash.
 *
 * @example
 * ```tsx
 * <PrefetchedPopoverImage
 *   isVisible={isHovering}
 *   src={verification.document?.verificationImageSrc}
 *   alt="Citation verification"
 *   onClick={() => setExpandedImageSrc(src)}
 * />
 * ```
 */
export function PrefetchedPopoverImage({
  isVisible,
  src,
  alt,
  onClick,
  className,
  imageStyle,
}: PrefetchedPopoverImageProps) {
  // The Activity component pre-renders children in "hidden" mode
  // When isVisible becomes true, it switches to "visible" mode instantly
  // The image is already rendered/decoded, so no flash occurs
  return (
    <Activity mode={isVisible ? "visible" : "hidden"}>
      <div className={className}>
        <button
          type="button"
          className="group block cursor-zoom-in relative overflow-hidden rounded-md bg-gray-50 dark:bg-gray-800"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onClick?.();
          }}
          aria-label="Click to view full size"
        >
          <img
            src={src}
            alt={alt}
            className="block rounded-md"
            style={
              imageStyle ?? {
                maxWidth: "min(70vw, 384px)",
                maxHeight: "min(50vh, 300px)",
                width: "auto",
                height: "auto",
                objectFit: "contain",
              }
            }
            // Don't use lazy loading - we want to prefetch
            loading="eager"
            // Decode async to not block main thread during prefetch
            decoding="async"
          />
        </button>
      </div>
    </Activity>
  );
}

/**
 * Memoized version of PrefetchedPopoverImage.
 * Use this when the parent re-renders frequently.
 */
export const MemoizedPrefetchedPopoverImage = memo(PrefetchedPopoverImage);
