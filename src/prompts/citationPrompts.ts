export const CITATION_MARKDOWN_SYNTAX_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Citation Format

You MUST cite sources using this exact syntax:

<cite attachment_id='ID' reasoning='why this supports the claim' key_span='1-3 key words' full_phrase='verbatim quote' start_page_key='page_number_N_index_I' line_ids='X-Y' />

### Syntax Rules (MUST follow)

1. **attachment_id**: Use the exact ID from the source document
2. **reasoning**: Brief explanation of why this citation supports your claim (think first!)
3. **key_span**: The 1-3 most important words from full_phrase
4. **full_phrase**: Copy text VERBATIM from source. Escape quotes (\\') and newlines (\\n).
5. **start_page_key**: ONLY use format \`page_number_N_index_I\` from page tags (e.g., \`<page_number_1_index_0>\`). Never extract page numbers from document content.
6. **line_ids**: Inclusive range (e.g., '2-6' or '4'). Infer intermediate lines since only every 5th line is shown.

### Placement Rules

- Place <cite /> inline, typically at the end of a claim
- One citation per distinct idea, concept, or value (a sentence citing 3 different values needs 3 citations)
- Do NOT group citations at the end of the document
- The <cite /> tag is self-closing - never use <cite>...</cite>

### Example

The company reported strong growth<cite attachment_id='abc123' reasoning='directly states revenue growth percentage' key_span='increased 45%' full_phrase='Revenue increased 45% year-over-year to $2.3 billion' start_page_key='page_number_2_index_1' line_ids='12-14' />

</citation-instructions>
`;

export const AV_CITATION_MARKDOWN_SYNTAX_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Audio/Video Citation Format

You MUST cite sources using this exact syntax:

<cite attachment_id='ID' reasoning='why this supports the claim' full_phrase='verbatim transcript quote' timestamps='HH:MM:SS.SSS-HH:MM:SS.SSS' />

### Syntax Rules (MUST follow)

1. **attachment_id**: Use the exact ID from the source
2. **reasoning**: Brief explanation of why this citation supports your claim (think first!)
3. **full_phrase**: Copy transcript text VERBATIM. Escape quotes (\\') and newlines (\\n).
4. **timestamps**: Start and end time with milliseconds (e.g., '00:01:23.456-00:01:45.789')

### Placement Rules

- Place <cite /> inline, typically at the end of a claim
- One citation per distinct idea, concept, or value (a sentence citing 3 different values needs 3 citations)
- Do NOT group citations at the end of the document
- The <cite /> tag is self-closing - never use <cite>...</cite>

</citation-instructions>
`;

/**
 * A brief reminder to reinforce citation requirements in user messages.
 * Use this when you want to add emphasis without repeating full instructions.
 */
export const CITATION_REMINDER = `<citation-reminder>Remember: You MUST use <cite /> tags with all required attributes for every claim from source documents.</citation-reminder>`;

/**
 * Audio/video version of the citation reminder.
 */
export const CITATION_AV_REMINDER = `<citation-reminder>Remember: You MUST use <cite /> tags with timestamps for every claim from source media.</citation-reminder>`;

export interface WrapSystemPromptOptions {
  /** The original system prompt to wrap with citation instructions */
  systemPrompt: string;
  /** Whether to use audio/video citation format (with timestamps) instead of text-based (with line IDs) */
  isAudioVideo?: boolean;
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
  /**
   * Whether to add a citation reminder to the user prompt.
   * Useful for reinforcing citation requirements.
   * @default false
   */
  addUserReminder?: boolean;
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
 * Citation instructions are placed at the start of the prompt (highest priority) with a
 * brief reminder at the end for maximum reliability.
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
  const { systemPrompt, isAudioVideo = false } = options;

  const citationPrompt = isAudioVideo
    ? AV_CITATION_MARKDOWN_SYNTAX_PROMPT
    : CITATION_MARKDOWN_SYNTAX_PROMPT;

  const reminder = isAudioVideo ? CITATION_AV_REMINDER : CITATION_REMINDER;

  // Full instructions at start, brief reminder at end for maximum reliability
  return `${citationPrompt.trim()}\n\n${systemPrompt.trim()}\n\n${reminder}`;
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
    addUserReminder = false,
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

  // Add reminder to user prompt if requested
  if (addUserReminder) {
    const reminder = isAudioVideo ? CITATION_AV_REMINDER : CITATION_REMINDER;
    enhancedUserPrompt = `${enhancedUserPrompt}\n\n${reminder}`;
  }

  return {
    enhancedSystemPrompt,
    enhancedUserPrompt,
  };
}

export const CITATION_JSON_OUTPUT_FORMAT = {
  type: "object",
  properties: {
    attachmentId: { type: "string" },
    reasoning: {
      type: "string",
      description:
        "The logic connecting the form section requirements to the supporting source citation (think first!)",
    },
    keySpan: {
      type: "string",
      description:
        "The verbatim 1-3 words within fullPhrase that best support the citation",
    },
    fullPhrase: {
      type: "string",
      description:
        "The verbatim text of the terse phrase inside <attachment_text /> to support the citation (if there is a detected OCR correction, use the corrected text)",
    },
    startPageKey: {
      type: "string",
      description:
        'Only return a result like "page_number_PAGE_index_INDEX" from the provided page keys (e.g. <page_number_1_index_0>) and never from the contents inside the page.',
    },
    lineIds: {
      type: "array",
      items: { type: "number" },
      description:
        "Infer lineIds, as we only provide the first, last, and every 5th line. Provide inclusive lineIds for the fullPhrase.",
    },
  },
  required: [
    "attachmentId",
    "reasoning",
    "keySpan",
    "fullPhrase",
    "startPageKey",
    "lineIds",
  ],
};

export const CITATION_AV_BASED_JSON_OUTPUT_FORMAT = {
  type: "object",
  properties: {
    attachmentId: { type: "string" },
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
  required: ["attachmentId", "startPageKey", "fullPhrase", "timestamps"],
};
