import { type Verification } from "../types/verification.js";
import { type Citation, type CitationStatus } from "../types/citation.js";
import { normalizeCitations } from "./normalizeCitation.js";
import { generateCitationKey } from "../react/utils.js";

/**
 * Parses a line_ids string that may contain individual numbers, ranges, or both.
 * Examples: "1,2,3", "5-10", "1,5-7,10", "20-20"
 *
 * @param lineIdsString - The raw line_ids string (e.g., "1,5-7,10")
 * @returns Sorted array of unique line IDs, or undefined if empty/invalid
 */
function parseLineIds(lineIdsString: string): number[] | undefined {
  if (!lineIdsString) return undefined;

  const lineIds: number[] = [];
  const parts = lineIdsString.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Check if this part is a range (e.g., "5-10")
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!isNaN(start) && !isNaN(end) && start <= end) {
        // Expand the range
        for (let i = start; i <= end; i++) {
          lineIds.push(i);
        }
      } else if (!isNaN(start)) {
        // If only start is valid, just use it
        lineIds.push(start);
      }
    } else {
      // Single number
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) {
        lineIds.push(num);
      }
    }
  }

  if (lineIds.length === 0) return undefined;

  // Sort and deduplicate
  return [...new Set(lineIds)].sort((a, b) => a - b);
}

/**
 * Calculates the verification status of a citation based on the found highlight and search state.
 *
 * @param verification - The found highlight location, or null/undefined if not found
 * @returns An object containing boolean flags for verification status
 */
export function getCitationStatus(
  verification: Verification | null | undefined
): CitationStatus {
  const status = verification?.status;

  const isMiss = status === "not_found";
  const isFullMatchWithMissedValue = status === "found_phrase_missed_value";
  const isFoundValueMissedFullMatch = status === "found_key_span_only";

  const isPartialMatch =
    status === "partial_text_found" ||
    status === "found_on_other_page" ||
    status === "found_on_other_line" ||
    status === "first_word_found";

  const isVerified =
    status === "found" ||
    isFoundValueMissedFullMatch ||
    isPartialMatch ||
    isFullMatchWithMissedValue;

  const isPending =
    status === "pending" || status === "loading" || !status;

  return { isVerified, isMiss, isPartialMatch, isPending };
}

export const parseCitation = (
  fragment: string,
  mdAttachmentId?: string | null,
  citationCounterRef?: any | null,
  isVerbose?: boolean
) => {
  // Helper: Remove wrapper quotes and unescape internal single quotes (e.g. It\'s -> It's)
  const cleanAndUnescape = (str?: string) => {
    if (!str) return undefined;
    // Remove surrounding quotes if present (regex usually handles this, but safety first)
    const trimmed = str.replace(/^['"]|['"]$/g, "");
    // Replace escaped single quotes with actual single quotes
    return trimmed.replace(/\\'/g, "'");
  };

  const citationNumber = citationCounterRef?.current
    ? citationCounterRef.current++
    : undefined;

  const beforeCite = fragment.substring(0, fragment.indexOf("<cite"));
  const afterCite = fragment.includes("/>")
    ? fragment.slice(fragment.indexOf("/>") + 2)
    : "";
  const middleCite = fragment.substring(
    fragment.indexOf("<cite"),
    fragment.indexOf("/>") + 2
  );

  // Helper function to extract attribute value by name (handles any order)
  const extractAttribute = (tag: string, attrNames: string[]): string | undefined => {
    for (const name of attrNames) {
      // Match attribute with escaped quotes support: name='value' where value can contain \'
      const regex = new RegExp(`${name}='((?:[^'\\\\]|\\\\.)*)'`);
      const match = tag.match(regex);
      if (match) {
        return match[1];
      }
    }
    return undefined;
  };

  // Extract all attributes by name (order-independent)
  let rawAttachmentId = extractAttribute(middleCite, ['attachment_id', 'attachmentId', 'file_id', 'fileId']);
  let attachmentId = rawAttachmentId?.length === 20 ? rawAttachmentId : mdAttachmentId || rawAttachmentId;

  const startPageKeyRaw = extractAttribute(middleCite, ['start_page_key', 'startPageKey', 'start_page']);
  let pageNumber: number | undefined;
  let pageIndex: number | undefined;
  if (startPageKeyRaw) {
    const pageMatch = startPageKeyRaw.match(/page[\_a-zA-Z]*(\d+)_index_(\d+)/);
    if (pageMatch) {
      pageNumber = parseInt(pageMatch[1]);
      pageIndex = parseInt(pageMatch[2]);
    }
  }

  // Use helper to handle escaped quotes inside the phrase
  let fullPhrase = cleanAndUnescape(extractAttribute(middleCite, ['full_phrase', 'fullPhrase']));
  let keySpan = cleanAndUnescape(extractAttribute(middleCite, ['key_span', 'keySpan']));
  let reasoning = cleanAndUnescape(extractAttribute(middleCite, ['reasoning']));
  let value = cleanAndUnescape(extractAttribute(middleCite, ['value']));

  let lineIds: number[] | undefined;
  try {
    const lineIdsRaw = extractAttribute(middleCite, ['line_ids', 'lineIds']);
    const lineIdsString = lineIdsRaw?.replace(/[A-Za-z_[\](){}:]/g, "");
    lineIds = lineIdsString ? parseLineIds(lineIdsString) : undefined;
  } catch (e) {
    if (isVerbose) console.error("Error parsing lineIds", e);
  }

  // Check for AV citation (has timestamps instead of line_ids)
  const timestampsRaw = extractAttribute(middleCite, ['timestamps']);
  let timestamps: { startTime?: string; endTime?: string } | undefined;

  if (timestampsRaw) {
    const [startTime, endTime] = timestampsRaw.split("-") || [];
    timestamps = { startTime, endTime };
  }

  const citation: Citation = {
    attachmentId: attachmentId,
    pageNumber,
    startPageKey: `page_number_${pageNumber || 1}_index_${pageIndex || 0}`,
    fullPhrase,
    keySpan: keySpan || value,
    citationNumber,
    lineIds,
    beforeCite,
    timestamps,
    reasoning,
  };

  return {
    beforeCite,
    afterCite,
    citation,
  };
};

/**
 * Parses a JSON-based citation object into a Citation.
 * Supports both camelCase and snake_case property names.
 *
 * @param jsonCitation - The JSON citation object (can have camelCase or snake_case properties)
 * @param citationNumber - Optional citation number for ordering
 * @returns Parsed Citation object
 */
const parseJsonCitation = (
  jsonCitation: any,
  citationNumber?: number
): Citation | null => {
  if (!jsonCitation) {
    return null;
  }

  // Support both camelCase and snake_case property names
  const fullPhrase = jsonCitation.fullPhrase ?? jsonCitation.full_phrase;
  const startPageKey = jsonCitation.startPageKey ?? jsonCitation.start_page_key;
  const keySpan = jsonCitation.keySpan ?? jsonCitation.key_span;
  const rawLineIds = jsonCitation.lineIds ?? jsonCitation.line_ids;
  const attachmentId = jsonCitation.attachmentId ?? jsonCitation.attachment_id ?? jsonCitation.fileId ?? jsonCitation.file_id;
  const reasoning = jsonCitation.reasoning;
  const value = jsonCitation.value;

  if (!fullPhrase) {
    return null;
  }

  // Parse startPageKey format: "page_number_PAGE_index_INDEX" or simple "PAGE_INDEX"
  let pageNumber: number | undefined;
  if (startPageKey) {
    // Try full format first: page_number_5_index_2 or pageKey_5_index_2
    const pageMatch = startPageKey.match(/page[_a-zA-Z]*(\d+)_index_(\d+)/i);
    if (pageMatch) {
      pageNumber = parseInt(pageMatch[1], 10);
    } else {
      // Try simple n_m format: 5_4 (page 5, index 4)
      const simpleMatch = startPageKey.match(/^(\d+)_(\d+)$/);
      if (simpleMatch) {
        pageNumber = parseInt(simpleMatch[1], 10);
      }
    }
  }

  // Sort lineIds if present
  const lineIds = rawLineIds?.length
    ? [...rawLineIds].sort((a: number, b: number) => a - b)
    : undefined;

  const citation: Citation = {
    attachmentId,
    pageNumber,
    fullPhrase,
    citationNumber,
    lineIds,
    keySpan: keySpan || value,
    reasoning,
  };

  return citation;
};

/**
 * Checks if an object has citation-like properties (camelCase or snake_case).
 */
const hasCitationProperties = (item: any): boolean =>
  typeof item === "object" &&
  item !== null &&
  ("fullPhrase" in item ||
    "full_phrase" in item ||
    "startPageKey" in item ||
    "start_page_key" in item ||
    "keySpan" in item ||
    "key_span" in item ||
    "lineIds" in item ||
    "line_ids" in item);

/**
 * Checks if the input appears to be JSON-based citations.
 * Looks for array of objects with citation-like properties (supports both camelCase and snake_case).
 */
const isJsonCitationFormat = (data: any): data is Citation[] | Citation => {
  if (Array.isArray(data)) {
    return data.length > 0 && data.some(hasCitationProperties);
  }
  if (typeof data === "object" && data !== null) {
    return hasCitationProperties(data);
  }
  return false;
};

/**
 * Extracts citations from JSON format (array or single object).
 */
const extractJsonCitations = (
  data: Citation[] | Citation
): { [key: string]: Citation } => {
  const citations: { [key: string]: Citation } = {};
  const items = Array.isArray(data) ? data : [data];

  let citationNumber = 1;
  for (const item of items) {
    const citation = parseJsonCitation(item, citationNumber++);
    if (citation && citation.fullPhrase) {
      const citationKey = generateCitationKey(citation);
      citations[citationKey] = citation;
    }
  }

  return citations;
};

/**
 * Recursively traverses an object looking for `citation` or `citations` properties
 * that match our JSON citation format.
 */
const findJsonCitationsInObject = (obj: any, found: Citation[]): void => {
  if (!obj || typeof obj !== "object") return;

  // Check for citation/citations properties
  if (obj.citation && isJsonCitationFormat(obj.citation)) {
    const items = Array.isArray(obj.citation) ? obj.citation : [obj.citation];
    found.push(...items);
  }
  if (obj.citations && isJsonCitationFormat(obj.citations)) {
    const items = Array.isArray(obj.citations)
      ? obj.citations
      : [obj.citations];
    found.push(...items);
  }

  // Recurse into object properties
  if (Array.isArray(obj)) {
    for (const item of obj) {
      findJsonCitationsInObject(item, found);
    }
  } else {
    for (const key of Object.keys(obj)) {
      if (key !== "citation" && key !== "citations") {
        findJsonCitationsInObject(obj[key], found);
      }
    }
  }
};

/**
 * Extracts XML citations from text using <cite ... /> tags.
 */
const extractXmlCitations = (text: string): { [key: string]: Citation } => {
  const normalizedText = normalizeCitations(text);

  // Find all <cite ... /> tags
  const citeRegex = /<cite\s+[^>]*\/>/g;
  const matches = normalizedText.match(citeRegex);

  if (!matches || matches.length === 0) return {};

  const citations: { [key: string]: Citation } = {};
  const citationCounterRef = { current: 1 };

  for (const match of matches) {
    const { citation } = parseCitation(match, undefined, citationCounterRef);
    if (citation && citation.fullPhrase) {
      const citationKey = generateCitationKey(citation);
      citations[citationKey] = citation;
    }
  }

  return citations;
};

/**
 * Extracts all citations from LLM output.
 * Supports both XML <cite ... /> tags (embedded in strings/markdown) and JSON-based citation formats.
 *
 * For object input:
 * - Traverses the object looking for `citation` or `citations` properties matching JSON format
 * - Also stringifies the object to find embedded XML citations in markdown content
 *
 * @param llmOutput - The LLM output (string or object)
 * @returns Dictionary of parsed Citation objects keyed by citation key
 */
export const getAllCitationsFromLlmOutput = (
  llmOutput: any
): { [key: string]: Citation } => {
  if (!llmOutput) return {};

  const citations: { [key: string]: Citation } = {};

  if (typeof llmOutput === "object") {
    // Check if the root object itself is JSON citation format
    if (isJsonCitationFormat(llmOutput)) {
      const jsonCitations = extractJsonCitations(llmOutput);
      Object.assign(citations, jsonCitations);
    } else {
      // Traverse object for nested citation/citations properties
      const foundJsonCitations: Citation[] = [];
      findJsonCitationsInObject(llmOutput, foundJsonCitations);

      if (foundJsonCitations.length > 0) {
        const jsonCitations = extractJsonCitations(foundJsonCitations);
        Object.assign(citations, jsonCitations);
      }
    }

    // Also stringify and parse for embedded XML citations in markdown
    const text = JSON.stringify(llmOutput);
    const xmlCitations = extractXmlCitations(text);
    Object.assign(citations, xmlCitations);
  } else if (typeof llmOutput === "string") {
    // String input - parse for XML citations
    const xmlCitations = extractXmlCitations(llmOutput);
    Object.assign(citations, xmlCitations);
  }

  return citations;
};

/**
 * Groups citations by their attachmentId for multi-file verification scenarios.
 * This is useful when you have citations from multiple files and need to
 * verify them against their respective source documents.
 *
 * @param citations - Array of Citation objects or a dictionary of citations
 * @returns Map of attachmentId to dictionary of citations from that file
 *
 * @example
 * ```typescript
 * const citations = getAllCitationsFromLlmOutput(response.content);
 * const citationsByAttachment = groupCitationsByAttachmentId(citations);
 *
 * // Verify citations for each file
 * for (const [attachmentId, fileCitations] of citationsByAttachment) {
 *   const verified = await dc.verifyCitations(attachmentId, fileCitations);
 *   // Process verification results...
 * }
 * ```
 */
export function groupCitationsByAttachmentId(
  citations: Citation[] | { [key: string]: Citation }
): Map<string, { [key: string]: Citation }> {
  const grouped = new Map<string, { [key: string]: Citation }>();

  // Normalize input to entries
  const entries: [string, Citation][] = Array.isArray(citations)
    ? citations.map((c, idx) => [generateCitationKey(c) || String(idx + 1), c])
    : Object.entries(citations);

  for (const [key, citation] of entries) {
    const attachmentId = citation.attachmentId || "";

    if (!grouped.has(attachmentId)) {
      grouped.set(attachmentId, {});
    }

    grouped.get(attachmentId)![key] = citation;
  }

  return grouped;
}

/**
 * Groups citations by their attachmentId and returns as a plain object.
 * Alternative to groupCitationsByAttachmentId that returns a plain object instead of a Map.
 *
 * @param citations - Array of Citation objects or a dictionary of citations
 * @returns Object with attachmentId keys mapping to citation dictionaries
 *
 * @example
 * ```typescript
 * const citations = getAllCitationsFromLlmOutput(response.content);
 * const citationsByAttachment = groupCitationsByAttachmentIdObject(citations);
 *
 * // Verify citations for each file using Promise.all
 * const verificationPromises = Object.entries(citationsByAttachment).map(
 *   ([attachmentId, fileCitations]) => dc.verifyCitations(attachmentId, fileCitations)
 * );
 * const results = await Promise.all(verificationPromises);
 * ```
 */
export function groupCitationsByAttachmentIdObject(
  citations: Citation[] | { [key: string]: Citation }
): { [attachmentId: string]: { [key: string]: Citation } } {
  const grouped: { [attachmentId: string]: { [key: string]: Citation } } = {};

  // Normalize input to entries
  const entries: [string, Citation][] = Array.isArray(citations)
    ? citations.map((c, idx) => [generateCitationKey(c) || String(idx + 1), c])
    : Object.entries(citations);

  for (const [key, citation] of entries) {
    const attachmentId = citation.attachmentId || "";

    if (!grouped[attachmentId]) {
      grouped[attachmentId] = {};
    }

    grouped[attachmentId][key] = citation;
  }

  return grouped;
}
