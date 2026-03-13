/**
 * Unified citation response parser.
 *
 * Provides a single entry point for parsing LLM output that contains
 * `[N]` markers and a `<<<CITATION_DATA>>>` JSON block. Returns everything
 * needed for React rendering and verification lookup.
 */

import type { Citation, CitationRecord } from "../types/citation.js";
import { getCitationKey } from "../utils/citationKey.js";
import { createSafeObject } from "../utils/objectSafety.js";
import { citationDataToCitation, hasCitationData, parseCitationData } from "./citationParser.js";

/**
 * Result of parsing an LLM response for citations.
 *
 * Contains everything needed to render citations in React:
 * - `visibleText` for display (data block stripped)
 * - `citations` keyed by citationKey for lookup
 * - `markerMap` to bridge `[N]` numbers to citation keys
 * - `splitPattern` for `visibleText.split()` in rendering
 */
export interface ParsedCitationResult {
  /** Text for display — data block stripped; markers remain as split points */
  visibleText: string;
  /** Citations keyed by citationKey (16-char hash) */
  citations: CitationRecord;
  /** Maps `[N]` number → citationKey */
  markerMap: Record<number, string>;
  /** Detected citation format */
  format: "numeric" | "none";
  /** RegExp for `visibleText.split(splitPattern)` — produces alternating text/marker segments */
  splitPattern: RegExp;
}

/** Split pattern for `[N]` markers — capture group preserves markers in split output */
const NUMERIC_SPLIT_PATTERN = /(\[\d+\])/g;

/**
 * Parses LLM output into a unified result.
 *
 * Numeric format: `[N]` markers in text + `<<<CITATION_DATA>>>` JSON block
 *
 * @param llmOutput - Raw LLM response string
 * @returns ParsedCitationResult with citations, markerMap, and splitPattern
 *
 * @example
 * ```typescript
 * const result = parseCitationResponse(llmOutput);
 *
 * // Render in React:
 * const segments = result.visibleText.split(result.splitPattern);
 * segments.map((seg, i) => {
 *   const match = seg.match(/^\[(\d+)\]$/);
 *   if (match) {
 *     const key = result.markerMap[Number(match[1])];
 *     return <CitationComponent citation={result.citations[key]} />;
 *   }
 *   return seg;
 * });
 * ```
 */
export function parseCitationResponse(llmOutput: string): ParsedCitationResult {
  if (!llmOutput || typeof llmOutput !== "string") {
    return {
      visibleText: "",
      citations: {},
      markerMap: {},
      format: "none",
      splitPattern: NUMERIC_SPLIT_PATTERN,
    };
  }

  // Check for numeric format (has explicit delimiter)
  if (hasCitationData(llmOutput)) {
    return parseNumericFormat(llmOutput);
  }

  // No citations detected
  return {
    visibleText: llmOutput,
    citations: {},
    markerMap: {},
    format: "none",
    splitPattern: NUMERIC_SPLIT_PATTERN,
  };
}

/**
 * Internal: parses `[N]` + `<<<CITATION_DATA>>>` format.
 */
function parseNumericFormat(llmOutput: string): ParsedCitationResult {
  const parsed = parseCitationData(llmOutput);
  const citations: CitationRecord = createSafeObject<Citation>();
  const markerMap: Record<number, string> = {};

  if (parsed.success) {
    for (const data of parsed.citations) {
      const citation: Citation = citationDataToCitation(data);
      if (citation.fullPhrase) {
        const key = getCitationKey(citation);
        citations[key] = citation;
        if (typeof data.id === "number") {
          markerMap[data.id] = key;
        }
      }
    }
  }

  return {
    visibleText: parsed.visibleText,
    citations,
    markerMap,
    format: "numeric",
    splitPattern: NUMERIC_SPLIT_PATTERN,
  };
}
