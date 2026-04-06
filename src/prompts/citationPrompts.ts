import { removeLineIdMetadata, removePageNumberMetadata } from "../utils/textCleanup.js";

/**
 * Citation Prompts
 *
 * This module provides the "Numeric JSON Pattern" for citation output.
 * The LLM uses lightweight markers (e.g., [1], [2]) in the text and outputs
 * a structured JSON block at the end of the response.
 *
 * Canonical format spec: docs/prompts/citation-format.md
 * (single source of truth — update the spec file, not here)
 *
 * Benefits:
 * - **Robustness**: JSON.parse handles escaping naturally, avoiding quote-escaping issues
 * - **Streaming Latency**: No mid-sentence pausing for hidden metadata generation
 * - **Token Efficiency**: ~40% reduction in tokens per citation
 */

/** Start delimiter for the citation data block */
export const CITATION_DATA_START_DELIMITER = "<<<CITATION_DATA>>>";

/** End delimiter for the citation data block */
export const CITATION_DATA_END_DELIMITER = "<<<END_CITATION_DATA>>>";

/**
 * Citation prompt for document-based citations.
 * Uses [N] markers in text with JSON metadata at the end.
 * Citations are grouped by attachment_id to avoid repetition.
 *
 * Shorthand key mapping (optional):
 * - n: id, r: reasoning, f: full_phrase
 * - k: anchor_text, p: page_id, l: line_ids
 */
export const CITATION_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Citation Format

### In-Text Markers
Write naturally and **bold** the 1–4 word name of each key fact — a claim, value, fact, entity, date, or price. Not the surrounding clause, just the core term. Place a citation marker [N] immediately after each bolded term, where N is the sequential citation number (1, 2, 3…). One unique ID per distinct fact.

Example: The company reported **45% growth** [1] in revenue, reaching **$2.3 billion** [2] in Q4.

### Citation Data Block
At the END of your response, append a citation block. Group citations by attachment_id to avoid repetition.

### Format
\`\`\`
<<<CITATION_DATA>>>
{
  "attachment_id_here": [
    {"id": 1, "reasoning": "why", "full_phrase": "quote", "anchor_text": "key", "page_id": "page_number_2_index_1", "line_ids": [12]}
  ]
}
<<<END_CITATION_DATA>>>
\`\`\`

### Shorthand Keys (Optional)
To save tokens: n=id, r=reasoning, f=full_phrase, k=anchor_text, p=page_id, l=line_ids

### JSON Field Rules

1. **Group key**: The attachment_id (exact ID from source document)
2. **id** (or n): Each citation MUST have a unique ID matching its [N] marker. Do NOT reuse the same ID for different citations.
3. **reasoning** (or r): Brief explanation connecting the citation to your claim (think first!)
4. **full_phrase** (or f): Copy text VERBATIM from source. Use proper JSON escaping for quotes.
5. **anchor_text** (or k): 1–4 verbatim words from the evidence line (NEVER more than 4). Pick the distinctive noun or term, not the surrounding verb phrase. Drop leading articles ("the", "a"). This gets highlighted in yellow — a short highlight is precise; a full sentence in yellow is unreadable.
6. **page_id** (or p): Format "page_number_N_index_I" where N=page number, I=index (copy exactly from \`<page_number_N_index_I>\` tags in the source)
7. **line_ids** (or l): Array of line IDs from the source (copy from line ID markers in the text). Include IDs for all relevant lines.

### Placement Rules

- **Bold** the key term and place [N] after it, e.g. **Discount Rate** [2]
- One marker per distinct idea, concept, or value
- Use sequential numbering starting from 1 - each citation gets a unique number
- The JSON block MUST appear at the very end of your response

### Example Response

The company reported **strong growth** [1] in the quarter. Revenue reached **$2.3 billion** [2] in Q4. The **competitor** [3] also reported gains.

<<<CITATION_DATA>>>
{
  "abc123": [
    {"id": 1, "reasoning": "directly states growth metrics", "full_phrase": "The company achieved 45% year-over-year growth", "anchor_text": "45% growth", "page_id": "page_number_2_index_1", "line_ids": [12, 13]},
    {"id": 2, "reasoning": "states Q4 revenue figure", "full_phrase": "Q4 revenue reached $2.3 billion, up from $1.8 billion", "anchor_text": "$2.3 billion", "page_id": "page_number_3_index_2", "line_ids": [5, 6, 7]}
  ],
  "def456": [
    {"id": 3, "reasoning": "competitor data", "full_phrase": "Competitor X reported 20% growth", "anchor_text": "20% growth", "page_id": "page_number_1_index_0", "line_ids": [8]}
  ]
}
<<<END_CITATION_DATA>>>
</citation-instructions>

`;

/**
 * Citation prompt for audio/video content.
 * Uses timestamps instead of page/line references.
 * Citations are grouped by attachment_id to avoid repetition.
 *
 * Shorthand key mapping (optional):
 * - n: id, r: reasoning, f: full_phrase
 * - k: anchor_text, t: timestamps (with s: start_time, e: end_time)
 */
export const AV_CITATION_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Audio/Video Citation Format

### In-Text Markers
Write naturally and **bold** the 1–4 word name of each key fact — a claim, value, fact, entity, date, or price. Not the surrounding clause, just the core term. Place a citation marker [N] immediately after each bolded term, where N is the sequential citation number (1, 2, 3…). One unique ID per distinct fact.

### Citation Data Block
At the END of your response, append a citation block. Group citations by attachment_id to avoid repetition.

### Format
\`\`\`
<<<CITATION_DATA>>>
{
  "attachment_id_here": [
    {"id": 1, "reasoning": "why", "full_phrase": "quote", "anchor_text": "key", "timestamps": {"start_time": "HH:MM:SS.SSS", "end_time": "HH:MM:SS.SSS"}}
  ]
}
<<<END_CITATION_DATA>>>
\`\`\`

### Shorthand (Optional)
To save tokens: n=id, r=reasoning, f=full_phrase, k=anchor_text, t=timestamps (with s=start_time, e=end_time)

### JSON Field Rules

1. **Group key**: The attachment_id (exact ID from source media)
2. **id** (or n): Must match the [N] marker in your text (integer)
3. **reasoning** (or r): Brief explanation connecting the citation to your claim (think first!)
4. **full_phrase** (or f): Copy transcript text VERBATIM. Use proper JSON escaping.
5. **anchor_text** (or k): 1–4 verbatim words from the transcript (NEVER more than 4). Pick the distinctive noun or term, not the surrounding verb phrase. Drop leading articles ("the", "a"). This gets highlighted in yellow — a short highlight is precise; a full sentence in yellow is unreadable.
6. **timestamps** (or t): Object with start_time/s and end_time/e in HH:MM:SS.SSS format

### Placement Rules

- **Bold** the key term and place [N] after it, e.g. **exercise benefits** [1]
- One marker per distinct idea, concept, or value
- Use sequential numbering starting from 1
- The JSON block MUST appear at the very end of your response

### Example Response

The speaker discussed **exercise benefits** [1]. They recommended **specific techniques** [2].

<<<CITATION_DATA>>>
{
  "video123": [
    {"id": 1, "reasoning": "speaker directly states health benefits", "full_phrase": "Regular exercise improves cardiovascular health by 30%", "anchor_text": "cardiovascular health", "timestamps": {"start_time": "00:05:23.000", "end_time": "00:05:45.500"}},
    {"id": 2, "reasoning": "demonstrates proper form", "full_phrase": "Keep your back straight and engage your core", "anchor_text": "engage your core", "timestamps": {"start_time": "00:12:10.200", "end_time": "00:12:25.800"}}
  ]
}
<<<END_CITATION_DATA>>>
</citation-instructions>

`;

/**
 * A brief reminder to reinforce citation requirements in user messages.
 * Use this when you want to add emphasis without repeating full instructions.
 */
export const CITATION_REMINDER = `<citation-reminder>STOP and CHECK: Did you **bold** each key fact with [N] after it, and include the <<<CITATION_DATA>>> JSON block at the end?</citation-reminder>`;

/**
 * Audio/video version of the citation reminder.
 */
export const CITATION_AV_REMINDER = `<citation-reminder>STOP and CHECK: Did you **bold** each key fact with [N] after it, and include the <<<CITATION_DATA>>> JSON block with timestamps at the end?</citation-reminder>`;

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
  /**
   * Raw page text from prepareAttachments / uploadFile for a single attachment.
   * Pass pre-rendered strings if you already formatted the content yourself.
   */
  deepTextPages?: string | string[];
  /** Raw page text from prepareAttachments for multiple attachments, keyed by attachmentId. */
  deepTextPagesByAttachmentId?: Record<string, string[]>;
  /** Whether to use audio/video citation format (with timestamps) instead of text-based (with line IDs) */
  isAudioVideo?: boolean;
}

export interface WrapCitationPromptResult {
  /** Enhanced system prompt with citation instructions */
  enhancedSystemPrompt: string;
  /** Enhanced user prompt with raw pages rendered into the citation format when provided */
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
 * `attachment_id` → `reasoning` → `full_phrase` → `anchor_text` → `page_id` → `line_ids`
 *
 * By placing `reasoning` early, the model must articulate WHY it's citing before
 * specifying WHAT it's citing. Then `full_phrase` comes before `anchor_text` so the model
 * first produces the complete verbatim quote, then extracts the anchor text from it,
 * ensuring `anchor_text` is always a valid substring of `full_phrase`.
 *
 * ### Why Not Just Append?
 * In large system prompts, appended instructions can get "lost" in the middle of the
 * effective context. Prepending ensures citation instructions have high priority,
 * while the reminder leverages recency for reinforcement.
 *
 * @example
 * ```typescript
 * import { wrapSystemCitationPrompt } from 'deepcitation';
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
export function wrapSystemCitationPrompt(options: WrapSystemPromptOptions): string {
  const { systemPrompt, isAudioVideo = false } = options;

  const citationPrompt = isAudioVideo ? AV_CITATION_PROMPT : CITATION_PROMPT;
  const reminder = isAudioVideo ? CITATION_AV_REMINDER : CITATION_REMINDER;

  // Full instructions at start (high priority), brief reminder at end (recency effect)
  return `${citationPrompt.trim()}\n\n${systemPrompt.trim()}\n\n${reminder}`;
}

/**
 * Wraps both system and user prompts with DeepCitation's citation syntax instructions.
 * This is the recommended way to prepare prompts for citation verification.
 *
 * @example
 * ```typescript
 * import { wrapCitationPrompt } from 'deepcitation';
 *
 * // Single file
 * const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
 *   systemPrompt: "You are a helpful assistant.",
 *   userPrompt: "Analyze this document and summarize it.",
 *   deepTextPages, // from uploadFile response
 * });
 *
 * // Multiple files
 * const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
 *   systemPrompt: "You are a helpful assistant.",
 *   userPrompt: "Compare these documents.",
 *   deepTextPagesByAttachmentId: {
 *     attachment1: deepTextPages1,
 *     attachment2: deepTextPages2,
 *   },
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
export function wrapCitationPrompt(options: WrapCitationPromptOptions): WrapCitationPromptResult {
  const { systemPrompt, userPrompt, deepTextPages, deepTextPagesByAttachmentId, isAudioVideo = false } = options;

  const enhancedSystemPrompt = wrapSystemCitationPrompt({
    systemPrompt,
    isAudioVideo,
  });

  const reminder = isAudioVideo ? CITATION_AV_REMINDER : CITATION_REMINDER;

  // Build enhanced user prompt with file content if provided
  let enhancedUserPrompt = userPrompt;

  const renderedFileContent = deepTextPagesByAttachmentId
    ? renderDeepTextPagesByAttachmentId(deepTextPagesByAttachmentId)
    : deepTextPages
      ? renderDeepTextPages(deepTextPages)
      : "";

  if (renderedFileContent) {
    enhancedUserPrompt = `${renderedFileContent}\n\n${reminder}\n\n${userPrompt}`;
  }

  return {
    enhancedSystemPrompt,
    enhancedUserPrompt,
  };
}

function renderDeepTextPages(deepTextPages: string | string[]): string {
  if (typeof deepTextPages === "string") return deepTextPages;
  return renderDeepTextPromptString("attachment-1", deepTextPages);
}

function renderDeepTextPagesByAttachmentId(deepTextPagesByAttachmentId: Record<string, string[]>): string {
  return Object.entries(deepTextPagesByAttachmentId)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([attachmentId, pages]) => renderDeepTextPromptString(attachmentId, pages))
    .filter(Boolean)
    .join("\n\n");
}

function renderDeepTextPromptString(attachmentId: string, filePages: string[]): string {
  let isValid = false;
  const parts: string[] = [];

  for (let i = 0; i < filePages.length; i++) {
    const page = filePages[i] ?? "";
    if (page.trim()) isValid = true;

    const pageText = page.includes("<line id=") ? page : pageToLineTaggedText(page);
    parts.push(`<page_number_${i + 1}_index_${i}>\n${pageText}\n</page_number_${i + 1}_index_${i}>\n\n`);
  }

  if (!isValid) return "";
  return `<attachment id="${attachmentId}">${parts.join("").trim()}</attachment>`;
}

function pageToLineTaggedText(page: string): string {
  const cleanPage = removeLineIdMetadata(removePageNumberMetadata(page));
  const lines = cleanPage
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) return "";

  const lastIndex = lines.length - 1;
  return lines
    .map((line, index) => {
      if (index === 0 || index === lastIndex || (index + 1) % 5 === 0) {
        return `<line id="${index + 1}">${line}</line>`;
      }
      return line;
    })
    .join("\n");
}

/**
 * JSON schema for citation data (for structured output LLMs).
 * This can be used with OpenAI's response_format or similar features.
 */
export const CITATION_JSON_OUTPUT_FORMAT = {
  type: "object",
  properties: {
    id: {
      type: "integer",
      description: "Citation marker number matching (cite:N) in text",
    },
    attachment_id: {
      type: "string",
      description: "Exact attachment ID from source document",
    },
    reasoning: {
      type: "string",
      description: "Brief explanation of why this supports the claim",
    },
    full_phrase: {
      type: "string",
      description: "Verbatim quote from source document",
    },
    anchor_text: {
      type: "string",
      description:
        "1–4 verbatim words from full_phrase (never more than 4). Drop leading articles. Should match the anchor text used in [anchor](cite:N) inline markers",
    },
    page_id: {
      type: "string",
      description: "Page ID in format 'page_number_N_index_I' (copy from <page_number_N_index_I> tags)",
    },
    line_ids: {
      type: "array",
      items: { type: "integer" },
      description: "Array of line IDs for the citation",
    },
  },
  required: ["id", "attachment_id", "full_phrase", "anchor_text", "page_id", "line_ids"],
} as const;

/**
 * Compact citation prompt — omits full_phrase and reasoning from LLM output.
 *
 * Use this variant for latency-sensitive pipelines where fullPhrase is
 * reconstructed offline via `deepcitation hydrate` (or auto-hydrated by
 * `deepcitation verify --markdown` when a summary file is present).
 *
 * Token savings vs CITATION_PROMPT: ~80–135 tokens per citation
 * (eliminates ~50-75 tokens of verbatim copying + ~30-60 tokens of reasoning).
 *
 * Compact key mapping:
 * - n: id, k: anchor_text, p: page_id (compact "N_I" form), l: line_ids
 */
export const COMPACT_CITATION_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Citation Format (Compact)

### In-Text Markers
Write naturally and **bold** the 1–4 word name of each key fact — a claim, value, fact, entity, date, or price. Not the surrounding clause, just the core term. Bold text minimizes cognitive load for the reader: they scan the bolded terms to quickly grasp the key facts without reading every word. Place a citation marker [N] immediately after each bolded term, where N is the sequential citation number (1, 2, 3…). One unique ID per distinct fact.

Example: The **Discount Rate** [1] is applied to the conversion price. Revenue grew **45%** [2].

### Citation Data Block
At the END of your response, append a compact citation block grouped by attachment_id.
Do NOT output fullPhrase or reasoning — these are reconstructed automatically from lineIds.

### Format
\`\`\`
<<<CITATION_DATA>>>
{
  "attachment_id_here": [
    {"n": 1, "k": "key phrase", "p": "N_I", "l": [lineId]}
  ]
}
<<<END_CITATION_DATA>>>
\`\`\`

### Field Rules

1. **n**: Citation id (integer, matches [N] in text)
2. **k** (anchorText): 1–4 verbatim words from the evidence line (NEVER more than 4). Pick the distinctive noun or term, not the surrounding verb phrase. Drop leading articles ("the", "a"). This gets highlighted in yellow — a short highlight is precise; a full sentence in yellow is unreadable.
3. **p** (page_id): Compact form "N_I" where N=page number and I=index (extract from \`<page_number_N_index_I>\` tag)
4. **l** (line_ids): Array of line IDs from \`<line id="N">\` tags

### anchorText Examples
- "multiplied by the Discount Rate" → k: "Discount Rate" (not the verb phrase)
- "Junior to payment of outstanding indebtedness" → k: "Junior to"
- "a voluntary termination of operations" → k: "voluntary termination"
- "this Safe will automatically convert" → k: "automatically convert"
- "SAFE (Simple Agreement for Future Equity)" → k: "SAFE" (not the 5-word expansion)

### Placement Rules
- **Bold** the key term and place [N] after it, e.g. **Discount Rate** [2]
- Sequential IDs starting from 1 — each citation gets a unique number
- JSON block MUST appear at the very end of your response

### Example Response

The **Discount Rate** [1] is applied to the conversion price. Revenue grew **45%** [2].

<<<CITATION_DATA>>>
{
  "abc123": [
    {"n": 1, "k": "Discount Rate", "p": "2_0", "l": [47]},
    {"n": 2, "k": "45%", "p": "3_1", "l": [12]}
  ]
}
<<<END_CITATION_DATA>>>
</citation-instructions>

`;

/**
 * JSON schema for compact citation data (structured output LLMs, hydrate pipeline).
 * Omits full_phrase and reasoning — these are reconstructed by deepcitation hydrate.
 */
export const COMPACT_CITATION_JSON_OUTPUT_FORMAT = {
  type: "object",
  properties: {
    n: {
      type: "integer",
      description: "Citation marker number matching (cite:N) in text",
    },
    a: {
      type: "string",
      description: "Attachment ID (compact key for attachment_id)",
    },
    k: {
      type: "string",
      description:
        "anchorText: 1–4 verbatim words from the evidence line (never more than 4). Drop leading articles.",
    },
    p: {
      type: "string",
      description:
        "Compact page id 'N_I' (e.g. '2_0' for page 2, index 0). Extract N and I from <page_number_N_index_I> tags.",
    },
    l: {
      type: "array",
      items: { type: "integer" },
      description: "Array of line IDs from <line id='N'> tags",
    },
  },
  required: ["n", "a", "k", "p", "l"],
} as const;

/**
 * JSON schema for AV citation data.
 */
export const CITATION_AV_JSON_OUTPUT_FORMAT = {
  type: "object",
  properties: {
    id: {
      type: "integer",
      description: "Citation marker number matching (cite:N) in text",
    },
    attachment_id: {
      type: "string",
      description: "Exact attachment ID from source media",
    },
    reasoning: {
      type: "string",
      description: "Brief explanation of why this supports the claim",
    },
    full_phrase: {
      type: "string",
      description: "Verbatim transcript quote",
    },
    anchor_text: {
      type: "string",
      description: "1–4 verbatim words from full_phrase (never more than 4). Drop leading articles.",
    },
    timestamps: {
      type: "object",
      properties: {
        start_time: {
          type: "string",
          description: "Start time in HH:MM:SS.SSS format",
        },
        end_time: {
          type: "string",
          description: "End time in HH:MM:SS.SSS format",
        },
      },
      required: ["start_time", "end_time"],
    },
  },
  required: ["id", "attachment_id", "full_phrase", "anchor_text", "timestamps"],
} as const;

/**
 * Compact citation data format from LLM output.
 * Uses single-character keys for token efficiency.
 */
export interface CompactCitationData {
  /** Citation number (n) - matches [N] marker */
  n: number;
  /** Attachment ID (a) */
  a?: string;
  /** Reasoning (r) */
  r?: string;
  /** Full phrase (f) - verbatim quote */
  f?: string;
  /** Key phrase (k) - anchor text */
  k?: string;
  /** Page ID (p) - format "page_number_N_index_I" */
  p?: string;
  /** Line IDs (l) */
  l?: number[];
  /** Timestamps (t) for AV citations */
  t?: {
    /** Start time (s) */
    s?: string;
    /** End time (e) */
    e?: string;
  };
}

/**
 * Interface for citation data from JSON block.
 * This is the normalized/expanded format used internally after parsing.
 * The parser expands compact keys (n,a,r,f,k,p,l,t) to these full names.
 */
export interface CitationData {
  /** Citation marker number (matches [N] in text). Compact key: n */
  id: number;
  /** Attachment ID from source document. Compact key: a */
  attachment_id?: string;
  /** Reasoning for the citation. Compact key: r */
  reasoning?: string;
  /** Verbatim quote from source. Compact key: f */
  full_phrase?: string;
  /** Anchor text (1-3 words). Compact key: k */
  anchor_text?: string;
  /** Display label override — shown as the clickable trigger instead of anchor_text. Compact key: d */
  display_label?: string;
  /** Page ID in format "page_number_N_index_I". Compact key: p */
  page_id?: string;
  /** Line IDs array. Compact key: l */
  line_ids?: number[];
  /** Timestamps for AV citations. Compact key: t */
  timestamps?: {
    /** Start time. Compact key: s */
    start_time?: string;
    /** End time. Compact key: e */
    end_time?: string;
  };
}

/**
 * Result of parsing a citation response.
 */
export interface ParsedCitationResponse {
  /** The clean text meant for display (content before the delimiter) */
  visibleText: string;
  /** The structured citation data from the JSON block */
  citations: CitationData[];
  /** Helper map for O(1) lookups by ID */
  citationMap: Map<number, CitationData>;
  /** Whether parsing was successful */
  success: boolean;
  /** Error message if parsing failed */
  error?: string;
}
