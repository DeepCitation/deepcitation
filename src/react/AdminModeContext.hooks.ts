import { createContext, useContext } from "react";

export const AdminModeContext = createContext<boolean | null>(null);

/** Returns `true` if inside a `DeepCitationAdminProvider`, `false` otherwise. */
export function useAdminMode(): boolean {
  const context = useContext(AdminModeContext);
  return context ?? false;
}
