import { generateCitationKey } from "../react/utils.js";
import type { Citation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { getCitationStatus } from "./parseCitation.js";

/**
 * Module-level compiled regexes for hot-path operations.
 *
 * IMPORTANT: These regexes are compiled once at module load time to avoid
 * the overhead of regex compilation on every function call.
 *
 * Note on global flag (/g): Regexes with the global flag maintain internal
 * state (lastIndex). To avoid state pollution across calls, we create fresh
 * instances from these patterns when using methods that rely on lastIndex:
 *
 *   // SAFE: Create new instance from source pattern
 *   const regex = new RegExp(CITE_TAG_REGEX.source, CITE_TAG_REGEX.flags);
 *
 * Performance fix: avoids regex recompilation on every function call.
 */
const PAGE_NUMBER_REGEX = /page[_a-zA-Z]*(\d+)/;
const _RANGE_EXPANSION_REGEX = /(\d+)-(\d+)/g;
const CITE_TAG_REGEX = /<cite\s+[^>]*?\/>/g;

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

  // Match attribute patterns: key='value' or key="value"
  const attrRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(['"])((?:[^'"\\]|\\.)*)\2/g;
  let match: RegExpExecArray | null;

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
        : key === "anchortext" || key === "anchor_text" || key === "keyspan" || key === "key_span"
          ? "anchor_text"
          : key === "fullphrase"
            ? "full_phrase"
            : key === "lineids"
              ? "line_ids"
              : key === "pageid" ||
                  key === "page_id" ||
                  key === "startpageid" ||
                  key === "start_pageid" ||
                  key === "start_page_id" ||
                  key === "startpagekey" ||
                  key === "start_pagekey" ||
                  key === "start_page_key" ||
                  key === "pagekey" ||
                  key === "page_key"
                ? "start_page_id"
                : key;

    attrs[normalizedKey] = value;
  }

  return attrs;
};

/**
 * Get verification status indicator character for plain text/terminal output.
 * Returns: ☑️ (fully verified), ✅ (partial match), ❌ (not found), ⌛ (pending/null), ◌ (unknown)
 *
 * For web UI, use the React CitationComponent instead which provides
 * proper styled indicators with colors and accessibility.
 */
export const getVerificationTextIndicator = (verification: Verification | null | undefined): string => {
  const status = getCitationStatus(verification);

  if (status.isMiss) return "❌";
  // Check for fully verified (not partial) first
  if (status.isVerified && !status.isPartialMatch) return "☑️";
  // Then check for partial match
  if (status.isPartialMatch) return "✅";

  if (status.isPending) return "⌛";

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
  const { leaveAnchorTextBehind = false, verifications, showVerificationStatus = false } = options;

  // Track citation index for matching with numbered verification keys
  let citationIndex = 0;

  // Use module-level regex directly - replace() handles lastIndex reset automatically
  return markdownWithCitations.replace(CITE_TAG_REGEX, match => {
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
        // Performance fix: use module-level compiled regex
        const match = startPageId.match(PAGE_NUMBER_REGEX);
        return match ? parseInt(match[1], 10) : undefined;
      };

      const parseLineIds = (lineIdsStr?: string): number[] | undefined => {
        if (!lineIdsStr) return undefined;

        // Performance fix: limit range expansion to prevent memory exhaustion
        const MAX_RANGE_SIZE = 1000;
        const SAMPLE_COUNT = 50;

        // First expand ranges (e.g., "62-63" -> "62,63")
        const expanded = lineIdsStr.replace(/(\d+)-(\d+)/g, (_match, start, end) => {
          const startNum = parseInt(start, 10);
          const endNum = parseInt(end, 10);
          if (startNum <= endNum) {
            const rangeSize = endNum - startNum + 1;
            // For large ranges, use sampling to maintain accuracy
            if (rangeSize > MAX_RANGE_SIZE) {
              const samples = [startNum];
              const sampleCount = Math.min(SAMPLE_COUNT - 2, rangeSize - 2);
              if (sampleCount > 0) {
                // Use Math.floor for predictable sampling, ensuring step >= 1
                const step = Math.max(1, Math.floor((endNum - startNum) / (sampleCount + 1)));
                for (let i = 1; i <= sampleCount; i++) {
                  const sample = startNum + step * i;
                  // Ensure we don't exceed the range end
                  if (sample < endNum) {
                    samples.push(sample);
                  }
                }
              }
              samples.push(endNum);
              return samples.join(",");
            }
            const range = [];
            for (let i = startNum; i <= endNum; i++) {
              range.push(i);
            }
            return range.join(",");
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
        attachmentId: attrs.attachment_id,
        pageNumber: parsePageNumber(attrs.start_page_id),
        fullPhrase: unescapeQuotes(attrs.full_phrase),
        anchorText: unescapeQuotes(attrs.anchor_text),
        lineIds: parseLineIds(attrs.line_ids),
      };

      // Strategy 1: Match by citationKey (hash) - most reliable
      const citationKey = generateCitationKey(citation);
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
  });
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

export const getCitationPageNumber = (startPageId?: string | null): number | null => {
  //page_number_{page_number}_index_{page_index} or page_number_{page_number} or page_id_{page_number}_index_{page_index}
  if (!startPageId) return null;

  //regex first \d+ is the page number
  const pageNumber = startPageId.match(/\d+/)?.[0];
  return pageNumber ? parseInt(pageNumber, 10) : null;
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
    if (lowerKey === "fullphrase" || lowerKey === "full_phrase") return "full_phrase";
    if (lowerKey === "lineids" || lowerKey === "line_ids") return "line_ids";
    if (
      lowerKey === "startpageid" ||
      lowerKey === "start_pageid" ||
      lowerKey === "start_page_id" ||
      lowerKey === "startpagekey" ||
      lowerKey === "start_pagekey" ||
      lowerKey === "start_page_key"
    )
      return "start_page_id";
    if (lowerKey === "fileid" || lowerKey === "file_id" || lowerKey === "attachmentid" || lowerKey === "attachment_id")
      return "attachment_id";
    if (lowerKey === "anchortext" || lowerKey === "anchor_text" || lowerKey === "keyspan" || lowerKey === "key_span")
      return "anchor_text";
    if (lowerKey === "reasoning" || lowerKey === "value") return lowerKey;
    if (lowerKey === "timestamps" || lowerKey === "timestamp" || lowerKey === "timestamps") return "timestamps";

    return lowerKey;
  };

  const htmlEntityMap: Record<string, string> = {
    "&quot;": '"',
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
  };
  const htmlEntityRegex = /&(?:quot|apos|lt|gt|amp);/g;
  const decodeHtmlEntities = (str: string) => {
    return str.replace(htmlEntityRegex, match => htmlEntityMap[match] || match);
  };

  const textAttributeRegex =
    /(fullPhrase|full_phrase|anchorText|anchor_text|keySpan|key_span|reasoning|value)\s*=\s*(['"])([\s\S]*?)(?=\s+(?:line_ids|lineIds|timestamps|fileId|file_id|attachmentId|attachment_id|start_page_id|start_pageId|startPageId|start_page_key|start_pageKey|startPageKey|anchorText|anchor_text|keySpan|key_span|reasoning|value|full_phrase)\s*=|\s*\/>|['"]>)/gm;

  normalized = normalized.replace(textAttributeRegex, (_match, key, openQuote, rawContent) => {
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

    // Normalize quotes
    content = content.replace(/\\\\'/g, "'").replace(/\\'/g, "'").replace(/'/g, "\\'");
    content = content.replace(/\\\\"/g, '"').replace(/\\"/g, '"').replace(/"/g, '\\"');

    return `${canonicalizeCiteAttributeKey(key)}='${content}'`;
  });
  // Performance fix: limit range expansion to prevent memory exhaustion
  const MAX_RANGE_SIZE = 1000;
  const SAMPLE_COUNT = 50;

  normalized = normalized.replace(
    /(line_ids|lineIds|timestamps)=['"]?([[\](){}A-Za-z0-9_\-, ]+)['"]?(\s*\/?>|\s+)/gm,
    (_match, key, rawValue, trailingChars) => {
      // Clean up the value (remove generic text, keep numbers/separators)
      let cleanedValue = rawValue.replace(/[A-Za-z[\](){}]/g, "");

      // Expand ranges (e.g., "1-3" -> "1,2,3")
      cleanedValue = cleanedValue.replace(/(\d+)-(\d+)/g, (_rangeMatch: string, start: string, end: string) => {
        const startNum = parseInt(start, 10);
        const endNum = parseInt(end, 10);

        // Handle ascending range
        if (startNum <= endNum) {
          const rangeSize = endNum - startNum + 1;
          // For large ranges, use sampling to maintain accuracy
          if (rangeSize > MAX_RANGE_SIZE) {
            const samples = [startNum];
            const sampleCount = Math.min(SAMPLE_COUNT - 2, rangeSize - 2);
            if (sampleCount > 0) {
              // Use Math.floor for predictable sampling, ensuring step >= 1
              const step = Math.max(1, Math.floor((endNum - startNum) / (sampleCount + 1)));
              for (let i = 1; i <= sampleCount; i++) {
                const sample = startNum + step * i;
                // Ensure we don't exceed the range end
                if (sample < endNum) {
                  samples.push(sample);
                }
              }
            }
            samples.push(endNum);
            return samples.join(",");
          }
          const range = [];
          for (let i = startNum; i <= endNum; i++) {
            range.push(i);
          }
          return range.join(",");
        } else {
          // Fallback for weird descending ranges or just return start
          return String(startNum);
        }
      });

      // Normalize commas
      cleanedValue = cleanedValue.replace(/,+/g, ",").replace(/^,|,$/g, "");

      // Return standardized format: key='value' + preserved trailing characters (space or />)
      return `${canonicalizeCiteAttributeKey(key)}='${cleanedValue}'${trailingChars}`;
    },
  );

  // 4. Re-order <cite ... /> attributes to match the strict parsing expectations in `citationParser.ts`
  // (the parser uses regexes that assume a canonical attribute order).
  const reorderCiteTagAttributes = (tag: string): string => {
    // Match both single-quoted and double-quoted attributes
    const attrRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['"])((?:[^'"\\\n]|\\.)*)(?:\2)/g;
    const attrs: Record<string, string> = {};
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(tag)) !== null) {
      const rawKey = match[1];
      const value = match[3]; // match[2] is the quote character
      const key = canonicalizeCiteAttributeKey(rawKey);
      attrs[key] = value;
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
