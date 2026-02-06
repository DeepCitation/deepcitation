/**
 * CitationOverlayContext
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
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface CitationOverlayContextValue {
  /** Whether any citation image overlay is currently open */
  isAnyOverlayOpen: boolean;
  /** Register an overlay as open (call on mount) */
  registerOverlay: () => void;
  /** Unregister an overlay (call on unmount) */
  unregisterOverlay: () => void;
}

const CitationOverlayContext =
  createContext<CitationOverlayContextValue | null>(null);

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
export function CitationOverlayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [overlayCount, setOverlayCount] = useState(0);

  const registerOverlay = useCallback(() => {
    setOverlayCount((c) => c + 1);
  }, []);

  const unregisterOverlay = useCallback(() => {
    setOverlayCount((c) => Math.max(0, c - 1));
  }, []);

  const value = useMemo(
    () => ({
      isAnyOverlayOpen: overlayCount > 0,
      registerOverlay,
      unregisterOverlay,
    }),
    [overlayCount, registerOverlay, unregisterOverlay]
  );

  return (
    <CitationOverlayContext.Provider value={value}>
      {children}
    </CitationOverlayContext.Provider>
  );
}

/**
 * Hook to access citation overlay state.
 *
 * Returns context value if inside a CitationOverlayProvider,
 * otherwise returns a fallback that allows all hover (graceful degradation).
 *
 * @example
 * ```tsx
 * const { isAnyOverlayOpen, registerOverlay, unregisterOverlay } = useCitationOverlay();
 *
 * // In ImageOverlay component:
 * useEffect(() => {
 *   registerOverlay();
 *   return () => unregisterOverlay();
 * }, []);
 *
 * // In hover handler:
 * if (isAnyOverlayOpen) return; // Skip hover
 * ```
 */
export function useCitationOverlay(): CitationOverlayContextValue {
  const context = useContext(CitationOverlayContext);

  // Fallback for when no provider is present - allows hover, no-op register
  // This provides graceful degradation for users who don't wrap with provider
  if (!context) {
    return {
      isAnyOverlayOpen: false,
      registerOverlay: () => {},
      unregisterOverlay: () => {},
    };
  }

  return context;
}

/**
 * Check if the CitationOverlayProvider is present in the tree.
 * Useful for debugging or conditional behavior.
 */
export function useHasCitationOverlayProvider(): boolean {
  const context = useContext(CitationOverlayContext);
  return context !== null;
}
