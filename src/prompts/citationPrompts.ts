import {
  DEEP_TEXT_COMPACT_PAGE_ID_SCHEMA_DESCRIPTION,
  DEEP_TEXT_INCLUSIVE_LINE_IDS_SCHEMA_DESCRIPTION,
  DEEP_TEXT_PAGE_ID_SCHEMA_DESCRIPTION,
  pageToDeepTextLineTaggedText,
  wrapDeepTextPage,
} from "../deeptext/index.js";

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
 * - n: id, r: reasoning, f: source_context
 * - k: source_match, p: page_id, l: line_ids
 */
export const CITATION_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Citation Format

### In-Text Markers
Write naturally and **bold** the 1–4 word name of each key fact — a claim, value, fact, entity, date, or price. Not the surrounding clause, just the core term. Place a citation marker [N] immediately after each bolded term, where N is the sequential citation number (1, 2, 3…). One unique ID per distinct fact.

Example: The company reported **45% growth** [1] in revenue, reaching **$2.3 billion** [2] in Q4.

Mark only that term: never place [N] after a whole clause or a dash-joined phrase — the highlight grows left from [N], so a marker at the end of a clause highlights the entire clause. If the bolded term paraphrases the source instead of quoting it verbatim (e.g. **progressive functional limitation** where the source says "progressively limited"), \`reasoning\` is REQUIRED — state why the two mean the same thing.

### Citation Data Block
At the END of your response, append a citation block. Group citations by attachment_id to avoid repetition.

### Format
\`\`\`
<<<CITATION_DATA>>>
{
  "attachment_id_here": [
    {"id": 1, "reasoning": "why", "source_context": "quote", "source_match": "key", "page_id": "page_number_2_index_1", "line_ids": [12]}
  ]
}
<<<END_CITATION_DATA>>>
\`\`\`

### Shorthand Keys (Optional)
To save tokens: n=id, r=reasoning, f=source_context, k=source_match, p=page_id, l=line_ids, c=children

### JSON Field Rules

1. **Group key**: The attachment_id (exact ID from source document)
2. **id** (or n): Each citation MUST have a unique ID matching its [N] marker. Do NOT reuse the same ID for different citations.
3. **reasoning** (or r): Brief explanation connecting the citation to your claim (think first!). REQUIRED whenever your bolded term paraphrases the source rather than quoting source_match verbatim — explain why they mean the same thing.
4. **source_context** (or f): Copy text VERBATIM from source. Use proper JSON escaping for quotes.
5. **source_match** (or k): 1–4 verbatim words from the evidence line (NEVER more than 4). Pick the distinctive noun or term, not the surrounding verb phrase. Drop leading articles ("the", "a"). This gets highlighted in yellow — a short highlight is precise; a full sentence in yellow is unreadable.
6. **page_id** (or p): Format "page_number_N_index_I" where N=page number, I=index (copy exactly from \`<page_number_N_index_I>\` tags in the source)
7. **line_ids** (or l): Array of line IDs from the source (copy from line ID markers in the text). Count from the nearest \`<line id="N">\` tag above your text — if the tag says \`<line id="10">\` and your text is 3 lines below, the line ID is 13. Do NOT default to \`[1]\`.

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
    {"id": 1, "reasoning": "directly states growth metrics", "source_context": "The company achieved 45% year-over-year growth", "source_match": "45% growth", "page_id": "page_number_2_index_1", "line_ids": [12, 13]},
    {"id": 2, "reasoning": "states Q4 revenue figure", "source_context": "Q4 revenue reached $2.3 billion, up from $1.8 billion", "source_match": "$2.3 billion", "page_id": "page_number_3_index_2", "line_ids": [5, 6, 7]}
  ],
  "def456": [
    {"id": 3, "reasoning": "competitor data", "source_context": "Competitor X reported 20% growth", "source_match": "20% growth", "page_id": "page_number_1_index_0", "line_ids": [8]}
  ]
}
<<<END_CITATION_DATA>>>

### Supporting Facts (Optional)
When a claim has 2+ verifiable details from the source (dates, amounts, scope qualifiers), group them under the primary fact using a "children" array.

Use ONLY when:
- A claim references multiple verifiable details backed by source text
- The details genuinely support or qualify the primary fact

Each child uses the same field keys (reasoning, source_context, source_match, page_id, line_ids) and optionally attachment_id if the supporting fact is from a different document. Children inherit the parent's attachment_id when not specified.

Default: one fact per citation. Only use children for genuine multi-part evidence.

Example:
\`\`\`
{"id": 1, "reasoning": "court order directive with date", "source_context": "ordered to preserve and segregate all output log data", "source_match": "preserve and segregate", "page_id": "page_number_2_index_0", "line_ids": [12, 13],
 "children": [
   {"source_match": "output log data", "source_context": "preserve and segregate all output log data", "page_id": "page_number_2_index_0", "line_ids": [12]},
   {"source_match": "May 13, 2025", "source_context": "Dated: May 13, 2025", "page_id": "page_number_5_index_0", "line_ids": [38]}
 ]}
\`\`\`
</citation-instructions>

`;

/**
 * Citation prompt for audio/video content.
 * Uses timestamps instead of page/line references.
 * Citations are grouped by attachment_id to avoid repetition.
 *
 * Shorthand key mapping (optional):
 * - n: id, r: reasoning, f: source_context
 * - k: source_match, t: timestamps (with s: start_time, e: end_time)
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
    {"id": 1, "reasoning": "why", "source_context": "quote", "source_match": "key", "timestamps": {"start_time": "HH:MM:SS.SSS", "end_time": "HH:MM:SS.SSS"}}
  ]
}
<<<END_CITATION_DATA>>>
\`\`\`

### Shorthand (Optional)
To save tokens: n=id, r=reasoning, f=source_context, k=source_match, t=timestamps (with s=start_time, e=end_time)

### JSON Field Rules

1. **Group key**: The attachment_id (exact ID from source media)
2. **id** (or n): Must match the [N] marker in your text (integer)
3. **reasoning** (or r): Brief explanation connecting the citation to your claim (think first!)
4. **source_context** (or f): Copy transcript text VERBATIM. Use proper JSON escaping.
5. **source_match** (or k): 1–4 verbatim words from the transcript (NEVER more than 4). Pick the distinctive noun or term, not the surrounding verb phrase. Drop leading articles ("the", "a"). This gets highlighted in yellow — a short highlight is precise; a full sentence in yellow is unreadable.
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
    {"id": 1, "reasoning": "speaker directly states health benefits", "source_context": "Regular exercise improves cardiovascular health by 30%", "source_match": "cardiovascular health", "timestamps": {"start_time": "00:05:23.000", "end_time": "00:05:45.500"}},
    {"id": 2, "reasoning": "demonstrates proper form", "source_context": "Keep your back straight and engage your core", "source_match": "engage your core", "timestamps": {"start_time": "00:12:10.200", "end_time": "00:12:25.800"}}
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
 * `attachment_id` → `reasoning` → `source_context` → `source_match` → `page_id` → `line_ids`
 *
 * By placing `reasoning` early, the model must articulate WHY it's citing before
 * specifying WHAT it's citing. Then `source_context` comes before `source_match` so the model
 * first produces the complete verbatim quote, then extracts the source match from it,
 * ensuring `source_match` is always a valid substring of `source_context`.
 *
 * ### Why Not Just Append?
 * In large system prompts, appended instructions can get "lost" in the middle of the
 * effective context. Prepending ensures citation instructions have high priority,
 * while the reminder leverages recency for reinforcement.
 *
 * @example
 * ```typescript
 * import { wrapSystemCitationPrompt } from 'deepcitation/prompts';
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
 * import { wrapCitationPrompt } from 'deepcitation/prompts';
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

    const pageText = page.includes("<line id=") ? page : pageToDeepTextLineTaggedText(page);
    const wrapped = wrapDeepTextPage(i + 1, pageText);
    if (wrapped) parts.push(`${wrapped}\n\n`);
  }

  if (!isValid) return "";
  return `<attachment id="${attachmentId}">${parts.join("").trim()}</attachment>`;
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
      description:
        "Brief explanation of why this supports the claim. Required when the displayed claim wording paraphrases source_match rather than quoting it verbatim.",
    },
    source_context: {
      type: "string",
      description: "Verbatim quote from source document",
    },
    source_match: {
      type: "string",
      description:
        "1–4 verbatim words from source_context (never more than 4). Drop leading articles. Should match the source match used in [anchor](cite:N) inline markers",
    },
    page_id: {
      type: "string",
      description: DEEP_TEXT_PAGE_ID_SCHEMA_DESCRIPTION,
    },
    line_ids: {
      type: "array",
      items: { type: "integer" },
      description: DEEP_TEXT_INCLUSIVE_LINE_IDS_SCHEMA_DESCRIPTION,
    },
  },
  required: ["id", "attachment_id", "source_context", "source_match", "page_id", "line_ids"],
} as const;

/**
 * Compact citation prompt — omits source_context and reasoning from LLM output.
 *
 * Use this variant for latency-sensitive pipelines where sourceContext is
 * reconstructed offline via `deepcitation hydrate` (or auto-hydrated by
 * `deepcitation verify --markdown` when a summary file is present).
 *
 * Token savings vs CITATION_PROMPT: ~80–135 tokens per citation
 * (eliminates ~50-75 tokens of verbatim copying + ~30-60 tokens of reasoning).
 *
 * Compact key mapping:
 * - n: id, k: source_match, p: page_id (compact "N_I" form), l: line_ids
 */
export const COMPACT_CITATION_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Citation Format (Compact)

### In-Text Markers — the k-first method
For each fact you cite, first pick a **k value**: 1–4 distinctive words copied verbatim from the source. Then **bold exactly those words** in your prose and place [N] after them. Your surrounding sentence provides context; the bold text is just the keyword.

The k value gets highlighted in yellow in the PDF. The reader sees bold text in your report → clicks → sees the identical words highlighted. If you bold a full sentence, the entire sentence turns yellow — unreadable. Bold only the keyword.

**Hard cap: 4 words. Only exception: a multi-word legal/technical compound term that loses meaning when split (e.g. "legal costs as between solicitor and client"). If you can't explain why splitting breaks the meaning, it's not a compound — shorten to ≤4.**

Example — source says "seventy-seven (77) residential apartment units and six (6) ground floor commercial units in a nine (9) storey building":
- GOOD: "The building has **77 residential** [1] apartment units and **6 commercial** [2] units." / k₁: "77 residential", k₂: "6 commercial"
- BAD: "**seventy-seven (77) residential apartment units and six (6) ground floor commercial units** [1]" / k: entire clause (13 words!)
- BAD: k: "six ground floor commercial units" (5 words — not a compound term) → GOOD: k: "ground floor commercial" (3w)
- BAD: k: "fifty-nine interior underground parking units" (5w) → GOOD: k: "underground parking units" (3w)

More examples:
- Source: "Each parking unit shall be used and occupied only for motor vehicle parking purposes" → Bold: **motor vehicle parking** [3] / k: "motor vehicle parking"
- Source: "The Corporation shall maintain separate reserve funds" → Bold: **separate reserve funds** [4] / k: "separate reserve funds"
- Source: "No animal, livestock or fowl, other than ordinary household pets may be kept" → Bold: **ordinary household pets** [5] / k: "ordinary household pets"

### Citation Data Block
At the END of your response, append a compact citation block grouped by attachment_id.
Do NOT output sourceContext or reasoning — these are reconstructed automatically from lineIds.

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
2. **k** (sourceMatch): 1–4 verbatim words from the source (hard cap 4; exception only for legal/technical compound terms that lose meaning when split). This is the yellow highlight in the PDF — short highlights are precise, full sentences in yellow are unreadable. k = the bold text in your report. Must be copied character-for-character from the source — never paraphrase (e.g. source says "The cost of cooling" → k: "cost of cooling", NOT "Cooling costs").
3. **p** (page_id): Compact form "N_I" where N=page number and I=index (extract from \`<page_number_N_index_I>\` tag)
4. **l** (line_ids): Array of line IDs from \`<line id="N">\` tags. Find the nearest \`<line id="N">\` tag ABOVE your text on the SAME page, then count lines down: if \`<line id="10">\` is 3 lines above, use \`[13]\`. Do NOT default to \`[1]\`. Double-check p and l are from the same page — if your text is on page 9, don't use a lineId from page 10.

### sourceMatch Rules
k = bold text = yellow highlight. All three must be the same phrase, copied verbatim from the source.

**Hard cap: 4 words. Exception only for legal/technical compound terms that lose meaning when split. Never a full sentence.**

How to shorten a long source clause to a good k:
| Source clause | k | What to bold |
|---|---|---|
| "seventy-seven (77) residential apartment units" | "77 residential" (2w) | **77 residential** [N] |
| "Board of Directors shall decide whether any addition..." | "Board of Directors" (3w) | **Board of Directors** [N] |
| "No animal, livestock or fowl, other than ordinary household pets" | "ordinary household pets" (3w) | **ordinary household pets** [N] |
| "maintain separate reserve funds for major repair" | "separate reserve funds" (3w) | **separate reserve funds** [N] |
| "legal costs as between solicitor and client" | "legal costs as between solicitor and client" (7w, compound term ✓) | **legal costs as between solicitor and client** [N] |
| "The cost of cooling the units is billed directly to the owner" | "cost of cooling" (3w) | **cost of cooling** [N] |

Pick the most distinctive noun phrase — the thing a reader would ctrl+F for. Never paraphrase: if the source says "cost of cooling", don't write "Cooling costs".

### Placement Rules
- **Bold** the key term and place [N] after it, e.g. **Discount Rate** [2]
- Sequential IDs starting from 1 — each citation gets a unique number
- JSON block MUST appear at the very end of your response

### SELF-CHECK — run this for every k before writing it
1. Count the words in k. Is it ≤4? If yes, proceed.
2. If >4: is it a legal/technical compound term that loses meaning when split? If no, shorten it.
3. Is k a contiguous verbatim substring of the source line? (If you can't ctrl+F it, it's wrong.)

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

### Supporting Facts (Optional, compact key: c)
When a claim has 2+ verifiable details from the source (dates, amounts, scope qualifiers), group them under the primary fact using a children array (compact key: c).

Use ONLY when:
- A claim references multiple verifiable details backed by source text
- The details genuinely support or qualify the primary fact

Each child uses the same compact keys (k, p, l, r) and optionally a (attachment_id) if the supporting fact is from a different document. Children inherit n and a from the parent.

Default: one fact per citation. Only use c for genuine multi-part evidence.

Example:
\`\`\`
{"n": 1, "k": "preserve and segregate", "p": "2_0", "l": [12, 13],
 "c": [
   {"k": "output log data", "p": "2_0", "l": [12]},
   {"k": "May 13, 2025", "p": "5_0", "l": [38], "a": "other-doc-id"}
 ]}
\`\`\`
</citation-instructions>
`;

/**
 * Scenario-2 citation prompt — for user-supplied content that already exists.
 *
 * Unlike COMPACT_CITATION_PROMPT (scenario 1) where we generate both prose
 * and citations together (k-first method), this variant is for when the user
 * sends pre-existing text (reports, summaries, form drafts) and we must find
 * the best source anchors for their paraphrased claims.
 *
 * Key differences from scenario 1:
 * - Text is FROZEN — no rewriting, no bold markers
 * - Only [N] markers are inserted
 * - k must be verbatim from SOURCE, not from user's text (user may paraphrase)
 * - claim_text ≠ k is expected (handled by hydrate's paraphrase-promotion)
 *
 * Tested on OCSCC 748 Declaration (46-page legal document):
 * - 135 citations, 0% long anchors, 75% exact verbatim, ~93% pipeline-findable
 */
export const COMPACT_CITATION_SCENARIO2_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Add Citations to Existing Text

The text is FROZEN — do not rewrite, reorder, or rephrase any of it. Your job is to:

1. Identify every factual claim in the text that can be traced to the source document
2. Insert a [N] marker after each claim — one unique N per distinct fact
3. Produce a <<<CITATION_DATA>>> JSON block at the end

### How to Insert Markers

Place [N] after each individual factual claim. Every distinct fact gets its own unique [N].

Example: "The building has 77 residential units [1] and 6 commercial units [2] in a 9-storey structure [3]."

### Coverage: One Marker Per Fact

Every specific number, entity, rule, restriction, or condition gets its own [N]. Do not merge multiple facts under one marker. Aim for high density — cite every claim with source support. Skip only headings and transitional phrases.

### The k Rule — CONTIGUOUS VERBATIM SUBSTRING

k must be a **contiguous sequence of consecutive words** copied exactly from the source. Not cherry-picked words. Not paraphrased. CONSECUTIVE WORDS as they appear.

**k = 2–4 consecutive words from the source. Up to 7 for compound terms. NEVER more than 7.**

Open the source, find the passage, copy 2–4 ADJACENT words. Do not skip words between them.

| Source text | GOOD k (contiguous) | BAD k (non-contiguous) |
|---|---|---|
| "performance of the objects and duties" | "objects and duties" | "performance objects duties" ✗ |
| "garbage room and loading bay" | "garbage room" | "garbage room loading bay" ✗ |
| "maintain and repair all pipes, wires, cables, utility lines" | "pipes, wires, cables" | "pipes utility lines" ✗ |
| "damage caused to improvements made to a unit" | "damage caused to improvements" | "damage improvements unit" ✗ |
| "Corporation and the owners from time to time" | "Corporation and the owners" | "Corporation owners time" ✗ |
| "indemnify and save harmless the Corporation" | "indemnify and save harmless" | "indemnify save harmless" ✗ |
| "legal costs as between solicitor and client" | "legal costs as between solicitor and client" | "legal costs solicitor" ✗ |

**TEST**: After writing each k, ask: "If I search for this exact string in the source document, will I find it?" If not, it's not contiguous.

**WHY**: k gets highlighted in yellow in the PDF. Non-contiguous phrases won't be found → no highlight → broken citation.

### Finding the Right Anchor

The user's text may paraphrase — your k must come from the SOURCE, not from the user's text.

| User text says | Source says | k |
|---|---|---|
| "77 residential units" | "seventy-seven (77) residential apartment units" | "77 residential" |
| "Board of Directors governs" | "Board of Directors shall decide" | "Board of Directors" |
| "pets are allowed" | "ordinary household pets may be kept" | "ordinary household pets" |
| "cooling is billed to owners" | "The cost of cooling the units is billed directly to the owner" | "cost of cooling" |

### Citation Data Block

At the END of your response:

\`\`\`
<<<CITATION_DATA>>>
{
  "attachment_id_here": [
    {"n": 1, "k": "verbatim source phrase", "p": "N_I", "l": [lineId]}
  ]
}
<<<END_CITATION_DATA>>>
\`\`\`

### Field Rules

1. **n**: Unique citation id (integer, matches [N] in text)
2. **k**: 2–4 contiguous verbatim words from SOURCE (up to 7 for compounds). Must be findable as exact substring in source.
3. **p** (page_id): Compact form "N_I" (from \`<page_number_N_index_I>\` tag)
4. **l** (line_ids): Array of line IDs from \`<line id="N">\` tags. Count from nearest tag above.

### Placement Rules
- Place [N] at the end of each claim phrase
- Sequential IDs starting from 1 — every fact gets a unique number
- Do NOT output bold markers (**) — the text is the user's
- JSON block MUST appear at the very end

### SELF-CHECK per citation:
1. Is k a contiguous substring of the source? (Can I ctrl+F find it?)
2. Is k ≤4 words? (≤7 for compounds?)
3. Does [N] appear after the right claim in the text?

### Supporting Facts (Optional, compact key: c)
When a claim has 2+ verifiable details from the source, group them under the primary fact using a children array (c). Each child uses the same compact keys (k, p, l) and optionally a (attachment_id) for cross-document facts. Children inherit n and a from the parent. Only use c for genuine multi-part evidence.
</citation-instructions>

`;

/**
 * JSON schema for compact citation data (structured output LLMs, hydrate pipeline).
 * Omits source_context and reasoning — these are reconstructed by deepcitation hydrate.
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
      description: "sourceMatch: 1–4 verbatim words from the evidence line (never more than 4). Drop leading articles.",
    },
    p: {
      type: "string",
      description: DEEP_TEXT_COMPACT_PAGE_ID_SCHEMA_DESCRIPTION,
    },
    l: {
      type: "array",
      items: { type: "integer" },
      description: DEEP_TEXT_INCLUSIVE_LINE_IDS_SCHEMA_DESCRIPTION,
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
      description:
        "Brief explanation of why this supports the claim. Required when the displayed claim wording paraphrases source_match rather than quoting it verbatim.",
    },
    source_context: {
      type: "string",
      description: "Verbatim transcript quote",
    },
    source_match: {
      type: "string",
      description: "1–4 verbatim words from source_context (never more than 4). Drop leading articles.",
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
  required: ["id", "attachment_id", "source_context", "source_match", "timestamps"],
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
  /** Key phrase (k) - source match */
  k?: string;
  /** Domain A claim text (d) */
  d?: string;
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
  /** Children (c) - supporting facts for multi-fact citations */
  c?: CompactCitationData[];
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
  source_context?: string;
  /** Anchor text (1-3 words). Compact key: k */
  source_match?: string;
  /** Display label override — shown as the clickable trigger instead of source_match. Compact key: d */
  claim_text?: string;
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
  /** Supporting facts for multi-fact citations. Compact key: c */
  children?: CitationData[];
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
