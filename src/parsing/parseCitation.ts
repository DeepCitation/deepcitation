import type { AudioVideoCitation, Citation, CitationRecord, DocumentCitation, UrlCitation } from "../types/citation.js";
import { normalizeDeepTextPageId } from "../deeptext/index.js";
import { getCitationKey } from "../utils/citationKey.js";
import { getFieldAliases, resolveField } from "../utils/fieldAliases.js";
import { createSafeObject, isSafeKey } from "../utils/objectSafety.js";
import {
  extractCitationsFromMarkers,
  getAllCitationsFromNumericResponse,
  hasCitationData,
} from "./citationParser.js";

/**
 * Parses a JSON-based citation object into a Citation.
 * Supports both camelCase and snake_case property names.
 *
 * @param jsonCitation - The JSON citation object (can have camelCase or snake_case properties)
 * @param citationNumber - Optional citation number for ordering
 * @returns Parsed Citation object
 */
const parseJsonCitation = (jsonCitation: unknown, citationNumber?: number): Citation | null => {
  if (!jsonCitation || typeof jsonCitation !== "object") {
    return null;
  }

  // Type assertion after runtime check - we've verified it's an object
  const obj = jsonCitation as Record<string, unknown>;

  // Resolve field names using centralized alias map (handles camelCase, snake_case,
  // kebab-case, and shortened LLM variants like "anchor" → sourceMatch)
  const sourceContextValue = resolveField(obj, "sourceContext");
  const sourceContext = typeof sourceContextValue === "string" ? sourceContextValue : undefined;

  const startPageIdValue = resolveField(obj, "startPageId");
  const startPageId = typeof startPageIdValue === "string" ? startPageIdValue : undefined;

  const sourceMatchValue = resolveField(obj, "sourceMatch");
  const sourceMatch = typeof sourceMatchValue === "string" ? sourceMatchValue : undefined;

  const rawLineIdsValue = resolveField(obj, "lineIds");
  const rawLineIds = Array.isArray(rawLineIdsValue) ? rawLineIdsValue : undefined;

  const attachmentIdValue = resolveField(obj, "attachmentId");
  const attachmentId = typeof attachmentIdValue === "string" ? attachmentIdValue : undefined;

  const reasoningValue = resolveField(obj, "reasoning");
  const reasoning = typeof reasoningValue === "string" ? reasoningValue : undefined;

  const valueValue = resolveField(obj, "value");
  const value = typeof valueValue === "string" ? valueValue : undefined;

  if (!sourceContext) {
    return null;
  }

  const pageNumber = startPageId ? normalizeDeepTextPageId(startPageId).pageNumber : undefined;

  // Sort lineIds if present
  const lineIds = rawLineIds?.length ? [...rawLineIds].sort((a: number, b: number) => a - b) : undefined;

  // Extract URL-specific fields via centralized alias resolution
  const urlValue = resolveField(obj, "url");
  const url = typeof urlValue === "string" ? urlValue : undefined;
  const domainValue = resolveField(obj, "domain");
  const domain = typeof domainValue === "string" ? domainValue : undefined;
  const titleValue = resolveField(obj, "title");
  const title = typeof titleValue === "string" ? titleValue : undefined;
  const descriptionValue = resolveField(obj, "description");
  const description = typeof descriptionValue === "string" ? descriptionValue : undefined;
  const siteNameValue = resolveField(obj, "siteName");
  const siteName = typeof siteNameValue === "string" ? siteNameValue : undefined;
  const faviconUrlValue = resolveField(obj, "faviconUrl");
  const faviconUrl = typeof faviconUrlValue === "string" ? faviconUrlValue : undefined;

  // Determine citation type: URL citation if url is present and no attachmentId
  if (url && !attachmentId) {
    const citation: UrlCitation = {
      type: "url" as const,
      url,
      domain,
      title,
      description,
      siteName,
      faviconUrl,
      sourceContext,
      citationNumber,
      sourceMatch: sourceMatch || value,
      reasoning,
    };
    return citation;
  }

  const citation: DocumentCitation = {
    type: "document",
    attachmentId,
    pageNumber,
    sourceContext,
    citationNumber,
    lineIds,
    sourceMatch: sourceMatch || value,
    reasoning,
  };

  return citation;
};

/**
 * All known aliases for detection-relevant citation fields.
 * Built once at module load from the centralized alias map.
 */
const CITATION_DETECT_KEYS = new Set([
  ...getFieldAliases("sourceContext"),
  ...getFieldAliases("startPageId"),
  ...getFieldAliases("sourceMatch"),
  ...getFieldAliases("lineIds"),
]);

const URL_DETECT_KEYS = new Set(getFieldAliases("url"));
const PHRASE_DETECT_KEYS = new Set(getFieldAliases("sourceContext"));

/**
 * Checks if an object has citation-like properties.
 * Handles camelCase, snake_case, kebab-case, and shortened LLM variants.
 */
const hasCitationProperties = (item: unknown): boolean => {
  if (typeof item !== "object" || item === null) return false;
  const keys = Object.keys(item);

  // Check if any key matches a known citation field alias
  const hasCitationKey = keys.some(k => CITATION_DETECT_KEYS.has(k));
  if (hasCitationKey) return true;

  // URL citation: needs both a URL alias and a sourceContext alias
  const hasUrl = keys.some(k => URL_DETECT_KEYS.has(k));
  const hasPhrase = keys.some(k => PHRASE_DETECT_KEYS.has(k));
  return hasUrl && hasPhrase;
};

/**
 * Checks if the input appears to be JSON-based citations.
 * Looks for array of objects with citation-like properties (supports both camelCase and snake_case).
 */
const isJsonCitationFormat = (data: unknown): data is Citation[] | Citation => {
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
const extractJsonCitations = (data: Citation[] | Citation): CitationRecord => {
  const citations: CitationRecord = {};
  const items = Array.isArray(data) ? data : [data];

  let citationNumber = 1;
  for (const item of items) {
    const citation = parseJsonCitation(item, citationNumber++);
    if (citation?.sourceContext) {
      const citationKey = getCitationKey(citation);
      citations[citationKey] = citation;
    }
  }

  return citations;
};

/**
 * Maximum recursion depth for JSON citation traversal.
 * Prevents stack overflow from deeply nested or circular objects.
 */
const MAX_TRAVERSAL_DEPTH = 50;

/**
 * Recursively traverses an object looking for `citation` or `citations` properties
 * that match our JSON citation format.
 *
 * Performance fix: Depth limit prevents stack overflow from malicious/circular objects.
 *
 * @param obj - Object to traverse
 * @param found - Array to collect found citations
 * @param depth - Current recursion depth (internal)
 */
const findJsonCitationsInObject = (obj: unknown, found: Citation[], depth = 0): void => {
  // Performance fix: prevent stack overflow with depth limit
  if (depth > MAX_TRAVERSAL_DEPTH || !obj || typeof obj !== "object") return;

  // Type assertion after runtime check - we've verified it's an object
  const record = obj as Record<string, unknown>;

  // Check for citation/citations properties
  if (record.citation && isJsonCitationFormat(record.citation)) {
    const items = Array.isArray(record.citation) ? record.citation : [record.citation];
    found.push(...items);
  }
  if (record.citations && isJsonCitationFormat(record.citations)) {
    const items = Array.isArray(record.citations) ? record.citations : [record.citations];
    found.push(...items);
  }

  // Recurse into object properties
  if (Array.isArray(obj)) {
    for (const item of obj) {
      findJsonCitationsInObject(item, found, depth + 1);
    }
  } else {
    for (const key of Object.keys(record)) {
      if (key !== "citation" && key !== "citations") {
        findJsonCitationsInObject(record[key], found, depth + 1);
      }
    }
  }
};

/**
 * Extracts all citations from LLM output.
 * Supports numeric [N] + <<<CITATION_DATA>>> format (strings) and JSON-based citation formats (objects).
 *
 * For object input:
 * - Traverses the object looking for `citation` or `citations` properties matching JSON format
 *
 * **IMPORTANT**: Returns an OBJECT (CitationRecord), NOT an array.
 * To check if empty, use `Object.keys(citations).length === 0`.
 *
 * @param llmOutput - The LLM output (string or object)
 * @returns CitationRecord - An object/dictionary of citations keyed by citationKey (a 16-char hash).
 *          This is NOT an array. Use Object.keys(), Object.values(), or Object.entries() to iterate.
 *
 * @example
 * ```typescript
 * const citations = getAllCitationsFromLlmOutput(llmResponse);
 * // Returns: { "a1b2c3d4e5f67890": { pageNumber: 1, ... }, "f9e8d7c6b5a43210": { ... } }
 *
 * // Check if empty (NOT citations.length!)
 * if (Object.keys(citations).length === 0) {
 *   console.log("No citations found");
 * }
 *
 * // Get count
 * const count = Object.keys(citations).length;
 *
 * // Iterate
 * for (const [citationKey, citation] of Object.entries(citations)) {
 *   console.log(`Citation ${citationKey}:`, citation.sourceContext);
 * }
 * ```
 */
export const getAllCitationsFromLlmOutput = (llmOutput: unknown): CitationRecord => {
  if (!llmOutput) return {};

  const citations: CitationRecord = {};

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
  } else if (typeof llmOutput === "string") {
    // Check for numeric JSON format (<<<CITATION_DATA>>>)
    if (hasCitationData(llmOutput)) {
      const numericCitations = getAllCitationsFromNumericResponse(llmOutput);
      Object.assign(citations, numericCitations);
    } else {
      // Fallback: extract citations from [N] markers in raw LLM output
      // (no <<<CITATION_DATA>>> block — uses surrounding sentence as full_phrase)
      const markerCitations = extractCitationsFromMarkers(llmOutput);
      Object.assign(citations, markerCitations);
    }
  }

  return citations;
};

function toCitationEntries(citations: Citation[] | CitationRecord): [string, Citation][] {
  return Array.isArray(citations)
    ? citations.map((c, idx) => [getCitationKey(c) || String(idx + 1), c])
    : Object.entries(citations);
}

/**
 * Groups citations by their attachmentId for multi-file verification scenarios.
 * This is useful when you have citations from multiple files and need to
 * verify them against their respective attachments.
 *
 * @param citations - Array of Citation objects or a CitationRecord (object/dictionary)
 * @returns Map of attachmentId to CitationRecord (dictionary of citations from that file)
 *
 * @example
 * ```typescript
 * const citations = getAllCitationsFromLlmOutput(response.content);
 * const citationsByAttachment = groupCitationsByAttachmentId(citations);
 *
 * // Verify citations for each file
 * for (const [attachmentId, fileCitations] of citationsByAttachment) {
 *   const verified = await deepcitation.verifyCitations(attachmentId, fileCitations);
 *   // Process verification results...
 * }
 * ```
 */
export function groupCitationsByAttachmentId(citations: Citation[] | CitationRecord): Map<string, CitationRecord> {
  const grouped = new Map<string, CitationRecord>();

  for (const [key, citation] of toCitationEntries(citations)) {
    if (!isSafeKey(key)) continue;

    const attachmentId = (citation.type !== "url" ? citation.attachmentId : undefined) || "";

    if (!grouped.has(attachmentId)) {
      grouped.set(attachmentId, {});
    }

    // biome-ignore lint/style/noNonNullAssertion: guaranteed by has() check above
    const group = grouped.get(attachmentId)!;
    group[key] = citation;
  }

  return grouped;
}

/**
 * Groups citations by their attachmentId and returns as a plain object.
 * Alternative to groupCitationsByAttachmentId that returns a plain object instead of a Map.
 *
 * @param citations - Array of Citation objects or a CitationRecord (object/dictionary)
 * @returns Object with attachmentId keys mapping to CitationRecord dictionaries
 *
 * @example
 * ```typescript
 * const citations = getAllCitationsFromLlmOutput(response.content);
 * const citationsByAttachment = groupCitationsByAttachmentIdObject(citations);
 *
 * // Verify citations for each file using Promise.all
 * const verificationPromises = Object.entries(citationsByAttachment).map(
 *   ([attachmentId, fileCitations]) => deepcitation.verifyCitations(attachmentId, fileCitations)
 * );
 * const results = await Promise.all(verificationPromises);
 * ```
 */
export function groupCitationsByAttachmentIdObject(
  citations: Citation[] | CitationRecord,
): Record<string, CitationRecord> {
  const grouped: Record<string, CitationRecord> = {};

  for (const [key, citation] of toCitationEntries(citations)) {
    const attachmentId = (citation.type !== "url" ? citation.attachmentId : undefined) || "";

    // Only assign if both attachmentId and key are safe (prevents prototype pollution)
    if (!isSafeKey(attachmentId) || !isSafeKey(key)) {
      continue;
    }

    // attachmentId and key are guaranteed safe by isSafeKey checks above
    // lgtm[js/prototype-polluting-assignment]
    if (!grouped[attachmentId]) {
      grouped[attachmentId] = createSafeObject<Citation>();
    }

    grouped[attachmentId][key] = citation;
  }

  return grouped;
}

/**
 * Normalizes a citation object from external sources (APIs, databases) to ensure
 * the `type` discriminator is set correctly.
 *
 * If the citation has a `url` field but no `type: "url"`, it is corrected to a `UrlCitation`.
 * This is useful when consuming data that predates the discriminated union refactor.
 *
 * Validates that URL citations have a non-empty `url` string. If `type: "url"` is set
 * but `url` is missing/empty, throws an error to prevent malformed citations.
 *
 * @example
 * ```typescript
 * // External data missing the discriminator
 * const raw = { url: "https://example.com", sourceContext: "..." };
 * const citation = normalizeCitationType(raw); // { type: "url", url: "...", sourceContext: "..." }
 *
 * // Already correct — passes through
 * const correct = { type: "url", url: "https://example.com" };
 * normalizeCitationType(correct); // unchanged
 *
 * // Document citation — type discriminator is always injected
 * const doc = { attachmentId: "abc", pageNumber: 1 };
 * normalizeCitationType(doc); // { type: "document", attachmentId: "abc", pageNumber: 1 }
 * ```
 *
 * @throws Error if `type` is `"url"` but `url` field is missing or empty
 */
export function normalizeCitationType(citation: Record<string, unknown>): Citation {
  // Pass through audio/video citations with their existing type discriminator.
  if (citation.type === "audio" || citation.type === "video") {
    // Type is narrowed by the discriminator check above. The spread produces
    // { [x: string]: unknown } which TypeScript can't directly assert to AudioVideoCitation,
    // so we go through unknown. Safe: type field is validated by the if-check above.
    return { ...citation } as unknown as AudioVideoCitation;
  }
  if (citation.type === "url" || (typeof citation.url === "string" && citation.url.length > 0)) {
    if (typeof citation.url !== "string" || !citation.url) {
      throw new Error("URL citation missing required 'url' field");
    }
    return { ...citation, type: "url" as const } as UrlCitation;
  }
  // No url field → DocumentCitation. Always inject the type discriminator.
  return { ...citation, type: "document" as const } as DocumentCitation;
}
