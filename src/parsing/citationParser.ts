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
import { formatDeepTextPageId, normalizeDeepTextLineIds, normalizeDeepTextPageId } from "../deeptext/index.js";
import { repairJson } from "./jsonRepair.js";
import type { Citation, SupportingFact } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { getCitationKey } from "../utils/citationKey.js";
import { createSafeObject, isSafeKey } from "../utils/objectSafety.js";
import { escapeForRegex, safeMatch } from "../utils/regexSafety.js";
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
  c: "children",
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
  citationNumber: "id",
  citation_number: "id",
  number: "id",
  marker: "id",
  // Legacy field names → new canonical names
  fullPhrase: "source_context",
  full_phrase: "source_context",
  sourceQuote: "source_context",
  source_quote: "source_context",
  quote: "source_context",
  context: "source_context",
  anchorText: "source_match",
  anchor_text: "source_match",
  match: "source_match",
  matchedText: "source_match",
  matched_text: "source_match",
  displayLabel: "claim_text",
  display_label: "claim_text",
  reason: "reasoning",
  pageId: "page_id",
  pageNumber: "page_id",
  page_number: "page_id",
  page: "page_id",
  lineIds: "line_ids",
  lines: "line_ids",
  lineNumbers: "line_ids",
  line_numbers: "line_ids",
  // "fileId" was an early API field name before "attachmentId" was standardized.
  fileId: "attachment_id",
} as const;

/**
 * Matches [N] citation markers in text.
 * Safe to reuse as a module-level constant: String.replace() and String.matchAll()
 * do not mutate lastIndex, so there is no stateful cross-call contamination.
 * Do NOT use with RegExp iterative calls in a loop — they advance lastIndex.
 */
const CITATION_MARKER_RE = /\[(\d+)\]/g;

/**
 * Matches [N] citation markers, capturing the full bracket token.
 * Outer-capture variant of CITATION_MARKER_RE — intended for use with
 * String.split() so that the `[N]` delimiters are preserved in the result array.
 *
 * @example
 * ```typescript
 * const segments = text.split(CITATION_MARKER_PATTERN);
 * // ["before ", "[1]", " after"]
 * ```
 */
export const CITATION_MARKER_PATTERN = /(\[\d+\])/;

/**
 * Matches [anchor text](cite:N) citation link markers.
 * The anchor text is in capture group 1, the citation ID in capture group 2.
 * Safe to reuse as a module-level constant: String.replace() and String.matchAll()
 * do not mutate lastIndex, so there is no stateful cross-call contamination.
 * Do NOT use with RegExp iterative calls in a loop — they advance lastIndex.
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
 * Normalizes a single key-value pair from compact/alias format to canonical CitationData format.
 * Handles timestamps (nested s/e keys) and line_ids (string-to-int coercion).
 *
 * @returns The canonical key and normalized value, or null if the key is unsafe.
 */
function normalizeKeyValue(rawKey: string, value: unknown): { fullKey: string; normalizedValue: unknown } | null {
  const fullKey = KEY_ALIAS_MAP[rawKey] || COMPACT_KEY_MAP[rawKey] || rawKey;
  if (!isSafeKey(fullKey)) return null;

  // Handle timestamps specially (nested object with s/e keys)
  if ((rawKey === "t" || fullKey === "timestamps") && value && typeof value === "object") {
    const ts = value as Record<string, unknown>;
    return {
      fullKey: "timestamps",
      normalizedValue: {
        start_time: ts.s ?? ts.start_time ?? ts.startTime,
        end_time: ts.e ?? ts.end_time ?? ts.endTime,
      },
    };
  }

  // Coerce line_ids to integers — LLMs sometimes output ["452"] instead of [452]
  if (fullKey === "line_ids" && Array.isArray(value)) {
    return {
      fullKey,
      normalizedValue: normalizeDeepTextLineIds(value),
    };
  }

  if (fullKey === "page_id" && typeof value === "number" && Number.isFinite(value)) {
    return {
      fullKey,
      normalizedValue: formatDeepTextPageId(value) ?? value,
    };
  }

  return { fullKey, normalizedValue: value };
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
    // Shallow (one-level) expansion of the children array — each child uses the same compact keys.
    // Children-of-children are intentionally stripped (line 203 below) to prevent recursive nesting.
    if ((KEY_ALIAS_MAP[key] || COMPACT_KEY_MAP[key] || key) === "children" && Array.isArray(value)) {
      result.children = value
        .filter((child): child is Record<string, unknown> => typeof child === "object" && child !== null)
        .map(child => {
          const expanded = createSafeObject<unknown>();
          for (const [ck, cv] of Object.entries(child)) {
            const normalized = normalizeKeyValue(ck, cv);
            if (!normalized) continue;
            if (normalized.fullKey === "children") continue;
            // fullKey is guaranteed safe by isSafeKey check in normalizeKeyValue
            // lgtm[js/remote-property-injection]
            expanded[normalized.fullKey] = normalized.normalizedValue;
          }
          return expanded;
        });
      continue;
    }

    const normalized = normalizeKeyValue(key, value);
    if (!normalized) continue;

    // fullKey is guaranteed safe by isSafeKey check in normalizeKeyValue
    // lgtm[js/remote-property-injection]
    result[normalized.fullKey] = normalized.normalizedValue;
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

/** Maximum nesting depth for envelope unwrapping in {@link parseCitationsFromJson}. */
const MAX_ENVELOPE_DEPTH = 5;

/**
 * Helper to parse citations from JSON, handling both grouped and flat formats.
 *
 * `depth` tracks recursion into nested `citations`/`data`/`citation_data`
 * envelopes; once it exceeds {@link MAX_ENVELOPE_DEPTH} the envelope unwrapping
 * is skipped so an adversarial deeply-nested payload cannot overflow the stack.
 */
function parseCitationsFromJson(parsed: unknown, depth = 0): CitationData[] {
  if (depth < MAX_ENVELOPE_DEPTH && typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.citations)) {
      return record.citations.map(c => expandCompactKeys(c as Record<string, unknown>));
    }
    if (Array.isArray(record.data) && record.data.every(c => typeof c === "object" && c !== null)) {
      return record.data.map(c => expandCompactKeys(c as Record<string, unknown>));
    }
    if (record.citations && typeof record.citations === "object" && !Array.isArray(record.citations)) {
      return parseCitationsFromJson(record.citations, depth + 1);
    }
    if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
      return parseCitationsFromJson(record.data, depth + 1);
    }
    if (record.citation_data) {
      return parseCitationsFromJson(record.citation_data, depth + 1);
    }
  }

  // Check for grouped format: { "attachmentId": [citations...], ... }
  if (isGroupedFormat(parsed)) {
    return flattenGroupedCitations(parsed);
  }

  // Flat format: array of citations or single citation
  const rawCitations = Array.isArray(parsed) ? parsed : [parsed];
  return rawCitations.map(c => expandCompactKeys(c as Record<string, unknown>));
}

const NON_ATTACHMENT_ARRAY_KEYS = new Set([
  "children",
  "citations",
  "evidence",
  "line_ids",
  "lines",
  "matches",
  "pages",
  "supporting_facts",
]);

function findNearestGroupedAttachmentId(jsonString: string, objectStart: number): string | undefined {
  const prefix = jsonString.slice(0, objectStart);
  const matches = [...prefix.matchAll(/"([^"]+)"\s*:\s*\[/g)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const key = matches[i]?.[1];
    if (!key || NON_ATTACHMENT_ARRAY_KEYS.has(key)) continue;
    return key;
  }
  return undefined;
}

function findBalancedObjectEnd(jsonString: string, objectStart: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = objectStart; i < jsonString.length; i++) {
    const ch = jsonString[i] as string;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

function recoverCitationObjectsFromMalformedJson(jsonString: string): CitationData[] {
  const citations: CitationData[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < jsonString.length; i++) {
    if (jsonString[i] !== "{") continue;
    const preview = jsonString.slice(i, i + 120);
    if (!/"(?:id|n)"\s*:/.test(preview)) continue;

    const end = findBalancedObjectEnd(jsonString, i);
    if (end === -1) continue;

    try {
      const rawObject = JSON.parse(jsonString.slice(i, end));
      const attachmentId = findNearestGroupedAttachmentId(jsonString, i);
      const citation = expandCompactKeys(rawObject as Record<string, unknown>, attachmentId);
      const dedupeKey = [
        citation.attachment_id ?? "",
        citation.id,
        citation.source_context ?? "",
        citation.source_match ?? "",
      ].join("|");
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      citations.push(citation);
    } catch {
      // Keep scanning; malformed sibling objects should not poison valid ones.
    }
  }

  return citations;
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
      const recovered = recoverCitationObjectsFromMalformedJson(jsonString);
      if (recovered.length > 0) {
        console.warn(
          "[DeepCitation] Recovered citation objects from malformed citation JSON.",
          `Recovered ${recovered.length} citation object(s).`,
          `Initial parse error: ${initialError instanceof Error ? initialError.message : "Unknown error"}.`,
          `Repair error: ${repairError instanceof Error ? repairError.message : "Unknown error"}`,
        );
        citations = recovered;
      } else {
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
 * Converts a CitationData object to the standard Citation format.
 * Internal use only — use {@link getAllCitationsFromLlmOutput} from the public API.
 */
export function citationDataToCitation(data: CitationData, citationNumber?: number): Citation {
  // Parse page number from page_id (supports both "N_I" and "page_number_N_index_I")
  let pageNumber: number | undefined;
  let startPageId: string | undefined;
  const pageId = data.page_id;
  if (pageId) {
    const parsed = normalizeDeepTextPageId(pageId);
    pageNumber = parsed.pageNumber;
    startPageId = parsed.startPageId;
  }

  // Sort lineIds if present
  const normalizedLineIds = normalizeDeepTextLineIds(data.line_ids, { sort: true });
  const lineIds = normalizedLineIds.length ? normalizedLineIds : undefined;

  const supportingFacts = mapChildrenToSupportingFacts(data.children);

  // AV citation: timestamps present means this is an audio/video citation.
  // `supportingFacts` is valid here — AudioVideoCitation extends CitationBase which has supportingFacts?.
  if (data.timestamps) {
    return {
      type: "audio" as const,
      attachmentId: data.attachment_id,
      sourceContext: data.source_context,
      sourceMatch: data.source_match,
      claimText: data.claim_text,
      citationNumber: citationNumber ?? data.id,
      reasoning: data.reasoning,
      timestamps: {
        startTime: data.timestamps.start_time,
        endTime: data.timestamps.end_time,
      },
      ...(supportingFacts && { supportingFacts }),
    };
  }

  return {
    type: "document" as const,
    attachmentId: data.attachment_id,
    pageNumber,
    startPageId,
    sourceContext: data.source_context,
    sourceMatch: data.source_match,
    claimText: data.claim_text,
    citationNumber: citationNumber ?? data.id,
    lineIds,
    reasoning: data.reasoning,
    ...(supportingFacts && { supportingFacts }),
  };
}

function mapChildrenToSupportingFacts(children: CitationData[] | undefined): SupportingFact[] | undefined {
  if (!children?.length) return undefined;

  return children.map((child, index): SupportingFact => {
    let childPageNumber: number | undefined;
    let childStartPageId: string | undefined;
    if (child.page_id) {
      const parsed = normalizeDeepTextPageId(child.page_id);
      childPageNumber = parsed.pageNumber;
      childStartPageId = parsed.startPageId;
    }

    const normalizedChildLineIds = normalizeDeepTextLineIds(child.line_ids, { sort: true });
    const childLineIds = normalizedChildLineIds.length ? normalizedChildLineIds : undefined;

    return {
      childIndex: index,
      claimText: child.claim_text,
      sourceContext: child.source_context,
      sourceMatch: child.source_match,
      pageNumber: childPageNumber,
      lineIds: childLineIds,
      startPageId: childStartPageId,
      reasoning: child.reasoning,
      attachmentId: child.attachment_id,
      ...(child.timestamps && {
        timestamps: {
          startTime: child.timestamps.start_time,
          endTime: child.timestamps.end_time,
        },
      }),
    };
  });
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
    // Admit citations that have either sourceContext OR sourceMatch.
    // Dropping entries that only have sourceMatch (no sourceContext) caused
    // orphan [N] markers in prose to render as permanently-pulsing chips
    // because no map entry existed for the marker number. (issue-235)
    if (citation.sourceContext || citation.sourceMatch) {
      const baseCitationKey = getCitationKey(citation);
      const citationKey =
        citations[baseCitationKey] && citations[baseCitationKey].citationNumber !== citation.citationNumber
          ? sha1Hash(`${baseCitationKey}|citationNumber:${citation.citationNumber ?? ""}`).slice(0, 16)
          : baseCitationKey;
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
  const pageNumber = data.page_id ? normalizeDeepTextPageId(data.page_id).pageNumber : undefined;
  const normalizedLineIds = normalizeDeepTextLineIds(data.line_ids, { sort: true });
  const lineIds = normalizedLineIds.length ? normalizedLineIds : undefined;

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

/**
 * Wrapper pairs recognised around a trailing `sourceMatch` — the canonical
 * table that both {@link stripClaimText} and {@link extractTrailingClaimText}
 * derive from. Ordered longest-first so composites (e.g. `**\`x\`**`) match
 * before their constituents.
 */
const CLAIM_WRAPPERS: ReadonlyArray<readonly [string, string]> = [
  ["**`", "`**"], // **`code`**
  ["*`", "`*"], // *`code`*
  ["**", "**"], // **bold**
  ["*", "*"], // *italic*
  ["`", "`"], // `code`
  ['"', '"'], // "straight double"
  ["'", "'"], // 'straight single'
  ["“", "”"], // “smart double”
  ["‘", "’"], // ‘smart single’
];

/** Pre-escaped CLAIM_WRAPPERS pairs so stripClaimText doesn't re-escape per call. */
const CLAIM_WRAPPER_ESCAPES: ReadonlyArray<readonly [string, string]> = CLAIM_WRAPPERS.map(
  ([open, close]) => [escapeForRegex(open), escapeForRegex(close)] as const,
);

/**
 * Pre-compiled patterns for extractTrailingClaimText's sourceMatch-agnostic
 * fallback — derived from the quote-like single-char entries of
 * {@link CLAIM_WRAPPERS} so the canonical table remains the single source of
 * truth. Markdown emphasis (`*`, `**`) is excluded: `*x*` is ambiguous
 * between italic and a quoted value, so we only trigger the fallback for
 * unambiguous quote-like delimiters.
 */
const FALLBACK_PATTERNS: readonly RegExp[] = CLAIM_WRAPPERS.filter(
  ([open, close]) => [...open].length === 1 && [...close].length === 1 && open !== "*",
).map(([open, close]) => {
  const eo = escapeForRegex(open);
  const ec = escapeForRegex(close);
  // Content excludes BOTH delimiters + newline so a later span can't bridge
  // across an earlier one (e.g. "`first` middle `last`" → extracts "last").
  // Symmetric pairs (`` ` ``) collapse to a one-char class; asymmetric pairs
  // (e.g. “…”) keep both chars distinct in the class — same guarantee.
  return new RegExp(`${eo}([^${eo}${ec}\\n]+?)${ec}\\s*$`);
});

/** Bounded LRU for per-sourceMatch stripClaimText patterns. */
const STRIP_PATTERN_CACHE_CAP = 128;
const stripPatternCache = new Map<string, readonly RegExp[]>();

function getStripPatterns(sourceMatch: string): readonly RegExp[] {
  const cached = stripPatternCache.get(sourceMatch);
  if (cached) {
    stripPatternCache.delete(sourceMatch);
    stripPatternCache.set(sourceMatch, cached);
    return cached;
  }
  const esc = escapeForRegex(sourceMatch);
  const patterns: RegExp[] = CLAIM_WRAPPER_ESCAPES.map(([eo, ec]) => new RegExp(`${eo}${esc}${ec}\\s*$`));
  patterns.push(new RegExp(`${esc}\\s*$`));
  if (stripPatternCache.size >= STRIP_PATTERN_CACHE_CAP) {
    const firstKey = stripPatternCache.keys().next().value;
    if (firstKey !== undefined) stripPatternCache.delete(firstKey);
  }
  stripPatternCache.set(sourceMatch, patterns);
  return patterns;
}

function stripExactClaimMatch(segment: string, sourceMatch: string): string | null {
  if (!sourceMatch) return null;
  for (const pat of getStripPatterns(sourceMatch)) {
    const m = safeMatch(segment, pat);
    if (m && m.index !== undefined) return segment.slice(0, m.index);
  }
  return null;
}

/**
 * Strips `sourceMatch` text from the tail of a markdown segment.
 *
 * Recognises the match whether it is plain or wrapped in any of the pairs
 * listed in {@link CLAIM_WRAPPERS} (markdown emphasis, inline code, straight
 * or curly quotes, and the `**\`…\`**` / `*\`…\`*` composites LLMs often emit
 * for tabular values).
 *
 * @param segment - The markdown text segment (everything before the `[N]` token)
 * @param sourceMatch - The citation's source match text to strip
 * @returns The segment with the trailing `sourceMatch` (and its wrapper) removed, or `null` if not found
 *
 * @deprecated Prefer {@link extractTrailingClaimText}: it also returns the
 * extracted claim text, which is needed when the LLM's wrapped value diverges
 * from the verified `sourceMatch`.
 */
export function stripClaimText(segment: string, sourceMatch: string): string | null {
  return stripExactClaimMatch(segment, sourceMatch);
}

/**
 * Strips a trailing claim span from a markdown segment and returns both the
 * stripped segment and the claim text the model wrote.
 *
 * Matching strategy (first hit wins):
 *   1. Exact `sourceMatch` match (supports every wrapper in
 *      {@link CLAIM_WRAPPERS}) — returns `{ stripped, claimText: sourceMatch }`.
 *   2. **Content-agnostic fallback**: if the segment ends with any recognized
 *      quote-like wrapper ({@link FALLBACK_PATTERNS}), strip the wrapper and
 *      return its inner content as `claimText` regardless of whether it
 *      matches `sourceMatch`. This captures LLM "off-script" output such as
 *      `` `Austin, TX 73301` [14] `` where the wrapped value diverges from
 *      the citation's verified `sourceMatch`.
 *
 * Callers should pass `claimText` as the `claimText` prop on
 * `CitationComponent`: the trigger then shows what the model wrote while the
 * popover continues to display the verified `sourceMatch` (with a variance
 * annotation when they differ).
 *
 * @param segment - The markdown text segment (everything before the `[N]` token)
 * @param sourceMatch - Optional verified source match; enables the exact-match path
 * @returns `{ stripped, claimText }` or `null` if no trailing claim was found
 */
export function extractTrailingClaimText(
  segment: string,
  sourceMatch?: string | null,
): { stripped: string; claimText: string } | null {
  if (sourceMatch) {
    const stripped = stripExactClaimMatch(segment, sourceMatch);
    if (stripped !== null) {
      return { stripped, claimText: sourceMatch };
    }
  }
  for (const pat of FALLBACK_PATTERNS) {
    const m = safeMatch(segment, pat);
    if (m && m.index !== undefined && m[1]) {
      return { stripped: segment.slice(0, m.index), claimText: m[1] };
    }
  }
  return null;
}
