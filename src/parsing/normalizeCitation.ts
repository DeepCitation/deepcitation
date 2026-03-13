import type { Citation, DocumentCitation, UrlCitation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { getCitationKey } from "../utils/citationKey.js";
import { getFieldAliases, resolveFieldNameSnake } from "../utils/fieldAliases.js";
import { createSafeObject, safeAssign } from "../utils/objectSafety.js";
import { expandRange } from "../utils/rangeExpansion.js";
import { validateRegexInput } from "../utils/regexSafety.js";
import { getVerificationTextIndicator } from "../utils/verificationIndicator.js";

/**
 * Module-level compiled regexes for hot-path operations.
 * Compiled once at module load to avoid per-call recompilation.
 */
const PAGE_NUMBER_REGEX = /page[_a-zA-Z]*(\d+)/;
/**
 * Global regex used exclusively via String.prototype.replace(), which resets
 * lastIndex to 0 per spec (ES2023 §22.2.5.11 step 5) before iterating.
 * No manual lastIndex reset is needed.
 */
const RANGE_EXPANSION_REGEX = /(\d+)-(\d+)/g;

export interface ReplaceCitationsOptions {
  /**
   * If true, leaves the anchor_text text behind when removing citations.
   * @default false
   */
  leaveAnchorTextBehind?: boolean;

  /**
   * Map of citation keys to verification results.
   * Used to determine verification status for each citation.
   */
  verifications?: Record<string, Verification>;

  /**
   * If true and verifications are provided, appends a verification status indicator.
   * Uses: ✓ (verified), ⚠ (partial), ✗ (not found), ◌ (pending)
   * @default false
   */
  showVerificationStatus?: boolean;
}

/**
 * Parse attributes from a cite tag in any order.
 * Returns an object with all found attributes.
 */
const parseCiteAttributes = (citeTag: string): Record<string, string | undefined> => {
  const attrs: Record<string, string | undefined> = {};

  // Security: validate input length before regex operations to prevent ReDoS.
  // The direct length check (visible to static analysis) supplements validateRegexInput()
  // which CodeQL cannot trace through function boundaries.
  validateRegexInput(citeTag);
  if (citeTag.length > 5000) return attrs;

  // Match attribute patterns: key='value' or key="value"
  const attrRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\2/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(citeTag)) !== null) {
    const key = match[1]
      .toLowerCase()
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase();
    const value = match[3];

    const normalizedKey = resolveFieldNameSnake(key);

    attrs[normalizedKey] = value;
  }

  return attrs;
};

/**
 * Replaces citation tags in markdown text with optional replacement content.
 *
 * @param markdownWithCitations - The text containing <cite /> tags
 * @param options - Configuration options
 * @returns The text with citations replaced
 *
 * @example
 * ```typescript
 * // Remove all citations
 * const clean = replaceCitations(llmOutput);
 *
 * // Leave anchor_text text behind
 * const withAnchorTexts = replaceCitations(llmOutput, { leaveAnchorTextBehind: true });
 *
 * // Show verification status indicators
 * const withStatus = replaceCitations(llmOutput, {
 *   leaveAnchorTextBehind: true,
 *   verifications: verificationMap,
 *   showVerificationStatus: true,
 * });
 * // Output: "Revenue grew 45% year-over-year Revenue Growth✓"
 * ```
 */
export const replaceCitations = (markdownWithCitations: string, options: ReplaceCitationsOptions = {}): string => {
  // Security: validate input length before regex operations to prevent ReDoS
  validateRegexInput(markdownWithCitations);

  const { leaveAnchorTextBehind = false, verifications, showVerificationStatus = false } = options;

  // Track citation index for matching with numbered verification keys
  let citationIndex = 0;

  // Linear-time cite tag replacement using indexOf instead of regex.
  // Avoids polynomial backtracking that CodeQL flags in regex-based matching.
  const replaceCiteTag = (match: string): string => {
    citationIndex++;
    const attrs = parseCiteAttributes(match);

    // Determine what to output
    let output = "";

    if (leaveAnchorTextBehind && attrs.anchor_text) {
      // Unescape the anchor_text value
      output = attrs.anchor_text.replace(/\\'/g, "'").replace(/\\"/g, '"');
    }

    // Add verification status if requested
    if (showVerificationStatus && verifications) {
      // Try to find verification by various key strategies
      let verification: Verification | undefined;

      // Build a Citation object from parsed attributes to generate the key
      const parsePageNumber = (startPageId?: string): number | undefined => {
        if (!startPageId) return undefined;
        if (startPageId.length > 200) return undefined;
        // Performance fix: use module-level compiled regex
        // Note: parent replaceCitations() already validated the full input
        const match = startPageId.match(PAGE_NUMBER_REGEX);
        return match ? parseInt(match[1], 10) : undefined;
      };

      const parseLineIds = (lineIdsStr?: string): number[] | undefined => {
        if (!lineIdsStr) return undefined;
        if (lineIdsStr.length > 500) return undefined;

        // Expand ranges (e.g., "62-63" -> "62,63") using shared helper
        const expanded = lineIdsStr.replace(RANGE_EXPANSION_REGEX, (_match, start, end) => {
          const startNum = parseInt(start, 10);
          const endNum = parseInt(end, 10);
          if (startNum <= endNum) {
            return expandRange(startNum, endNum).join(",");
          }
          return start;
        });

        const nums = expanded
          .split(",")
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !Number.isNaN(n));
        return nums.length > 0 ? nums : undefined;
      };

      // Unescape quotes in fullPhrase and anchorText to match how citations are parsed
      // by getAllCitationsFromLlmOutput (which returns unescaped values)
      const unescapeQuotes = (str: string | undefined): string | undefined =>
        str?.replace(/\\'/g, "'").replace(/\\"/g, '"');

      const citation: Citation = {
        type: "document",
        attachmentId: attrs.attachment_id,
        pageNumber: parsePageNumber(attrs.start_page_id),
        fullPhrase: unescapeQuotes(attrs.full_phrase),
        anchorText: unescapeQuotes(attrs.anchor_text),
        lineIds: parseLineIds(attrs.line_ids),
      };

      // Strategy 1: Match by citationKey (hash) - most reliable
      const citationKey = getCitationKey(citation);
      verification = verifications[citationKey];

      // Strategy 2: Fall back to numbered keys (1, 2, 3, etc.)
      if (!verification) {
        const numericKey = String(citationIndex);
        verification = verifications[numericKey];
      }

      const indicator = getVerificationTextIndicator(verification);
      output = output ? `${output}${indicator}` : indicator;
    }

    return output;
  };

  // Scan for <cite ... /> tags using indexOf — O(n) guaranteed
  let result = "";
  let lastIndex = 0;
  let pos = 0;
  const OPEN = "<cite ";

  while (pos < markdownWithCitations.length) {
    const start = markdownWithCitations.indexOf(OPEN, pos);
    if (start === -1) break;

    const end = markdownWithCitations.indexOf("/>", start + OPEN.length);
    if (end === -1) break;

    const tag = markdownWithCitations.substring(start, end + 2);
    result += markdownWithCitations.substring(lastIndex, start);
    result += replaceCiteTag(tag);
    lastIndex = end + 2;
    pos = end + 2;
  }

  result += markdownWithCitations.substring(lastIndex);
  return result;
};

/**
 * Extracts content from a non-self-closing citation tag and moves it before the citation.
 * Converts <cite ...>content</cite> to: content<cite ... />
 *
 * @param citePart - The citation part that may contain inner content
 * @returns The normalized citation with content moved before it
 */
const extractAndRelocateCitationContent = (citePart: string): string => {
  // Check if this is a non-self-closing citation: <cite ...>content</cite>
  // Match: <cite with attributes> then content then </cite>
  // The attribute regex handles escaped quotes: (?:[^'\\]|\\.)* matches non-quote/non-backslash OR backslash+any
  const nonSelfClosingMatch = citePart.match(
    /^(<cite\s+(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[^'">/])*>)([\s\S]*?)<\/cite>$/,
  );

  if (!nonSelfClosingMatch) {
    // Check if this is an unclosed citation ending with just >
    // Pattern: <cite attributes> (no closing tag)
    const unclosedMatch = citePart.match(/^(<cite\s+(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[^'">/])*>)$/);
    if (unclosedMatch) {
      // Convert <cite ... > to self-closing <cite ... />
      const selfClosingTag = unclosedMatch[1].replace(/>$/, " />");
      return normalizeCitationContent(selfClosingTag);
    }
    // Already self-closing or doesn't match pattern, normalize as-is
    return normalizeCitationContent(citePart);
  }

  const [, openingTag, innerContent] = nonSelfClosingMatch;

  // If there's no inner content, just normalize the citation
  if (!innerContent || !innerContent.trim()) {
    return normalizeCitationContent(citePart);
  }

  // Extract the attributes from the opening tag
  // Convert <cite attributes> to <cite attributes />
  const selfClosingTag = openingTag.replace(/>$/, " />");

  // Move inner content before the citation and normalize
  // The inner content is trimmed to avoid extra whitespace issues
  const relocatedContent = innerContent.trim();

  // Normalize the self-closing citation tag
  const normalizedCitation = normalizeCitationContent(selfClosingTag);

  // Return content followed by the citation
  return relocatedContent + normalizedCitation;
};

export const normalizeCitations = (response: string): string => {
  let trimmedResponse = response?.trim() || "";

  // Fix missing < before cite tags
  // LLMs sometimes output 'cite' without the leading '<'
  // Match 'cite' followed by a space and attribute pattern, but NOT preceded by '<' or a letter
  // This avoids matching words like "excite" or "recite"
  trimmedResponse = trimmedResponse.replace(
    /(?<![<a-zA-Z])cite\s+(attachment_id|file_id|fileId|attachmentId)\s*=/gi,
    "<cite $1=",
  );

  // Split on citation tags - captures three patterns:
  // 1. Self-closing: <cite ... />
  // 2. With closing tag: <cite ...>content</cite>
  // 3. Unclosed (ends with >): <cite ...> (no closing tag, no </cite> anywhere after)
  // Pattern 3 uses negative lookahead to avoid matching when </cite> follows
  const citationParts = trimmedResponse.split(/(<cite[\s\S]*?(?:\/>|<\/cite>|>(?=\s*$|[\r\n])(?![\s\S]*<\/cite>)))/gm);
  if (citationParts.length <= 1) {
    // Handle unclosed citations by converting to self-closing
    const unclosedMatch = trimmedResponse.match(/<cite\s+(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[^'">/])*>/g);
    if (unclosedMatch && unclosedMatch.length > 0) {
      const result = trimmedResponse.replace(/<cite\s+(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[^'">/])*>/g, match =>
        match.replace(/>$/, " />"),
      );
      return normalizeCitationContent(result);
    }
    return normalizeCitationContent(trimmedResponse);
  }

  trimmedResponse = citationParts
    .map(part => (part.startsWith("<cite") ? extractAndRelocateCitationContent(part) : part))
    .join("");

  return trimmedResponse;
};

// resolveFieldNameSnake already lowercases internally, so no wrapper needed.

/** HTML entity decode map — compiled once at module load. */
const HTML_ENTITY_MAP: Record<string, string> = {
  "&quot;": '"',
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
};
const HTML_ENTITY_REGEX = /&(?:quot|apos|lt|gt|amp);/g;
const decodeHtmlEntities = (str: string): string => {
  return str.replace(HTML_ENTITY_REGEX, match => HTML_ENTITY_MAP[match] || match);
};

/** Regex for text-valued cite attributes — compiled once at module load. */
const TEXT_ATTRIBUTE_REGEX =
  /(fullPhrase|full_phrase|anchorText|anchor_text|keySpan|key_span|reasoning|value)\s*=\s*(['"])([\s\S]*?)(?=\s+(?:line_ids|lineIds|timestamps|fileId|file_id|attachmentId|attachment_id|start_page_id|start_pageId|startPageId|start_page_key|start_pageKey|startPageKey|anchorText|anchor_text|keySpan|key_span|reasoning|value|full_phrase)\s*=|\s*\/>|['"]>)/gm;

/** Regex for line_ids/timestamps attributes — compiled once at module load. */
const LINE_IDS_ATTRIBUTE_REGEX = /(line_ids|lineIds|timestamps)=['"]?([[\](){}A-Za-z0-9_\-, ]+)['"]?(\s*\/?>|\s+)/gm;

const normalizeCitationContent = (input: string): string => {
  let normalized = input;

  // 0. Unescape all backslash-escaped underscores
  // This handles Markdown-processed output where underscores get escaped (e.g., attachment\_id -> attachment_id, page\_number\_1 -> page_number_1)
  normalized = normalized.replace(/\\_/g, "_");

  // 1. Standardize self-closing tags
  // Replace ></cite> with /> for consistency
  normalized = normalized.replace(/><\/cite>/g, "/>");

  normalized = normalized.replace(TEXT_ATTRIBUTE_REGEX, (_match, key, openQuote, rawContent) => {
    let content = rawContent;

    if (content.endsWith(openQuote)) {
      content = content.slice(0, -1);
    }

    // Flatten newlines and remove markdown markers
    content = content.replace(/(\r?\n)+|(\*|_){2,}|\*/g, (match: string) => {
      if (match.includes("\n") || match.includes("\r")) return " ";
      return "";
    });

    content = decodeHtmlEntities(content);

    // Normalize quotes in a single pass: match any backslash sequences followed by
    // a quote character and replace with a consistently escaped quote.
    // This avoids CodeQL js/incomplete-sanitization warnings from chained .replace()
    // calls where earlier replacements can reintroduce patterns matched by later ones.
    content = content.replace(/\\*(['"])/g, (_: string, quote: string) => `\\${quote}`);

    return `${resolveFieldNameSnake(key)}='${content}'`;
  });
  normalized = normalized.replace(LINE_IDS_ATTRIBUTE_REGEX, (_match, key, rawValue, trailingChars) => {
    // Clean up the value (remove generic text, keep numbers/separators)
    let cleanedValue = rawValue.replace(/[A-Za-z[\](){}]/g, "");

    // Expand ranges (e.g., "1-3" -> "1,2,3") using shared helper
    cleanedValue = cleanedValue.replace(RANGE_EXPANSION_REGEX, (_rangeMatch: string, start: string, end: string) => {
      const startNum = parseInt(start, 10);
      const endNum = parseInt(end, 10);

      if (startNum <= endNum) {
        return expandRange(startNum, endNum).join(",");
      }
      return String(startNum);
    });

    // Normalize commas
    cleanedValue = cleanedValue.replace(/,+/g, ",").replace(/^,|,$/g, "");

    // Return standardized format: key='value' + preserved trailing characters (space or />)
    return `${resolveFieldNameSnake(key)}='${cleanedValue}'${trailingChars}`;
  });

  // 4. Re-order <cite ... /> attributes to match the strict parsing expectations in `citationParser.ts`
  // (the parser uses regexes that assume a canonical attribute order).
  const reorderCiteTagAttributes = (tag: string): string => {
    // Match both single-quoted and double-quoted attributes
    const attrRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['"])([^'"\\\n]*(?:\\.[^'"\\\n]*)*)(?:\2)/g;
    // Use safe object to prevent prototype pollution
    const attrs = createSafeObject<string>();
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(tag)) !== null) {
      const rawKey = match[1];
      const value = match[3]; // match[2] is the quote character
      const key = resolveFieldNameSnake(rawKey);
      // Security: use safeAssign to prevent prototype pollution (rejects __proto__, constructor, prototype)
      safeAssign(attrs, key, value);
    }

    // If we didn't find any parsable attrs, don't touch the tag.
    const keys = Object.keys(attrs);
    if (keys.length === 0) return tag;

    const hasTimestamps = typeof attrs.timestamps === "string" && attrs.timestamps.length > 0;
    const startPageIds = keys.filter(k => k.startsWith("start_page"));

    const ordered: string[] = [];

    // Shared first
    if (attrs.attachment_id) ordered.push("attachment_id");

    if (hasTimestamps) {
      // AV citations: attachment_id, full_phrase, anchor_text, timestamps, (optional reasoning/value), then any extras
      if (attrs.full_phrase) ordered.push("full_phrase");
      if (attrs.anchor_text) ordered.push("anchor_text");
      ordered.push("timestamps");
    } else {
      // Document citations: attachment_id, start_page*, full_phrase, anchor_text, line_ids, (optional reasoning/value), then any extras
      if (startPageIds.includes("start_page_id")) ordered.push("start_page_id");
      for (const k of startPageIds.filter(k => k !== "start_page_id").sort()) {
        ordered.push(k);
      }

      if (attrs.full_phrase) ordered.push("full_phrase");
      if (attrs.anchor_text) ordered.push("anchor_text");
      if (attrs.line_ids) ordered.push("line_ids");
    }

    // Optional attrs supported by the parser (but not required)
    if (attrs.reasoning) ordered.push("reasoning");
    if (attrs.value) ordered.push("value");

    // Any remaining attributes, stable + deterministic (alpha)
    const used = new Set(ordered);
    for (const k of keys.filter(k => !used.has(k)).sort()) {
      ordered.push(k);
    }

    const rebuiltAttrs = ordered.map(k => `${k}='${attrs[k]}'`).join(" ");
    return `<cite ${rebuiltAttrs} />`;
  };

  normalized = normalized.replace(/<cite\b[\s\S]*?\/>/gm, tag => reorderCiteTagAttributes(tag));

  return normalized;
};

// ─── parseCitation: XML cite tag parser ──────────────────────────

const PAGE_ID_FULL_REGEX = /page[_a-zA-Z]*(\d+)_index_(\d+)/;

const attributeRegexCache = new Map<string, RegExp>();

function getAttributeRegex(name: string): RegExp {
  let regex = attributeRegexCache.get(name);
  if (!regex) {
    regex = new RegExp(`${name}='((?:[^'\\\\]|\\\\.)*)'`);
    attributeRegexCache.set(name, regex);
  }
  return regex;
}

function parseLineIds(lineIdsString: string): number[] | undefined {
  if (!lineIdsString) return undefined;

  const lineIds: number[] = [];
  const parts = lineIdsString.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
        lineIds.push(...expandRange(start, end));
      } else if (!Number.isNaN(start)) {
        lineIds.push(start);
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!Number.isNaN(num)) {
        lineIds.push(num);
      }
    }
  }

  if (lineIds.length === 0) return undefined;
  return [...new Set(lineIds)].sort((a, b) => a - b);
}

/**
 * Strips surrounding quotes and unescapes common escape sequences in cite attribute values.
 * Hoisted to module scope to avoid per-call function object allocation.
 */
const cleanAndUnescape = (str?: string): string | undefined => {
  if (!str) return undefined;
  let result = str;
  if (result.startsWith("'") || result.startsWith('"')) {
    result = result.slice(1);
  }
  if ((result.endsWith("'") || result.endsWith('"')) && !result.endsWith("\\'") && !result.endsWith('\\"')) {
    result = result.slice(0, -1);
  }
  result = result.replace(/\\"/g, '"');
  result = result.replace(/\\'/g, "'");
  result = result.replace(/\\n/g, " ");
  result = result.replace(/\\\\/g, "\\");
  return result;
};

export const parseCitation = (
  fragment: string,
  mdAttachmentId?: string | null,
  citationCounterRef?: { current: number } | null,
  isVerbose?: boolean,
) => {
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

  const rawAttachmentId = extractAttribute(middleCite, getFieldAliases("attachmentId"));
  const attachmentId = rawAttachmentId?.length === 20 ? rawAttachmentId : mdAttachmentId || rawAttachmentId;

  const startPageIdRaw = extractAttribute(middleCite, getFieldAliases("startPageId"));
  let pageNumber: number | undefined;
  let pageIndex: number | undefined;
  if (startPageIdRaw) {
    const pageMatch = startPageIdRaw.match(PAGE_ID_FULL_REGEX);
    if (pageMatch) {
      pageNumber = parseInt(pageMatch[1], 10);
      pageIndex = parseInt(pageMatch[2], 10);
    }
  }

  const fullPhrase = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("fullPhrase")));
  const anchorText = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("anchorText")));
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

  const url = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("url")));
  const domain = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("domain")));
  const title = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("title")));
  const description = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("description")));
  const siteName = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("siteName")));
  const faviconUrl = cleanAndUnescape(extractAttribute(middleCite, getFieldAliases("faviconUrl")));

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
