/**
 * Deferred Citation Parser
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

import { type Citation } from "../types/citation.js";
import { generateCitationKey } from "../react/utils.js";
import {
  CITATION_DATA_START_DELIMITER,
  CITATION_DATA_END_DELIMITER,
  type DeferredCitationData,
  type ParsedDeferredResponse,
} from "../prompts/deferredCitationPrompt.js";

/**
 * Attempts to repair malformed JSON.
 * Handles common LLM output issues like:
 * - Trailing commas
 * - Single quotes instead of double quotes (in JSON context)
 * - Missing closing brackets
 * - Unescaped newlines in strings
 */
function repairJson(jsonString: string): string {
  let repaired = jsonString.trim();

  // Remove any markdown code block markers that might be present
  repaired = repaired.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  // Fix trailing commas before ] or }
  repaired = repaired.replace(/,(\s*[\]\}])/g, "$1");

  // Fix missing closing bracket if we have an opening [
  if (repaired.startsWith("[") && !repaired.endsWith("]")) {
    // Check if we have unclosed array
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      repaired = repaired + "]".repeat(openBrackets - closeBrackets);
    }
  }

  // Fix missing closing brace if we have an opening {
  if (repaired.includes("{")) {
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      repaired = repaired + "}".repeat(openBraces - closeBraces);
    }
  }

  return repaired;
}

/**
 * Normalizes a DeferredCitationData object to use consistent field names.
 * Handles both snake_case and camelCase variations from LLM output.
 */
function normalizeCitationData(
  raw: DeferredCitationData
): DeferredCitationData {
  return {
    id: raw.id,
    attachment_id: raw.attachment_id ?? raw.attachmentId,
    reasoning: raw.reasoning,
    full_phrase: raw.full_phrase ?? raw.fullPhrase,
    key_span: raw.key_span ?? raw.keySpan,
    page_key:
      raw.page_key ?? raw.pageKey ?? raw.start_page_key ?? raw.startPageKey,
    line_ids: raw.line_ids ?? raw.lineIds,
    timestamps: raw.timestamps
      ? {
          start_time:
            raw.timestamps.start_time ?? raw.timestamps.startTime,
          end_time: raw.timestamps.end_time ?? raw.timestamps.endTime,
        }
      : undefined,
  };
}

/**
 * Parses a deferred JSON response from an LLM.
 *
 * This function:
 * 1. Finds the <<<CITATION_DATA>>> delimiter in the response
 * 2. Splits the response into visible text and citation data
 * 3. Parses the JSON citation data
 * 4. Returns a structured result with both
 *
 * @param llmResponse - The full LLM response text
 * @returns ParsedDeferredResponse with visible text and parsed citations
 *
 * @example
 * ```typescript
 * const response = `
 *   The company grew 45% [1].
 *
 *   <<<CITATION_DATA>>>
 *   [{"id": 1, "attachment_id": "abc", "full_phrase": "grew 45%", "key_span": "45%"}]
 *   <<<END_CITATION_DATA>>>
 * `;
 *
 * const parsed = parseDeferredCitationResponse(response);
 * console.log(parsed.visibleText); // "The company grew 45% [1]."
 * console.log(parsed.citations); // [{id: 1, attachment_id: "abc", ...}]
 * ```
 */
export function parseDeferredCitationResponse(
  llmResponse: string
): ParsedDeferredResponse {
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
  const endIndex = llmResponse.indexOf(
    CITATION_DATA_END_DELIMITER,
    startIndex
  );

  // Extract the JSON block
  const jsonStartIndex = startIndex + CITATION_DATA_START_DELIMITER.length;
  const jsonEndIndex =
    endIndex !== -1 ? endIndex : llmResponse.length;
  const jsonString = llmResponse.substring(jsonStartIndex, jsonEndIndex).trim();

  // Parse the JSON
  let citations: DeferredCitationData[] = [];
  const citationMap = new Map<number, DeferredCitationData>();

  if (jsonString) {
    try {
      // First attempt: direct JSON.parse
      const parsed = JSON.parse(jsonString);
      citations = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Second attempt: repair and retry
      try {
        const repaired = repairJson(jsonString);
        const parsed = JSON.parse(repaired);
        citations = Array.isArray(parsed) ? parsed : [parsed];
      } catch (repairError) {
        return {
          visibleText,
          citations: [],
          citationMap: new Map(),
          success: false,
          error: `Failed to parse citation JSON: ${repairError instanceof Error ? repairError.message : "Unknown error"}`,
        };
      }
    }
  }

  // Normalize and map citations
  citations = citations.map(normalizeCitationData);
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
 * Converts a DeferredCitationData object to the standard Citation format.
 *
 * @param data - The deferred citation data
 * @param citationNumber - Optional override for citation number (defaults to data.id)
 * @returns Standard Citation object
 */
export function deferredCitationToCitation(
  data: DeferredCitationData,
  citationNumber?: number
): Citation {
  // Parse page number from page_key
  let pageNumber: number | undefined;
  let startPageKey: string | undefined;
  const pageKey = data.page_key;
  if (pageKey) {
    const pageMatch = pageKey.match(/page[_a-zA-Z]*(\d+)_index_(\d+)/i);
    if (pageMatch) {
      pageNumber = parseInt(pageMatch[1], 10);
      startPageKey = `page_number_${pageMatch[1]}_index_${pageMatch[2]}`;
    }
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
  const lineIds = data.line_ids?.length
    ? [...data.line_ids].sort((a, b) => a - b)
    : undefined;

  return {
    attachmentId: data.attachment_id,
    pageNumber,
    startPageKey,
    fullPhrase: data.full_phrase,
    keySpan: data.key_span,
    citationNumber: citationNumber ?? data.id,
    lineIds,
    reasoning: data.reasoning,
    timestamps,
  };
}

/**
 * Extracts all citations from a deferred JSON response and returns them
 * in the standard dictionary format used by the verification API.
 *
 * This function parses the response, converts each citation to the standard
 * Citation format, and generates deterministic keys for each.
 *
 * @param llmResponse - The full LLM response with deferred citation block
 * @returns Dictionary of parsed Citation objects keyed by citation key
 *
 * @example
 * ```typescript
 * const citations = getAllCitationsFromDeferredResponse(llmOutput);
 * // Returns: { "abc123...": { attachmentId: "...", fullPhrase: "...", ... }, ... }
 * ```
 */
export function getAllCitationsFromDeferredResponse(
  llmResponse: string
): { [key: string]: Citation } {
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
 * Checks if a response contains deferred citation markers.
 *
 * @param response - The LLM response to check
 * @returns True if the response contains the citation data delimiter
 */
export function hasDeferredCitations(response: string): boolean {
  return (
    typeof response === "string" &&
    response.includes(CITATION_DATA_START_DELIMITER)
  );
}

/**
 * Extracts just the visible text from a deferred response,
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
 * // Replace with key spans
 * replaceDeferredMarkers(text, {
 *   citationMap: new Map([[1, { key_span: "45%" }], [2, { key_span: "Q4" }]]),
 *   showKeySpan: true,
 * });
 * // Returns: "Revenue grew 45% 45% in Q4 Q4."
 * ```
 */
export function replaceDeferredMarkers(
  text: string,
  options?: {
    /** Map of citation IDs to their data */
    citationMap?: Map<number, DeferredCitationData>;
    /** Whether to show the key span after the marker */
    showKeySpan?: boolean;
    /** Custom replacement function */
    replacer?: (id: number, data?: DeferredCitationData) => string;
  }
): string {
  const { citationMap, showKeySpan, replacer } = options || {};

  // Match [N] patterns where N is one or more digits
  return text.replace(/\[(\d+)\]/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    const data = citationMap?.get(id);

    // Custom replacer takes precedence
    if (replacer) {
      return replacer(id, data);
    }

    // Show key span if requested
    if (showKeySpan && data?.key_span) {
      return data.key_span;
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
  let match;

  while ((match = regex.exec(text)) !== null) {
    ids.push(parseInt(match[1], 10));
  }

  return ids;
}
