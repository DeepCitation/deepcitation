/**
 * Regex safety utilities to prevent ReDoS (Regular Expression Denial of Service) attacks.
 *
 * ReDoS vulnerabilities occur when regex patterns with nested quantifiers are applied
 * to malicious input, causing catastrophic backtracking. This module provides safe
 * wrappers that validate input length before regex operations.
 *
 * @module utils/regexSafety
 */

/**
 * Maximum safe input length for regex operations.
 * Prevents catastrophic backtracking attacks on polynomial regex patterns.
 * 100KB is a reasonable limit for citation processing without impact on legitimate use.
 *
 * **Important**: JavaScript string length is measured in UTF-16 code units, not bytes or Unicode code points.
 * - ASCII characters (a-z, 0-9): 1 code unit each
 * - Most Unicode characters (é, ñ, 中, Ω): 1 code unit each
 * - Emoji and rare characters (😀, 𝕏, 🎯): 2 code units each (surrogate pairs)
 *
 * For most text (primarily Latin script + common Unicode), this limit provides ~100KB of memory.
 * For text with many emoji/rare characters, the actual byte size may be lower (~50KB).
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/length
 */
export const MAX_REGEX_INPUT_LENGTH = 100_000; // ~100KB in UTF-16 code units

/**
 * Validates that input is safe for regex operations.
 * Throws an error if input exceeds the maximum safe length.
 *
 * @param input - The string to validate
 * @param maxLength - Maximum allowed length (default: 100KB)
 * @throws Error if input exceeds maxLength
 *
 * @example
 * ```typescript
 * validateRegexInput(userInput);
 * const matches = userInput.match(dangerousRegex);
 * ```
 */
export function validateRegexInput(input: string, maxLength = MAX_REGEX_INPUT_LENGTH): void {
  if (input.length > maxLength) {
    throw new Error(
      `Input too large for regex operation: ${input.length} bytes (max: ${maxLength}). ` +
        `This may indicate a ReDoS attack or malformed input.`,
    );
  }
}

/**
 * Safe wrapper for String.prototype.match() with length validation.
 *
 * @param input - The string to search
 * @param regex - The regular expression to match
 * @returns Array of matches, or null if no matches found
 * @throws Error if input exceeds maximum safe length
 *
 * @example
 * ```typescript
 * const matches = safeMatch(text, /pattern/g);
 * if (matches) {
 *   matches.forEach(match => console.log(match));
 * }
 * ```
 */
export function safeMatch(input: string, regex: RegExp): RegExpMatchArray | null {
  validateRegexInput(input);
  return input.match(regex);
}

/**
 * Safe wrapper for RegExp.prototype.exec() with length validation.
 * Use this for iterative regex execution in loops.
 *
 * @param regex - The regular expression with the g flag
 * @param input - The string to search
 * @returns Match array with index and groups, or null if no match
 * @throws Error if input exceeds maximum safe length
 *
 * @example
 * ```typescript
 * const regex = /pattern/g;
 * let match;
 * while ((match = safeExec(regex, input)) !== null) {
 *   console.log(match[0]);
 * }
 * ```
 */
export function safeExec(regex: RegExp, input: string): RegExpExecArray | null {
  validateRegexInput(input);
  return regex.exec(input);
}

/**
 * Safe wrapper for String.prototype.replace() with length validation.
 *
 * @param input - The string to process
 * @param regex - The pattern to match
 * @param replacement - String or function to replace matches
 * @returns The result string with replacements applied
 * @throws Error if input exceeds maximum safe length
 *
 * @example
 * ```typescript
 * const result = safeReplace(text, /foo/g, 'bar');
 * ```
 */
export function safeReplace(
  input: string,
  regex: RegExp,
  replacement: string | ((substring: string, ...args: any[]) => string),
): string {
  validateRegexInput(input);
  return input.replace(regex, replacement as any);
}

/**
 * Safe wrapper for String.prototype.replaceAll() with length validation.
 *
 * @param input - The string to process
 * @param regex - The pattern to match (must have g flag)
 * @param replacement - String or function to replace matches
 * @returns The result string with all replacements applied
 * @throws Error if input exceeds maximum safe length
 *
 * @example
 * ```typescript
 * const result = safeReplaceAll(text, /foo/g, 'bar');
 * ```
 */
export function safeReplaceAll(
  input: string,
  regex: RegExp,
  replacement: string | ((substring: string, ...args: any[]) => string),
): string {
  validateRegexInput(input);
  if (!regex.global) {
    throw new Error("safeReplaceAll requires a regex with the g flag");
  }
  return input.replaceAll(regex, replacement as any);
}

/**
 * Safe wrapper for String.prototype.split() with length validation.
 *
 * @param input - The string to split
 * @param regex - The pattern to split on
 * @param limit - Optional limit on the number of substrings
 * @returns Array of substrings
 * @throws Error if input exceeds maximum safe length
 *
 * @example
 * ```typescript
 * const parts = safeSplit(text, /\s+/);
 * ```
 */
export function safeSplit(input: string, regex: RegExp, limit?: number): string[] {
  validateRegexInput(input);
  return input.split(regex, limit);
}

/**
 * Safe wrapper for String.prototype.search() with length validation.
 *
 * @param input - The string to search
 * @param regex - The pattern to search for
 * @returns The index of the first match, or -1 if not found
 * @throws Error if input exceeds maximum safe length
 *
 * @example
 * ```typescript
 * const index = safeSearch(text, /pattern/);
 * ```
 */
export function safeSearch(input: string, regex: RegExp): number {
  validateRegexInput(input);
  return input.search(regex);
}

/**
 * Safe wrapper for String.prototype.test() with length validation.
 *
 * @param regex - The regular expression to test
 * @param input - The string to test
 * @returns True if the pattern matches, false otherwise
 * @throws Error if input exceeds maximum safe length
 *
 * @example
 * ```typescript
 * if (safeTest(/pattern/, text)) {
 *   console.log('Match found');
 * }
 * ```
 */
export function safeTest(regex: RegExp, input: string): boolean {
  validateRegexInput(input);
  return regex.test(input);
}
