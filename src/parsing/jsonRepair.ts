/**
 * JSON Repair
 *
 * Utilities to repair malformed JSON emitted by LLMs before parsing.
 * Handles common issues like trailing commas, unescaped control characters,
 * invalid escape sequences, markdown code-block wrappers, and unclosed brackets.
 */

function escapeLiteralControlCharactersInJsonStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      out += ch;
      inString = false;
      continue;
    }

    if (ch === "\r") {
      if (text[i + 1] === "\n") {
        out += "\\n";
        i++;
        continue;
      }
      out += "\\n";
      continue;
    }

    if (ch === "\n") {
      out += "\\n";
      continue;
    }

    if (ch === "\t") {
      out += "\\t";
      continue;
    }

    if (ch.charCodeAt(0) < 0x20) {
      out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
      continue;
    }

    out += ch;
  }

  return out;
}

/**
 * Attempts to repair malformed JSON.
 * Handles common LLM output issues like:
 * - Trailing commas
 * - Single quotes instead of double quotes (in JSON context)
 * - Missing closing brackets
 * - Unescaped newlines in strings
 * - Invalid escape sequences (like \~ or \x)
 *
 * @param jsonString - The potentially malformed JSON string
 * @returns The repaired JSON string
 */
export function repairJson(jsonString: string): {
  repaired: string;
  repairs: string[];
} {
  let repaired = jsonString.trim();
  const repairs: string[] = [];

  // Remove any markdown code block markers that might be present
  const beforeMarkdownRemoval = repaired;
  repaired = repaired.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (repaired !== beforeMarkdownRemoval) {
    repairs.push("removed markdown code block markers");
  }

  // Escape literal control characters that LLMs sometimes emit inside JSON
  // strings (especially multiline source_context/source_match values).
  const beforeControlCharRepair = repaired;
  repaired = escapeLiteralControlCharactersInJsonStrings(repaired);
  if (repaired !== beforeControlCharRepair) {
    repairs.push("escaped literal control characters");
  }

  // Fix invalid escape sequences inside JSON strings.
  // Valid escapes: \" \\ \/ \b \f \n \r \t \uXXXX
  // Invalid escapes like \~ \x \a etc. should have the backslash removed.
  // We need to be careful to only process content inside string values.
  // Note: \u is only valid when followed by exactly 4 hex digits (e.g.,  ).
  // Invalid \u sequences (like \utest) should have the backslash removed.
  const beforeInvalidEscapes = repaired;
  repaired = repaired.replace(/"(?:[^"\\]|\\.)*"/g, match => {
    // Inside a JSON string, fix invalid escape sequences
    // by removing the backslash before non-standard escape characters.
    // Use negative lookahead to preserve valid unicode escapes (\uXXXX).
    return match.replace(/\\(?!u[0-9a-fA-F]{4})([^"\\/bfnrt])/g, (_, char) => char);
  });
  if (repaired !== beforeInvalidEscapes) {
    repairs.push("fixed invalid escape sequences");
  }

  // Fix trailing commas before ] or }
  const beforeTrailingCommas = repaired;
  repaired = repaired.replace(/,(\s*[\]}])/g, "$1");
  if (repaired !== beforeTrailingCommas) {
    repairs.push("removed trailing commas");
  }

  // Fix missing closing bracket if we have an opening [
  if (repaired.startsWith("[") && !repaired.endsWith("]")) {
    // Check if we have unclosed array
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      const addedCount = openBrackets - closeBrackets;
      repaired = repaired + "]".repeat(addedCount);
      repairs.push(`added ${addedCount} closing bracket(s)`);
    }
  }

  // Fix missing closing brace if we have an opening {
  if (repaired.includes("{")) {
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      const addedCount = openBraces - closeBraces;
      repaired = repaired + "}".repeat(addedCount);
      repairs.push(`added ${addedCount} closing brace(s)`);
    }
  }

  return { repaired, repairs };
}
