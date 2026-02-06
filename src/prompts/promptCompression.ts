import type { CompressedResult } from "./types.js";

const MIN_PREFIX_LENGTH = 4;
const MIN_CHARACTERS_PER_PREFIX_WITH_AT_LEAST_ONE_DIGIT = 3;
const MIN_CHARACTERS_PER_PREFIX_WITH_NO_DIGITS = 5;

/**
 * Build a map from each ID's minimal unique prefix to the full ID,
 * such that the prefix only ever appears in the prompt where the full ID appears.
 */
function buildSafePrefixMap(
  ids: string[],
  prompt: string
): Record<string, string> {
  const map: Record<string, string> = {};

  for (const id of ids) {
    for (let len = MIN_PREFIX_LENGTH; len <= id.length; len++) {
      const prefix = id.slice(0, len);

      // Check minimum requirements
      const digitCount = (prefix.match(/\d/g) || []).length;
      const letterCount = (prefix.match(/[a-zA-Z]/g) || []).length;

      if (
        prefix.length < MIN_PREFIX_LENGTH ||
        (digitCount > 0 &&
          letterCount < MIN_CHARACTERS_PER_PREFIX_WITH_AT_LEAST_ONE_DIGIT) ||
        (digitCount === 0 &&
          letterCount < MIN_CHARACTERS_PER_PREFIX_WITH_NO_DIGITS)
      ) {
        continue;
      }

      // 1) Unique among IDs
      if (ids.some((other) => other !== id && other.startsWith(prefix))) {
        continue;
      }

      // 2) Only appears in prompt as part of the full ID
      const esc = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const prefixCount = (prompt.match(new RegExp(esc(prefix), "g")) || [])
        .length;
      const fullCount = (prompt.match(new RegExp(esc(id), "g")) || []).length;
      if (prefixCount !== fullCount) {
        continue;
      }

      map[prefix] = id;
      break;
    }

    if (!Object.values(map).includes(id)) {
      throw new Error(
        `Cannot find a safe unique prefix for ID "${id}" that meets the minimum requirements (length: ${MIN_PREFIX_LENGTH})`
      );
    }
  }

  return map;
}

/**
 * Compress all occurrences of `ids` inside `obj`, returning a new object
 * plus the `prefixMap` needed to decompress.
 */
export function compressPromptIds<T>(
  obj: T,
  ids: string[] | undefined
): CompressedResult<T> {
  if (!ids || ids.length === 0) {
    return { compressed: obj, prefixMap: {} };
  }

  const uniqueIds = Array.from(new Set(ids));
  const text = JSON.stringify(obj);
  const prefixMap = buildSafePrefixMap(uniqueIds, text);

  // Sort prefixes by descending length to avoid partial matches
  const prefixes = Object.keys(prefixMap).sort((a, b) => b.length - a.length);

  let compressedText = text;
  for (const prefix of prefixes) {
    const full = prefixMap[prefix];
    const escFull = full.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    compressedText = compressedText.replace(new RegExp(escFull, "g"), prefix);
  }

  return {
    compressed: JSON.parse(compressedText) as T,
    prefixMap,
  };
}

/**
 * Decompress all minimal prefixes back into their full IDs,
 * using the `prefixMap` returned from `compressPromptIds`.
 *
 * If you pass in a string, it will return a string.
 * If you pass in an object, it will JSON‑serialize and parse it back.
 */
export function decompressPromptIds<T>(
  compressed: T | string,
  prefixMap: Record<string, string>
): T | string {
  if (!prefixMap || Object.keys(prefixMap).length === 0) {
    return compressed;
  }

  // Prepare sorted [prefix, full] entries (longest prefix first)
  const entries = Object.entries(prefixMap).sort(
    (a, b) => b[0].length - a[0].length
  );

  // Decide whether we're working on a string or an object
  let text: string;
  let shouldParseBack = false;

  if (typeof compressed === "string") {
    text = compressed;
  } else {
    text = JSON.stringify(compressed);
    shouldParseBack = true;
  }

  const originalLength = text?.length;

  // Perform all prefix → full-ID replacements
  for (const [prefix, full] of entries) {
    const escPrefix = prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    text = text.replace(new RegExp(escPrefix, "g"), full);
  }

  // Handle cases where the LLM may output ID in a different attribute format
  // We look for common ID attribute patterns and replace compressed prefixes within them
  // Note: fileId variants are supported for backwards compatibility with legacy citations
  const idAttributeKeys = [
    "attachmentId",
    "attachment_id",
    "attachment_ID",
    "attachmentID",
    "fileId",
    "file_id",
    "file_ID",
    "fileID",
    "fileid",
  ];

  // For each prefix, look for it within ID attribute values and replace with full ID
  for (const [prefix, full] of entries) {
    const escPrefix = prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const keyPattern = idAttributeKeys.join("|");
    const quotePattern = "([\"'`])";

    // Match: attributeName = 'prefix' or attributeName="prefix" etc.
    // Only replace the prefix part, preserving the attribute name and quotes
    const re = new RegExp(
      `(${keyPattern})(\\s*=\\s*)${quotePattern}${escPrefix}\\3`,
      "g"
    );
    text = text.replace(re, `$1$2$3${full}$3`);
  }
  const newLength = text?.length;

  const diff = originalLength - newLength;
  if (diff > 0) {
    throw new Error(
      `[decompressedPromptIds] diff ${diff} originalLength ${originalLength} newLength ${newLength}`
    );
  }

  return shouldParseBack ? (JSON.parse(text) as T) : text;
}
