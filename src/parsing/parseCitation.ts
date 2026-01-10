import { type FoundHighlightLocation } from "../types/foundHighlight.js";
import { type Citation, type CitationStatus } from "../types/citation.js";
import { sha1Hash } from "../utils/sha.js";
import { normalizeCitations } from "./normalizeCitation.js";
import { generateCitationKey } from "../react/utils.js";

/**
 * Calculates the verification status of a citation based on the found highlight and search state.
 *
 * @param foundHighlight - The found highlight location, or null/undefined if not found
 * @returns An object containing boolean flags for verification status
 */
export function getCitationStatus(
  foundHighlight: FoundHighlightLocation | null | undefined
): CitationStatus {
  const searchState = foundHighlight?.searchState;

  const isMiss = searchState?.status === "not_found";
  const isFullMatchWithMissedValue =
    searchState?.status === "found_phrase_missed_value";
  const isFoundValueMissedFullMatch =
    searchState?.status === "found_value_only";

  const isPartialMatch =
    searchState?.status === "partial_text_found" ||
    searchState?.status === "found_on_other_page" ||
    searchState?.status === "found_on_other_line" ||
    searchState?.status === "first_word_found";

  const isVerified =
    searchState?.status === "found" ||
    isFoundValueMissedFullMatch ||
    isPartialMatch ||
    isFullMatchWithMissedValue;

  const isPending =
    searchState?.status === "pending" ||
    searchState?.status === "loading" ||
    !searchState;

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

  // GROUPS:
  // 1: fileId
  // 2: start_page number
  // 3: index number
  // 4: full_phrase content (escaped)
  // 5: key_span content (escaped)
  // 6: line_ids content
  // 6: Optional Key (value|reasoning)
  // 7: Optional Value content (escaped)
  const citationRegex =
    /<cite\s+file(?:_id|Id)='(\w{0,25})'\s+start_page[\_a-zA-Z]*='page[\_a-zA-Z]*(\d+)_index_(\d+)'\s+full_phrase='((?:[^'\\]|\\.)*)'\s+key_span='((?:[^'\\]|\\.)*)'\s+line(?:_ids|Ids)='([^']+)'(?:\s+(value|reasoning)='((?:[^'\\]|\\.)*)')?\s*\/>/g;

  const citationMatches = [...middleCite.matchAll(citationRegex)];
  const match = citationMatches?.[0];

  const rawCitationMd = match?.[0];
  const pageNumber = match?.[2] ? parseInt(match?.[2]) : undefined;

  let fileId = match?.[1];
  let attachmentId =
    fileId?.length === 20 ? fileId : mdAttachmentId || match?.[1];

  // Use helper to handle escaped quotes inside the phrase
  let fullPhrase = cleanAndUnescape(match?.[4]);
  let keySpan = cleanAndUnescape(match?.[5]);

  // Handle the optional attribute (value or reasoning)
  let value: string | undefined;
  let reasoning: string | undefined;

  const optionalKey = match?.[7]; // "value" or "reasoning"
  const optionalContent = cleanAndUnescape(match?.[8]);

  if (optionalKey === "value") {
    value = optionalContent;
  } else if (optionalKey === "reasoning") {
    reasoning = optionalContent;
  }

  let lineIds: number[] | undefined;
  try {
    // match[5] is line_ids
    const lineIdsString = match?.[6]?.replace(/[A-Za-z_[\](){}:]/g, "");

    lineIds = lineIdsString
      ? lineIdsString
          .split(",")
          .map((id) => (isNaN(parseInt(id)) ? undefined : parseInt(id)))
          .filter((id) => id !== undefined)
          .sort((a, b) => a - b)
      : undefined;
  } catch (e) {
    if (isVerbose) console.error("Error parsing lineIds", e);
  }

  // GROUPS for AV:
  // 1: fileId
  // 2: full_phrase content (escaped)
  // 3: timestamps content
  // 4: Optional Key (value|reasoning)
  // 5: Optional Value content (escaped)
  const avCitationRegex =
    /<cite\s+file(?:_id|Id)='(\w{0,25})'\s+full_phrase='((?:[^'\\]|\\.)*)'\s+timestamps='([^']+)'(?:\s+(value|reasoning)='((?:[^'\\]|\\.)*)')?\s*\/>/g;

  const avCitationMatches = [...middleCite.matchAll(avCitationRegex)];
  const avMatch = avCitationMatches?.[0];
  let timestamps: { startTime?: string; endTime?: string } | undefined;

  if (avMatch) {
    fileId = avMatch?.[1];
    attachmentId =
      fileId?.length === 20 ? fileId : mdAttachmentId || avMatch?.[1];
    fullPhrase = cleanAndUnescape(avMatch?.[2]);

    const timestampsString = avMatch?.[3]?.replace(/timestamps=['"]|['"]/g, "");
    const [startTime, endTime] = timestampsString?.split("-") || [];

    const avOptionalKey = avMatch?.[4];
    const avOptionalContent = cleanAndUnescape(avMatch?.[5]);

    if (avOptionalKey === "value") {
      value = avOptionalContent;
    } else if (avOptionalKey === "reasoning") {
      reasoning = avOptionalContent;
    }

    timestamps = { startTime, endTime };
  }

  const fragmentContext = sha1Hash(fragment).toString().slice(0, 8);

  const citation: Citation = {
    fragmentContext,
    fileId: attachmentId,
    pageNumber,
    fullPhrase,
    keySpan,
    citationNumber,
    lineIds,
    rawCitationMd,
    beforeCite,
    value,
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
  const keySpan =
    jsonCitation.keySpan ?? jsonCitation.key_span;
  const rawLineIds = jsonCitation.lineIds ?? jsonCitation.line_ids;
  const fileId = jsonCitation.fileId ?? jsonCitation.file_id;
  const reasoning = jsonCitation.reasoning;
  const value = jsonCitation.value;

  if (!fullPhrase) {
    return null;
  }

  // Parse startPageKey format: "page_number_PAGE_index_INDEX"
  let pageNumber: number | undefined;
  if (startPageKey) {
    const pageMatch = startPageKey.match(/page[_a-zA-Z]*(\d+)_index_(\d+)/i);
    if (pageMatch) {
      pageNumber = parseInt(pageMatch[1], 10);
    }
  }

  // Sort lineIds if present
  const lineIds = rawLineIds?.length
    ? [...rawLineIds].sort((a: number, b: number) => a - b)
    : undefined;

  const citation: Citation = {
    fileId,
    pageNumber,
    fullPhrase,
    citationNumber,
    lineIds,
    keySpan,
    reasoning,
    value,
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
 * Groups citations by their fileId for multi-file verification scenarios.
 * This is useful when you have citations from multiple files and need to
 * verify them against their respective source documents.
 *
 * @param citations - Array of Citation objects or a dictionary of citations
 * @returns Map of fileId to dictionary of citations from that file
 *
 * @example
 * ```typescript
 * const citations = getAllCitationsFromLlmOutput(response.content);
 * const citationsByFile = groupCitationsByFileId(citations);
 *
 * // Verify citations for each file
 * for (const [fileId, fileCitations] of citationsByFile) {
 *   const verified = await dc.verifyCitations(fileId, fileCitations);
 *   // Process verification results...
 * }
 * ```
 */
export function groupCitationsByFileId(
  citations: Citation[] | { [key: string]: Citation }
): Map<string, { [key: string]: Citation }> {
  const grouped = new Map<string, { [key: string]: Citation }>();

  // Normalize input to entries
  const entries: [string, Citation][] = Array.isArray(citations)
    ? citations.map((c, idx) => [generateCitationKey(c) || String(idx + 1), c])
    : Object.entries(citations);

  for (const [key, citation] of entries) {
    const fileId = citation.fileId || "";

    if (!grouped.has(fileId)) {
      grouped.set(fileId, {});
    }

    grouped.get(fileId)![key] = citation;
  }

  return grouped;
}

/**
 * Groups citations by their fileId and returns as a plain object.
 * Alternative to groupCitationsByFileId that returns a plain object instead of a Map.
 *
 * @param citations - Array of Citation objects or a dictionary of citations
 * @returns Object with fileId keys mapping to citation dictionaries
 *
 * @example
 * ```typescript
 * const citations = getAllCitationsFromLlmOutput(response.content);
 * const citationsByFile = groupCitationsByFileIdObject(citations);
 *
 * // Verify citations for each file using Promise.all
 * const verificationPromises = Object.entries(citationsByFile).map(
 *   ([fileId, fileCitations]) => dc.verifyCitations(fileId, fileCitations)
 * );
 * const results = await Promise.all(verificationPromises);
 * ```
 */
export function groupCitationsByFileIdObject(
  citations: Citation[] | { [key: string]: Citation }
): { [fileId: string]: { [key: string]: Citation } } {
  const grouped: { [fileId: string]: { [key: string]: Citation } } = {};

  // Normalize input to entries
  const entries: [string, Citation][] = Array.isArray(citations)
    ? citations.map((c, idx) => [generateCitationKey(c) || String(idx + 1), c])
    : Object.entries(citations);

  for (const [key, citation] of entries) {
    const fileId = citation.fileId || "";

    if (!grouped[fileId]) {
      grouped[fileId] = {};
    }

    grouped[fileId][key] = citation;
  }

  return grouped;
}
