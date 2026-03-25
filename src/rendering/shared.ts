/**
 * Shared utilities for citation rendering targets.
 *
 * Extracts the common segment-walk loop and source label resolution
 * used identically across GitHub, HTML, Slack, Terminal, and Markdown renderers.
 */

import { getCitationStatus } from "../parsing/parseCitation.js";
import { type ParsedCitationResult, parseCitationResponse } from "../parsing/parseCitationResponse.js";
import type { Citation, CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import type { RenderCitationWithStatus } from "./types.js";

export type StatusKey = "verified" | "partial" | "notFound" | "pending";

const CITATION_MARKER_RE = /^\[(\d+)\]$/;

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

export function getStatusLabel(status: CitationStatus): string {
  if (status.isMiss) return "Not Found";
  if (status.isPartialMatch) return "Partial Match";
  if (status.isVerified) return "Verified";
  if (status.isPending) return "Pending";
  return "Unknown";
}

/**
 * Escape a string for safe embedding in HTML text content and attributes.
 * Covers the OWASP-recommended five characters to prevent XSS in both
 * element content and quoted attribute values.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Escape special Slack mrkdwn characters (`<`, `>`, `&`).
 * Inside Slack messages these three characters must be entity-encoded
 * to prevent them from being interpreted as link/mention/channel syntax.
 * See: https://api.slack.com/reference/surfaces/formatting#escaping
 */
export function escapeSlackMrkdwn(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    const match = segment.match(CITATION_MARKER_RE);
    if (!match) {
      segments.push({ type: "text", value: segment });
      continue;
    }

    citationIndex++;
    const citationKey = parsed.markerMap[Number(match[1])];
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
