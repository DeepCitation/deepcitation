//flash and flash lite get super confused if we ask for a MD table and infinite loop
const MIN_CONTENT_LENGTH_FOR_GEMINI_GARBAGE = 64;
const MIN_REPETITIONS = 2;
const MIN_SENTENCE_CONTENT_LENGTH = 10;
const MIN_REPEATING_UNIT_LENGTH = 2;
const MAX_REPEATING_UNIT_LENGTH = 80;

function isMarkupLikeRepeatingUnit(value: string): boolean {
  if (value.length < MIN_REPEATING_UNIT_LENGTH || value.length > MAX_REPEATING_UNIT_LENGTH) return false;
  return /^<\/?[a-z][a-z0-9:-]*(?:\s[^<>]*)?>$/i.test(value);
}

function hasRepeatedMarkupLines(text: string): boolean {
  let firstLine: string | undefined;
  let repetitions = 0;
  let lineStart = 0;

  for (let index = 0; index <= text.length; index++) {
    if (index < text.length && text[index] !== "\n") continue;

    const line = text.slice(lineStart, index).trim();
    lineStart = index + 1;
    if (!line) continue;

    if (firstLine === undefined) {
      if (!isMarkupLikeRepeatingUnit(line)) return false;
      firstLine = line;
      repetitions = 1;
      continue;
    }

    if (line !== firstLine) return false;
    repetitions++;
  }

  return repetitions >= MIN_REPETITIONS;
}

export const isGeminiGarbage = (content: string) => {
  if (!content) return false;
  const trimmedContent = content.trim();
  if (trimmedContent.length < MIN_CONTENT_LENGTH_FOR_GEMINI_GARBAGE) return false;

  // Single-character repetition (e.g. "aaaaaaa...")
  const firstCharacter = trimmedContent[0];
  let allSameChar = true;
  for (let i = 1; i < trimmedContent.length; i++) {
    if (trimmedContent[i] !== firstCharacter) {
      allSameChar = false;
      break;
    }
  }
  if (allSameChar) return true;

  // Multi-character markup repetition (e.g. "</font>\n</font>\n...").
  return hasRepeatedMarkupLines(trimmedContent);
};

// Single linear scan — no regex, so the 100KB validateRegexInput cap does not
// apply. The caller passes legitimate long-form LLM output that can exceed
// that cap without being ReDoS-prone.
function findSentenceEndIndices(text: string): number[] {
  const indices: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character !== "." && character !== "?" && character !== "!") continue;
    const nextCharacter = text[index + 1];
    if (
      nextCharacter === undefined ||
      nextCharacter === " " ||
      nextCharacter === "\n" ||
      nextCharacter === "\r" ||
      nextCharacter === "\t" ||
      nextCharacter === "\f" ||
      nextCharacter === "\v"
    ) {
      indices.push(index);
    }
  }
  return indices;
}

// helps clean up infinite rambling bug output from gemini
export function cleanRepeatingLastSentence(text: string): string {
  text = text.trim();
  const sentenceEndIndices = findSentenceEndIndices(text);

  if (sentenceEndIndices.length < 2) {
    return text;
  }

  const lastTerminatorIndex = sentenceEndIndices[sentenceEndIndices.length - 1];
  const secondLastTerminatorIndex = sentenceEndIndices[sentenceEndIndices.length - 2];

  const repeatingUnit = text.substring(secondLastTerminatorIndex + 1, lastTerminatorIndex + 1);
  const unitLength = repeatingUnit.length;

  const sentenceContent = repeatingUnit.trim().slice(0, -1);
  if (sentenceContent.length < MIN_SENTENCE_CONTENT_LENGTH) {
    return text;
  }
  if (unitLength <= 0) {
    return text;
  }

  if (text.length < unitLength * MIN_REPETITIONS) {
    return text;
  }

  let repetitionsFound = 0;
  let currentCheckEndIndex = lastTerminatorIndex + 1;
  if (text.endsWith(repeatingUnit)) {
    currentCheckEndIndex = text.length;
  }

  let firstRepetitionStartIndex = -1;

  while (true) {
    const checkStartIndex = currentCheckEndIndex - unitLength;

    if (checkStartIndex < 0) {
      break;
    }

    if (text.startsWith(repeatingUnit, checkStartIndex)) {
      repetitionsFound++;
      firstRepetitionStartIndex = checkStartIndex;
      currentCheckEndIndex = checkStartIndex;
    } else {
      break;
    }
  }

  if (repetitionsFound >= MIN_REPETITIONS) {
    return text.substring(0, firstRepetitionStartIndex) + repeatingUnit;
  }
  return text;
}
