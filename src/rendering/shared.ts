/**
 * Shared utilities for citation rendering targets.
 *
 * Provides the segment-walk loop and source label resolution
 * used by prepareCitations and the terminal renderer.
 */

import { type ParsedCitationResult, parseCitationResponse } from "../parsing/parseCitationResponse.js";
import type { Citation, CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { getCitationStatus } from "../utils/citationStatus.js";
import type { RenderCitationWithStatus } from "./types.js";

export type StatusKey = "verified" | "partial" | "notFound" | "pending";

const CITATION_MARKER_RE = /^\[(\d+)\]$/;
const CITATION_LINK_RE = /^\[([^\][]+)\]\(cite:(\d+)\)$/;

/**
 * Map a CitationStatus to a status key used across renderers for
 * CSS classes, ANSI colors, and status labels.
 */
export function getStatusKey(status: CitationStatus): StatusKey {
  if (status.isMiss) return "notFound";
  if (status.isPartialMatch) return "partial";
  if (status.isVerified) return "verified";
  return "pending";
}

/** A text segment (no citation marker). */
export interface TextSegment {
  type: "text";
  value: string;
}

/** A citation marker segment with resolved citation data. */
export interface CitationSegment {
  type: "citation";
  citationKey: string;
  citation: Citation;
  verification: Verification | null;
  status: CitationStatus;
  citationNumber: number;
}

/** Result of walking citation segments. */
export interface WalkResult {
  segments: (TextSegment | CitationSegment)[];
  citationsWithStatus: RenderCitationWithStatus[];
}

/**
 * Walks parsed citation output, splitting into typed segments.
 *
 * Replaces the ~25-line boilerplate loop duplicated across all renderers:
 * parse → split → match `[N]` → look up markerMap → getCitationStatus → push.
 *
 * @param input - Raw LLM string or pre-parsed result
 * @param verifications - Verification results keyed by citationKey
 * @returns Typed segments and citationsWithStatus array
 */
export function walkCitationSegments(
  input: string | ParsedCitationResult,
  verifications: Record<string, Verification> = {},
): WalkResult {
  const parsed = typeof input === "string" ? parseCitationResponse(input) : input;
  const rawSegments = parsed.visibleText.split(parsed.splitPattern);
  const segments: (TextSegment | CitationSegment)[] = [];
  const citationsWithStatus: RenderCitationWithStatus[] = [];
  let citationIndex = 0;

  for (const segment of rawSegments) {
    const oldMatch = segment.match(CITATION_MARKER_RE);
    const linkMatch = !oldMatch ? segment.match(CITATION_LINK_RE) : null;
    const match = oldMatch || linkMatch;
    if (!match) {
      segments.push({ type: "text", value: segment });
      continue;
    }

    citationIndex++;
    // Old format: ID in group 1; link format: ID in group 2
    const citationId = linkMatch ? Number(match[2]) : Number(match[1]);
    const citationKey = parsed.markerMap[citationId];
    const citation = citationKey ? parsed.citations[citationKey] : undefined;
    if (!citation) {
      segments.push({ type: "text", value: segment });
      continue;
    }

    const verification = verifications[citationKey] || null;
    const status = getCitationStatus(verification);

    const cws: RenderCitationWithStatus = {
      citation,
      citationKey,
      verification,
      status,
      citationNumber: citationIndex,
    };

    citationsWithStatus.push(cws);
    segments.push({
      type: "citation",
      citationKey,
      citation,
      verification,
      status,
      citationNumber: citationIndex,
    });
  }

  return { segments, citationsWithStatus };
}

/**
 * Resolves a source label for a citation, with fallback chain.
 *
 * Fallback order:
 * 1. sourceLabels[attachmentId] (or sourceLabels[""] for URL citations)
 * 2. verification.label
 * 3. citation.title (URL citations only)
 * 4. "Source N"
 */
export function resolveSourceLabel(cws: RenderCitationWithStatus, sourceLabels: Record<string, string>): string {
  if (cws.citation.type === "url") {
    return sourceLabels[""] || cws.verification?.label || cws.citation.title || `Source ${cws.citationNumber}`;
  }
  return sourceLabels[cws.citation.attachmentId || ""] || cws.verification?.label || `Source ${cws.citationNumber}`;
}
