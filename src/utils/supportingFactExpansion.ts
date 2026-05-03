import type { Citation, CitationRecord, SupportingFact } from "../types/citation.js";
import type { VerificationRecord } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { getChildCitationKey, getCitationKey } from "./citationKey.js";

/** Maps a parent citation key to its child verification keys (ordered by childIndex). */
export type ParentChildKeyMap = Record<string, string[]>;

/**
 * Expands supporting facts into standalone Citation entries for verification.
 * The server sees a flat CitationRecord — each supporting fact becomes its own
 * entry keyed by a deterministic child key.
 */
export function expandSupportingFactsForVerification(citations: CitationRecord): {
  expanded: CitationRecord;
  parentChildMap: ParentChildKeyMap;
} {
  const expanded: CitationRecord = {};
  const parentChildMap: ParentChildKeyMap = {};

  for (const [key, citation] of Object.entries(citations)) {
    expanded[key] = citation;

    if (!citation.supportingFacts?.length) continue;

    const childKeys: string[] = [];
    for (const fact of citation.supportingFacts) {
      const childKey = getChildCitationKey(key, fact.childIndex);
      childKeys.push(childKey);
      expanded[childKey] = childCitationFromFact(fact, citation);
    }
    parentChildMap[key] = childKeys;
  }

  return { expanded, parentChildMap };
}

/**
 * Retrieves verifications for a parent's supporting facts, ordered by childIndex.
 */
export function getSupportingFactVerifications(
  parentKey: string,
  parentChildMap: ParentChildKeyMap,
  verifications: VerificationRecord,
): (Verification | undefined)[] {
  const childKeys = parentChildMap[parentKey];
  if (!childKeys) return [];
  return childKeys.map((k) => verifications[k]);
}

/**
 * Converts a SupportingFact to a standalone Citation for independent verification.
 * Strips `supportingFacts` from the parent to prevent recursive nesting.
 */
export function childCitationFromFact(fact: SupportingFact, parent: Citation): Citation {
  const { supportingFacts: _drop, ...parentWithoutChildren } = parent;
  return {
    ...parentWithoutChildren,
    sourceContext: fact.sourceContext ?? parent.sourceContext,
    sourceMatch: fact.sourceMatch,
    pageNumber: fact.pageNumber ?? parent.pageNumber,
    lineIds: fact.lineIds,
    startPageId: fact.startPageId,
    attachmentId: fact.attachmentId ?? parent.attachmentId,
    reasoning: fact.reasoning,
  } as Citation;
}
