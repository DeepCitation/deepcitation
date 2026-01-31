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

// React 19.2+ Activity component for prefetching - falls back to Fragment if unavailable
const Activity =
  (React as { Activity?: React.ComponentType<{ mode: "visible" | "hidden"; children: React.ReactNode }> }).Activity ??
  (({ children }: { mode: "visible" | "hidden"; children: React.ReactNode }) => <>{children}</>);

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
 *   src={verification.verificationImageBase64}
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
          onClick={(e) => {
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

/**
 * Hook to prefetch an image into browser cache.
 * This is a simpler alternative when Activity isn't available or needed.
 *
 * @example
 * ```tsx
 * const prefetchImage = usePrefetchImage();
 *
 * // Prefetch when verification arrives
 * useEffect(() => {
 *   if (verification?.verificationImageBase64) {
 *     prefetchImage(verification.verificationImageBase64);
 *   }
 * }, [verification?.verificationImageBase64]);
 * ```
 */
export function usePrefetchImage() {
  const prefetchImage = React.useCallback((src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = src;
    });
  }, []);

  return prefetchImage;
}

/**
 * Creates an SSR-safe prefetch cache that only exists on the client.
 * Uses a factory function to avoid module-level state issues with SSR.
 *
 * The cache uses a Map with promises for deduplication and timestamps for
 * LRU-style eviction to prevent memory leaks. Entries are evicted after 5 minutes.
 *
 * Performance fix: Storing promises (not just timestamps) prevents race conditions
 * where multiple concurrent calls could start duplicate prefetch requests.
 */
const PREFETCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PREFETCH_CACHE_SIZE = 100; // Maximum cached entries

interface PrefetchCacheEntry {
  promise: Promise<void>;
  timestamp: number;
}

/**
 * Symbol key for the window cache property.
 * Using Symbol.for with a package-namespaced key ensures singleton behavior across
 * module reloads while avoiding collisions with other libraries.
 * The version suffix allows cache invalidation on breaking changes.
 */
const PREFETCH_CACHE_KEY = Symbol.for("@deepcitation/deepcitation-js:prefetchCache:v1");

/**
 * Type-safe interface for window with prefetch cache.
 * Using a dedicated type avoids `any` casts throughout the code.
 */
interface WindowWithPrefetchCache {
  [key: symbol]: Map<string, PrefetchCacheEntry> | undefined;
}

/**
 * SSR-safe singleton getter for the prefetch cache.
 * Returns null during SSR (no window), returns the cache on client.
 */
function getPrefetchCache(): Map<string, PrefetchCacheEntry> | null {
  // SSR safety: only create cache on client
  if (typeof window === "undefined") {
    return null;
  }

  // Type-safe access to window with symbol key
  // Cast through unknown since Window doesn't have a symbol index signature
  const win = window as unknown as WindowWithPrefetchCache;

  // Use a Symbol property on window to ensure singleton across module reloads
  // Symbol.for ensures the same symbol is used even after hot module reload
  if (!win[PREFETCH_CACHE_KEY]) {
    win[PREFETCH_CACHE_KEY] = new Map<string, PrefetchCacheEntry>();
  }
  return win[PREFETCH_CACHE_KEY]!;
}

/**
 * Cleans expired entries from the prefetch cache.
 * Only runs periodically to avoid performance overhead.
 */
let lastCacheCleanup = 0;
const CACHE_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

function cleanPrefetchCache(): void {
  try {
    const cache = getPrefetchCache();
    if (!cache) return;

    const now = Date.now();
    if (now - lastCacheCleanup < CACHE_CLEANUP_INTERVAL_MS) return;
    lastCacheCleanup = now;

    // Remove expired entries
    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp > PREFETCH_CACHE_TTL_MS) {
        cache.delete(key);
      }
    }

    // If still too large, remove oldest entries
    if (cache.size > MAX_PREFETCH_CACHE_SIZE) {
      const entries = Array.from(cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, cache.size - MAX_PREFETCH_CACHE_SIZE);
      for (const [key] of toRemove) {
        cache.delete(key);
      }
    }
  } catch (err) {
    // Silently fail - do not break the main prefetch flow
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[DeepCitation] Prefetch cache cleanup failed:", err);
    }
  }
}

/**
 * Prefetches multiple images concurrently with deduplication.
 * Useful for batch prefetching all verification images.
 *
 * Performance fix: Stores promises in cache to avoid race conditions where
 * multiple concurrent calls could start duplicate prefetch requests.
 * SSR-safe: Returns immediately during server-side rendering.
 * Memory-safe: Uses LRU-style eviction with TTL to prevent memory leaks.
 *
 * @example
 * ```tsx
 * // Prefetch all images when verifications load
 * useEffect(() => {
 *   const srcs = verifications
 *     .filter(v => v.verificationImageBase64)
 *     .map(v => v.verificationImageBase64!);
 *   prefetchImages(srcs);
 * }, [verifications]);
 * ```
 */
export async function prefetchImages(srcs: string[]): Promise<void[]> {
  const cache = getPrefetchCache();

  // SSR safety: return empty array during server-side rendering
  if (!cache) {
    return [];
  }

  // Periodically clean expired entries
  cleanPrefetchCache();

  const now = Date.now();

  // Collect promises for all sources (reuse existing or create new)
  const promises = srcs.map((src) => {
    // Check if we have a valid cached entry
    const entry = cache.get(src);
    if (entry && now - entry.timestamp < PREFETCH_CACHE_TTL_MS) {
      // Return existing promise (avoids duplicate requests)
      return entry.promise;
    }

    // Create new prefetch promise
    const promise = new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => {
        // Remove from cache on error so it can be retried
        cache.delete(src);
        reject();
      };
      img.src = src;
    });

    // Store promise in cache immediately to prevent concurrent duplicates
    cache.set(src, { promise, timestamp: now });

    return promise;
  });

  return Promise.all(promises);
}

/**
 * Clears the prefetch cache. Useful for testing or memory management.
 * SSR-safe: No-op during server-side rendering.
 * Also resets the cleanup timer so cleanup runs immediately on next cache access.
 */
export function clearPrefetchCache(): void {
  const cache = getPrefetchCache();
  if (cache) {
    cache.clear();
  }
  // Reset cleanup timer so cleanup runs on next access if cache starts filling
  lastCacheCleanup = 0;
}
