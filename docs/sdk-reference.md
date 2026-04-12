---
layout: default
title: SDK Reference
parent: API Reference
nav_order: 1
description: "TypeScript SDK client methods and utility functions"
commit_sha: "31553cd"
stale_after_commits: 10
watch_paths:
  - src/client/DeepCitation.ts
  - src/client/types.ts
  - src/index.ts
---

# SDK Reference

All public methods on the `DeepCitation` client class and standalone utility functions exported from the `deepcitation` package.

{: .note }
For the REST API endpoints, see [API Reference]({{ site.baseurl }}/api-reference/). The SDK methods below are wrappers around these endpoints with additional convenience features.

---

## Client Class

### Constructor

```typescript
import { DeepCitation } from "deepcitation";

const dc = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY,
});
```

| Option | Type | Required | Description |
|:-------|:-----|:---------|:------------|
| `apiKey` | `string` | Yes | Your DeepCitation API key. Must start with `sk-dc-` and be at least 20 characters. |
| `apiUrl` | `string` | No | Override the API base URL. Defaults to `https://api.deepcitation.com`. Must use HTTPS (except `http://localhost` for local development). The client throws `ValidationError` at construction if this constraint is not met. |
| `maxRetries` | `number` | No | Maximum retries for transient network failures (connection drops, DNS errors). Uses exponential backoff with jitter: `2^(attempt-1) * 100ms ± 10%`, capped at 16s. Does **not** retry HTTP error responses (4xx/5xx). Default: `3`. |
| `requestSource` | `string` | No | Tag identifying request origin (e.g. `"playground"`). Sent as `X-Request-Source` header. |
| `onLatestVersion` | `(latestVersion: string) => void` | No | Callback invoked when the API responds with a latest SDK version header. Useful for detecting when a newer SDK version is available. |
| `convertedPdfDownloadPolicy` | `"url_only" \| "always" \| "never"` | No | Controls when converted PDF download URLs are included in file responses. `"url_only"` (default) includes a signed download URL; `"always"` includes both URL and raw bytes; `"never"` omits the converted PDF entirely. |
| `logger` | `DeepCitationLogger` | No | Custom logger for SDK internals. Implements optional `debug`, `info`, `warn`, and `error` methods. Pass `console` to log to stdout. |

---

## File Preparation

### `prepareAttachments(files)`

Upload one or more files and extract text with line IDs for LLM prompts. This is the primary method for preparing source documents.

```typescript
const { fileDataParts, deepTextPages } = await dc.prepareAttachments([
  { file: pdfBuffer, filename: "report.pdf" },
  { file: imageBuffer, filename: "chart.png" },
]);

const attachmentId = fileDataParts[0].attachmentId;
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `files` | `FileInput[]` | Array of `{ file, filename }` objects. `file` can be `File`, `Blob`, or `Buffer`. |

**Returns**: `PrepareAttachmentsResult` — `{ fileDataParts: PreparedAttachment[], deepTextPagesByAttachmentId: Record<string, string[]> }`

---

### `uploadFile(file, options?)`

Upload a single file. Lower-level than `prepareAttachments` — use when you need fine-grained control over individual uploads.

```typescript
const result = await dc.uploadFile(pdfBuffer, {
  filename: "report.pdf",
  attachmentId: "custom-id-123",
  endUserId: "user-456",
});
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `file` | `File \| Blob \| Buffer` | The file to upload |
| `options.filename` | `string` | Override filename |
| `options.attachmentId` | `string` | Custom attachment ID (auto-generated if omitted) |
| `options.endUserId` | `string` | Your end-user identifier for usage attribution |

**Returns**: `UploadFileResponse` — includes canonical `deepTextPages`

---

### `prepareUrl(options)`

Convert a web page or hosted document to PDF and prepare it for verification.

```typescript
const result = await dc.prepareUrl({
  url: "https://example.com/article",
  filename: "article.pdf",
  skipCache: false,
});
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `options.url` | `string` | URL of the web page or document |
| `options.filename` | `string` | Custom filename for the converted document |
| `options.attachmentId` | `string` | Custom attachment ID |
| `options.skipCache` | `boolean` | Force fresh conversion, bypass URL cache (default: `false`) |
| `options.endUserId` | `string` | Your end-user identifier |

**Returns**: `UploadFileResponse` (includes `deepTextPages`, `urlSource`, and `urlCache` fields)

---

### `convertToPdf(input)`

Convert an Office document (DOCX, XLSX, PPTX) to PDF without preparing it for verification.

```typescript
const { downloadUrl } = await dc.convertToPdf({
  url: "https://example.com/report.docx",
});
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `input` | `ConvertFileInput \| string` | URL or conversion options |

**Returns**: `ConvertFileResponse`

---

### `prepareConvertedFile(options)`

Prepare a previously converted PDF for citation verification.

```typescript
const result = await dc.prepareConvertedFile({
  convertedFileUrl: downloadUrl,
  filename: "report.pdf",
});
```

**Returns**: `UploadFileResponse` (includes `deepTextPages`)

---

## Citation Verification

### `verify(input, citations?)`

Convenience wrapper that parses citations from raw LLM output, groups them by attachment, and verifies each group.

```typescript
const { verifications } = await dc.verify({
  llmOutput: response.content,
  outputImageFormat: "avif",
});
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `input.llmOutput` | `string` | Raw LLM output containing `[N]` markers and `<<<CITATION_DATA>>>` block |
| `input.outputImageFormat` | `"avif" \| "jpeg" \| "png"` | Proof image format (default: `"avif"`) |
| `input.fileDataParts` | `Array<{ attachmentId: string; filename?: string }>` | File metadata for Zero Data Retention / post-expiry scenarios |
| `input.endUserId` | `string` | Your end-user identifier |
| `citations` | `Record<string, Citation>` | Pre-parsed citations (if omitted, parsed from `llmOutput`) |

**Returns**: `VerifyCitationsResponse` — `{ verifications: Record<string, Verification> }`

{: .note }
`verify()` calls `getAllCitationsFromLlmOutput()` internally. Use `verifyAttachment()` when you extract and manage citations yourself.

---

### `verifyAttachment(attachmentId, citations, options?)`

Verify explicit citations against a specific attachment. Use this when you manage citation extraction yourself.

```typescript
const citations = getAllCitationsFromLlmOutput(response.content);
const { verifications } = await dc.verifyAttachment(attachmentId, citations, {
  outputImageFormat: "avif",
});
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `attachmentId` | `string` | The attachment ID from `prepareAttachments()` |
| `citations` | `CitationInput` | Map of citation keys to Citation objects |
| `options.outputImageFormat` | `"avif" \| "jpeg" \| "png"` | Proof image format (default: `"avif"`) |
| `options.endUserId` | `string` | Your end-user identifier |

**Returns**: `VerifyCitationsResponse` — `{ verifications: Record<string, Verification> }`

---

## Batch & Iterative Verification

### `verifyBatch(citations, options?)`

Verify citations across multiple attachments in a single request. Each citation must include an `attachmentId` field. Use this when you have citations from multiple documents and want a single API call.

```typescript
const allCitations = getAllCitationsFromLlmOutput(response.content);
const { verifications } = await dc.verifyBatch(allCitations, {
  outputImageFormat: "avif",
});
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `citations` | `Record<string, Citation>` | Citations keyed by citation key. Each citation must include an `attachmentId` field. |
| `options.outputImageFormat` | `"avif" \| "jpeg" \| "png"` | Proof image format (default: `"avif"`) |
| `options.endUserId` | `string` | Your end-user identifier |

**Returns**: `VerifyCitationsResponse` — `{ verifications: Record<string, Verification> }`

{: .note }
`verifyBatch()` is equivalent to calling `verifyAttachment()` per attachment but batches them into one network round-trip. Use `verify()` for the simplest case — it calls `verifyBatch()` internally after parsing citations from raw LLM output.

---

### `verifyIterative(attachmentId, citations, options)`

Verify citations with iterative refinement. Each failed citation is retried up to `maxAttempts` times using the correction callback, letting you fix citations programmatically instead of discarding them.

```typescript
const { verifications } = await dc.verifyIterative(
  attachmentId,
  citations,
  {
    maxAttempts: 3,
    outputImageFormat: "avif",
    onAttemptComplete: async (attempt, history, citationKey) => {
      if (attempt.status === "not_found") {
        // Shorten the source match and retry
        const original = citations[citationKey];
        return { ...original, sourceMatch: original.sourceMatch.split(" ").slice(0, 2).join(" ") };
      }
      return null; // stop retrying
    },
  },
);
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `attachmentId` | `string` | The attachment ID from `prepareAttachments()` |
| `citations` | `CitationInput` | Map of citation keys to Citation objects |
| `options.maxAttempts` | `number` | Maximum verification passes per citation. Default: `3`. |
| `options.outputImageFormat` | `"avif" \| "jpeg" \| "png"` | Proof image format (default: `"avif"`) |
| `options.endUserId` | `string` | Your end-user identifier |
| `options.onAttemptComplete` | `(attempt: LlmSearchAttempt, history: LlmSearchAttempt[], citationKey: string) => Promise<Citation \| { citation: Citation; isFalsePositiveRejection?: boolean } \| null \| undefined>` | Called after each non-terminal attempt. Return an amended `Citation` to retry, `{ citation, isFalsePositiveRejection: true }` to flag a false positive, or `null`/`undefined` to stop. |

**Returns**: `VerifyCitationsResponse` — `{ verifications: Record<string, Verification> }`

---

## Attachment Management

### `getAttachment(attachmentId, options?)`

Retrieve full attachment metadata including page renders, verifications, and extracted text.

```typescript
const attachment = await dc.getAttachment("abc123");
```

**Returns**: `AttachmentResponse` (includes canonical `deepTextPages`)

---

### `deleteAttachment(attachmentId)`

Permanently delete an attachment and all associated data. Irreversible.

```typescript
const { deleted } = await dc.deleteAttachment("abc123");
```

**Returns**: `DeleteAttachmentResponse` — `{ attachmentId, deleted: true }`

---

### `extendExpiration(options)`

Extend the expiration date of an attachment.

```typescript
const { expiresAt } = await dc.extendExpiration({
  attachmentId: "abc123",
  duration: "year", // "month" or "year"
});
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `options.attachmentId` | `string` | The attachment to extend |
| `options.duration` | `"month" \| "year"` | Extension period (30 or 365 days) |

**Returns**: `ExtendExpirationResponse` — `{ attachmentId, expiresAt, previousExpiresAt }`

---

## Standalone Utility Functions

These functions are imported directly from `deepcitation` — they don't require a client instance.

### Citation Parsing

#### Core Parsing

```typescript
import {
  getAllCitationsFromLlmOutput,
  parseCitationResponse,
  parseCitationData,
  citationDataToCitation,
  groupCitationsByAttachmentId,
  groupCitationsByAttachmentIdObject,
  getCitationKey,
  normalizeCitationType,
  extractCitationsFromMarkers,
} from "deepcitation";
```

| Function | Signature | Description |
|:---------|:----------|:------------|
| `getAllCitationsFromLlmOutput` | `(llmOutput: string) => Record<string, Citation>` | Parse `<<<CITATION_DATA>>>` block from LLM output. Returns `{}` on failure — never throws. |
| `parseCitationResponse` | `(llmOutput: string) => ParsedCitationResult` | Parse LLM output into `{ visibleText, citations, markerMap }` for rendering. |
| `parseCitationData` | `(json: unknown) => CitationData \| null` | Parse and validate a single raw citation data object. Returns `null` if the object lacks a required `id` field. |
| `citationDataToCitation` | `(data: CitationData) => Citation` | Convert a parsed `CitationData` object to a `Citation` for verification. |
| `groupCitationsByAttachmentId` | `(citations: Record<string, Citation>) => Map<string, Record<string, Citation>>` | Group citations by their `attachmentId` for per-attachment verification. Returns a `Map`. |
| `groupCitationsByAttachmentIdObject` | `(citations: Record<string, Citation>) => Record<string, Record<string, Citation>>` | Same as `groupCitationsByAttachmentId` but returns a plain object instead of a `Map`. |
| `getCitationKey` | `(citation: Citation) => string` | Generate a stable 16-char hash key for a citation. Used as the dictionary key in verification results. |
| `normalizeCitationType` | `(type: string) => CitationType` | Normalize a raw type string (e.g. `"audio"`, `"video"`) to a `CitationType` value. |
| `extractCitationsFromMarkers` | `(text: string) => Record<string, Citation>` | Extract citations from LLM output that has only `[N]` markers but no `<<<CITATION_DATA>>>` block. Uses the surrounding sentence as `sourceContext`. |

#### Text Manipulation

```typescript
import {
  stripCitations,
  replaceCitationMarkers,
  extractVisibleText,
  hasCitationData,
  getCitationMarkerIds,
} from "deepcitation";
```

| Function | Signature | Description |
|:---------|:----------|:------------|
| `stripCitations` | `(llmResponse: string) => string` | Remove all citation artifacts from LLM output — strips both `[N]` markers and the `<<<CITATION_DATA>>>` block. Returns clean readable text. |
| `replaceCitationMarkers` | `(text: string, options?) => string` | Replace `[N]` markers with custom content. Pass a `replacer` function, `showSourceMatch: true` to substitute anchor text, or `showVerificationStatus: true` to append status indicators. Default behavior strips markers. |
| `extractVisibleText` | `(llmResponse: string) => string` | Split the LLM output at the `<<<CITATION_DATA>>>` delimiter and return only the visible portion above it. Does **not** strip `[N]` markers. |
| `hasCitationData` | `(text: string) => boolean` | Check whether a string contains a `<<<CITATION_DATA>>>` block. |
| `getCitationMarkerIds` | `(text: string) => number[]` | Return all citation marker IDs found in text, in order of appearance. Handles both `[N]` and `[anchor](cite:N)` formats. |

#### Type Guards

```typescript
import {
  isDocumentCitation,
  isUrlCitation,
  isAudioVideoCitation,
} from "deepcitation";
```

| Function | Signature | Description |
|:---------|:----------|:------------|
| `isDocumentCitation` | `(c: Citation) => c is DocumentCitation` | Narrow a `Citation` union to `DocumentCitation` (type `"document"`). |
| `isUrlCitation` | `(c: Citation) => c is UrlCitation` | Narrow a `Citation` union to `UrlCitation` (type `"url"`). |
| `isAudioVideoCitation` | `(c: Citation) => c is AudioVideoCitation` | Narrow a `Citation` union to `AudioVideoCitation` (type `"audio"` or `"video"`). |

### Prompt Wrapping

```typescript
import { wrapCitationPrompt, wrapSystemCitationPrompt } from "deepcitation/prompts";
```

| Function | Signature | Description |
|:---------|:----------|:------------|
| `wrapCitationPrompt` | `(options: WrapCitationPromptOptions) => WrapCitationPromptResult` | Wrap both system and user prompts with citation instructions. Returns `{ enhancedSystemPrompt, enhancedUserPrompt }`. |
| `wrapSystemCitationPrompt` | `(options: WrapSystemPromptOptions) => string` | Wrap only the system prompt. Use when you manage user prompt construction yourself. |

See [Prompts]({{ site.baseurl }}/prompts/) for details on what these functions inject.

### Verification Helpers

```typescript
import { getCitationStatus, validateUploadFile } from "deepcitation";
```

| Function | Signature | Description |
|:---------|:----------|:------------|
| `getCitationStatus` | `(verification: Verification) => CitationStatus` | Derive UI status (`isVerified`, `isPartialMatch`, `isMiss`, `isPending`) from a verification result. |
| `validateUploadFile` | `(file: unknown) => { valid: boolean, error?: string }` | Validate a file before uploading (checks size, type). |

---

## Rendering

### `prepareCitations(input, options?)`

Convert raw LLM output into a normalized intermediate representation (IR) that any rendering adapter can consume. This is the formal boundary between parsing/verification logic and custom renderers — prepare once, render to multiple formats.

```typescript
import { prepareCitations, type CitationAdapter } from "deepcitation";

const ir = prepareCitations(llmOutput, {
  verifications,
  sourceLabels: { [attachmentId]: "Annual Report 2024" },
});

// Walk the IR to build custom output
for (const seg of ir.segments) {
  if (seg.type === "text") {
    output += seg.text;
  } else {
    // seg.type === "citation"
    const citation = ir.citations.find(c => c.citationNumber === seg.citationNumber);
    output += renderCitationBadge(citation);
  }
}
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `input` | `string \| ParsedCitationResult` | Raw LLM output string, or a pre-parsed result from `parseCitationResponse()`. |
| `options.verifications` | `VerificationRecord` | Verification results keyed by citation key. Populates `isVerified`, `isPartialMatch`, etc. on each citation in the IR. |
| `options.sourceLabels` | `Record<string, string>` | Display labels keyed by `attachmentId` (use `""` for URL citations). Pre-resolved onto each `ResolvedCitation` in the IR. |

**Returns**: `CitationIR` — `{ segments: ReadonlyArray<TextSegment \| CitationSegment>, citations: ReadonlyArray<ResolvedCitation> }`

#### Related types

| Type | Description |
|:-----|:------------|
| `CitationIR` | The normalized IR: `{ segments, citations }`. Adapters consume this — they never call `parseCitationResponse` directly. |
| `CitationAdapter<TOptions, TOutput>` | A pure function `(ir: CitationIR, options?: TOptions) => TOutput`. Implement this to target a new render format (email, PDF, Notion, etc.). |
| `ResolvedCitation` | A citation with verification status and a pre-computed `sourceLabel` from the fallback chain. |
| `PrepareCitationsOptions` | Input options for `prepareCitations()`: `{ verifications?, sourceLabels? }`. |

---

## Display Utilities

These helpers are useful when building custom citation renderers.

```typescript
import {
  toSuperscript,
  getIndicator,
  humanizeLinePosition,
  INDICATOR_SETS,
  SUPERSCRIPT_DIGITS,
} from "deepcitation";
```

| Export | Signature / Type | Description |
|:-------|:-----------------|:------------|
| `toSuperscript` | `(n: number) => string` | Convert a number to Unicode superscript characters (e.g. `3` → `"³"`). |
| `getIndicator` | `(set: IndicatorSet, index: number) => string` | Get the indicator character at a given index from an `IndicatorSet`. Wraps when index exceeds the set length. |
| `humanizeLinePosition` | `(pos: LinePosition) => string` | Format a `LinePosition` as a human-readable string (e.g. `"line 5"` or `"lines 5–7"`). |
| `INDICATOR_SETS` | `Record<IndicatorStyle, IndicatorSet>` | Predefined indicator sets: `"numbers"` (1, 2, 3…), `"letters"` (a, b, c…), `"symbols"` (†, ‡, §…). |
| `SUPERSCRIPT_DIGITS` | `string[]` | Lookup array mapping digits 0–9 to their Unicode superscript equivalents. |

---

## Error Classes

All errors extend `DeepCitationError` and include `code`, `isRetryable`, and `statusCode` properties.

```typescript
import {
  AuthenticationError,   // 401/403 — fix the API key
  PaymentRequiredError,  // 402 — add or update payment method
  RateLimitError,        // 429 — rate limit exceeded
  ValidationError,       // 400/404/413 — fix the input
  ServerError,           // 5xx — safe to retry
  NetworkError,          // Network failure — safe to retry
} from "deepcitation";
```

| Class | Code | Status | Retryable | When thrown |
|:------|:-----|:-------|:----------|:------------|
| `AuthenticationError` | `DC_AUTH_INVALID` | 401, 403 | No | Missing, invalid, or expired API key |
| `PaymentRequiredError` | `DC_PAYMENT_REQUIRED` | 402 | No | Free tier exhausted, spend cap hit, or payment failed. Includes a `billingCode` field with the server-side billing reason. |
| `RateLimitError` | `DC_RATE_LIMITED` | 429 | Yes | API rate limit exceeded |
| `ValidationError` | `DC_VALIDATION_ERROR` | 400, 404, 413 | No | Bad input — wrong file format, oversized file, or invalid attachment ID |
| `ServerError` | `DC_SERVER_ERROR` | 5xx | Yes | API server error |
| `NetworkError` | `DC_NETWORK_ERROR` | — | Yes | Timeout, DNS failure, or connection refused |

See [Error Handling]({{ site.baseurl }}/error-handling/) for retry patterns and the `isRetryable` flag.

---

## Constants

### Delimiters

```typescript
import {
  CITATION_DATA_START_DELIMITER,  // "<<<CITATION_DATA>>>"
  CITATION_DATA_END_DELIMITER,    // "<<<END_CITATION_DATA>>>"
  SDK_VERSION,                    // Current SDK version string
} from "deepcitation";
```

### Prompt Format Constants

The SDK exports four distinct citation prompt formats. Pass these directly to LLM APIs that accept raw system prompt text, or use them to build custom `wrapCitationPrompt` alternatives.

```typescript
import {
  // Standard document format (default)
  CITATION_PROMPT,
  CITATION_JSON_OUTPUT_FORMAT,
  CITATION_REMINDER,

  // Audio/video format (timestamps instead of page/line references)
  AV_CITATION_PROMPT,
  CITATION_AV_JSON_OUTPUT_FORMAT,
  CITATION_AV_REMINDER,

  // Compact format (omits source_context/reasoning — ~80–135 fewer tokens per citation)
  COMPACT_CITATION_PROMPT,
  COMPACT_CITATION_SCENARIO2_PROMPT,
  COMPACT_CITATION_JSON_OUTPUT_FORMAT,
} from "deepcitation";
```

| Constant | Format | When to use |
|:---------|:-------|:------------|
| `CITATION_PROMPT` | Standard | Default for document/PDF citations. Includes `source_context` and `reasoning` fields. |
| `CITATION_JSON_OUTPUT_FORMAT` | Standard | JSON schema object for use with structured output APIs (e.g. OpenAI `response_format`). |
| `CITATION_REMINDER` | Standard | Short reminder string to append to user prompts. |
| `AV_CITATION_PROMPT` | Audio/Video | Replaces `page_id`/`line_ids` with `timestamps` (`start_time`/`end_time` in `HH:MM:SS.SSS`). |
| `CITATION_AV_JSON_OUTPUT_FORMAT` | Audio/Video | JSON schema for AV timestamp citations. |
| `CITATION_AV_REMINDER` | Audio/Video | Reminder variant that mentions timestamps. |
| `COMPACT_CITATION_PROMPT` | Compact | Omits `source_context` and `reasoning` from LLM output (reconstructed offline via hydrate). Use for latency-sensitive pipelines. Saves ~80–135 tokens per citation. |
| `COMPACT_CITATION_SCENARIO2_PROMPT` | Compact | Variant for annotating pre-existing user text (text is frozen; only `[N]` markers are inserted). |
| `COMPACT_CITATION_JSON_OUTPUT_FORMAT` | Compact | JSON schema for compact citations (`n`, `k`, `p`, `l` only). |

See [Prompts]({{ site.baseurl }}/prompts/) for when to choose each format.

### Prompt ID Compression

When attachment IDs are long (e.g. UUIDs), compressing them reduces token count in large prompts.

```typescript
import { compressPromptIds, decompressPromptIds, type CompressedResult } from "deepcitation";

// Compress: replace full IDs with minimal unique prefixes
const { compressed, prefixMap } = compressPromptIds(promptObject, attachmentIds);

// Decompress: restore full IDs from prefixes
const restored = decompressPromptIds(compressed, prefixMap);
```

| Export | Signature | Description |
|:-------|:----------|:------------|
| `compressPromptIds` | `<T>(obj: T, ids: string[] \| undefined) => CompressedResult<T>` | Replace all occurrences of each ID in `obj` with its minimal unique prefix. Returns the compressed object and a `prefixMap` for decompression. Throws if a safe prefix cannot be found. |
| `decompressPromptIds` | `<T>(compressed: T \| string, prefixMap: Record<string, string>) => T \| string` | Restore full IDs from a compressed object or string using the `prefixMap` from `compressPromptIds`. |
| `CompressedResult<T>` | `{ compressed: T, prefixMap: Record<string, string> }` | Return type of `compressPromptIds`. Pass `prefixMap` to `decompressPromptIds` to reverse the operation. |
