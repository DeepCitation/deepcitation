import type { Verification } from "../types/verification.js";
import { getCitationStatus } from "./parseCitation.js";

export interface ReplaceCitationsOptions {
  /**
   * If true, leaves the key_span text behind when removing citations.
   * @default false
   */
  leaveKeySpanBehind?: boolean;

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
const parseCiteAttributes = (
  citeTag: string
): Record<string, string | undefined> => {
  const attrs: Record<string, string | undefined> = {};

  // Match attribute patterns: key='value' or key="value"
  const attrRegex =
    /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(['"])((?:[^'"\\]|\\.)*)\2/g;
  let match;

  while ((match = attrRegex.exec(citeTag)) !== null) {
    const key = match[1]
      .toLowerCase()
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase();
    const value = match[3];

    // Normalize key names
    const normalizedKey =
      key === "fileid" || key === "file_id" || key === "attachmentid"
        ? "attachment_id"
        : key === "keyspan"
          ? "key_span"
          : key === "fullphrase"
            ? "full_phrase"
            : key === "lineids"
              ? "line_ids"
              : key === "startpagekey" || key === "start_pagekey"
                ? "start_page_key"
                : key;

    attrs[normalizedKey] = value;
  }

  return attrs;
};

/**
 * Get verification status indicator character.
 */
const getVerificationIndicator = (
  verification: Verification | null | undefined
): string => {
  if (!verification) return "◌"; // pending

  const status = getCitationStatus(verification);

  if (status.isPending) return "◌";
  if (status.isMiss) return "✗";
  if (status.isPartialMatch) return "⚠";
  if (status.isVerified) return "✓";

  return "◌";
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
 * // Leave key_span text behind
 * const withKeySpans = replaceCitations(llmOutput, { leaveKeySpanBehind: true });
 *
 * // Show verification status indicators
 * const withStatus = replaceCitations(llmOutput, {
 *   leaveKeySpanBehind: true,
 *   verifications: verificationMap,
 *   showVerificationStatus: true,
 * });
 * // Output: "Revenue grew 45% year-over-year Revenue Growth✓"
 * ```
 */
export const replaceCitations = (
  markdownWithCitations: string,
  options: ReplaceCitationsOptions = {}
): string => {
  const {
    leaveKeySpanBehind = false,
    verifications,
    showVerificationStatus = false,
  } = options;

  // Track citation index for matching with numbered verification keys
  let citationIndex = 0;

  // Flexible regex that matches any <cite ... /> tag
  const citationRegex = /<cite\s+[^>]*?\/>/g;

  return markdownWithCitations.replace(citationRegex, (match) => {
    citationIndex++;
    const attrs = parseCiteAttributes(match);

    // Determine what to output
    let output = "";

    if (leaveKeySpanBehind && attrs.key_span) {
      // Unescape the key_span value
      output = attrs.key_span.replace(/\\'/g, "'").replace(/\\"/g, '"');
    }

    // Add verification status if requested
    if (showVerificationStatus && verifications) {
      // Try to find verification by various key strategies
      let verification: Verification | undefined;

      // Strategy 1: Try numbered keys (1, 2, 3, etc.) - most common
      const numericKey = String(citationIndex);
      verification = verifications[numericKey];

      // Strategy 2: Match by attachment_id
      if (!verification && attrs.attachment_id) {
        for (const [, v] of Object.entries(verifications)) {
          if (v.attachmentId === attrs.attachment_id) {
            verification = v;
            break;
          }
        }
      }

      const indicator = getVerificationIndicator(verification);
      output = output ? `${output}${indicator}` : indicator;
    }

    return output;
  });
};

/**
 * @deprecated Use `replaceCitations` instead. This function is kept for backward compatibility.
 */
export const removeCitations = (
  markdownWithCitations: string,
  leaveKeySpanBehind?: boolean
): string => {
  return replaceCitations(markdownWithCitations, { leaveKeySpanBehind });
};

export const removePageNumberMetadata = (pageText: string): string => {
  return pageText
    .replace(/<page_number_\d+_index_\d+>/g, "")
    .replace(/<\/page_number_\d+_index_\d+>/g, "")
    .trim();
};

export const removeLineIdMetadata = (pageText: string): string => {
  const lineIdRegex = /<line id="[^"]*">|<\/line>/g;
  return pageText.replace(lineIdRegex, "");
};

export const getCitationPageNumber = (
  startPageKey?: string | null
): number | null => {
  //page_number_{page_number}_index_{page_index} or page_number_{page_number} or page_key_{page_number}_index_{page_index}
  if (!startPageKey) return null;

  //regex first \d+ is the page number
  const pageNumber = startPageKey.match(/\d+/)?.[0];
  return pageNumber ? parseInt(pageNumber) : null;
};

export const normalizeCitations = (response: string): string => {
  let trimmedResponse = response?.trim() || "";

  const citationParts = trimmedResponse.split(
    /(<cite[\s\S]*?(?:\/>|<\/cite>))/gm
  );
  if (citationParts.length <= 1) {
    return normalizeCitationContent(trimmedResponse);
  }

  trimmedResponse = citationParts
    .map((part) =>
      part.startsWith("<cite") ? normalizeCitationContent(part) : part
    )
    .join("");

  return trimmedResponse;
};

const normalizeCitationContent = (input: string): string => {
  let normalized = input;

  // 0. Unescape all backslash-escaped underscores
  // This handles Markdown-processed output where underscores get escaped (e.g., attachment\_id -> attachment_id, page\_number\_1 -> page_number_1)
  normalized = normalized.replace(/\\_/g, "_");

  // 1. Standardize self-closing tags
  // Replace ></cite> with /> for consistency
  normalized = normalized.replace(/><\/cite>/g, "/>");

  const canonicalizeCiteAttributeKey = (key: string): string => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "fullphrase" || lowerKey === "full_phrase")
      return "full_phrase";
    if (lowerKey === "lineids" || lowerKey === "line_ids") return "line_ids";
    if (
      lowerKey === "startpagekey" ||
      lowerKey === "start_pagekey" ||
      lowerKey === "start_page_key"
    )
      return "start_page_key";
    if (
      lowerKey === "fileid" ||
      lowerKey === "file_id" ||
      lowerKey === "attachmentid" ||
      lowerKey === "attachment_id"
    )
      return "attachment_id";
    if (lowerKey === "keyspan" || lowerKey === "key_span") return "key_span";
    if (lowerKey === "reasoning" || lowerKey === "value") return lowerKey;
    if (
      lowerKey === "timestamps" ||
      lowerKey === "timestamp" ||
      lowerKey === "timestamps"
    )
      return "timestamps";

    return lowerKey;
  };

  // Helper to decode HTML entities (simple implementation, expand if needed)
  const decodeHtmlEntities = (str: string) => {
    return str
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  };

  // 2. ROBUST TEXT ATTRIBUTE PARSING (reasoning, value, full_phrase)
  // This regex matches: Key = Quote -> Content (lazy) -> Lookahead for (Next Attribute OR End of Tag)
  // It effectively ignores quotes inside the content during the initial capture.
  const textAttributeRegex =
    /(fullPhrase|full_phrase|keySpan|key_span|reasoning|value)\s*=\s*(['"])([\s\S]*?)(?=\s+(?:line_ids|lineIds|timestamps|fileId|file_id|attachmentId|attachment_id|start_page_key|start_pageKey|startPageKey|keySpan|key_span|reasoning|value|full_phrase)|\s*\/?>)/gm;

  normalized = normalized.replace(
    textAttributeRegex,
    (_match, key, openQuote, rawContent) => {
      let content = rawContent;

      // The lazy match usually captures the closing quote because the lookahead
      // starts at the space *after* the attribute. We must strip it.
      if (content.endsWith(openQuote)) {
        content = content.slice(0, -1);
      }

      // 1. Normalization: Flatten newlines to spaces
      content = content.replace(/(\r?\n)+/g, " ");

      // 2. Decode entities to get raw text (e.g., &apos; -> ')
      content = decodeHtmlEntities(content);

      // 3. Remove Markdown bold/italic markers often hallucinated by LLMs inside attributes
      content = content.replace(/(\*|_){2,}/g, "");

      // 4. Sanitize Quotes:
      // First, unescape existing backslashed quotes to avoid double escaping (e.g. \\' -> ')
      content = content.replace(/\\\\'/g, "'");
      content = content.replace(/\\'/g, "'");
      content = content.replace(/'/g, "\\'");

      content = content.replace(/\\\\"/g, '"');
      content = content.replace(/\\"/g, '"');
      content = content.replace(/"/g, '\\"');

      // 5. Remove * from the content, sometimes a md list will really mess things up here so we remove it
      content = content.replace(/\*/g, ""); //this is a hack to remove the * from the content

      return `${canonicalizeCiteAttributeKey(key)}='${content}'`;
    }
  );

  // 3. ROBUST LINE_ID / TIMESTAMP PARSING
  // Handles unquoted, single quoted, or double quoted numbers/ranges.
  // Can handle line_ids appearing anywhere in the tag, not just at the end.
  normalized = normalized.replace(
    /(line_ids|lineIds|timestamps)=['"]?([\[\]\(\){}A-Za-z0-9_\-, ]+)['"]?(\s*\/?>|\s+)/gm,
    (_match, key, rawValue, trailingChars) => {
      // Clean up the value (remove generic text, keep numbers/separators)
      let cleanedValue = rawValue.replace(/[A-Za-z\[\]\(\){}]/g, "");

      // Expand ranges (e.g., "1-3" -> "1,2,3")
      cleanedValue = cleanedValue.replace(
        /(\d+)-(\d+)/g,
        (_rangeMatch: string, start: string, end: string) => {
          const startNum = parseInt(start, 10);
          const endNum = parseInt(end, 10);
          const range = [];

          // Handle ascending range
          if (startNum <= endNum) {
            for (let i = startNum; i <= endNum; i++) {
              range.push(i);
            }
          } else {
            // Fallback for weird descending ranges or just return start
            range.push(startNum);
          }
          return range.join(",");
        }
      );

      // Normalize commas
      cleanedValue = cleanedValue.replace(/,+/g, ",").replace(/^,|,$/g, "");

      // Return standardized format: key='value' + preserved trailing characters (space or />)
      return `${canonicalizeCiteAttributeKey(
        key
      )}='${cleanedValue}'${trailingChars}`;
    }
  );

  // 4. Re-order <cite ... /> attributes to match the strict parsing expectations in `citationParser.ts`
  // (the parser uses regexes that assume a canonical attribute order).
  const reorderCiteTagAttributes = (tag: string): string => {
    // Match both single-quoted and double-quoted attributes
    const attrRegex =
      /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['"])((?:[^'"\\\n]|\\.)*)(?:\2)/g;
    const attrs: Record<string, string> = {};
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(tag))) {
      const rawKey = match[1];
      const value = match[3]; // match[2] is the quote character
      const key = canonicalizeCiteAttributeKey(rawKey);
      attrs[key] = value;
    }

    // If we didn't find any parsable attrs, don't touch the tag.
    const keys = Object.keys(attrs);
    if (keys.length === 0) return tag;

    const hasTimestamps =
      typeof attrs.timestamps === "string" && attrs.timestamps.length > 0;
    const startPageKeys = keys.filter((k) => k.startsWith("start_page"));

    const ordered: string[] = [];

    // Shared first
    if (attrs.attachment_id) ordered.push("attachment_id");

    if (hasTimestamps) {
      // AV citations: attachment_id, full_phrase, key_span, timestamps, (optional reasoning/value), then any extras
      if (attrs.full_phrase) ordered.push("full_phrase");
      if (attrs.key_span) ordered.push("key_span");
      ordered.push("timestamps");
    } else {
      // Document citations: attachment_id, start_page*, full_phrase, key_span, line_ids, (optional reasoning/value), then any extras
      if (startPageKeys.includes("start_page_key"))
        ordered.push("start_page_key");
      startPageKeys
        .filter((k) => k !== "start_page_key")
        .sort()
        .forEach((k) => ordered.push(k));

      if (attrs.full_phrase) ordered.push("full_phrase");
      if (attrs.key_span) ordered.push("key_span");
      if (attrs.line_ids) ordered.push("line_ids");
    }

    // Optional attrs supported by the parser (but not required)
    if (attrs.reasoning) ordered.push("reasoning");
    if (attrs.value) ordered.push("value");

    // Any remaining attributes, stable + deterministic (alpha)
    const used = new Set(ordered);
    keys
      .filter((k) => !used.has(k))
      .sort()
      .forEach((k) => ordered.push(k));

    const rebuiltAttrs = ordered.map((k) => `${k}='${attrs[k]}'`).join(" ");
    return `<cite ${rebuiltAttrs} />`;
  };

  normalized = normalized.replace(/<cite\b[\s\S]*?\/>/gm, (tag) =>
    reorderCiteTagAttributes(tag)
  );

  return normalized;
};
