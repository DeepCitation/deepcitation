/**
 * CitationOverlayProvider Component
 *
 * Manages global state for citation image overlays. When any citation has an
 * expanded image overlay, other citations should not show hover popovers.
 *
 * This context provides a robust, React-idiomatic solution that:
 * - Works with SSR (no global module state)
 * - Is reactive (components re-render when state changes)
 * - Handles multiple overlays correctly
 * - Works across different bundle chunks
 *
 * Usage:
 * 1. Wrap your app (or citation container) with <CitationOverlayProvider>
 * 2. Components use useCitationOverlay() to check/update overlay state
 *
 * If no provider is present, the hook returns a no-op implementation that
 * always allows hover (graceful degradation).
 */
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { CitationOverlayContext } from "./CitationOverlayContext.hooks.js";

/**
 * Provider component that manages overlay state for all child citations.
 *
 * Wrap your app or citation container with this provider to enable
 * proper hover blocking when image overlays are expanded.
 *
 * @example
 * ```tsx
 * <CitationOverlayProvider>
 *   <YourContent>
 *     <CitationComponent ... />
 *     <CitationComponent ... />
 *   </YourContent>
 * </CitationOverlayProvider>
 * ```
 */
export function CitationOverlayProvider({ children }: { children: React.ReactNode }) {
  const [overlayCount, setOverlayCount] = useState(0);

  const registerOverlay = useCallback(() => {
    setOverlayCount(c => c + 1);
  }, []);

  const unregisterOverlay = useCallback(() => {
    setOverlayCount(c => Math.max(0, c - 1));
  }, []);

  const value = useMemo(
    () => ({
      isAnyOverlayOpen: overlayCount > 0,
      registerOverlay,
      unregisterOverlay,
    }),
    [overlayCount, registerOverlay, unregisterOverlay],
  );

  return <CitationOverlayContext.Provider value={value}>{children}</CitationOverlayContext.Provider>;
}

// Context, types, and hooks are exported from CitationOverlayContext.hooks.ts
export {
  CitationOverlayContext,
  type CitationOverlayContextValue,
  useCitationOverlay,
  useHasCitationOverlayProvider,
} from "./CitationOverlayContext.hooks.js";
