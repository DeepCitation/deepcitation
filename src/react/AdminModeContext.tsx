/**
 * DeepCitationAdminProvider Component
 *
 * Enables admin/read-only mode for all child citation components.
 * When active, citations suppress telemetry events (citation_seen, evidence_ready,
 * popover_opened, popover_closed, citation_reviewed) and skip automatic image
 * prefetching. This prevents admin dashboard page loads from inflating usage
 * metrics or triggering unnecessary network requests.
 *
 * Usage:
 * 1. Wrap your admin dashboard with <DeepCitationAdminProvider>
 * 2. All child CitationComponents automatically enter admin mode
 *
 * Individual components can also use the `adminMode` prop for granular control.
 *
 * @example
 * ```tsx
 * <DeepCitationAdminProvider>
 *   <AdminDashboard>
 *     <CitationComponent citation={c} verification={v} />
 *   </AdminDashboard>
 * </DeepCitationAdminProvider>
 * ```
 */
import type React from "react";
import { AdminModeContext } from "./AdminModeContext.hooks.js";

/**
 * Provider that enables admin mode for all child citation components.
 *
 * @param enabled - Whether admin mode is active. Defaults to `true`.
 */
export function DeepCitationAdminProvider({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  return <AdminModeContext.Provider value={enabled}>{children}</AdminModeContext.Provider>;
}

// Context, types, and hooks are exported from AdminModeContext.hooks.ts
export { AdminModeContext, useAdminMode, useHasAdminModeProvider } from "./AdminModeContext.hooks.js";
