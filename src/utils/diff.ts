/**
 * Custom diff implementation to replace the 'diff' npm package.
 * This avoids dependency issues in Firebase Functions environments.
 *
 * Implements a Myers diff algorithm with optimizations inspired by jsdiff.
 * @see https://github.com/kpdecker/jsdiff
 *
 * ---
 *
 * BSD 3-Clause License
 *
 * Copyright (c) 2009-2015, Kevin Decker <kpdecker@gmail.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

export interface Change {
  value: string;
  added?: boolean;
  removed?: boolean;
  count?: number;
}

/**
 * Myers diff algorithm with diagonal pruning optimization.
 * This reduces complexity from O(n+d²) to O(n+d) for common cases like appending text.
 *
 * @see https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/
 */
function computeDiff(
  oldTokens: string[],
  newTokens: string[],
  equals: (a: string, b: string) => boolean = (a, b) => a === b
): Change[] {
  const oldLen = oldTokens.length;
  const newLen = newTokens.length;

  // Handle edge cases
  if (oldLen === 0 && newLen === 0) {
    return [];
  }

  // Quick path for completely new content
  if (oldLen === 0) {
    return [
      { value: newTokens.join(""), added: true, count: newTokens.length },
    ];
  }

  // Quick path for completely removed content
  if (newLen === 0) {
    return [
      { value: oldTokens.join(""), removed: true, count: oldTokens.length },
    ];
  }

  // Find common prefix
  let commonPrefixLen = 0;
  while (
    commonPrefixLen < oldLen &&
    commonPrefixLen < newLen &&
    equals(oldTokens[commonPrefixLen], newTokens[commonPrefixLen])
  ) {
    commonPrefixLen++;
  }

  // Find common suffix (but don't overlap with prefix)
  let commonSuffixLen = 0;
  while (
    commonSuffixLen < oldLen - commonPrefixLen &&
    commonSuffixLen < newLen - commonPrefixLen &&
    equals(
      oldTokens[oldLen - 1 - commonSuffixLen],
      newTokens[newLen - 1 - commonSuffixLen]
    )
  ) {
    commonSuffixLen++;
  }

  // Extract the differing middle portions
  const oldMiddle = oldTokens.slice(commonPrefixLen, oldLen - commonSuffixLen);
  const newMiddle = newTokens.slice(commonPrefixLen, newLen - commonSuffixLen);

  // If middles are empty, we only have common prefix/suffix
  if (oldMiddle.length === 0 && newMiddle.length === 0) {
    return [{ value: oldTokens.join(""), count: oldTokens.length }];
  }

  // Compute diff on the middle portion using Myers algorithm
  const middleDiff = myersDiff(oldMiddle, newMiddle, equals);

  // Build result with prefix, middle diff, and suffix
  const result: Change[] = [];

  if (commonPrefixLen > 0) {
    result.push({
      value: oldTokens.slice(0, commonPrefixLen).join(""),
      count: commonPrefixLen,
    });
  }

  result.push(...middleDiff);

  if (commonSuffixLen > 0) {
    result.push({
      value: oldTokens.slice(oldLen - commonSuffixLen).join(""),
      count: commonSuffixLen,
    });
  }

  return mergeConsecutiveChanges(result);
}

/**
 * Myers diff algorithm implementation.
 * Uses the "middle snake" approach for better memory efficiency.
 */
function myersDiff(
  oldTokens: string[],
  newTokens: string[],
  equals: (a: string, b: string) => boolean
): Change[] {
  const oldLen = oldTokens.length;
  const newLen = newTokens.length;
  const maxD = oldLen + newLen;

  // V array indexed by k = x - y (diagonal)
  // We use an object to handle negative indices
  const v: Record<number, number> = { 1: 0 };

  // Store the path for backtracking
  const trace: Array<Record<number, number>> = [];

  // Iterate through edit distances
  outer: for (let d = 0; d <= maxD; d++) {
    trace.push({ ...v });

    // Iterate through diagonals
    for (let k = -d; k <= d; k += 2) {
      // Decide whether to go down or right
      let x: number;
      if (k === -d || (k !== d && v[k - 1] < v[k + 1])) {
        x = v[k + 1]; // Move down (insert)
      } else {
        x = v[k - 1] + 1; // Move right (delete)
      }

      let y = x - k;

      // Follow diagonal (matches)
      while (x < oldLen && y < newLen && equals(oldTokens[x], newTokens[y])) {
        x++;
        y++;
      }

      v[k] = x;

      // Check if we've reached the end
      if (x >= oldLen && y >= newLen) {
        break outer;
      }
    }
  }

  // Backtrack to build the diff
  return backtrack(trace, oldTokens, newTokens);
}

function backtrack(
  trace: Array<Record<number, number>>,
  oldTokens: string[],
  newTokens: string[]
): Change[] {
  const changes: Change[] = [];
  let x = oldTokens.length;
  let y = newTokens.length;

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;

    let prevK: number;
    if (k === -d || (k !== d && v[k - 1] < v[k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v[prevK] ?? 0;
    const prevY = prevX - prevK;

    // Add diagonal matches (unchanged) - push in reverse order, will reverse at end
    while (x > prevX && y > prevY) {
      x--;
      y--;
      changes.push({ value: oldTokens[x], count: 1 });
    }

    if (d > 0) {
      if (x === prevX) {
        // Insertion (went down)
        y--;
        changes.push({ value: newTokens[y], added: true, count: 1 });
      } else {
        // Deletion (went right)
        x--;
        changes.push({ value: oldTokens[x], removed: true, count: 1 });
      }
    }
  }

  // Reverse to get correct order (we built backwards for O(n) efficiency)
  return changes.reverse();
}

/**
 * Merge consecutive changes of the same type.
 */
function mergeConsecutiveChanges(changes: Change[]): Change[] {
  if (changes.length === 0) return [];

  const result: Change[] = [];

  for (const change of changes) {
    const last = result[result.length - 1];

    if (
      last &&
      last.added === change.added &&
      last.removed === change.removed
    ) {
      last.value += change.value;
      last.count = (last.count || 1) + (change.count || 1);
    } else {
      result.push({ ...change });
    }
  }

  return result;
}

function splitLines(text: string): string[] {
  if (!text) return [];

  const lines: string[] = [];
  let lineStart = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      // Include the newline character in the line
      lines.push(text.substring(lineStart, i + 1));
      lineStart = i + 1;
    }
  }

  // Don't forget the last line if it doesn't end with newline
  if (lineStart < text.length) {
    lines.push(text.substring(lineStart));
  }

  return lines;
}

/**
 * Extended word character class - matches jsdiff's extendedWordChars.
 * Includes: a-zA-Z0-9_, soft hyphen, Latin Extended-A/B, IPA Extensions,
 * Spacing Modifier Letters, and Latin Extended Additional.
 *
 * @see https://github.com/kpdecker/jsdiff/blob/master/src/diff/word.ts
 */
const EXTENDED_WORD_CHARS =
  "a-zA-Z0-9_\\u00AD\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C6\\u02C8-\\u02D7\\u02DE-\\u02FF\\u1E00-\\u1EFF";

/**
 * Tokenization regex matching jsdiff's approach.
 * Matches: word character runs, whitespace runs, or single non-word chars.
 */
const TOKENIZE_REGEX = new RegExp(
  `[${EXTENDED_WORD_CHARS}]+|\\s+|[^${EXTENDED_WORD_CHARS}]`,
  "gu"
);

/**
 * Split text into tokens using jsdiff's tokenization approach.
 * Each token is one of:
 * - A word (extended word characters)
 * - A whitespace run
 * - A single punctuation/symbol character
 */
function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return text.match(TOKENIZE_REGEX) || [];
}

/**
 * Find the longest common prefix between two strings.
 */
function longestCommonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return a.slice(0, i);
}

/**
 * Find the longest common suffix between two strings.
 */
function longestCommonSuffix(a: string, b: string): string {
  let i = 0;
  while (
    i < a.length &&
    i < b.length &&
    a[a.length - 1 - i] === b[b.length - 1 - i]
  ) {
    i++;
  }
  return a.slice(a.length - i);
}

/**
 * Check if a string is only whitespace.
 */
function _isWhitespace(str: string): boolean {
  return /^\s*$/.test(str);
}

/**
 * Deduplicate whitespace in change objects.
 * This is a simplified version of jsdiff's dedupeWhitespaceInChangeObjects.
 *
 * Handles three main scenarios:
 * 1. Deletion followed by insertion - extract common leading/trailing whitespace
 * 2. Lone insertion after unchanged - strip duplicate leading whitespace
 * 3. Lone deletion between unchanged - distribute whitespace properly
 */
function dedupeWhitespaceInChangeObjects(changes: Change[]): Change[] {
  const result: Change[] = [];

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];

    // Scenario 1: Deletion followed by insertion
    if (change.removed && changes[i + 1]?.added) {
      const deletion = change;
      const insertion = changes[i + 1];

      // Find common prefix (must be whitespace)
      const commonPrefix = longestCommonPrefix(deletion.value, insertion.value);
      const wsPrefix = commonPrefix.match(/^\s*/)?.[0] || "";

      // Find common suffix (must be whitespace)
      const delWithoutPrefix = deletion.value.slice(wsPrefix.length);
      const insWithoutPrefix = insertion.value.slice(wsPrefix.length);
      const commonSuffix = longestCommonSuffix(
        delWithoutPrefix,
        insWithoutPrefix
      );
      const wsSuffix = commonSuffix.match(/\s*$/)?.[0] || "";

      // Build the cleaned changes
      if (wsPrefix) {
        result.push({ value: wsPrefix, count: 1 });
      }

      const cleanedDel = deletion.value.slice(
        wsPrefix.length,
        deletion.value.length - wsSuffix.length
      );
      const cleanedIns = insertion.value.slice(
        wsPrefix.length,
        insertion.value.length - wsSuffix.length
      );

      if (cleanedDel) {
        result.push({ value: cleanedDel, removed: true, count: 1 });
      }
      if (cleanedIns) {
        result.push({ value: cleanedIns, added: true, count: 1 });
      }

      if (wsSuffix) {
        result.push({ value: wsSuffix, count: 1 });
      }

      i++; // Skip the insertion since we processed it
      continue;
    }

    // Scenario 2: Lone insertion after unchanged text
    if (
      change.added &&
      i > 0 &&
      !changes[i - 1].added &&
      !changes[i - 1].removed
    ) {
      const prev = result[result.length - 1];
      if (prev && !prev.added && !prev.removed) {
        // Check for duplicate leading whitespace
        const leadingWs = change.value.match(/^\s*/)?.[0] || "";
        const trailingWs = prev.value.match(/\s*$/)?.[0] || "";

        if (leadingWs && trailingWs) {
          const overlap = longestCommonSuffix(trailingWs, leadingWs);
          if (overlap) {
            // Remove overlap from the insertion
            result.push({
              value: change.value.slice(overlap.length),
              added: true,
              count: 1,
            });
            continue;
          }
        }
      }
    }

    // Scenario 3: Lone deletion between unchanged text
    if (
      change.removed &&
      !changes[i + 1]?.added &&
      i > 0 &&
      !changes[i - 1]?.added &&
      !changes[i - 1]?.removed
    ) {
      const prev = result[result.length - 1];
      const next = changes[i + 1];

      if (prev && next && !next.added && !next.removed) {
        const leadingWs = change.value.match(/^\s*/)?.[0] || "";
        const trailingWs = change.value.match(/\s*$/)?.[0] || "";
        const prevTrailingWs = prev.value.match(/\s*$/)?.[0] || "";
        const nextLeadingWs = next.value.match(/^\s*/)?.[0] || "";

        // If deletion starts/ends with whitespace that overlaps with neighbors
        if (leadingWs && prevTrailingWs) {
          const overlap = longestCommonSuffix(prevTrailingWs, leadingWs);
          if (overlap.length === leadingWs.length) {
            // Leading whitespace is already in prev, strip it
            result.push({
              value: change.value.slice(leadingWs.length),
              removed: true,
              count: 1,
            });
            continue;
          }
        }

        if (trailingWs && nextLeadingWs) {
          const overlap = longestCommonPrefix(trailingWs, nextLeadingWs);
          if (overlap.length === trailingWs.length) {
            // Trailing whitespace will be in next, strip it
            result.push({
              value: change.value.slice(0, -trailingWs.length) || change.value,
              removed: true,
              count: 1,
            });
            continue;
          }
        }
      }
    }

    // Default: just add the change as-is
    result.push({ ...change });
  }

  return mergeConsecutiveChanges(result);
}

/**
 * Compare two strings line by line.
 * Similar to Diff.diffLines from the 'diff' package.
 */
export function diffLines(oldStr: string, newStr: string): Change[] {
  const oldLines = splitLines(oldStr);
  const newLines = splitLines(newStr);

  return computeDiff(oldLines, newLines);
}

/**
 * Compare two strings word by word, preserving whitespace.
 * Similar to Diff.diffWordsWithSpace from the 'diff' package.
 *
 * Features matching jsdiff:
 * - Extended Unicode word character support
 * - Proper tokenization (words, whitespace runs, single punctuation)
 * - Whitespace deduplication in consecutive changes
 */
export function diffWordsWithSpace(oldStr: string, newStr: string): Change[] {
  const oldWords = tokenizeWords(oldStr);
  const newWords = tokenizeWords(newStr);

  const diff = computeDiff(oldWords, newWords);
  return dedupeWhitespaceInChangeObjects(diff);
}
