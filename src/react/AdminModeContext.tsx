import type React from "react";
import { AdminModeContext } from "./AdminModeContext.hooks.js";

/** Suppresses telemetry and image prefetch for all child citation components. */
export function DeepCitationAdminProvider({ children }: { children: React.ReactNode }) {
  return <AdminModeContext.Provider value={true}>{children}</AdminModeContext.Provider>;
}

export { useAdminMode } from "./AdminModeContext.hooks.js";
