import type { Citation, CitationRecord } from "../types/citation.js";
import { getCitationKey } from "../utils/citationKey.js";
import { createSafeObject } from "../utils/objectSafety.js";
import { citationDataToCitation, hasCitationData, parseCitationData } from "./citationParser.js";

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

/** Split pattern for both `[anchor](cite:N)` and `[N]` markers — capture group preserves markers in split output */
const NUMERIC_SPLIT_PATTERN = /(\[[^\][]+\]\(cite:\d+\)|\[\d+\])/g;

/** Parse LLM output with `[N]` markers and `<<<CITATION_DATA>>>` JSON block. */
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
