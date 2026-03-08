import type {
  AudioVideoCitation,
  Citation,
  CitationRecord,
  CitationStatus,
  DocumentCitation,
  UrlCitation,
} from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { getCitationKey } from "../utils/citationKey.js";
import { getFieldAliases, resolveField } from "../utils/fieldAliases.js";
import { createSafeObject, isSafeKey } from "../utils/objectSafety.js";
import { safeMatch } from "../utils/regexSafety.js";
import { getAllCitationsFromDeferredResponse, hasDeferredCitations } from "./citationParser.js";
import { normalizeCitations } from "./normalizeCitation.js";

/**
 * Module-level compiled regexes for hot-path operations.
 *
 * IMPORTANT: These regexes are compiled once at module load time to avoid
 * the overhead of regex compilation on every function call. This is a
 * significant performance optimization for parsing-heavy workloads.
 *
 * ## Safe usage patterns for global (/g) regexes:
 *
 * Regexes with the global flag maintain internal state (lastIndex).
 * Here's when each usage pattern is safe:
 *
 * ```typescript
 * // SAFE: String.match() creates a new matcher internally
 * const matches = text.match(CITE_TAG_REGEX);
 *
 * // SAFE: Non-global regexes don't have lastIndex issues
 * const isMatch = PAGE_ID_FULL_REGEX.test(text);
 * const match = PAGE_ID_FULL_REGEX.exec(text);
 *
 * // REQUIRED: Create fresh instance for .exec() loops with global regexes
 * const regex = new RegExp(CITE_TAG_REGEX.source, CITE_TAG_REGEX.flags);
 * let match;
 * while ((match = regex.exec(text)) !== null) { ... }
 *
 * // UNSAFE: Don't reuse global regex with .exec() in loops
 * // while ((match = CITE_TAG_REGEX.exec(text)) !== null) // BUG!
 * ```
 *
 * Performance fix: avoids regex recompilation on every function call.
 */
const PAGE_ID_FULL_REGEX = /page[_a-zA-Z]*(\d+)_index_(\d+)/;
const PAGE_ID_SIMPLE_REGEX = /page[_a-zA-Z]*(\d+)_index_(\d+)/i;
const SIMPLE_PAGE_INDEX_REGEX = /^(\d+)_(\d+)$/;
const CITE_TAG_REGEX = /<cite\s+(?:'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"|[^'">/])*\/>/g;

const attributeRegexCache = new Map<string, RegExp>();

function getAttributeRegex(name: string): RegExp {
  let regex = attributeRegexCache.get(name);
  if (!regex) {
    regex = new RegExp(`${name}='((?:[^'\\\\]|\\\\.)*)'`);
    attributeRegexCache.set(name, regex);
  }
  return regex;
}

/**
 * Maximum allowed range size for line ID expansion.
 * Prevents memory exhaustion from malicious inputs like "1-1000000".
 */
const MAX_LINE_ID_RANGE_SIZE = 1000;

/**
 * Number of sample points to use when a range is too large to fully expand.
 * Samples are evenly distributed across the range to maintain verification accuracy.
 */
const LARGE_RANGE_SAMPLE_COUNT = 50;

/**
 * Parses a line_ids string that may contain individual numbers, ranges, or both.
 * Examples: "1,2,3", "5-10", "1,5-7,10", "20-20"
 *
 * Performance: Range expansion is limited to MAX_LINE_ID_RANGE_SIZE to prevent
 * quadratic memory allocation from malicious inputs. For larger ranges, evenly
 * distributed sample points are used to maintain verification accuracy.
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

      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
        const rangeSize = end - start + 1;

        if (rangeSize > MAX_LINE_ID_RANGE_SIZE) {
          // Performance fix: use sampling for large ranges to maintain accuracy
          // Include start and end, plus evenly distributed samples using Math.floor
          // for predictable behavior. Deduplication happens at the end via Set.
          // Note: No warning logged to avoid spamming production logs.
          lineIds.push(start);
          const sampleCount = Math.min(LARGE_RANGE_SAMPLE_COUNT - 2, rangeSize - 2);
          if (sampleCount > 0) {
            // Use Math.floor for predictable sampling, ensuring step >= 1
            const step = Math.max(1, Math.floor((end - start) / (sampleCount + 1)));
            for (let i = 1; i <= sampleCount; i++) {
              const sample = start + step * i;
              // Ensure we don't exceed the range end
              if (sample < end) {
                lineIds.push(sample);
              }
            }
          }
          lineIds.push(end);
        } else {
          // Expand the full range
          for (let i = start; i <= end; i++) {
            lineIds.push(i);
          }
        }
      } else if (!Number.isNaN(start)) {
        // If only start is valid, just use it
        lineIds.push(start);
      }
    } else {
      // Single number
      const num = parseInt(trimmed, 10);
      if (!Number.isNaN(num)) {
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
export function getCitationStatus(verification: Verification | null | undefined): CitationStatus {
  const status = verification?.status;

  const isMiss = ["not_found"].includes(status || "");

  // Partial matches: something found but not ideal (amber indicator)
  const isPartialMatch = [
    "found_anchor_text_only", // Only anchor text found, not full phrase
    "partial_text_found",
    "found_on_other_page",
    "found_on_other_line",
    "first_word_found",
  ].includes(status || "");

  // Verified: exact match or partial match (green or amber indicator)
  const isVerified = ["found", "found_phrase_missed_anchor_text"].includes(status || "") || isPartialMatch;

  const isPending = ["pending", "loading", null, undefined].includes(status);

  return { isVerified, isMiss, isPartialMatch, isPending };
}

export const parseCitation = (
  fragment: string,
  mdAttachmentId?: string | null,
  citationCounterRef?: { current: number } | null,
  isVerbose?: boolean,
) => {
  // Helper: Remove wrapper quotes and fully unescape content
  // Handles: \' -> ', \" -> ", \n -> space, \\ -> \
  const cleanAndUnescape = (str?: string) => {
    if (!str) return undefined;
    let result = str;
    // Remove surrounding quotes if present, but only if not escaped
    // Check start: remove leading quote only if it exists
    if (result.startsWith("'") || result.startsWith('"')) {
      result = result.slice(1);
    }
    // Check end: remove trailing quote only if it's not escaped (not preceded by \)
    if ((result.endsWith("'") || result.endsWith('"')) && !result.endsWith("\\'") && !result.endsWith('\\"')) {
      result = result.slice(0, -1);
    }
    // Replace escaped double quotes with actual double quotes
    result = result.replace(/\\"/g, '"');
    // Replace escaped single quotes with actual single quotes
    result = result.replace(/\\'/g, "'");
    // Replace literal \n sequences with spaces (newlines in attribute values)
    result = result.replace(/\\n/g, " ");
    // Replace double backslashes with single backslash
    result = result.replace(/\\\\/g, "\\");
    return result;
  };

  const citationNumber = citationCounterRef?.current ? citationCounterRef.current++ : undefined;

  const afterCite = fragment.includes("/>") ? fragment.slice(fragment.indexOf("/>") + 2) : "";
  const middleCite = fragment.substring(fragment.indexOf("<cite"), fragment.indexOf("/>") + 2);

  const extractAttribute = (tag: string, attrNames: string[]): string | undefined => {
    for (const name of attrNames) {
      const regex = getAttributeRegex(name);
      const match = tag.match(regex);
      if (match) {
        return match[1];
      }
    }
    return undefined;
  };

  // Extract all attributes by name (order-independent)
  // Alias lists are derived from the centralized field alias map (utils/fieldAliases.ts)
  const rawAttachmentId = extractAttribute(middleCite, getFieldAliases("attachmentId"));
  const attachmentId = rawAttachmentId?.length === 20 ? rawAttachmentId : mdAttachmentId || rawAttachmentId;

  const startPageIdRaw = extractAttribute(middleCite, getFieldAliases("startPageId"));
  let pageNumber: number | undefined;
  let pageIndex: number | undefined;
  if (startPageIdRaw) {
    // Performance fix: use module-level compiled regex
    const pageMatch = startPageIdRaw.match(PAGE_ID_FULL_REGEX);
    if (pageMatch) {
      pageNumber = parseInt(pageMatch[1], 10);
      pageIndex = parseInt(pageMatch[2], 10);
    }
  }

  // Use helper to handle escaped quotes inside the phrase
  const fullPhrase = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("fullPhrase")));
  const anchorText = cleanAndUnescape(
    extractAttribute(middleCite, getFieldAliases("anchorText")),
  );
  const reasoning = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("reasoning")));
  const value = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("value")));

  let lineIds: number[] | undefined;
  try {
    const lineIdsRaw = extractAttribute(middleCite, getFieldAliases("lineIds"));
    const lineIdsString = lineIdsRaw?.replace(/[A-Za-z_[\](){}:]/g, "");
    lineIds = lineIdsString ? parseLineIds(lineIdsString) : undefined;
  } catch (e) {
    if (isVerbose) console.error("Error parsing lineIds", e);
  }

  // Extract URL-specific attributes
  const url = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("url")));
  const domain = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("domain")));
  const title = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("title")));
  const description = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("description")));
  const siteName = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("siteName")));
  const faviconUrl = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("faviconUrl")));

  // Determine citation type: URL citation if url is present and no attachmentId
  const citation: Citation =
    url && !attachmentId
      ? ({
          type: "url" as const,
          url,
          domain,
          title,
          description,
          siteName,
          faviconUrl,
          fullPhrase,
          anchorText: anchorText || value,
          citationNumber,
          reasoning,
        } as UrlCitation)
      : ({
          type: "document" as const,
          attachmentId: attachmentId,
          pageNumber,
          startPageId: `page_number_${pageNumber || 1}_index_${pageIndex || 0}`,
          fullPhrase,
          anchorText: anchorText || value,
          citationNumber,
          lineIds,
          reasoning,
        } as DocumentCitation);

  return {
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
const parseJsonCitation = (jsonCitation: unknown, citationNumber?: number): Citation | null => {
  if (!jsonCitation || typeof jsonCitation !== "object") {
    return null;
  }

  // Type assertion after runtime check - we've verified it's an object
  const obj = jsonCitation as Record<string, unknown>;

  // Resolve field names using centralized alias map (handles camelCase, snake_case,
  // kebab-case, and shortened LLM variants like "anchor" → anchorText)
  const fullPhraseValue = resolveField(obj, "fullPhrase");
  const fullPhrase = typeof fullPhraseValue === "string" ? fullPhraseValue : undefined;

  const startPageIdValue = resolveField(obj, "startPageId");
  const startPageId = typeof startPageIdValue === "string" ? startPageIdValue : undefined;

  const anchorTextValue = resolveField(obj, "anchorText");
  const anchorText = typeof anchorTextValue === "string" ? anchorTextValue : undefined;

  const rawLineIdsValue = resolveField(obj, "lineIds");
  const rawLineIds = Array.isArray(rawLineIdsValue) ? rawLineIdsValue : undefined;

  const attachmentIdValue = resolveField(obj, "attachmentId");
  const attachmentId = typeof attachmentIdValue === "string" ? attachmentIdValue : undefined;

  const reasoningValue = resolveField(obj, "reasoning");
  const reasoning = typeof reasoningValue === "string" ? reasoningValue : undefined;

  const valueValue = resolveField(obj, "value");
  const value = typeof valueValue === "string" ? valueValue : undefined;

  if (!fullPhrase) {
    return null;
  }

  // Parse startPageId format: "page_number_PAGE_index_INDEX" or simple "PAGE_INDEX"
  let pageNumber: number | undefined;
  if (startPageId) {
    // Try full format first: page_number_5_index_2 or pageId_5_index_2
    // Performance fix: use module-level compiled regex
    // Security fix: use safeMatch to prevent ReDoS on untrusted JSON input
    const pageMatch = safeMatch(startPageId, PAGE_ID_SIMPLE_REGEX);
    if (pageMatch) {
      pageNumber = parseInt(pageMatch[1], 10);
    } else {
      // Try simple n_m format: 5_4 (page 5, index 4)
      const simpleMatch = safeMatch(startPageId, SIMPLE_PAGE_INDEX_REGEX);
      if (simpleMatch) {
        pageNumber = parseInt(simpleMatch[1], 10);
      }
    }
  }

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
      fullPhrase,
      citationNumber,
      anchorText: anchorText || value,
      reasoning,
    };
    return citation;
  }

  const citation: DocumentCitation = {
    type: "document",
    attachmentId,
    pageNumber,
    fullPhrase,
    citationNumber,
    lineIds,
    anchorText: anchorText || value,
    reasoning,
  };

  return citation;
};

/**
 * All known aliases for detection-relevant citation fields.
 * Built once at module load from the centralized alias map.
 */
const CITATION_DETECT_KEYS = new Set([
  ...getFieldAliases("fullPhrase"),
  ...getFieldAliases("startPageId"),
  ...getFieldAliases("anchorText"),
  ...getFieldAliases("lineIds"),
]);

const URL_DETECT_KEYS = new Set(getFieldAliases("url"));
const PHRASE_DETECT_KEYS = new Set(getFieldAliases("fullPhrase"));

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

  // URL citation: needs both a URL alias and a fullPhrase alias
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
    if (citation?.fullPhrase) {
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
 * Extracts XML citations from text using <cite ... /> tags.
 */
const extractXmlCitations = (text: string): CitationRecord => {
  const normalizedText = normalizeCitations(text);

  // Find all <cite ... /> tags
  // Performance fix: use module-level compiled regex (create fresh instance to reset lastIndex)
  const citeRegex = new RegExp(CITE_TAG_REGEX.source, CITE_TAG_REGEX.flags);
  const matches = normalizedText.match(citeRegex);

  if (!matches || matches.length === 0) return {};

  const citations: CitationRecord = {};
  const citationCounterRef = { current: 1 };

  for (const match of matches) {
    const { citation } = parseCitation(match, undefined, citationCounterRef);
    if (citation?.fullPhrase) {
      const citationKey = getCitationKey(citation);
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
 *   console.log(`Citation ${citationKey}:`, citation.fullPhrase);
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

    // Also stringify and parse for embedded XML citations in markdown
    const text = JSON.stringify(llmOutput);
    const xmlCitations = extractXmlCitations(text);
    Object.assign(citations, xmlCitations);
  } else if (typeof llmOutput === "string") {
    // Check for deferred JSON format (<<<CITATION_DATA>>>)
    if (hasDeferredCitations(llmOutput)) {
      const deferredCitations = getAllCitationsFromDeferredResponse(llmOutput);
      Object.assign(citations, deferredCitations);
    }
    // Also parse for XML citations (both formats can coexist)
    const xmlCitations = extractXmlCitations(llmOutput);
    Object.assign(citations, xmlCitations);
  }

  return citations;
};

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

  // Normalize input to entries
  const entries: [string, Citation][] = Array.isArray(citations)
    ? citations.map((c, idx) => [getCitationKey(c) || String(idx + 1), c])
    : Object.entries(citations);

  for (const [key, citation] of entries) {
    const attachmentId = (citation.type !== "url" ? citation.attachmentId : undefined) || "";

    if (!grouped.has(attachmentId)) {
      grouped.set(attachmentId, {});
    }

    const group = grouped.get(attachmentId);
    if (group) {
      group[key] = citation;
    }
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

  // Normalize input to entries
  const entries: [string, Citation][] = Array.isArray(citations)
    ? citations.map((c, idx) => [getCitationKey(c) || String(idx + 1), c])
    : Object.entries(citations);

  for (const [key, citation] of entries) {
    const attachmentId = (citation.type !== "url" ? citation.attachmentId : undefined) || "";

    // Only assign if both attachmentId and key are safe (prevents prototype pollution)
    if (!isSafeKey(attachmentId) || !isSafeKey(key)) {
      continue;
    }

    // attachmentId and key are guaranteed safe by isSafeKey checks above (line 696)
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
 * @example
 * ```typescript
 * // External data missing the discriminator
 * const raw = { url: "https://example.com", fullPhrase: "..." };
 * const citation = normalizeCitationType(raw); // { type: "url", url: "...", fullPhrase: "..." }
 * ```
 */
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
 * const raw = { url: "https://example.com", fullPhrase: "..." };
 * const citation = normalizeCitationType(raw); // { type: "url", url: "...", fullPhrase: "..." }
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
