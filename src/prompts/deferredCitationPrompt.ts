/**
 * Deferred JSON Citation Prompts
 *
 * This module provides the "Deferred JSON Pattern" for citation output.
 * Instead of inline XML tags with attributes, the LLM uses lightweight
 * markers (e.g., [1], [2]) in the text and outputs a structured JSON
 * block at the end of the response.
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
 * Deferred JSON citation prompt for document-based citations.
 * Uses [N] markers in text with JSON metadata at the end.
 */
export const DEFERRED_CITATION_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Citation Format

### In-Text Markers
For every claim, value, or fact from attachments, place a sequential integer marker like [1], [2], [3] at the end of the claim.

### Citation Data Block
At the END of your response, you MUST append a citation verification block containing JSON data for all citations used.

### Format
\`\`\`
<<<CITATION_DATA>>>
[
  {
    "id": 1,
    "attachment_id": "exact_attachment_id",
    "reasoning": "why this supports the claim",
    "full_phrase": "verbatim quote from source",
    "key_span": "1-3 key words from full_phrase",
    "page_key": "page_number_N_index_I",
    "line_ids": [X, Y, Z]
  }
]
<<<END_CITATION_DATA>>>
\`\`\`

### JSON Field Rules

1. **id**: Must match the [N] marker in your text (integer)
2. **attachment_id**: Exact ID from the source document
3. **reasoning**: Brief explanation connecting the citation to your claim (think first!)
4. **full_phrase**: Copy text VERBATIM from source. Use proper JSON escaping for quotes and special characters.
5. **key_span**: The 1-3 most important words from full_phrase
6. **page_key**: ONLY use format \`page_number_N_index_I\` from page tags (e.g., \`<page_number_1_index_0>\`)
7. **line_ids**: Array of line numbers (e.g., [12, 13, 14]). Infer intermediate lines since only every 5th line is shown.

### Placement Rules

- Place [N] markers inline, typically at the end of a claim
- One marker per distinct idea, concept, or value
- Use sequential numbering starting from [1]
- The JSON block MUST appear at the very end of your response
- Do NOT include the JSON block markers in code blocks - they should appear as plain text

### Example Response

The company reported strong growth [1]. Revenue increased significantly in Q4 [2].

<<<CITATION_DATA>>>
[
  {
    "id": 1,
    "attachment_id": "abc123",
    "reasoning": "directly states growth metrics",
    "full_phrase": "The company achieved 45% year-over-year growth",
    "key_span": "45% year-over-year growth",
    "page_key": "page_number_2_index_1",
    "line_ids": [12, 13]
  },
  {
    "id": 2,
    "attachment_id": "abc123",
    "reasoning": "states Q4 revenue figure",
    "full_phrase": "Q4 revenue reached $2.3 billion, up from $1.8 billion",
    "key_span": "$2.3 billion",
    "page_key": "page_number_3_index_2",
    "line_ids": [5, 6, 7]
  }
]
<<<END_CITATION_DATA>>>
</citation-instructions>

`;

/**
 * Deferred JSON citation prompt for audio/video content.
 * Uses timestamps instead of page/line references.
 */
export const DEFERRED_AV_CITATION_PROMPT = `
<citation-instructions priority="critical">
## REQUIRED: Audio/Video Citation Format

### In-Text Markers
For every claim, value, or fact from media content, place a sequential integer marker like [1], [2], [3] at the end of the claim.

### Citation Data Block
At the END of your response, you MUST append a citation verification block containing JSON data for all citations used.

### Format
\`\`\`
<<<CITATION_DATA>>>
[
  {
    "id": 1,
    "attachment_id": "exact_attachment_id",
    "reasoning": "why this supports the claim",
    "full_phrase": "verbatim transcript quote",
    "key_span": "1-3 key words from full_phrase",
    "timestamps": {
      "start_time": "HH:MM:SS.SSS",
      "end_time": "HH:MM:SS.SSS"
    }
  }
]
<<<END_CITATION_DATA>>>
\`\`\`

### JSON Field Rules

1. **id**: Must match the [N] marker in your text (integer)
2. **attachment_id**: Exact ID from the source media
3. **reasoning**: Brief explanation connecting the citation to your claim (think first!)
4. **full_phrase**: Copy transcript text VERBATIM. Use proper JSON escaping.
5. **key_span**: The 1-3 most important words from full_phrase
6. **timestamps**: Object with start_time and end_time in HH:MM:SS.SSS format

### Example Response

The speaker discussed exercise benefits [1]. They recommended specific techniques [2].

<<<CITATION_DATA>>>
[
  {
    "id": 1,
    "attachment_id": "video123",
    "reasoning": "speaker directly states health benefits",
    "full_phrase": "Regular exercise improves cardiovascular health by 30%",
    "key_span": "cardiovascular health",
    "timestamps": {
      "start_time": "00:05:23.000",
      "end_time": "00:05:45.500"
    }
  },
  {
    "id": 2,
    "attachment_id": "video123",
    "reasoning": "demonstrates proper form",
    "full_phrase": "Keep your back straight and engage your core",
    "key_span": "engage your core",
    "timestamps": {
      "start_time": "00:12:10.200",
      "end_time": "00:12:25.800"
    }
  }
]
<<<END_CITATION_DATA>>>
</citation-instructions>

`;

/**
 * Brief reminder for deferred JSON citations.
 * Use in user prompts to reinforce citation requirements.
 */
export const DEFERRED_CITATION_REMINDER = `<citation-reminder>STOP and CHECK: Did you use [N] markers for every claim and include the <<<CITATION_DATA>>> JSON block at the end?</citation-reminder>`;

/**
 * Brief reminder for AV deferred citations.
 */
export const DEFERRED_AV_CITATION_REMINDER = `<citation-reminder>STOP and CHECK: Did you use [N] markers for every claim and include the <<<CITATION_DATA>>> JSON block with timestamps at the end?</citation-reminder>`;

/**
 * JSON schema for deferred citation data (for structured output LLMs).
 * This can be used with OpenAI's response_format or similar features.
 */
export const DEFERRED_CITATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    id: {
      type: "integer",
      description: "Citation marker number matching [N] in text",
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
    key_span: {
      type: "string",
      description: "1-3 key words from full_phrase",
    },
    page_key: {
      type: "string",
      description: "Page key in format page_number_N_index_I",
    },
    line_ids: {
      type: "array",
      items: { type: "integer" },
      description: "Array of line numbers for the citation",
    },
  },
  required: ["id", "attachment_id", "full_phrase", "key_span"],
} as const;

/**
 * JSON schema for AV deferred citation data.
 */
export const DEFERRED_AV_CITATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    id: {
      type: "integer",
      description: "Citation marker number matching [N] in text",
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
    key_span: {
      type: "string",
      description: "1-3 key words from full_phrase",
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
  required: ["id", "attachment_id", "full_phrase", "key_span", "timestamps"],
} as const;

/**
 * Interface for raw deferred citation data from JSON block.
 * Supports both snake_case (from JSON) and camelCase naming.
 */
export interface DeferredCitationData {
  /** Citation marker number (matches [N] in text) */
  id: number;
  /** Attachment ID (snake_case from JSON) */
  attachment_id?: string;
  /** Attachment ID (camelCase alternative) */
  attachmentId?: string;
  /** Reasoning for the citation */
  reasoning?: string;
  /** Verbatim quote from source */
  full_phrase?: string;
  /** Verbatim quote (camelCase alternative) */
  fullPhrase?: string;
  /** Key span (1-3 words) */
  key_span?: string;
  /** Key span (camelCase alternative) */
  keySpan?: string;
  /** Page key in format page_number_N_index_I */
  page_key?: string;
  /** Page key (camelCase alternative) */
  pageKey?: string;
  /** Start page key (alternative field) */
  start_page_key?: string;
  /** Start page key (camelCase alternative) */
  startPageKey?: string;
  /** Line IDs array */
  line_ids?: number[];
  /** Line IDs (camelCase alternative) */
  lineIds?: number[];
  /** Timestamps for AV citations */
  timestamps?: {
    start_time?: string;
    startTime?: string;
    end_time?: string;
    endTime?: string;
  };
}

/**
 * Result of parsing a deferred JSON response.
 */
export interface ParsedDeferredResponse {
  /** The clean text meant for display (content before the delimiter) */
  visibleText: string;
  /** The structured citation data from the JSON block */
  citations: DeferredCitationData[];
  /** Helper map for O(1) lookups by ID */
  citationMap: Map<number, DeferredCitationData>;
  /** Whether parsing was successful */
  success: boolean;
  /** Error message if parsing failed */
  error?: string;
}
