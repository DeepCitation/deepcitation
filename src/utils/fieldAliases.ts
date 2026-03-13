/**
 * Centralized field-name alias map for LLM citation output normalization.
 *
 * LLMs are non-deterministic in their naming: the same model might emit
 * `anchor_text`, `anchorText`, `anchor-text`, or just `anchor` across
 * different responses. This module provides a single source of truth
 * for mapping all known variants back to our canonical camelCase names.
 *
 * Used by:
 * - JSON citation parsing (parseCitation.ts)
 * - Any future parsing path that consumes LLM citation output
 */

/**
 * Canonical camelCase field name → all known LLM aliases.
 *
 * Aliases are stored in their natural casing so that `resolveField()` can
 * do exact object-key lookups (JS object keys are case-sensitive).
 * For case-insensitive name resolution, `resolveFieldName()` lowercases
 * the input before lookup.
 *
 * To add a new alias: append it to the relevant array.
 * To add a new field: add a new entry with its aliases.
 */
const FIELD_ALIAS_MAP: Record<string, readonly string[]> = {
  // === CitationBase fields ===
  attachmentId: ["attachment_id", "attachment-id", "file_id", "fileId", "file-id"],
  pageNumber: ["page_number", "page-number", "page"],
  lineIds: ["line_ids", "line-ids", "lines"],
  startPageId: [
    "start_page_id",
    "start-page-id",
    "start_pageid",
    "page_id",
    "pageId",
    "page-id",
    "start_page_key",
    "startPageKey",
    "start-page-key",
    "start_pagekey",
    "page_key",
    "pageKey",
    "page-key",
    "start_page",
    "start-page",
  ],
  fullPhrase: ["full_phrase", "full-phrase", "phrase", "full"],
  anchorText: ["anchor_text", "anchor-text", "anchor", "keySpan", "key_span", "key-span"],
  citationNumber: ["citation_number", "citation-number", "number"],
  reasoning: [],
  value: [],

  // === UrlCitation fields ===
  url: ["URL", "uri", "href", "link"],
  domain: [],
  title: [],
  description: ["desc"],
  faviconUrl: ["favicon_url", "favicon-url", "favicon"],
  siteName: ["site_name", "site-name"],
  sourceType: ["source_type", "source-type"],

  // === AudioVideoCitation fields ===
  timestamps: ["timestamp"],
};

/**
 * Reverse lookup: lowercased alias → canonical camelCase name.
 * Built once at module load.
 */
const ALIAS_TO_CANONICAL = new Map<string, string>();

for (const [canonical, aliases] of Object.entries(FIELD_ALIAS_MAP)) {
  // Map the canonical name itself (lowercased)
  ALIAS_TO_CANONICAL.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
  }
}

/**
 * Canonical camelCase → snake_case mapping for XML normalization.
 * Built once at module load.
 */
const CANONICAL_TO_SNAKE: Record<string, string> = {
  attachmentId: "attachment_id",
  pageNumber: "page_number",
  lineIds: "line_ids",
  startPageId: "start_page_id",
  fullPhrase: "full_phrase",
  anchorText: "anchor_text",
  citationNumber: "citation_number",
  faviconUrl: "favicon_url",
  siteName: "site_name",
  sourceType: "source_type",
};

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Resolves any LLM field name variant to the canonical camelCase name.
 * Case-insensitive. Returns the input unchanged if no alias is found.
 *
 * @example
 * resolveFieldName("anchor_text")  // "anchorText"
 * resolveFieldName("anchor-text")  // "anchorText"
 * resolveFieldName("anchor")       // "anchorText"
 * resolveFieldName("anchorText")   // "anchorText"
 * resolveFieldName("unknown_field") // "unknown_field"
 */
export function resolveFieldName(name: string): string {
  return ALIAS_TO_CANONICAL.get(name.toLowerCase()) ?? name;
}

/**
 * Resolves an LLM field name to its snake_case form for XML attributes.
 * Falls back to the lowercase input if no alias is found.
 *
 * @example
 * resolveFieldNameSnake("anchorText")   // "anchor_text"
 * resolveFieldNameSnake("anchor-text")  // "anchor_text"
 * resolveFieldNameSnake("anchor")       // "anchor_text"
 * resolveFieldNameSnake("unknown")      // "unknown"
 */
export function resolveFieldNameSnake(name: string): string {
  const canonical = ALIAS_TO_CANONICAL.get(name.toLowerCase());
  if (!canonical) return name.toLowerCase();
  return CANONICAL_TO_SNAKE[canonical] ?? canonical;
}

/**
 * Looks up a value from an object by trying the canonical name, then all
 * aliases of that field. Returns the first defined value found, or undefined.
 *
 * Aliases are tried in their natural casing (exact match against object keys),
 * which is correct because JS object keys are case-sensitive.
 *
 * @example
 * resolveField({ anchor_text: "hello" }, "anchorText") // "hello"
 * resolveField({ anchor: "world" }, "anchorText")      // "world"
 * resolveField({ startPageKey: "p1" }, "startPageId")  // "p1"
 */
export function resolveField(obj: Record<string, unknown>, canonicalName: string): unknown {
  // Try canonical name first
  if (obj[canonicalName] !== undefined) return obj[canonicalName];

  const aliases = FIELD_ALIAS_MAP[canonicalName];
  if (!aliases) return undefined;

  for (const alias of aliases) {
    if (obj[alias] !== undefined) return obj[alias];
  }
  return undefined;
}

/**
 * Returns all known aliases for a canonical field name, including the
 * canonical name itself. Useful for building XML attribute extraction lists.
 *
 * @example
 * getFieldAliases("anchorText")
 * // ["anchorText", "anchor_text", "anchor-text", "anchor", "key_span", "keySpan", "key-span"]
 */
export function getFieldAliases(canonicalName: string): string[] {
  const aliases = FIELD_ALIAS_MAP[canonicalName];
  if (!aliases) return [canonicalName];
  return [canonicalName, ...aliases];
}

/**
 * Normalizes all field names in a citation-like object to canonical camelCase.
 * Returns a new object — does not mutate the input.
 *
 * Unknown fields are passed through unchanged.
 *
 * @example
 * normalizeCitationFields({ "anchor-text": "hello", full_phrase: "world" })
 * // { anchorText: "hello", fullPhrase: "world" }
 */
export function normalizeCitationFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const canonical = resolveFieldName(key);
    // First writer wins — if both "anchor_text" and "anchorText" exist,
    // whichever appears first in Object.entries() takes precedence.
    if (!(canonical in result)) {
      result[canonical] = value;
    }
  }
  return result;
}
