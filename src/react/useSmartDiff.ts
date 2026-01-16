import { diffLines, diffWordsWithSpace } from "../utils/diff.js";
import { useMemo } from "react";

export type DiffBlockType = "modified" | "added" | "removed" | "unchanged";

export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface DiffBlock {
  type: DiffBlockType;
  parts: DiffPart[];
}

export const useSmartDiff = (expected: string = "", actual: string = "") => {
  return useMemo(() => {
    // 1. Sanitize standard noise (CRLF, trailing spaces)
    const cleanExpected = (expected || "").trim().replace(/\r\n/g, "\n");
    const cleanActual = (actual || "").trim().replace(/\r\n/g, "\n");

    // 2. First Pass: Diff by LINES.
    // This isolates the "extra line" issue. The extra line becomes one "added" chunk,
    // and it prevents the tokenizer from getting confused on the rest of the text.
    const lineDiffs = diffLines(cleanExpected, cleanActual);

    // 3. Second Pass: Process the line results to find "Modifications"
    const processedDiffs: DiffBlock[] = [];
    let hasDiff = false;
    let totalChange = 0;

    for (let i = 0; i < lineDiffs.length; i++) {
      const part = lineDiffs[i];
      const nextPart = lineDiffs[i + 1];

      // CHECK FOR MODIFICATION:
      // If we see a "Removed" block immediately followed by an "Added" block,
      // it means this specific line changed. We should DIFF WORDS inside this line.
      if (part.removed && nextPart && nextPart.added) {
        // Run word diff ONLY on this pair of lines
        const wordDiffs = diffWordsWithSpace(part.value, nextPart.value);

        processedDiffs.push({
          type: "modified",
          parts: wordDiffs,
        });

        hasDiff = true;
        // Calculate raw change amount for variance score
        totalChange += Math.abs(part.value.length - nextPart.value.length);

        i++; // Skip the next part since we merged it into this block
      }
      // CHECK FOR PURE ADDITION/DELETION (The "Extra Line" Scenario)
      else if (part.added || part.removed) {
        processedDiffs.push({
          type: part.added ? "added" : "removed",
          parts: [{ value: part.value, added: part.added, removed: part.removed }],
        });
        hasDiff = true;
        totalChange += part.value.length;
      }
      // UNCHANGED BLOCKS
      else {
        processedDiffs.push({
          type: "unchanged",
          parts: [{ value: part.value }],
        });
      }
    }

    // 4. Calculate a similarity score to decide UI defaults
    // 1.0 = Perfect match, 0.0 = Totally different
    const maxLength = Math.max(cleanExpected.length, cleanActual.length);
    const similarity = maxLength === 0 ? 1 : 1 - totalChange / maxLength;

    return {
      diffResult: processedDiffs,
      hasDiff,
      similarity,
      // If similarity is too low (< 60%), the Diff view is likely "Fruit Salad" (messy).
      // We can use this boolean to default the UI to the "Source" tab.
      isHighVariance: similarity < 0.6,
    };
  }, [expected, actual]);
};
