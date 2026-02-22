/**
 * Hook to get common citation data (key, instance ID, status).
 *
 * Extracted from CitationVariants.tsx to enable reuse across
 * custom citation components.
 *
 * @packageDocumentation
 */

import { useMemo } from "react";
import { getCitationStatus } from "../../parsing/parseCitation.js";
import type { Citation, CitationStatus } from "../../types/citation.js";
import type { Verification } from "../../types/verification.js";
import { generateCitationInstanceId, generateCitationKey } from "../utils.js";

export interface UseCitationDataResult {
  citationKey: string;
  citationInstanceId: string;
  status: CitationStatus;
}

/**
 * Derives common citation data from a citation and optional verification.
 *
 * NOTE: Status is intentionally not memoized because verification objects
 * may be mutated in place by the verification engine.
 */
export function useCitationData(citation: Citation, verification?: Verification | null): UseCitationDataResult {
  const citationKey = useMemo(() => generateCitationKey(citation), [citation]);
  const citationInstanceId = useMemo(() => generateCitationInstanceId(citationKey), [citationKey]);
  // Don't memoize - object reference as dependency causes stale values on mutation
  const status = getCitationStatus(verification ?? null);
  return { citationKey, citationInstanceId, status };
}
