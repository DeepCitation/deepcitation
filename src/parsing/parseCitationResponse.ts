/**
 * Unified citation response parser.
 *
 * Provides a single entry point for parsing LLM output that may contain
 * either deferred `[N]` markers or XML `<cite>` tags. Returns everything
 * needed for React rendering and verification lookup.
 */

import type { Citation, CitationRecord } from "../types/citation.js";
import { getCitationKey } from "../utils/citationKey.js";
import { createSafeObject } from "../utils/objectSafety.js";
import { deferredCitationToCitation, hasDeferredCitations, parseDeferredCitationResponse } from "./citationParser.js";
import { extractXmlCitations } from "./parseCitation.js";

/**
 * Result of parsing an LLM response for citations.
 *
 * Contains everything needed to render citations in React:
 * - `visibleText` for display (data block stripped)
 * - `citations` keyed by citationKey for lookup
 * - `markerMap` to bridge deferred `[N]` numbers to citation keys
 * - `splitPattern` for `visibleText.split()` in rendering
 */
export interface ParsedCitationResult {
  /** Text for display — data block stripped; markers/cite tags remain as split points */
  visibleText: string;
  /** Citations keyed by citationKey (16-char hash) */
  citations: CitationRecord;
  /** Maps deferred `[N]` number → citationKey. Empty for XML format. */
  markerMap: Record<number, string>;
  /** Detected citation format */
  format: "deferred" | "xml" | "none";
  /** RegExp for `visibleText.split(splitPattern)` — produces alternating text/marker segments */
  splitPattern: RegExp;
}

/** Split pattern for deferred `[N]` markers — capture group preserves markers in split output */
const DEFERRED_SPLIT_PATTERN = /(\[\d+\])/g;

/**
 * Split pattern for XML `<cite ... />` tags — capture group preserves tags in split output.
 * Core pattern mirrors CITE_TAG_REGEX in parseCitation.ts (must stay in sync).
 */
const XML_SPLIT_PATTERN = /(<cite\s+(?:'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"|[^'">/])*\/>)/g;

/**
 * Parses LLM output into a unified result, auto-detecting the citation format.
 *
 * Deferred format: `[N]` markers in text + `<<<CITATION_DATA>>>` JSON block
 * XML format: `<cite ... />` tags inline in text
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
 *   if (result.format === "deferred") {
 *     const match = seg.match(/^\[(\d+)\]$/);
 *     if (match) {
 *       const key = result.markerMap[Number(match[1])];
 *       return <CitationComponent citation={result.citations[key]} />;
 *     }
 *   }
 *   // ... handle XML segments with parseCitation()
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
      splitPattern: DEFERRED_SPLIT_PATTERN,
    };
  }

  // Check for deferred format first (has explicit delimiter)
  if (hasDeferredCitations(llmOutput)) {
    return parseDeferredFormat(llmOutput);
  }

  // Check for XML format
  const xmlCitations = extractXmlCitations(llmOutput);
  if (Object.keys(xmlCitations).length > 0) {
    return {
      visibleText: llmOutput,
      citations: xmlCitations,
      markerMap: {},
      format: "xml",
      splitPattern: XML_SPLIT_PATTERN,
    };
  }

  // No citations detected
  return {
    visibleText: llmOutput,
    citations: {},
    markerMap: {},
    format: "none",
    splitPattern: DEFERRED_SPLIT_PATTERN,
  };
}

/**
 * Internal: parses deferred `[N]` + `<<<CITATION_DATA>>>` format.
 */
function parseDeferredFormat(llmOutput: string): ParsedCitationResult {
  const parsed = parseDeferredCitationResponse(llmOutput);
  const citations: CitationRecord = createSafeObject<Citation>();
  const markerMap: Record<number, string> = {};

  if (parsed.success) {
    for (const data of parsed.citations) {
      const citation: Citation = deferredCitationToCitation(data);
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
    format: "deferred",
    splitPattern: DEFERRED_SPLIT_PATTERN,
  };
}
