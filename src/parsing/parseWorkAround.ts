//flash and flash lite get super confused if we ask for a MD table and infinite loop
const MIN_CONTENT_LENGTH_FOR_GEMINI_GARBAGE = 64;
const MIN_REPETITIONS = 2;
const MIN_SENTENCE_CONTENT_LENGTH = 10;

export const isGeminiGarbage = (content: string) => {
  if (!content) return false;
  const trimmedContent = content.trim();
  if (trimmedContent.length < MIN_CONTENT_LENGTH_FOR_GEMINI_GARBAGE) return false;

  const firstCharacter = trimmedContent[0];

  for (let i = 1; i < trimmedContent.length; i++) {
    if (trimmedContent[i] !== firstCharacter) return false;
  }
  return true;
};

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
