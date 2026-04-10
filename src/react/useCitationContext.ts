/**
 * Citation Context Hooks
 * @packageDocumentation
 */

import { createContext, type ReactNode, useContext } from "react";
import type { Citation, CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";

interface CitationContextValue {
  citation: Citation;
  citationKey: string;
  citationInstanceId: string;
  status: CitationStatus;
  verification: Verification | null;
  config: {
    fallbackText: string | null;
    pendingContent: ReactNode;
  };
}

export const CitationContext = createContext<CitationContextValue | null>(null);

/** Access citation context. Must be used within Citation.Root. */
export function useCitationContext(): CitationContextValue {
  const context = useContext(CitationContext);
  if (!context) {
    throw new Error("Citation components must be used within a Citation.Root");
  }
  return context;
}

/** Safely access citation context (returns null if not in context). */
export function useCitationContextSafe(): CitationContextValue | null {
  return useContext(CitationContext);
}

export type { CitationContextValue };
