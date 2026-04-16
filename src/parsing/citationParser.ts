/**
 * Citation Parser
 *
 * Implements the "Split & Parse" strategy for the numeric citation pattern.
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
import type { AudioVideoCitation, Citation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { getCitationKey } from "../utils/citationKey.js";
import { createSafeObject, isSafeKey } from "../utils/objectSafety.js";
import { sha1Hash } from "../utils/sha.js";
import { getVerificationTextIndicator } from "../utils/verificationIndicator.js";

/**
 * Map of compact keys to their full CitationData equivalents.
 */
const COMPACT_KEY_MAP: Record<string, keyof CitationData> = {
  n: "id",
  a: "attachment_id",
  r: "reasoning",
  f: "source_context",
  k: "source_match",
  d: "claim_text",
  p: "page_id",
  l: "line_ids",
  t: "timestamps",
} as const;

/**
 * Map of camelCase and legacy aliases to canonical snake_case keys.
 */
const KEY_ALIAS_MAP: Record<string, keyof CitationData> = {
  attachmentId: "attachment_id",
  // New camelCase names → canonical snake_case
  sourceContext: "source_context",
  sourceMatch: "source_match",
  claimText: "claim_text",
  // Legacy field names → new canonical names
  fullPhrase: "source_context",
  full_phrase: "source_context",
  anchorText: "source_match",
  anchor_text: "source_match",
  displayLabel: "claim_text",
  display_label: "claim_text",
  pageId: "page_id",
  lineIds: "line_ids",
  // "fileId" was an early API field name before "attachmentId" was standardized.
  fileId: "attachment_id",
} as const;

/** Matches compact page ID format "N_I" (e.g., "2_1") */
const COMPACT_PAGE_ID_RE = /^(\d+)_(\d+)$/;
/** Matches verbose page ID format "page_number_N_index_I" (bounded to prevent ReDoS) */
const LEGACY_PAGE_ID_RE = /page[_a-z]{0,30}(\d+)_index_(\d+)/i;
/**
 * Matches [N] citation markers in text.
 * Safe to reuse as a module-level constant: String.replace() and String.matchAll()
 * do not mutate lastIndex, so there is no stateful cross-call contamination.
 * Do NOT use with RegExp.exec() in a loop — exec() advances lastIndex.
 */
const CITATION_MARKER_RE = /\[(\d+)\]/g;

/**
 * Matches [anchor text](cite:N) citation link markers.
 * The anchor text is in capture group 1, the citation ID in capture group 2.
 * Safe to reuse as a module-level constant: String.replace() and String.matchAll()
 * do not mutate lastIndex, so there is no stateful cross-call contamination.
 * Do NOT use with RegExp.exec() in a loop — exec() advances lastIndex.
 */
const CITATION_LINK_RE = /\[([^\][]+)\]\(cite:(\d+)\)/g;

const CITATION_DATA_END_DELIMITER_VARIANTS = [CITATION_DATA_END_DELIMITER, "<<</CITATION_DATA>>>"] as const;

/**
 * Returns true when a <<<CITATION_DATA>>> block exists but contains only
 * whitespace between the delimiters.
 */
export function hasWhitespaceOnlyCitationBlock(llmResponse: string): boolean {
  if (!llmResponse || typeof llmResponse !== "string") {
    return false;
  }

  const startIndex = llmResponse.indexOf(CITATION_DATA_START_DELIMITER);
  if (startIndex === -1) {
    return false;
  }

  let endIndex = -1;
  for (const delimiter of CITATION_DATA_END_DELIMITER_VARIANTS) {
    const idx = llmResponse.indexOf(delimiter, startIndex);
    if (idx !== -1 && (endIndex === -1 || idx < endIndex)) {
      endIndex = idx;
    }
  }

  if (endIndex === -1) {
    return false;
  }

  const jsonStartIndex = startIndex + CITATION_DATA_START_DELIMITER.length;
  return llmResponse.substring(jsonStartIndex, endIndex).trim().length === 0;
}

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
  const result = createSafeObject<unknown>();

  for (const [key, value] of Object.entries(data)) {
    // Check if this is a compact key
    const fullKey = KEY_ALIAS_MAP[key] || COMPACT_KEY_MAP[key] || key;

    // Only assign if key is safe (prevents prototype pollution)
    if (!isSafeKey(fullKey)) {
      continue;
    }

    // Handle timestamps specially (nested object with s/e keys)
    if ((key === "t" || fullKey === "timestamps") && value && typeof value === "object") {
      const ts = value as Record<string, unknown>;
      result.timestamps = {
        start_time: ts.s ?? ts.start_time ?? ts.startTime,
        end_time: ts.e ?? ts.end_time ?? ts.endTime,
      };
      continue;
    }

    // Coerce line_ids to integers — LLMs sometimes output ["452"] instead of [452]
    if (fullKey === "line_ids" && Array.isArray(value)) {
      result[fullKey] = value.map((v: unknown) => (typeof v === "string" ? parseInt(v, 10) : v));
      continue;
    }

    // fullKey is guaranteed safe by isSafeKey check above (line 79)
    // lgtm[js/remote-property-injection]
    result[fullKey] = value;
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
 *
 * Requires all values to be arrays of objects to avoid misclassifying unrelated
 * JSON shapes (e.g. `{ citations: [...strings] }` or `{ data: [...], meta: [...] }`).
 */
function isGroupedFormat(parsed: unknown): parsed is Record<string, unknown[]> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return false;
  for (const key of keys) {
    const v = record[key];
    if (!Array.isArray(v)) return false;
    for (const item of v) {
      if (typeof item !== "object" || item === null) return false;
    }
  }
  return true;
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

function escapeLiteralControlCharactersInJsonStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      out += ch;
      inString = false;
      continue;
    }

    if (ch === "\r") {
      if (text[i + 1] === "\n") {
        out += "\\n";
        i++;
        continue;
      }
      out += "\\n";
      continue;
    }

    if (ch === "\n") {
      out += "\\n";
      continue;
    }

    if (ch === "\t") {
      out += "\\t";
      continue;
    }

    if (ch.charCodeAt(0) < 0x20) {
      out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
      continue;
    }

    out += ch;
  }

  return out;
}

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

  // Escape literal control characters that LLMs sometimes emit inside JSON
  // strings (especially multiline source_context/source_match values).
  const beforeControlCharRepair = repaired;
  repaired = escapeLiteralControlCharactersInJsonStrings(repaired);
  if (repaired !== beforeControlCharRepair) {
    repairs.push("escaped literal control characters");
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
 * Internal use only — use {@link getAllCitationsFromLlmOutput} from the public API.
 */
export function parseCitationData(llmResponse: string): ParsedCitationResponse {
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

  // Find the end delimiter. Accept a small set of malformed variants because
  // LLMs occasionally emit the wrong closing token while still providing usable JSON.
  let endIndex = -1;
  for (const delimiter of CITATION_DATA_END_DELIMITER_VARIANTS) {
    const idx = llmResponse.indexOf(delimiter, startIndex);
    if (idx !== -1 && (endIndex === -1 || idx < endIndex)) {
      endIndex = idx;
    }
  }

  // Extract the JSON block
  const jsonStartIndex = startIndex + CITATION_DATA_START_DELIMITER.length;
  const jsonEndIndex = endIndex !== -1 ? endIndex : llmResponse.length;
  // .trim() here means !jsonString is also true for whitespace-only blocks.
  const jsonString = llmResponse.substring(jsonStartIndex, jsonEndIndex).trim();

  // Parse the JSON
  let citations: CitationData[] = [];
  const citationMap = new Map<number, CitationData>();

  if (!jsonString) {
    return {
      visibleText,
      citations: [],
      citationMap: new Map(),
      success: true,
    };
  }

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
export function parsePageId(pageId: string): {
  pageNumber?: number;
  startPageId?: string;
} {
  // Try compact format first: "N_I" (e.g., "2_1")
  const compactMatch = pageId.match(COMPACT_PAGE_ID_RE);
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

  // Try verbose format: "page_number_N_index_I" or variations
  const legacyMatch = pageId.match(LEGACY_PAGE_ID_RE);
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
 * Internal use only — use {@link getAllCitationsFromLlmOutput} from the public API.
 */
export function citationDataToCitation(data: CitationData, citationNumber?: number): Citation {
  // Parse page number from page_id (supports both "N_I" and "page_number_N_index_I")
  let pageNumber: number | undefined;
  let startPageId: string | undefined;
  const pageId = data.page_id;
  if (pageId) {
    const parsed = parsePageId(pageId);
    pageNumber = parsed.pageNumber;
    startPageId = parsed.startPageId;
  }

  // Sort lineIds if present
  const lineIds = data.line_ids?.length ? [...data.line_ids].sort((a, b) => a - b) : undefined;

  // AV citation: timestamps present means this is an audio/video citation.
  if (data.timestamps) {
    return {
      type: "audio" as const,
      attachmentId: data.attachment_id,
      sourceContext: data.source_context,
      sourceMatch: data.source_match,
      citationNumber: citationNumber ?? data.id,
      reasoning: data.reasoning,
      timestamps: {
        startTime: data.timestamps.start_time,
        endTime: data.timestamps.end_time,
      },
    } as AudioVideoCitation;
  }

  return {
    type: "document" as const,
    attachmentId: data.attachment_id,
    pageNumber,
    startPageId,
    sourceContext: data.source_context,
    sourceMatch: data.source_match,
    citationNumber: citationNumber ?? data.id,
    lineIds,
    reasoning: data.reasoning,
  };
}

/**
 * Extracts all citations from a response and returns them as a Citation dictionary.
 * Internal helper used by parseCitation.ts. Use {@link getAllCitationsFromLlmOutput} from the public API.
 */
export function getAllCitationsFromNumericResponse(llmResponse: string): {
  [key: string]: Citation;
} {
  const parsed = parseCitationData(llmResponse);

  if (!parsed.success || parsed.citations.length === 0) {
    return {};
  }

  const citations: { [key: string]: Citation } = {};

  for (const data of parsed.citations) {
    const citation = citationDataToCitation(data);
    if (citation.sourceContext) {
      const citationKey = getCitationKey(citation);
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
export function hasCitationData(response: string): boolean {
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
  const parsed = parseCitationData(llmResponse);
  return parsed.visibleText;
}

/**
 * Computes a citation key directly from CitationData without allocating a full Citation object.
 * Mirrors the key parts logic in getCitationKey (utils/citationKey.ts) but avoids
 * constructing/sorting/discarding a full Citation just to hash its fields.
 */
function getCitationKeyFromData(data: CitationData): string {
  const pageNumber = data.page_id ? parsePageId(data.page_id).pageNumber : undefined;
  const lineIds = data.line_ids?.length ? [...data.line_ids].sort((a, b) => a - b) : undefined;

  const keyParts = [
    data.source_context || "",
    data.source_match?.toString() || "",
    pageNumber?.toString() || "",
    lineIds?.join(",") || "",
  ];

  // AV citations include timestamps in the key
  if (data.timestamps) {
    keyParts.push(
      data.attachment_id || "",
      data.timestamps.start_time?.toString() || "",
      data.timestamps.end_time?.toString() || "",
    );
  }

  return sha1Hash(keyParts.join("|")).slice(0, 16);
}

/**
 * Builds a citationNumber → Verification index for O(1) lookups in `.replace()`.
 *
 * Strategy 1: citationMap entries → Citation key → verification lookup.
 * Strategy 2: Iterate verifications by citationNumber (fallback for IDs not in citationMap).
 */
function buildVerificationIndex(
  citationMap: Map<number, CitationData> | undefined,
  verifications: Record<string, Verification>,
): Map<number, Verification> {
  const index = new Map<number, Verification>();

  // Strategy 1: citationMap → key lookup without allocating full Citation objects
  if (citationMap) {
    for (const [id, data] of citationMap) {
      const key = getCitationKeyFromData(data);
      const v = verifications[key];
      if (v) index.set(id, v);
    }
  }

  // Strategy 2: fill in any remaining IDs from citationNumber
  for (const v of Object.values(verifications)) {
    const num = v.citation?.citationNumber;
    if (num != null && num > 0 && !index.has(num)) {
      index.set(num, v);
    }
  }

  return index;
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
 * replaceCitationMarkers(text);
 * // Returns: "Revenue grew 45% in Q4."
 *
 * // Replace with anchor texts
 * replaceCitationMarkers(text, {
 *   citationMap: new Map([[1, { anchor_text: "45%" }], [2, { anchor_text: "Q4" }]]),
 *   showSourceMatch: true,
 * });
 * // Returns: "Revenue grew 45% 45% in Q4 Q4."
 *
 * // Show verification status indicators
 * replaceCitationMarkers(text, {
 *   verifications: verificationResult.verifications,
 *   showVerificationStatus: true,
 * });
 * // Returns: "Revenue grew 45% [1☑️] in Q4 [2✅]."
 * ```
 */
export function replaceCitationMarkers(
  text: string,
  options?: {
    /** Map of citation IDs to their data */
    citationMap?: Map<number, CitationData>;
    /** Whether to show the anchor text after the marker */
    showSourceMatch?: boolean;
    /** Custom replacement function */
    replacer?: (id: number, data?: CitationData) => string;
    /** Verification results keyed by citation key */
    verifications?: Record<string, Verification>;
    /** When true, appends verification status indicator to each marker */
    showVerificationStatus?: boolean;
  },
): string {
  const { citationMap, showSourceMatch, replacer, verifications, showVerificationStatus } = options || {};

  // Pre-build verification index once (avoids per-marker object construction + linear scans)
  const verificationIndex =
    showVerificationStatus && verifications ? buildVerificationIndex(citationMap, verifications) : undefined;

  const replaceSingle = (_match: string, idStr: string, linkText?: string) => {
    const id = parseInt(idStr, 10);

    // Custom replacer takes precedence
    if (replacer) {
      return replacer(id, citationMap?.get(id));
    }

    // Show verification status indicator (preserve anchor text from cite-link format)
    if (verificationIndex) {
      const indicator = getVerificationTextIndicator(verificationIndex.get(id));
      return linkText ? `${linkText} [${id}${indicator}]` : `[${id}${indicator}]`;
    }

    // Show anchor text if requested
    if (showSourceMatch) {
      const data = citationMap?.get(id);
      if (data?.source_match) return data.source_match;
    }

    // Default: remove marker, but keep anchor text from cite-link format
    return linkText ?? "";
  };

  // First pass: replace [anchor](cite:N) markers
  let result = text.replace(CITATION_LINK_RE, (_match, anchor: string, idStr: string) => {
    return replaceSingle(_match, idStr, anchor);
  });

  // Second pass: replace [N] markers
  result = result.replace(CITATION_MARKER_RE, (_match, idStr: string) => {
    return replaceSingle(_match, idStr);
  });

  return result;
}

/**
 * Gets all citation marker IDs found in a text.
 *
 * @param text - The text to scan for [N] markers
 * @returns Array of citation IDs in order of appearance
 */
/** Combined pattern matching both [anchor](cite:N) and [N] formats in one scan. */
const COMBINED_MARKER_RE = /\[[^\][]+\]\(cite:(\d+)\)|\[(\d+)\]/g;

export function getCitationMarkerIds(text: string): number[] {
  // Single scan preserves document order — no sort needed
  return Array.from(text.matchAll(COMBINED_MARKER_RE), m => parseInt(m[1] ?? m[2], 10));
}

/**
 * Regex for comma-separated multi-citation markers like [1, 5] or [2, 3, 4].
 * Matches brackets containing comma-separated integers with optional whitespace.
 */
const MULTI_CITATION_MARKER_RE = /\[(\d+(?:\s*,\s*\d+)+)\]/g;

/** Maximum characters to scan forward/backward when finding sentence boundaries. */
const SENTENCE_SEARCH_WINDOW = 500;

/** Truncate text to ~maxLen characters at a word boundary. */
function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.substring(0, maxLen).replace(/\s+\S*$/, "");
  return truncated || text.substring(0, maxLen);
}

/**
 * Check if a period at position `i` in `text` is part of an abbreviation
 * (e.g. "Dr.", "U.S.", "3.") rather than a sentence-ending period.
 * Looks at the word ending at the period — abbreviations are typically
 * 1–2 characters or all-digits.
 */
function isAbbreviationPeriod(text: string, i: number): boolean {
  const wordMatch = text.slice(0, i).match(/\b(\w+)$/);
  const prevWord = wordMatch?.[1] ?? "";
  return prevWord.length <= 2 || /^\d+$/.test(prevWord);
}

/**
 * Extracts the sentence or clause surrounding a citation marker position.
 * Looks for sentence boundaries (. ! ? newline) or list item boundaries (- *).
 */
function extractSurroundingSentence(text: string, markerStart: number, markerEnd: number): string {
  // Look backward for sentence start
  let sentenceStart = markerStart;
  for (let i = markerStart - 1; i >= 0 && i >= markerStart - SENTENCE_SEARCH_WINDOW; i--) {
    const ch = text[i];
    if (ch === "\n") {
      sentenceStart = i + 1;
      break;
    }
    if ((ch === "." || ch === "!" || ch === "?") && i < markerStart - 1) {
      const nextChar = text[i + 1];
      if ((nextChar === " " || nextChar === "\n") && !isAbbreviationPeriod(text, i)) {
        sentenceStart = i + 2;
        break;
      }
    }
    if (i === 0) {
      sentenceStart = 0;
    }
  }

  // Look forward for sentence end
  let sentenceEnd = markerEnd;
  for (let i = markerEnd; i < text.length && i < markerEnd + SENTENCE_SEARCH_WINDOW; i++) {
    const ch = text[i];
    if (ch === "\n") {
      sentenceEnd = i;
      break;
    }
    if (ch === "." || ch === "!" || ch === "?") {
      const nextChar = text[i + 1];
      if ((!nextChar || nextChar === " " || nextChar === "\n") && !isAbbreviationPeriod(text, i)) {
        sentenceEnd = i + 1;
        break;
      }
    }
    if (i === text.length - 1) {
      sentenceEnd = text.length;
    }
  }

  // Extract and clean the sentence
  let sentence = text.substring(sentenceStart, sentenceEnd).trim();

  // Remove leading list markers (-, *, numbers)
  sentence = sentence.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "");

  // Strip all citation markers from the extracted sentence to get clean text
  // New format [anchor](cite:N) → keep anchor text; old format [N] → remove
  sentence = sentence
    .replace(CITATION_LINK_RE, (_m, anchor: string) => anchor)
    .replace(CITATION_MARKER_RE, "")
    .replace(MULTI_CITATION_MARKER_RE, "");

  // Remove markdown bold/italic markers for cleaner full_phrase
  sentence = sentence.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");

  // Clean up extra whitespace
  sentence = sentence.replace(/\s{2,}/g, " ").trim();

  return sentence;
}

/**
 * Extracts citations from raw LLM output that contains only [N] markers
 * (no <<<CITATION_DATA>>> JSON block). Uses the surrounding sentence/clause
 * as the `full_phrase` for each citation.
 *
 * Handles three marker styles observed across LLM providers:
 * - Sequential: `[1]`, `[2]`, `[3]` (all providers)
 * - Adjacent: `[9][10][11]` (OpenAI)
 * - Comma-separated: `[1, 5]`, `[2, 3, 4]` (Gemini)
 *
 * @param text - Raw LLM output with [N] markers but no citation data block
 * @returns Citation dictionary keyed by citation number as a string (e.g. "1", "2"),
 *   NOT by content hash like `getCitationKey()`. This is because marker-only citations
 *   lack the metadata needed for content hashing, and numeric keys match citationNumber.
 */
export function extractCitationsFromMarkers(text: string): { [key: string]: Citation } {
  if (!text || typeof text !== "string") return {};

  const citations: { [key: string]: Citation } = {};
  const seenIds = new Set<number>();

  // Pass 0: find all [anchor](cite:N) markers — anchor is explicit, no heuristic needed
  for (const match of text.matchAll(CITATION_LINK_RE)) {
    const anchor = match[1];
    const id = parseInt(match[2], 10);
    if (seenIds.has(id) || Number.isNaN(id)) continue;
    seenIds.add(id);

    const markerStart = match.index;
    const markerEnd = markerStart + match[0].length;
    const sentence = extractSurroundingSentence(text, markerStart, markerEnd);

    const citation: Citation = {
      type: "document" as const,
      sourceContext: sentence || anchor,
      citationNumber: id,
      sourceMatch: truncateAtWord(anchor, 50),
    };
    citations[String(id)] = citation;
  }

  // First pass: find all multi-citation markers [N, N, N]
  for (const match of text.matchAll(MULTI_CITATION_MARKER_RE)) {
    const ids = match[1].split(",").map(s => parseInt(s.trim(), 10));
    const markerStart = match.index;
    const markerEnd = markerStart + match[0].length;
    const sentence = extractSurroundingSentence(text, markerStart, markerEnd);

    if (!sentence) continue;

    for (const id of ids) {
      if (seenIds.has(id) || Number.isNaN(id)) continue;
      seenIds.add(id);

      const citation: Citation = {
        type: "document" as const,
        sourceContext: sentence,
        citationNumber: id,
        sourceMatch: truncateAtWord(sentence, 50),
      };
      // Use citationNumber as key to avoid collisions when multiple IDs share the same sentence
      citations[String(id)] = citation;
    }
  }

  // Second pass: find single [N] markers not already captured
  for (const match of text.matchAll(CITATION_MARKER_RE)) {
    const id = parseInt(match[1], 10);
    if (seenIds.has(id) || Number.isNaN(id)) continue;
    seenIds.add(id);

    const markerStart = match.index;
    const markerEnd = markerStart + match[0].length;
    const sentence = extractSurroundingSentence(text, markerStart, markerEnd);

    if (!sentence) continue;

    const citation: Citation = {
      type: "document" as const,
      sourceContext: sentence,
      citationNumber: id,
      sourceMatch: truncateAtWord(sentence, 50),
    };
    citations[String(id)] = citation;
  }

  return citations;
}

/**
 * Strips all citation artifacts from LLM output, returning clean readable text.
 * Strips `[N]` markers and `<<<CITATION_DATA>>>` block.
 *
 * @param llmResponse - The raw LLM response containing citations
 * @returns Clean text with all citation artifacts removed
 *
 * @example
 * ```typescript
 * const cleanText = stripCitations(llmResponse);
 * ```
 */
export function stripCitations(llmResponse: string): string {
  if (!llmResponse || typeof llmResponse !== "string") {
    return "";
  }

  // Strip <<<CITATION_DATA>>> block (if present), then remove [N] markers
  const visibleText = extractVisibleText(llmResponse);
  return replaceCitationMarkers(visibleText);
}
