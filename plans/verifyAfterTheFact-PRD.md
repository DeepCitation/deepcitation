# PRD: `verifyAfterTheFact` - Retroactive Citation Insertion

## Overview

A new DeepCitation client method that enables citation insertion into LLM output that was generated **without** citation instructions. This addresses the common case where users have already received LLM responses and want to add verifiable citations after the fact.

## Problem Statement

Currently, DeepCitation requires a "prepare-then-prompt" workflow:
1. Upload files via `prepareAttachments` → get `attachmentId` + `deepTextPromptPortion`
2. Include citation instructions in the LLM prompt
3. LLM produces output with embedded `<cite />` tags
4. Verify citations

This doesn't work when:
- The LLM output already exists (from a previous call without citation instructions)
- Using an LLM API that doesn't allow prompt modification
- Retroactively adding citations to existing content

---

## API Design

### Design Principles

1. **Progressive complexity** - Simple cases should be simple; advanced options available when needed
2. **Flexible input** - Accept files in multiple formats without unnecessary wrapping
3. **Fail fast with helpful errors** - Validate early, provide actionable error messages
4. **Composable** - Works seamlessly with existing `prepareAttachments()` and `verify()` methods

### Method Signatures

```typescript
// Simple: positional arguments
deepcitation.verifyAfterTheFact(llmOutput: string, sources: SourceInput[]): Promise<PromptResult>

// With options
deepcitation.verifyAfterTheFact(input: VerifyAfterTheFactInput): Promise<PromptResult>
```

### Input Types

```typescript
/**
 * Flexible source input - accepts multiple formats for convenience.
 * The method auto-detects the type and handles appropriately.
 */
type SourceInput =
  | File                                                    // Browser File object
  | Buffer                                                  // Node.js Buffer
  | Blob                                                    // Blob
  | { file: File | Buffer | Blob; filename?: string }       // File with metadata
  | { attachmentId: string; deepTextPromptPortion: string } // Pre-prepared source
  | PreparedFile;                                           // Direct from prepareAttachments()

/**
 * Result from prepareAttachments() - can be passed directly as a source
 */
interface PreparedFile {
  attachmentId: string;
  deepTextPromptPortion: string;
  filename?: string;
}

/**
 * Full input interface with options
 */
interface VerifyAfterTheFactInput {
  /** The original LLM output without citations */
  llmOutput: string;

  /** Source files or prepared attachments */
  sources: SourceInput[];

  /** Configuration options */
  options?: VerifyAfterTheFactOptions;
}

interface VerifyAfterTheFactOptions {
  /**
   * Optional LLM function for fully automated flow.
   * If provided, runs LLM and verification in one call.
   */
  llm?: (prompt: { system: string; user: string }) => Promise<string>;

  /** Output image format for verification screenshots. Default: "avif" */
  outputImageFormat?: "jpeg" | "png" | "avif";

  /** Audio/video mode - uses timestamp-based citations. Default: false */
  isAudioVideo?: boolean;

  /** Progress callback for multi-step operations */
  onProgress?: (event: ProgressEvent) => void;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

type ProgressEvent =
  | { stage: "uploading"; current: number; total: number; filename?: string }
  | { stage: "building_prompt" }
  | { stage: "awaiting_llm" }
  | { stage: "verifying"; current: number; total: number }
  | { stage: "complete" };
```

### Output Types

```typescript
/**
 * Returned when no LLM function is provided - gives prompts for manual execution
 */
interface VerifyAfterTheFactPromptResult {
  /** System prompt for the citation insertion LLM call */
  systemPrompt: string;

  /** User prompt containing sources and original text */
  userPrompt: string;

  /** Processed source metadata (useful for caching) */
  sources: ProcessedSource[];

  /** Complete verification after running your LLM */
  complete: (llmResponse: string) => Promise<VerifyAfterTheFactResult>;

  /** Convenience: prompts as OpenAI/Anthropic message format */
  toMessages(): Array<{ role: "system" | "user"; content: string }>;

  /** Estimated token count for the combined prompts */
  estimatedTokens: number;
}

interface ProcessedSource {
  attachmentId: string;
  filename?: string;
  pageCount?: number;
  /** Full text content - can be cached and reused */
  deepTextPromptPortion: string;
}

/**
 * Final result with annotated output and verifications
 */
interface VerifyAfterTheFactResult {
  /** Original text with <cite /> tags inserted */
  annotatedOutput: string;

  /** Extracted citations keyed by citation ID */
  citations: Record<string, Citation>;

  /** Verification results keyed by citation ID */
  verifications: Record<string, Verification>;

  /** Source file references */
  sources: Array<{ attachmentId: string; filename?: string }>;

  /** Summary statistics */
  stats: VerificationStats;

  /** Citations that failed to parse (malformed LLM output) */
  parseErrors?: Array<{ raw: string; error: string }>;
}

interface VerificationStats {
  /** Total citations found */
  totalCitations: number;
  /** Successfully verified */
  verified: number;
  /** Partial matches */
  partial: number;
  /** Not found in sources */
  notFound: number;
  /** Success rate: verified / total */
  successRate: number;
}
```

---

## Usage Examples

### Simplest Case

```typescript
import { DeepCitation } from "deepcitation";

const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// Get prompts - just pass the file directly
const prompts = await deepcitation.verifyAfterTheFact(
  "Revenue grew 45% to $2.3 billion in Q4.",
  [reportPdf]
);

// Run your LLM
const annotated = await yourLlm(prompts.systemPrompt, prompts.userPrompt);

// Complete verification
const result = await prompts.complete(annotated);

console.log(result.stats.successRate); // 0.85
```

### Fully Automated with LLM Callback

```typescript
import OpenAI from "openai";

const openai = new OpenAI();

const result = await deepcitation.verifyAfterTheFact({
  llmOutput: "Revenue grew 45% to $2.3 billion in Q4.",
  sources: [reportPdf],
  options: {
    llm: async ({ system, user }) => {
      const res = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return res.choices[0].message.content!;
    },
  },
});

// Done - result is fully verified
console.log(result.annotatedOutput);
```

### With Progress Tracking

```typescript
const result = await deepcitation.verifyAfterTheFact({
  llmOutput: existingResponse,
  sources: [file1, file2, file3],
  options: {
    llm: myLlmFunction,
    onProgress: (event) => {
      switch (event.stage) {
        case "uploading":
          updateUI(`Uploading ${event.current}/${event.total}...`);
          break;
        case "awaiting_llm":
          updateUI("Analyzing content...");
          break;
        case "verifying":
          updateUI(`Verifying citations...`);
          break;
        case "complete":
          updateUI("Done!");
          break;
      }
    },
  },
});
```

### Reusing Prepared Files (Caching)

```typescript
// Prepare files once (API call, slower)
const { fileDataParts } = await deepcitation.prepareAttachments([
  { file: report1, filename: "Q1.pdf" },
  { file: report2, filename: "Q2.pdf" },
]);

// Store fileDataParts in your cache/database...

// Later: reuse without re-uploading (no API call, fast)
const prompts = await deepcitation.verifyAfterTheFact(userQuery, fileDataParts);
```

### With toMessages() Helper

```typescript
const prompts = await deepcitation.verifyAfterTheFact(llmOutput, [pdfFile]);

// Direct use with OpenAI SDK
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: prompts.toMessages(),
});

const result = await prompts.complete(response.choices[0].message.content!);
```

### Cancellation

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 30000); // 30s timeout

try {
  const result = await deepcitation.verifyAfterTheFact({
    llmOutput: text,
    sources: [largePdf],
    options: { signal: controller.signal, llm: myLlm },
  });
} catch (err) {
  if (err.name === "AbortError") {
    console.log("Operation cancelled");
  }
}
```

---

## Error Handling

### Typed Errors

```typescript
class VerifyAfterTheFactError extends Error {
  code: ErrorCode;
  details?: Record<string, unknown>;
}

type ErrorCode =
  | "INVALID_INPUT"        // Empty llmOutput, no sources
  | "FILE_UPLOAD_FAILED"   // API error during file processing
  | "SOURCE_TOO_LARGE"     // Combined sources exceed token limit
  | "LLM_ERROR"            // User's LLM callback threw
  | "PARSE_ERROR"          // Couldn't parse LLM's citation output
  | "VERIFICATION_FAILED"  // DeepCitation API error
  | "ABORTED";             // Cancelled via AbortSignal
```

### Example Error Handling

```typescript
try {
  const result = await deepcitation.verifyAfterTheFact(llmOutput, sources);
} catch (err) {
  if (err instanceof VerifyAfterTheFactError) {
    switch (err.code) {
      case "INVALID_INPUT":
        showError("Please provide text and at least one source file.");
        break;
      case "SOURCE_TOO_LARGE":
        showError(`Sources too large (~${err.details?.estimatedTokens} tokens). Try fewer files.`);
        break;
      case "LLM_ERROR":
        showError("AI service error. Please try again.");
        console.error("LLM error:", err.cause);
        break;
      default:
        showError("Something went wrong. Please try again.");
    }
  }
}
```

### Graceful Partial Results

When some citations fail to parse or verify, the method still succeeds with partial results:

```typescript
const result = await prompts.complete(llmResponse);

// Check for malformed citations from LLM
if (result.parseErrors?.length) {
  console.warn(`${result.parseErrors.length} citations were malformed`);
}

// Check verification failures
if (result.stats.notFound > 0) {
  console.warn(`${result.stats.notFound} citations couldn't be verified`);
}

// annotatedOutput still contains everything - unverified citations have status: "not_found"
```

---

## Input Validation

Validation runs early with clear, actionable messages:

| Check | Error Message |
|-------|---------------|
| Empty `llmOutput` | `"llmOutput cannot be empty"` |
| Empty `sources` | `"At least one source is required"` |
| Invalid file type | `"Unsupported file type: {type}. Supported: PDF, images, Word, Excel, PowerPoint"` |
| File too large | `"File '{name}' exceeds 50MB limit"` |
| Missing text for attachmentId | `"Source '{id}' requires deepTextPromptPortion. Use prepareAttachments() first or include text from a previous call."` |
| Token limit exceeded | `"Combined sources (~{n} tokens) exceed limit. Use fewer or smaller files."` |

---

## Citation Insertion Prompt

### System Prompt

```
<citation-insertion-task>

## Your Role

You are a citation specialist. Analyze text and insert <cite /> tags where
claims can be verified against the provided attachments.

## Critical Rules

1. **PRESERVE ORIGINAL TEXT** - Only add <cite /> tags, never change wording
2. **ONLY cite verifiable claims** - Must be directly supported by sources
3. **Exact syntax required** - Follow the format precisely
4. **Inline placement** - Insert immediately after the claim
5. **One per claim** - Don't group citations

## Citation Format

<cite
  attachment_id='SOURCE_ID'
  reasoning='Why this source supports the claim'
  anchor_text='1-3 key words from quote'
  full_phrase='Exact verbatim quote from source'
  start_page_id='page_number_N_index_I'
  line_ids='X-Y'
/>

### Attributes

- **attachment_id**: Exact ID from <attachment_id='...'> in source
- **reasoning**: 1 sentence explaining the connection
- **anchor_text**: 1-3 words that directly support the claim
- **full_phrase**: VERBATIM from source. Escape: \' for quotes, \n for newlines
- **start_page_id**: Format page_number_N_index_I from page markers
- **line_ids**: Range '5-8' or single '12'

## What to Cite

- Facts, statistics, numbers, percentages
- Dates, timelines, deadlines
- Names (people, companies, products)
- Direct quotes or close paraphrases
- Technical specifications

## What NOT to Cite

- Common knowledge
- Author's opinions/analysis
- Speculation or hypotheticals
- Information not in sources

## Output

Return the complete original text with <cite /> tags inserted.
No explanation, preamble, or code blocks.

</citation-insertion-task>
```

### User Prompt Template

```
## Source Documents

{For each source:}
### {filename} (attachment_id='{id}')

{deepTextPromptPortion with page markers and line IDs}

---

## Text to Annotate

<text>
{llmOutput}
</text>
```

---

## Audio/Video Support

```typescript
const result = await deepcitation.verifyAfterTheFact({
  llmOutput: videoSummary,
  sources: [{ attachmentId: videoId, deepTextPromptPortion: transcript }],
  options: { isAudioVideo: true },
});
```

Uses timestamps instead of page/line:

```xml
<cite
  attachment_id='video123'
  reasoning='Speaker states quarterly revenue'
  anchor_text='45% growth'
  full_phrase='We achieved 45% growth this quarter'
  timestamps='00:05:23.100-00:05:28.500'
/>
```

---

## Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `src/client/types.ts` | Add types: `SourceInput`, `VerifyAfterTheFactInput`, `VerifyAfterTheFactPromptResult`, `VerifyAfterTheFactResult`, `VerificationStats`, `ProgressEvent`, `VerifyAfterTheFactError` |
| `src/prompts/citationPrompts.ts` | Add `AFTER_THE_FACT_SYSTEM_PROMPT`, `AFTER_THE_FACT_AV_SYSTEM_PROMPT`, `buildAfterTheFactPrompt()` |
| `src/client/DeepCitation.ts` | Add `verifyAfterTheFact()` with overloads, helpers |
| `src/client/index.ts` | Export new types |
| `src/index.ts` | Export prompts and types |
| `src/__tests__/verifyAfterTheFact.test.ts` | New test file |

### Method Outline

```typescript
async verifyAfterTheFact(
  inputOrLlmOutput: string | VerifyAfterTheFactInput,
  sourcesArg?: SourceInput[]
): Promise<VerifyAfterTheFactPromptResult | VerifyAfterTheFactResult> {
  // Normalize arguments
  const input = typeof inputOrLlmOutput === "string"
    ? { llmOutput: inputOrLlmOutput, sources: sourcesArg! }
    : inputOrLlmOutput;

  const { llmOutput, sources, options = {} } = input;

  // 1. Validate
  this.validateAfterTheFactInput(input);

  // 2. Process sources (upload new files, pass through prepared ones)
  options.onProgress?.({ stage: "uploading", current: 0, total: sources.length });
  const processedSources = await this.processSources(sources, options);

  // 3. Build prompts
  options.onProgress?.({ stage: "building_prompt" });
  const { systemPrompt, userPrompt, estimatedTokens } = buildAfterTheFactPrompt({
    originalOutput: llmOutput,
    sources: processedSources,
    isAudioVideo: options.isAudioVideo,
  });

  // 4. Create completion callback
  const complete = async (llmResponse: string): Promise<VerifyAfterTheFactResult> => {
    const { citations, parseErrors } = this.parseCitationsWithErrors(llmResponse);

    options.onProgress?.({ stage: "verifying", current: 0, total: Object.keys(citations).length });
    const verified = await this.verify({ llmOutput: llmResponse, outputImageFormat: options.outputImageFormat });

    options.onProgress?.({ stage: "complete" });

    return {
      annotatedOutput: llmResponse,
      citations,
      verifications: verified.verifications,
      sources: processedSources.map(s => ({ attachmentId: s.attachmentId, filename: s.filename })),
      stats: this.calculateStats(verified.verifications),
      parseErrors: parseErrors.length ? parseErrors : undefined,
    };
  };

  // 5. If LLM provided, run automatically
  if (options.llm) {
    options.onProgress?.({ stage: "awaiting_llm" });
    const llmResponse = await options.llm({ system: systemPrompt, user: userPrompt });
    return complete(llmResponse);
  }

  // 6. Return prompts for manual execution
  return {
    systemPrompt,
    userPrompt,
    sources: processedSources,
    complete,
    toMessages: () => [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ],
    estimatedTokens,
  };
}
```

---

## Test Cases

### Unit Tests

- Input validation (empty llmOutput, no sources, bad file types)
- Source processing (File, Buffer, Blob, prepared sources, mixed)
- Prompt building (single source, multiple, A/V mode)
- Token estimation
- Stats calculation
- Error code mapping

### Integration Tests

- Full flow with mock LLM
- `complete()` callback behavior
- Progress event sequence
- AbortSignal cancellation
- Partial results with parse errors

### E2E Tests

- Real file upload → prompts → verification
- Multiple source files
- Large documents near token limits

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Adoption | 20% of users try within 30 days |
| Citation accuracy | >80% verify successfully |
| Error rate | <5% unhandled errors |

---

## Future Enhancements

1. **Automatic chunking** - Split large docs, process in parallel, merge results
2. **Streaming** - Stream citations as inserted for real-time UI
3. **Confidence scores** - LLM reports confidence per citation
4. **Batch API** - Process multiple outputs efficiently
5. **Citation suggestions** - Return candidates without inserting (user picks)
