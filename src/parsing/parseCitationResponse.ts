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
const NUMERIC_MARKER_PATTERN = /\[[^\][]+\]\(cite:(\d+)\)|\[(\d+)\]/g;

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
    const candidatesByMarker = new Map<number, string[]>();
    for (const data of parsed.citations) {
      const citation: Citation = citationDataToCitation(data);
      if (citation.sourceContext) {
        const key = allocateCitationKey(
          citations,
          getCitationKey(citation),
          typeof data.id === "number" ? data.id : undefined,
        );
        citations[key] = citation;
        if (typeof data.id === "number") {
          const candidates = candidatesByMarker.get(data.id) ?? [];
          candidates.push(key);
          candidatesByMarker.set(data.id, candidates);
        }
      }
    }

    for (const [markerNumber, candidates] of candidatesByMarker) {
      markerMap[markerNumber] = selectBestCitationKeyForMarker(parsed.visibleText, markerNumber, candidates, citations);
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

function allocateCitationKey(citations: CitationRecord, baseKey: string, markerNumber: number | undefined): string {
  if (!baseKey) return "";
  const existing = citations[baseKey];
  if (!existing) return baseKey;
  if (markerNumber !== undefined && Number(existing.citationNumber) === markerNumber) return baseKey;

  const suffixBase = markerNumber !== undefined ? `${baseKey}:${markerNumber}` : `${baseKey}:dup`;
  let candidate = suffixBase;
  let counter = 2;
  while (citations[candidate]) {
    candidate = `${suffixBase}:${counter}`;
    counter++;
  }
  return candidate;
}

function normalizeForMarkerMatch(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[`*_()[\]{}"“”‘’.,;:!?-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMarkerContext(visibleText: string, markerNumber: number): string {
  NUMERIC_MARKER_PATTERN.lastIndex = 0;
  for (const match of visibleText.matchAll(NUMERIC_MARKER_PATTERN)) {
    const num = Number(match[1] ?? match[2]);
    if (num !== markerNumber || match.index === undefined) continue;
    const lineStart = Math.max(visibleText.lastIndexOf("\n", match.index) + 1, match.index - 220);
    const rawContext = visibleText.slice(lineStart, match.index);
    return normalizeForMarkerMatch(rawContext.replace(NUMERIC_MARKER_PATTERN, ""));
  }
  return "";
}

function scoreCitationForMarkerContext(citation: Citation, markerContext: string): number {
  if (!markerContext) return 0;
  const rawCitation = citation as Citation & { claimText?: string };
  const fields: Array<[string | undefined, number]> = [
    [rawCitation.claimText, 140],
    [citation.sourceMatch, 120],
    [citation.sourceContext, 60],
  ];

  let score = 0;
  for (const [field, weight] of fields) {
    const normalized = normalizeForMarkerMatch(field);
    if (!normalized) continue;
    if (markerContext.includes(normalized)) {
      score = Math.max(score, weight + Math.min(normalized.length, 80));
      continue;
    }
    if (normalized.includes(markerContext) && markerContext.length >= 4) {
      score = Math.max(score, weight - 20 + Math.min(markerContext.length, 40));
    }
  }
  return score;
}

function selectBestCitationKeyForMarker(
  visibleText: string,
  markerNumber: number,
  candidateKeys: string[],
  citations: CitationRecord,
): string {
  if (candidateKeys.length <= 1) return candidateKeys[0] ?? "";

  const markerContext = getMarkerContext(visibleText, markerNumber);
  let bestKey = candidateKeys[0] ?? "";
  let bestScore = -1;
  for (const key of candidateKeys) {
    const citation = citations[key];
    if (!citation) continue;
    const score = scoreCitationForMarkerContext(citation, markerContext);
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestKey;
}
