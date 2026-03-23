export interface CompressedResult<T> {
  compressed: T;
  prefixMap: Record<string, string>;
}

const MIN_PREFIX_LENGTH = 4;
const MIN_CHARACTERS_PER_PREFIX_WITH_AT_LEAST_ONE_DIGIT = 3;
const MIN_CHARACTERS_PER_PREFIX_WITH_NO_DIGITS = 5;
const DIGIT_ZERO_CODE = 48;
const DIGIT_NINE_CODE = 57;
const UPPER_A_CODE = 65;
const UPPER_Z_CODE = 90;
const LOWER_A_CODE = 97;
const LOWER_Z_CODE = 122;

function countOccurrences(text: string, needle: string): number {
  if (needle.length === 0) return 0;

  let count = 0;
  let searchIndex = 0;

  while (searchIndex < text.length) {
    const foundIndex = text.indexOf(needle, searchIndex);
    if (foundIndex === -1) break;

    count++;
    searchIndex = foundIndex + needle.length;
  }

  return count;
}

function isAsciiDigit(charCode: number): boolean {
  return charCode >= DIGIT_ZERO_CODE && charCode <= DIGIT_NINE_CODE;
}

function isAsciiLetter(charCode: number): boolean {
  return (
    (charCode >= UPPER_A_CODE && charCode <= UPPER_Z_CODE) || (charCode >= LOWER_A_CODE && charCode <= LOWER_Z_CODE)
  );
}

function buildPrefixUsageCount(ids: string[]): Map<string, number> {
  const usage = new Map<string, number>();

  for (const id of ids) {
    for (let len = MIN_PREFIX_LENGTH; len <= id.length; len++) {
      const prefix = id.slice(0, len);
      const currentCount = usage.get(prefix) ?? 0;
      usage.set(prefix, currentCount + 1);
    }
  }

  return usage;
}

/**
 * Build a map from each ID's minimal unique prefix to the full ID,
 * such that the prefix only ever appears in the prompt where the full ID appears.
 */
function buildSafePrefixMap(ids: string[], prompt: string): Record<string, string> {
  const map: Record<string, string> = {};
  const prefixUsageCount = buildPrefixUsageCount(ids);
  const promptCountCache = new Map<string, number>();
  const fullPromptCountById = new Map<string, number>();

  for (const id of ids) {
    fullPromptCountById.set(id, countOccurrences(prompt, id));
  }

  for (const id of ids) {
    let found = false;
    let digitCount = 0;
    let letterCount = 0;

    for (let len = 1; len <= id.length; len++) {
      const charCode = id.charCodeAt(len - 1);
      if (isAsciiDigit(charCode)) digitCount++;
      if (isAsciiLetter(charCode)) letterCount++;
      if (len < MIN_PREFIX_LENGTH) continue;

      const prefix = id.slice(0, len);

      // Check minimum character-type requirements
      if (
        (digitCount > 0 && letterCount < MIN_CHARACTERS_PER_PREFIX_WITH_AT_LEAST_ONE_DIGIT) ||
        (digitCount === 0 && letterCount < MIN_CHARACTERS_PER_PREFIX_WITH_NO_DIGITS)
      ) {
        continue;
      }

      // 1) Unique among IDs
      if ((prefixUsageCount.get(prefix) ?? 0) > 1) {
        continue;
      }

      // 2) Only appears in prompt as part of the full ID
      let prefixCount = promptCountCache.get(prefix);
      if (prefixCount === undefined) {
        prefixCount = countOccurrences(prompt, prefix);
        promptCountCache.set(prefix, prefixCount);
      }
      const fullCount = fullPromptCountById.get(id) ?? 0;
      if (prefixCount !== fullCount) {
        continue;
      }

      map[prefix] = id;
      found = true;
      break;
    }

    if (!found) {
      throw new Error(
        `Cannot find a safe unique prefix for ID "${id}" that meets the minimum requirements (length: ${MIN_PREFIX_LENGTH})`,
      );
    }
  }

  return map;
}

/**
 * Compress all occurrences of `ids` inside `obj`, returning a new object
 * plus the `prefixMap` needed to decompress.
 */
export function compressPromptIds<T>(obj: T, ids: string[] | undefined): CompressedResult<T> {
  if (!ids || ids.length === 0) {
    return { compressed: obj, prefixMap: {} };
  }

  const uniqueIds = Array.from(new Set(ids));
  const text = JSON.stringify(obj);
  const prefixMap = buildSafePrefixMap(uniqueIds, text);

  // Sort by full-ID length descending so a longer ID is replaced before
  // a shorter one that might be its substring.
  const entries = Object.entries(prefixMap).sort((a, b) => b[1].length - a[1].length);

  let compressedText = text;
  for (const [prefix, full] of entries) {
    compressedText = compressedText.replaceAll(full, prefix);
  }

  try {
    return {
      compressed: JSON.parse(compressedText) as T,
      prefixMap,
    };
  } catch {
    // Replacement corrupted the JSON (prefix collision) — return original uncompressed
    console.warn("[DeepCitation] compressPromptIds: JSON.parse failed after substitution, returning original");
    return { compressed: obj, prefixMap: {} };
  }
}

/**
 * Decompress all minimal prefixes back into their full IDs,
 * using the `prefixMap` returned from `compressPromptIds`.
 *
 * If you pass in a string, it will return a string.
 * If you pass in an object, it will JSON‑serialize and parse it back.
 */
export function decompressPromptIds<T>(compressed: T | string, prefixMap: Record<string, string>): T | string {
  if (!prefixMap) {
    return compressed;
  }
  const prefixKeys = Object.keys(prefixMap);
  if (prefixKeys.length === 0) return compressed;

  // Prepare sorted [prefix, full] entries (longest prefix first)
  const entries = prefixKeys
    .map(prefix => [prefix, prefixMap[prefix]] as const)
    .sort((a, b) => b[0].length - a[0].length);

  // Decide whether we're working on a string or an object
  let text: string;
  let shouldParseBack = false;

  if (typeof compressed === "string") {
    text = compressed;
  } else {
    text = JSON.stringify(compressed);
    shouldParseBack = true;
  }

  // Perform all prefix → full-ID replacements
  for (const [prefix, full] of entries) {
    text = text.replaceAll(prefix, full);
  }

  if (!shouldParseBack) return text;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Replacement corrupted the JSON — return the compressed input unchanged
    console.warn("[DeepCitation] decompressPromptIds: JSON.parse failed after substitution, returning compressed");
    return compressed;
  }
}
