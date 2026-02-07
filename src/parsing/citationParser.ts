/**
 * Citation Parser
 *
 * Implements the "Split & Parse" strategy for the deferred JSON citation pattern.
 * This parser extracts citations from LLM responses that use [N] markers in text
 * and include a JSON data block at the end.
 *
 * Algorithm:
 * 1. Detection: Look for the start delimiter <<<CITATION_DATA>>>
 * 2. Splitting: Separate visible content from the citation data block
 * 3. Data Extraction: Extract the JSON string between delimiters
 * 4. Sanitization: Parse with JSON.parse, with fallback repair for common issues
 * 5. Hydration: Map the JSON objects to a usable format
 */

import {
  CITATION_DATA_END_DELIMITER,
  CITATION_DATA_START_DELIMITER,
  type CitationData,
  type CompactCitationData,
  type ParsedCitationResponse,
} from "../prompts/citationPrompts.js";
import { generateCitationKey } from "../react/utils.js";
import type { Citation } from "../types/citation.js";

/**
 * Map of compact keys to their full CitationData equivalents.
 */
const COMPACT_KEY_MAP: Record<string, keyof CitationData> = {
  n: "id",
  a: "attachment_id",
  r: "reasoning",
  f: "full_phrase",
  k: "anchor_text",
  p: "page_id",
  l: "line_ids",
  t: "timestamps",
} as const;

/**
 * Map for timestamp sub-keys.
 */
const _TIMESTAMP_KEY_MAP: Record<string, string> = {
  s: "start_time",
  e: "end_time",
} as const;

/**
 * Type guard to validate that an object has the required CitationData structure.
 * Ensures at minimum the id field is present and is a number.
 */
function isValidCitationData(obj: unknown): obj is CitationData {
  return (
    typeof obj === "object" && obj !== null && "id" in obj && typeof (obj as Record<string, unknown>).id === "number"
  );
}

/**
 * Expands compact citation data to the full CitationData format.
 * Handles both compact keys (n, a, r, f, k, p, l, t) and full keys.
 *
 * @param data - Raw citation object (may have compact or full keys)
 * @param attachmentId - Optional attachment_id to inject (for grouped format)
 * @returns Normalized CitationData with full keys
 * @throws Error if the resulting data doesn't have a valid id field
 */
function expandCompactKeys(
  data: CompactCitationData | CitationData | Record<string, unknown>,
  attachmentId?: string,
): CitationData {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // Check if this is a compact key
    const fullKey = COMPACT_KEY_MAP[key] || key;

    // Handle timestamps specially (nested object with s/e keys)
    if ((key === "t" || key === "timestamps") && value && typeof value === "object") {
      const ts = value as Record<string, unknown>;
      result.timestamps = {
        start_time: ts.s ?? ts.start_time,
        end_time: ts.e ?? ts.end_time,
      };
    } else {
      result[fullKey] = value;
    }
  }

  // Inject attachment_id if provided (from grouped format)
  if (attachmentId && !result.attachment_id) {
    result.attachment_id = attachmentId;
  }

  // Runtime validation to ensure type safety
  if (!isValidCitationData(result)) {
    throw new Error("Invalid citation data: missing or invalid 'id' field");
  }

  return result;
}

/**
 * Checks if the parsed JSON is in grouped format (object with attachment IDs as keys)
 * vs flat format (array of citations).
 */
function isGroupedFormat(parsed: unknown): parsed is Record<string, unknown[]> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  // Check if all values are arrays (grouped format)
  const values = Object.values(parsed);
  return values.length > 0 && values.every(Array.isArray);
}

/**
 * Flattens grouped citation format into a flat array.
 * Grouped format: { "attachmentId": [citations...], ... }
 * Flat format: [{ attachment_id: "...", ...citation }, ...]
 */
function flattenGroupedCitations(grouped: Record<string, unknown[]>): CitationData[] {
  const citations: CitationData[] = [];

  for (const [attachmentId, citationArray] of Object.entries(grouped)) {
    for (const citation of citationArray) {
      if (typeof citation === "object" && citation !== null) {
        citations.push(expandCompactKeys(citation as Record<string, unknown>, attachmentId));
      }
    }
  }

  return citations;
}

/**
 * Helper to parse citations from JSON, handling both grouped and flat formats.
 */
function parseCitationsFromJson(parsed: unknown): CitationData[] {
  // Check for grouped format: { "attachmentId": [citations...], ... }
  if (isGroupedFormat(parsed)) {
    return flattenGroupedCitations(parsed);
  }

  // Flat format: array of citations or single citation
  const rawCitations = Array.isArray(parsed) ? parsed : [parsed];
  return rawCitations.map(c => expandCompactKeys(c as Record<string, unknown>));
}

export type {
  CitationData,
  ParsedCitationResponse,
} from "../prompts/citationPrompts.js";

/**
 * Attempts to repair malformed JSON.
 * Handles common LLM output issues like:
 * - Trailing commas
 * - Single quotes instead of double quotes (in JSON context)
 * - Missing closing brackets
 * - Unescaped newlines in strings
 * - Invalid escape sequences (like \~ or \x)
 *
 * @param jsonString - The potentially malformed JSON string
 * @returns The repaired JSON string
 */
function repairJson(jsonString: string): {
  repaired: string;
  repairs: string[];
} {
  let repaired = jsonString.trim();
  const repairs: string[] = [];

  // Remove any markdown code block markers that might be present
  const beforeMarkdownRemoval = repaired;
  repaired = repaired.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (repaired !== beforeMarkdownRemoval) {
    repairs.push("removed markdown code block markers");
  }

  // Fix invalid escape sequences inside JSON strings.
  // Valid escapes: \" \\ \/ \b \f \n \r \t \uXXXX
  // Invalid escapes like \~ \x \a etc. should have the backslash removed.
  // We need to be careful to only process content inside string values.
  // Note: \u is only valid when followed by exactly 4 hex digits (e.g., \u0020).
  // Invalid \u sequences (like \utest) should have the backslash removed.
  const beforeInvalidEscapes = repaired;
  repaired = repaired.replace(/"(?:[^"\\]|\\.)*"/g, match => {
    // Inside a JSON string, fix invalid escape sequences
    // by removing the backslash before non-standard escape characters.
    // Use negative lookahead to preserve valid unicode escapes (\uXXXX).
    return match.replace(/\\(?!u[0-9a-fA-F]{4})([^"\\/bfnrt])/g, (_, char) => char);
  });
  if (repaired !== beforeInvalidEscapes) {
    repairs.push("fixed invalid escape sequences");
  }

  // Fix trailing commas before ] or }
  const beforeTrailingCommas = repaired;
  repaired = repaired.replace(/,(\s*[\]}])/g, "$1");
  if (repaired !== beforeTrailingCommas) {
    repairs.push("removed trailing commas");
  }

  // Fix missing closing bracket if we have an opening [
  if (repaired.startsWith("[") && !repaired.endsWith("]")) {
    // Check if we have unclosed array
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      const addedCount = openBrackets - closeBrackets;
      repaired = repaired + "]".repeat(addedCount);
      repairs.push(`added ${addedCount} closing bracket(s)`);
    }
  }

  // Fix missing closing brace if we have an opening {
  if (repaired.includes("{")) {
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      const addedCount = openBraces - closeBraces;
      repaired = repaired + "}".repeat(addedCount);
      repairs.push(`added ${addedCount} closing brace(s)`);
    }
  }

  return { repaired, repairs };
}

/**
 * Parses a citation response from an LLM.
 *
 * This function:
 * 1. Finds the <<<CITATION_DATA>>> delimiter in the response
 * 2. Splits the response into visible text and citation data
 * 3. Parses the JSON citation data
 * 4. Returns a structured result with both
 *
 * @param llmResponse - The full LLM response text
 * @returns ParsedCitationResponse with visible text and parsed citations
 *
 * @example
 * ```typescript
 * const response = `
 *   The company grew 45% [1].
 *
 *   <<<CITATION_DATA>>>
 *   [{"id": 1, "attachment_id": "abc", "full_phrase": "grew 45%", "anchor_text": "45%"}]
 *   <<<END_CITATION_DATA>>>
 * `;
 *
 * const parsed = parseDeferredCitationResponse(response);
 * console.log(parsed.visibleText); // "The company grew 45% [1]."
 * console.log(parsed.citations); // [{id: 1, attachment_id: "abc", ...}]
 * ```
 */
export function parseDeferredCitationResponse(llmResponse: string): ParsedCitationResponse {
  if (!llmResponse || typeof llmResponse !== "string") {
    return {
      visibleText: "",
      citations: [],
      citationMap: new Map(),
      success: false,
      error: "Invalid input: expected a string",
    };
  }

  // Find the start delimiter
  const startIndex = llmResponse.indexOf(CITATION_DATA_START_DELIMITER);

  // No citation data block found - return full text as visible
  if (startIndex === -1) {
    return {
      visibleText: llmResponse.trim(),
      citations: [],
      citationMap: new Map(),
      success: true,
    };
  }

  // Extract visible text (everything before the delimiter)
  const visibleText = llmResponse.substring(0, startIndex).trim();

  // Find the end delimiter
  const endIndex = llmResponse.indexOf(CITATION_DATA_END_DELIMITER, startIndex);

  // Extract the JSON block
  const jsonStartIndex = startIndex + CITATION_DATA_START_DELIMITER.length;
  const jsonEndIndex = endIndex !== -1 ? endIndex : llmResponse.length;
  const jsonString = llmResponse.substring(jsonStartIndex, jsonEndIndex).trim();

  // Parse the JSON
  let citations: CitationData[] = [];
  const citationMap = new Map<number, CitationData>();

  if (jsonString) {
    try {
      // First attempt: direct JSON.parse
      const parsed = JSON.parse(jsonString);
      citations = parseCitationsFromJson(parsed);
    } catch (initialError) {
      // Second attempt: repair and retry
      try {
        const { repaired, repairs } = repairJson(jsonString);
        const parsed = JSON.parse(repaired);
        citations = parseCitationsFromJson(parsed);

        // Log warning when repair was necessary
        if (repairs.length > 0) {
          console.warn(
            "[DeepCitation] JSON repair was triggered for citation data.",
            `Repairs applied: ${repairs.join(", ")}.`,
            `Initial parse error: ${initialError instanceof Error ? initialError.message : "Unknown error"}`,
          );
        }
      } catch (repairError) {
        return {
          visibleText,
          citations: [],
          citationMap: new Map(),
          success: false,
          error: `Failed to parse citation JSON. Initial error: ${initialError instanceof Error ? initialError.message : "Unknown error"}. Repair error: ${repairError instanceof Error ? repairError.message : "Unknown error"}`,
        };
      }
    }
  }

  // Map citations by ID for O(1) lookups
  for (const citation of citations) {
    if (typeof citation.id === "number") {
      citationMap.set(citation.id, citation);
    }
  }

  return {
    visibleText,
    citations,
    citationMap,
    success: true,
  };
}

/**
 * Parses a page_id string to extract page number and index.
 * Supports both compact "N_I" format and legacy "page_number_N_index_I" format.
 *
 * Page numbers are 1-indexed (page 1 is the first page). If page_id is "0_0"
 * (both page and index are 0), it will be auto-corrected to page 1, index 0.
 * Other cases like "0_5" are left as-is since they are ambiguous.
 *
 * @param pageId - The page ID string
 * @returns Object with pageNumber and normalized startPageId, or undefined values
 */
function parsePageId(pageId: string): {
  pageNumber?: number;
  startPageId?: string;
} {
  // Try compact format first: "N_I" (e.g., "2_1")
  const compactMatch = pageId.match(/^(\d+)_(\d+)$/);
  if (compactMatch) {
    let pageNum = parseInt(compactMatch[1], 10);
    const index = parseInt(compactMatch[2], 10);

    // Only auto-correct "0_0" to page 1 (when both page and index are 0)
    // Other cases like "0_5" are ambiguous and should not be guessed
    if (pageNum === 0 && index === 0) {
      pageNum = 1;
    }

    return {
      pageNumber: pageNum,
      startPageId: `page_number_${pageNum}_index_${index}`,
    };
  }

  // Try legacy format: "page_number_N_index_I" or variations
  const legacyMatch = pageId.match(/page[_a-zA-Z]*(\d+)_index_(\d+)/i);
  if (legacyMatch) {
    let pageNum = parseInt(legacyMatch[1], 10);
    const index = parseInt(legacyMatch[2], 10);

    // Only auto-correct "page_number_0_index_0" to page 1
    if (pageNum === 0 && index === 0) {
      pageNum = 1;
    }

    return {
      pageNumber: pageNum,
      startPageId: `page_number_${pageNum}_index_${index}`,
    };
  }

  return { pageNumber: undefined, startPageId: undefined };
}

/**
 * Converts a CitationData object to the standard Citation format.
 *
 * @param data - The citation data
 * @param citationNumber - Optional override for citation number (defaults to data.id)
 * @returns Standard Citation object
 */
export function deferredCitationToCitation(data: CitationData, citationNumber?: number): Citation {
  // Parse page number from page_id (supports both "N_I" and "page_number_N_index_I")
  let pageNumber: number | undefined;
  let startPageId: string | undefined;
  const pageId = data.page_id;
  if (pageId) {
    const parsed = parsePageId(pageId);
    pageNumber = parsed.pageNumber;
    startPageId = parsed.startPageId;
  }

  // Parse timestamps for AV citations
  let timestamps: { startTime?: string; endTime?: string } | undefined;
  if (data.timestamps) {
    timestamps = {
      startTime: data.timestamps.start_time,
      endTime: data.timestamps.end_time,
    };
  }

  // Sort lineIds if present
  const lineIds = data.line_ids?.length ? [...data.line_ids].sort((a, b) => a - b) : undefined;

  return {
    attachmentId: data.attachment_id,
    pageNumber,
    startPageId,
    fullPhrase: data.full_phrase,
    anchorText: data.anchor_text,
    citationNumber: citationNumber ?? data.id,
    lineIds,
    reasoning: data.reasoning,
    timestamps,
  };
}

/**
 * Extracts all citations from a citation response and returns them
 * in the standard dictionary format used by the verification API.
 *
 * This function parses the response, converts each citation to the standard
 * Citation format, and generates deterministic keys for each.
 *
 * @param llmResponse - The full LLM response with citation block
 * @returns Dictionary of parsed Citation objects keyed by citation key
 *
 * @example
 * ```typescript
 * const citations = getAllCitationsFromDeferredResponse(llmOutput);
 * // Returns: { "abc123...": { attachmentId: "...", fullPhrase: "...", ... }, ... }
 * ```
 */
export function getAllCitationsFromDeferredResponse(llmResponse: string): {
  [key: string]: Citation;
} {
  const parsed = parseDeferredCitationResponse(llmResponse);

  if (!parsed.success || parsed.citations.length === 0) {
    return {};
  }

  const citations: { [key: string]: Citation } = {};

  for (const data of parsed.citations) {
    const citation = deferredCitationToCitation(data);
    if (citation.fullPhrase) {
      const citationKey = generateCitationKey(citation);
      citations[citationKey] = citation;
    }
  }

  return citations;
}

/**
 * Checks if a response contains citation markers.
 *
 * @param response - The LLM response to check
 * @returns True if the response contains the citation data delimiter
 */
export function hasDeferredCitations(response: string): boolean {
  return typeof response === "string" && response.includes(CITATION_DATA_START_DELIMITER);
}

/**
 * Extracts just the visible text from a response,
 * removing the citation data block.
 *
 * @param llmResponse - The full LLM response
 * @returns The visible text portion only
 */
export function extractVisibleText(llmResponse: string): string {
  const parsed = parseDeferredCitationResponse(llmResponse);
  return parsed.visibleText;
}

/**
 * Replaces [N] citation markers in text with optional content.
 *
 * @param text - The text containing [N] markers
 * @param options - Configuration for replacement
 * @returns The text with markers replaced
 *
 * @example
 * ```typescript
 * const text = "Revenue grew 45% [1] in Q4 [2].";
 *
 * // Remove markers entirely
 * replaceDeferredMarkers(text);
 * // Returns: "Revenue grew 45% in Q4."
 *
 * // Replace with anchor texts
 * replaceDeferredMarkers(text, {
 *   citationMap: new Map([[1, { anchor_text: "45%" }], [2, { anchor_text: "Q4" }]]),
 *   showAnchorText: true,
 * });
 * // Returns: "Revenue grew 45% 45% in Q4 Q4."
 * ```
 */
export function replaceDeferredMarkers(
  text: string,
  options?: {
    /** Map of citation IDs to their data */
    citationMap?: Map<number, CitationData>;
    /** Whether to show the anchor text after the marker */
    showAnchorText?: boolean;
    /** Custom replacement function */
    replacer?: (id: number, data?: CitationData) => string;
  },
): string {
  const { citationMap, showAnchorText, replacer } = options || {};

  // Match [N] patterns where N is one or more digits
  return text.replace(/\[(\d+)\]/g, (_match, idStr) => {
    const id = parseInt(idStr, 10);
    const data = citationMap?.get(id);

    // Custom replacer takes precedence
    if (replacer) {
      return replacer(id, data);
    }

    // Show anchor text if requested
    if (showAnchorText && data?.anchor_text) {
      return data.anchor_text;
    }

    // Default: remove marker
    return "";
  });
}

/**
 * Gets all citation marker IDs found in a text.
 *
 * @param text - The text to scan for [N] markers
 * @returns Array of citation IDs in order of appearance
 */
export function getCitationMarkerIds(text: string): number[] {
  const ids: number[] = [];
  const regex = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  for (;;) {
    match = regex.exec(text);
    if (!match) break;
    ids.push(parseInt(match[1], 10));
  }

  return ids;
}
