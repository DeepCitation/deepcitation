/**
 * CitationOverlayContext Hooks
 *
 * Hooks and context for managing citation overlay state.
 * These are exported from a separate file to comply with linting rules that
 * prevent non-component exports from component files.
 */
import { createContext, useContext } from "react";

export interface CitationOverlayContextValue {
  /** Whether any citation image overlay is currently open */
  isAnyOverlayOpen: boolean;
  /** Register an overlay as open (call on mount) */
  registerOverlay: () => void;
  /** Unregister an overlay (call on unmount) */
  unregisterOverlay: () => void;
}

export const CitationOverlayContext = createContext<CitationOverlayContextValue | null>(null);

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
