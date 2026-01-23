import {
  DEFERRED_CITATION_PROMPT,
  DEFERRED_AV_CITATION_PROMPT,
  DEFERRED_CITATION_REMINDER,
  DEFERRED_AV_CITATION_REMINDER,
} from "./deferredCitationPrompt.js";

/**
 * Citation mode for prompt wrapping.
 *
 * - `'inline_xml'`: Legacy mode using inline `<cite ... />` XML tags (default for backward compatibility)
 * - `'deferred_json'`: New mode using `[N]` markers with JSON block at end (recommended for new integrations)
 *
 * The deferred_json mode provides:
 * - Better robustness (no quote-escaping issues)
 * - Improved streaming latency (no mid-sentence pausing)
 * - ~40% reduction in tokens per citation
 */
export type CitationMode = "inline_xml" | "deferred_json";

export const CITATION_MARKDOWN_SYNTAX_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Citation Format

### Scope (Where to use)
For every claim, value, or fact in your chat response; you MUST cite the attachment using this exact syntax:

<cite attachment_id='ID' reasoning='why this supports the claim' full_phrase='verbatim quote' key_span='1-3 key words' start_page_key='page_number_N_index_I' line_ids='X-Y' />

### Syntax Rules (MUST follow)

1. **attachment_id**: Use the exact ID from the source document
2. **reasoning**: Brief explanation of why this citation supports your claim (think first!)
3. **full_phrase**: Copy text VERBATIM from source. Escape quotes (\\') and newlines (\\n).
4. **key_span**: The 1-3 most important words or value from full_phrase
5. **start_page_key**: ONLY use format \`page_number_N_index_I\` from page tags (e.g., \`<page_number_1_index_0>\`). Never extract page numbers from document content.
6. **line_ids**: Inclusive range (e.g., '2-6' or '4'). Infer intermediate lines since only every 5th line is shown.

### Placement Rules

- Place <cite /> inline, typically at the end of a claim
- One citation per distinct idea, concept, or value (a sentence citing 3 different values needs 3 citations)
- Do NOT group citations at the end of the document
- The <cite /> tag is self-closing - never use <cite>...</cite>

### Example Citation 1

The company reported strong growth<cite attachment_id='abc123' reasoning='directly states revenue growth percentage' full_phrase='Revenue increased 45% year-over-year to $2.3 billion' key_span='increased 45%' start_page_key='page_number_2_index_1' line_ids='12-14' />

### Example Citation 2

The total amount is $500 USD <cite attachment_id='abc123' reasoning='directly states the total amount' full_phrase='The total amount is $500 USD' key_span='$500 USD' start_page_key='page_number_2_index_1' line_ids='12-14' />
</citation-instructions>

`;

export const AV_CITATION_MARKDOWN_SYNTAX_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Audio/Video Citation Format

For every claim, value, or fact; you MUST cite the attachment using this exact syntax:

<cite attachment_id='ID' reasoning='why this supports the claim' full_phrase='verbatim transcript quote' key_span='1-3 key words' timestamps='HH:MM:SS.SSS-HH:MM:SS.SSS' />

### Syntax Rules (MUST follow)

1. **attachment_id**: Use the exact ID from the source
2. **reasoning**: Brief explanation of why this citation supports your claim (think first!)
3. **full_phrase**: Copy transcript text VERBATIM. Escape quotes (\\') and newlines (\\n).
4. **key_span**: The 1-3 most important words or value from full_phrase
5. **timestamps**: Start and end time with milliseconds (e.g., '00:01:23.456-00:01:45.789')

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
export const CITATION_REMINDER = `<citation-reminder>STOP and CHECK: Did you use <cite /> tags with all required attributes for every claim, value, or fact from attachments?</citation-reminder>`;

/**
 * Audio/video version of the citation reminder.
 */
export const CITATION_AV_REMINDER = `<citation-reminder>STOP and CHECK: Did you use <cite /> tags with timestamps for every claim, value, or fact from source media?</citation-reminder>`;

export interface WrapSystemPromptOptions {
  /** The original system prompt to wrap with citation instructions */
  systemPrompt: string;
  /** Whether to use audio/video citation format (with timestamps) instead of text-based (with line IDs) */
  isAudioVideo?: boolean;
  /**
   * Citation mode to use.
   * - `'inline_xml'`: Legacy inline `<cite />` tags (default)
   * - `'deferred_json'`: New `[N]` markers with JSON block at end (recommended)
   * @default 'inline_xml'
   */
  mode?: CitationMode;
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
   * Citation mode to use.
   * - `'inline_xml'`: Legacy inline `<cite />` tags (default)
   * - `'deferred_json'`: New `[N]` markers with JSON block at end (recommended)
   * @default 'inline_xml'
   */
  mode?: CitationMode;
}

export interface WrapCitationPromptResult {
  /** Enhanced system prompt with citation instructions */
  enhancedSystemPrompt: string;
  /** Enhanced user prompt (currently passed through unchanged) */
  enhancedUserPrompt: string;
}

/**
 * Wraps your existing system prompt with DeepCitation's citation syntax instructions.
 * This enables LLMs to output verifiable citations that can be checked against attachments.
 *
 * ## Why We Wrap (Instructions at Start + Reminder at End)
 *
 * This function places full citation instructions at the **start** of your system prompt
 * and a brief reminder at the **end**. This "wrap" strategy is intentional and based on
 * two key principles:
 *
 * ### 1. Recency Effect (RE2)
 * LLMs exhibit a "recency bias" where instructions closer to the end of the context
 * window have stronger influence on output. The reminder at the end reinforces citation
 * requirements right before generation begins.
 *
 * ### 2. Chain-of-Thought (CoT) Attribute Ordering
 * The citation attributes are ordered to encourage the model to "think first":
 * `attachment_id` → `reasoning` → `full_phrase` → `key_span` → `start_page_key` → `line_ids`
 *
 * By placing `reasoning` early, the model must articulate WHY it's citing before
 * specifying WHAT it's citing. Then `full_phrase` comes before `key_span` so the model
 * first produces the complete verbatim quote, then extracts the key span from it,
 * ensuring `key_span` is always a valid substring of `full_phrase`.
 *
 * ### Why Not Just Append?
 * In large system prompts, appended instructions can get "lost" in the middle of the
 * effective context. Prepending ensures citation instructions have high priority,
 * while the reminder leverages recency for reinforcement.
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
  const { systemPrompt, isAudioVideo = false, mode = "inline_xml" } = options;

  let citationPrompt: string;
  let reminder: string;

  if (mode === "deferred_json") {
    // Use deferred JSON pattern with [N] markers and JSON block at end
    citationPrompt = isAudioVideo
      ? DEFERRED_AV_CITATION_PROMPT
      : DEFERRED_CITATION_PROMPT;
    reminder = isAudioVideo
      ? DEFERRED_AV_CITATION_REMINDER
      : DEFERRED_CITATION_REMINDER;
  } else {
    // Use legacy inline XML pattern with <cite /> tags
    citationPrompt = isAudioVideo
      ? AV_CITATION_MARKDOWN_SYNTAX_PROMPT
      : CITATION_MARKDOWN_SYNTAX_PROMPT;
    reminder = isAudioVideo ? CITATION_AV_REMINDER : CITATION_REMINDER;
  }

  // Full instructions at start (high priority), brief reminder at end (recency effect)
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
    mode = "inline_xml",
  } = options;

  const enhancedSystemPrompt = wrapSystemCitationPrompt({
    systemPrompt,
    isAudioVideo,
    mode,
  });

  // Select the appropriate reminder based on mode
  let reminder: string;
  if (mode === "deferred_json") {
    reminder = isAudioVideo
      ? DEFERRED_AV_CITATION_REMINDER
      : DEFERRED_CITATION_REMINDER;
  } else {
    reminder = isAudioVideo ? CITATION_AV_REMINDER : CITATION_REMINDER;
  }

  // Build enhanced user prompt with file content if provided
  let enhancedUserPrompt = userPrompt;

  if (deepTextPromptPortion) {
    const fileTexts = Array.isArray(deepTextPromptPortion)
      ? deepTextPromptPortion
      : [deepTextPromptPortion];
    const fileContent = fileTexts
      .map((text) => {
        return `\n${text}`;
      })
      .join("\n\n");

    enhancedUserPrompt = `${fileContent}\n\n${reminder}\n\n${userPrompt}`;
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
    fullPhrase: {
      type: "string",
      description:
        "The verbatim text of the terse phrase inside <attachment_text /> to support the citation (if there is a detected OCR correction, use the corrected text)",
    },
    keySpan: {
      type: "string",
      description:
        "The verbatim 1-3 words within fullPhrase that best support the citation",
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
    "fullPhrase",
    "keySpan",
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
    keySpan: {
      type: "string",
      description:
        "The verbatim 1-3 words within fullPhrase that best support the citation",
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
  required: ["attachmentId", "startPageKey", "fullPhrase", "keySpan", "timestamps"],
};
