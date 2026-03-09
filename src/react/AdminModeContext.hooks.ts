/**
 * AdminModeContext Hooks
 *
 * Hooks and context for admin/read-only mode.
 * When admin mode is active, citation components suppress telemetry events
 * and image prefetching so that admin dashboard views don't inflate usage metrics.
 *
 * These are exported from a separate file to comply with linting rules that
 * prevent non-component exports from component files.
 */
import { createContext, useContext } from "react";

export const AdminModeContext = createContext<boolean | null>(null);

/**
 * Hook to check if admin mode is active.
 *
 * Returns `true` if inside a `DeepCitationAdminProvider` with `enabled` (default),
 * `false` otherwise. When no provider is present, returns `false` (graceful degradation).
 *
 * @example
 * ```tsx
 * const isAdmin = useAdminMode();
 * if (isAdmin) {
 *   // Skip telemetry, prefetch, etc.
 * }
 * ```
 */
export function useAdminMode(): boolean {
  const context = useContext(AdminModeContext);
  return context ?? false;
}

/**
 * Check if the DeepCitationAdminProvider is present in the tree.
 * Useful for debugging or conditional behavior.
 */
export function useHasAdminModeProvider(): boolean {
  const context = useContext(AdminModeContext);
  return context !== null;
}
