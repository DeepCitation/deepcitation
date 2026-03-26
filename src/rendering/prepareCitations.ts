/**
 * Citation IR (Intermediate Representation) — the formal boundary between
 * parsing/verification and rendering adapters.
 *
 * `prepareCitations` is the "port" in a ports-and-adapters architecture.
 * It parses input, resolves verifications, and produces a normalized IR
 * that rendering adapters consume. This allows:
 *
 * 1. Prepare once, render to multiple formats (GitHub + Slack + terminal)
 * 2. Test adapters in isolation against constructed IR literals
 * 3. Factor parse/resolve logic out of every renderer
 *
 * @packageDocumentation
 */

import type { ParsedCitationResult } from "../parsing/parseCitationResponse.js";
import type { VerificationRecord } from "../types/citation.js";
import { type CitationSegment, resolveSourceLabel, type TextSegment, walkCitationSegments } from "./shared.js";
import type { RenderCitationWithStatus } from "./types.js";

// =============================================================================
// TYPES
// =============================================================================

/** Citation with resolved source label (pre-computed for adapters). */
export interface ResolvedCitation extends RenderCitationWithStatus {
  /** Pre-resolved source label from the fallback chain. */
  sourceLabel: string;
}

/**
 * Normalized intermediate representation for citation rendering.
 * Adapters consume this — they never call parseCitationResponse or walkCitationSegments.
 */
export interface CitationIR {
  /** Ordered segments: text and citation interleaved. */
  readonly segments: ReadonlyArray<TextSegment | CitationSegment>;
  /** All citations with status and resolved labels. */
  readonly citations: ReadonlyArray<ResolvedCitation>;
}

export interface PrepareCitationsOptions {
  /** Verification results keyed by citationKey. */
  verifications?: VerificationRecord;
  /** Source labels keyed by attachmentId (or "" for URL citations). */
  sourceLabels?: Record<string, string>;
}

/**
 * A rendering adapter: pure function from IR + options to output.
 * Implement this to create a new render target (email, PDF, Notion, etc.).
 *
 * @example
 * ```typescript
 * const adaptForEmail: CitationAdapter<EmailOptions, EmailOutput> = (ir, options) => {
 *   for (const seg of ir.segments) {
 *     if (seg.type === "text") { ... }
 *     else { ... } // seg.type === "citation"
 *   }
 * };
 * ```
 */
export type CitationAdapter<TOptions, TOutput> = (ir: CitationIR, options?: TOptions) => TOutput;

// =============================================================================
// PORT
// =============================================================================

/**
 * Prepare citations for rendering: parse input, resolve verifications,
 * and produce a normalized IR that any adapter can consume.
 *
 * @param input - Raw LLM string or pre-parsed result.
 * @param options - Verifications and source labels.
 * @returns CitationIR ready for adapter consumption.
 */
export function prepareCitations(
  input: string | ParsedCitationResult,
  options: PrepareCitationsOptions = {},
): CitationIR {
  const { verifications = {}, sourceLabels = {} } = options;
  const { segments, citationsWithStatus } = walkCitationSegments(input, verifications);

  const citations: ResolvedCitation[] = citationsWithStatus.map(cws => ({
    ...cws,
    sourceLabel: resolveSourceLabel(cws, sourceLabels),
  }));

  return { segments, citations };
}
