export const CITATION_MARKDOWN_SYNTAX_PROMPT = `
Citation syntax to use within Markdown:
• To support any ideas or information that requires a citation from the provided content, use the following citation syntax:
<cite file_id='file_id' start_page_key='page_number_PAGE_index_INDEX' full_phrase='the verbatim text of the terse phrase inside <file_text />; remember to escape quotes and newlines inside the full_phrase to remain as valid JSON' key_span='the verbatim 1-3 words within full_phrase that best support the citation' line_ids='2-6' reasoning='the terse logic used to conclude the citation' />

• Very important: for page numbers, only use the page number and page index info from the page_number_PAGE_index_INDEX format (e.g. <page_number_1_index_0>) and never from the contents inside the page.
• start_page_key, full_phrase, and line_ids are required for each citation.
• Infer line_ids, as we only provide the first, last, and every 5th line. When copying a previous <cite />, use the full info from the previous citation without changing the start_page_key, line_ids, or any other <cite /> attributes.
• Use refer to line_ids inclusively, and use a range (or single) for each citation, split multiple sequential line_ids into multiple citations.
• These citations will be replaced and displayed in-line as a numeric element (e.g. [1]), the markdown preceding <cite /> should read naturally with only one <cite /> per sentence with rare exceptions for two <cite /> in a sentence. <cite /> often present best at the end of the sentence, and are not grouped at the end of the document.
• The full_phrase should be the exact verbatim text of the phrase or paragraph from the source document to support the insight or idea.
• We do NOT put the full_phrase inside <cite ...></cite>; we only use full_phrase inside the full_phrase attribute.
`;

export const AV_CITATION_MARKDOWN_SYNTAX_PROMPT = `
• To support any ideas or information that requires a citation from the provided content, use the following citation syntax:
<cite file_id='file_id' full_phrase='the verbatim text of the phrase; remember to escape quotes and newlines inside the full_phrase to remain as valid JSON' timestamps='HH:MM:SS.SSS-HH:MM:SS.SSS' reasoning='the logic connecting the form section requirements to the supporting source citation' />
• These citations are displayed in-line or in the relevant list item, and are not grouped at the end of the document.
`;

export interface WrapSystemPromptOptions {
  /** The original system prompt to wrap with citation instructions */
  systemPrompt: string;
  /** Whether to use audio/video citation format (with timestamps) instead of text-based (with line IDs) */
  isAudioVideo?: boolean;

  prependCitationInstructions?: boolean;
}

export interface WrapCitationPromptOptions {
  /** The original system prompt to wrap with citation instructions */
  systemPrompt: string;
  /** The original user prompt */
  userPrompt: string;
  /** The extracted file text with metadata (from uploadFile response). Can be a single string or array for multiple files. */
  deepTextPromptPortion?: string | string[];
  /** Whether to use audio/video citation format (with timestamps) instead of text-based (with line IDs) */
  isAudioVideo?: boolean;
}

export interface WrapCitationPromptResult {
  /** Enhanced system prompt with citation instructions */
  enhancedSystemPrompt: string;
  /** Enhanced user prompt (currently passed through unchanged) */
  enhancedUserPrompt: string;
}

/**
 * Wraps your existing system prompt with DeepCitation's citation syntax instructions.
 * This enables LLMs to output verifiable citations that can be checked against source documents.
 *
 * @example
 * ```typescript
 * import { wrapSystemCitationPrompt } from '@deepcitation/deepcitation-js';
 *
 * const systemPrompt = "You are a helpful assistant that analyzes documents.";
 * const enhanced = wrapSystemCitationPrompt({ systemPrompt });
 *
 * // Use enhanced prompt with your LLM
 * const response = await openai.chat.completions.create({
 *   messages: [{ role: "system", content: enhanced }],
 *   // ...
 * });
 * ```
 */
export function wrapSystemCitationPrompt(
  options: WrapSystemPromptOptions
): string {
  const {
    systemPrompt,
    isAudioVideo = false,
    prependCitationInstructions = false,
  } = options;

  const citationPrompt = isAudioVideo
    ? AV_CITATION_MARKDOWN_SYNTAX_PROMPT
    : CITATION_MARKDOWN_SYNTAX_PROMPT;

  if (prependCitationInstructions) {
    return `${citationPrompt.trim()}

${systemPrompt.trim()}`;
  }

  //append
  return `${systemPrompt.trim()}

${citationPrompt.trim()}`;
}

/**
 * Wraps both system and user prompts with DeepCitation's citation syntax instructions.
 * This is the recommended way to prepare prompts for citation verification.
 *
 * @example
 * ```typescript
 * import { wrapCitationPrompt } from '@deepcitation/deepcitation-js';
 *
 * // Single file
 * const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
 *   systemPrompt: "You are a helpful assistant.",
 *   userPrompt: "Analyze this document and summarize it.",
 *   deepTextPromptPortion, // from uploadFile response
 * });
 *
 * // Multiple files
 * const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
 *   systemPrompt: "You are a helpful assistant.",
 *   userPrompt: "Compare these documents.",
 *   deepTextPromptPortion: [deepTextPromptPortion1, deepTextPromptPortion2], // array of file texts
 * });
 *
 * // Use enhanced prompts with your LLM
 * const response = await llm.chat({
 *   messages: [
 *     { role: "system", content: enhancedSystemPrompt },
 *     { role: "user", content: enhancedUserPrompt },
 *   ],
 * });
 * ```
 */
export function wrapCitationPrompt(
  options: WrapCitationPromptOptions
): WrapCitationPromptResult {
  const {
    systemPrompt,
    userPrompt,
    deepTextPromptPortion,
    isAudioVideo = false,
  } = options;

  const enhancedSystemPrompt = wrapSystemCitationPrompt({
    systemPrompt,
    isAudioVideo,
  });

  // Build enhanced user prompt with file content if provided
  let enhancedUserPrompt = userPrompt;

  if (deepTextPromptPortion) {
    const fileTexts = Array.isArray(deepTextPromptPortion)
      ? deepTextPromptPortion
      : [deepTextPromptPortion];
    const fileContent = fileTexts
      .map((text, index) => {
        if (fileTexts.length === 1) {
          return `\n${text}`;
        }
        return `\n${text}`;
      })
      .join("\n\n");

    enhancedUserPrompt = `${fileContent}\n\n${userPrompt}`;
  }

  return {
    enhancedSystemPrompt,
    enhancedUserPrompt,
  };
}

export const CITATION_JSON_OUTPUT_FORMAT = {
  type: "object",
  properties: {
    fileId: { type: "string" },
    startPageKey: {
      type: "string",
      description:
        'Only return a result like "page_number_PAGE_index_INDEX" from the provided page keys (e.g. <page_number_1_index_0>) and never from the contents inside the page.',
    },
    reasoning: {
      type: "string",
      description:
        "The logic connecting the form section requirements to the supporting source citation",
    },
    fullPhrase: {
      type: "string",
      description:
        "The verbatim text of the terse phrase inside <file_text /> to support the citation (if there is a detected OCR correction, use the corrected text)",
    },
    keySpan: {
      type: "string",
      description:
        "the verbatim 1-3 words within fullPhrase that best support the citation",
    },
    lineIds: {
      type: "array",
      items: { type: "number" },
      description:
        "Infer lineIds, as we only provide the first, last, and every 5th line. Provide inclusive lineIds for the fullPhrase.",
    },
  },
  required: [
    "fileId",
    "startPageKey",
    "reasoning",
    "fullPhrase",
    "keySpan",
    "lineIds",
  ],
};

export const CITATION_AV_BASED_JSON_OUTPUT_FORMAT = {
  type: "object",
  properties: {
    fileId: { type: "string" },
    startPageKey: {
      type: "string",
      description:
        'Only return a result like "page_number_PAGE_index_INDEX" from the provided page keys (e.g. <page_number_1_index_0>) and never from the contents inside the page.',
    },
    fullPhrase: {
      type: "string",
      description:
        "The exact verbatim text of the phrase or paragraph from the source document to support the citation (if there is a detected OCR correction, use the verbatim corrected text)",
    },
    timestamps: {
      type: "object",
      properties: {
        startTime: { type: "string" },
        endTime: { type: "string" },
      },
      required: ["startTime", "endTime"],
      description:
        "The timestamp of the audio or video frame including milliseconds formatted as: HH:MM:SS.SSS",
    },
  },
};
