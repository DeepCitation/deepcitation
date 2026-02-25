/**
 * Image Prefetch Cache Utilities
 *
 * SSR-safe prefetch cache for preloading verification images before they're visible.
 * Uses a Map with promises for deduplication and timestamps for LRU-style eviction
 * to prevent memory leaks.
 *
 * Performance fix: Storing promises (not just timestamps) prevents race conditions
 * where multiple concurrent calls could start duplicate prefetch requests.
 */
import React from "react";

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
const MAX_CACHEABLE_SRC_LENGTH = 10_000; // Skip caching for unusually large src strings (e.g. base64)

interface PrefetchCacheEntry {
  promise: Promise<undefined>;
  timestamp: number;
}

/**
 * Complete cache state stored on window.
 * Includes both the cache map and cleanup timestamp for SSR safety.
 */
interface PrefetchCacheState {
  cache: Map<string, PrefetchCacheEntry>;
  lastCleanup: number;
}

/**
 * Symbol key for the window cache property.
 * Using Symbol.for with a package-namespaced key ensures singleton behavior across
 * module reloads while avoiding collisions with other libraries.
 * The version suffix allows cache invalidation on breaking changes.
 */
const PREFETCH_CACHE_KEY = Symbol.for("deepcitation:prefetchCache:v1");

/**
 * Type-safe interface for window with prefetch cache.
 * Using a dedicated type avoids `any` casts throughout the code.
 */
interface WindowWithPrefetchCache {
  [key: symbol]: PrefetchCacheState | undefined;
}

const CACHE_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * SSR-safe singleton getter for the prefetch cache state.
 * Returns null during SSR (no window), returns the cache state on client.
 * Also returns null in strict CSP/sandboxed environments where window access may throw.
 */
function getPrefetchCacheState(): PrefetchCacheState | null {
  // SSR safety: only create cache on client
  if (typeof window === "undefined") {
    return null;
  }

  try {
    // Type-safe access to window with symbol key
    // Cast through unknown since Window doesn't have a symbol index signature
    const win = window as unknown as WindowWithPrefetchCache;

    // Use a Symbol property on window to ensure singleton across module reloads
    // Symbol.for ensures the same symbol is used even after hot module reload
    if (!win[PREFETCH_CACHE_KEY]) {
      win[PREFETCH_CACHE_KEY] = {
        cache: new Map<string, PrefetchCacheEntry>(),
        lastCleanup: 0,
      };
    }
    return win[PREFETCH_CACHE_KEY] as PrefetchCacheState;
  } catch {
    // In strict CSP or sandboxed environments, window property access may throw
    // Gracefully degrade by disabling the prefetch cache
    return null;
  }
}

/**
 * SSR-safe getter for just the cache map (convenience wrapper).
 */
function getPrefetchCache(): Map<string, PrefetchCacheEntry> | null {
  const state = getPrefetchCacheState();
  return state?.cache ?? null;
}

/**
 * Cleans expired entries from the prefetch cache.
 * Only runs periodically to avoid performance overhead.
 */
function cleanPrefetchCache(): void {
  try {
    const state = getPrefetchCacheState();
    if (!state) return;

    const now = Date.now();
    if (now - state.lastCleanup < CACHE_CLEANUP_INTERVAL_MS) return;
    state.lastCleanup = now;

    const cache = state.cache;

    // Remove expired entries
    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp > PREFETCH_CACHE_TTL_MS) {
        cache.delete(key);
      }
    }

    // If still too large, remove oldest entries
    if (cache.size > MAX_PREFETCH_CACHE_SIZE) {
      const entries = Array.from(cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
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
 * Hook to prefetch an image into browser cache.
 * This is a simpler alternative when Activity isn't available or needed.
 *
 * @example
 * ```tsx
 * const prefetchImage = usePrefetchImage();
 *
 * // Prefetch when verification arrives
 * useEffect(() => {
 *   if (verification?.document?.verificationImageSrc) {
 *     prefetchImage(verification.document.verificationImageSrc);
 *   }
 * }, [verification?.document?.verificationImageSrc]);
 * ```
 */
export function usePrefetchImage() {
  const prefetchImage = React.useCallback((src: string): Promise<undefined> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Clean up event handlers to prevent memory leaks
        img.onload = null;
        img.onerror = null;
        resolve(undefined);
      };
      img.onerror = () => {
        // Clean up event handlers to prevent memory leaks
        img.onload = null;
        img.onerror = null;
        reject();
      };
      img.src = src;
    });
  }, []);

  return prefetchImage;
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
 *     .filter(v => v.document?.verificationImageSrc)
 *     .map(v => v.document!.verificationImageSrc!);
 *   prefetchImages(srcs);
 * }, [verifications]);
 * ```
 */
export async function prefetchImages(srcs: string[]): Promise<undefined[]> {
  const cache = getPrefetchCache();

  // SSR safety: return empty array during server-side rendering
  if (!cache) {
    return [];
  }

  // Periodically clean expired entries
  cleanPrefetchCache();

  const now = Date.now();

  // Collect promises for all sources (reuse existing or create new)
  const promises = srcs.map(src => {
    // Check if we have a valid cached entry
    const entry = cache.get(src);
    if (entry && now - entry.timestamp < PREFETCH_CACHE_TTL_MS) {
      // Return existing promise (avoids duplicate requests)
      return entry.promise;
    }

    // Create new prefetch promise
    const promise = new Promise<undefined>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Clean up event handlers to prevent memory leaks
        img.onload = null;
        img.onerror = null;
        resolve(undefined);
      };
      img.onerror = () => {
        // Clean up event handlers to prevent memory leaks
        img.onload = null;
        img.onerror = null;
        // Remove from cache on error so it can be retried
        cache.delete(src);
        reject();
      };
      img.src = src;
    });

    // Skip caching for unusually large src strings to prevent cache pollution
    if (src.length <= MAX_CACHEABLE_SRC_LENGTH) {
      // Store promise in cache immediately to prevent concurrent duplicates
      cache.set(src, { promise, timestamp: now });
    }

    return promise;
  });

  // Use Promise.allSettled to prevent one failed image from rejecting the entire batch
  const results = await Promise.allSettled(promises);
  return results.filter((r): r is PromiseFulfilledResult<undefined> => r.status === "fulfilled").map(r => r.value);
}

/**
 * Clears the prefetch cache. Useful for testing or memory management.
 * SSR-safe: No-op during server-side rendering.
 * Also resets the cleanup timer so cleanup runs immediately on next cache access.
 */
export function clearPrefetchCache(): void {
  const state = getPrefetchCacheState();
  if (state) {
    state.cache.clear();
    // Reset cleanup timer so cleanup runs on next access if cache starts filling
    state.lastCleanup = 0;
  }
}
