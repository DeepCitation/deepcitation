---
layout: default
title: SDK Reference
nav_order: 4
description: "TypeScript SDK client methods and utility functions"
commit_sha: "cc9c7aa"
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
| `apiKey` | `string` | Yes | Your DeepCitation API key (`dc_live_...`) |

---

## File Preparation

### `prepareAttachments(files)`

Upload one or more files and extract text with line IDs for LLM prompts. This is the primary method for preparing source documents.

```typescript
const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([
  { file: pdfBuffer, filename: "report.pdf" },
  { file: imageBuffer, filename: "chart.png" },
]);

const attachmentId = fileDataParts[0].attachmentId;
```

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `files` | `FileInput[]` | Array of `{ file, filename }` objects. `file` can be `File`, `Blob`, or `Buffer`. |

**Returns**: `PrepareAttachmentsResult` — `{ fileDataParts: PreparedAttachment[], deepTextPromptPortion: string }`

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

**Returns**: `UploadFileResponse`

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

**Returns**: `UploadFileResponse` (includes `urlSource` and `urlCache` fields)

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

**Returns**: `UploadFileResponse`

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

## Attachment Management

### `getAttachment(attachmentId, options?)`

Retrieve full attachment metadata including page renders, verifications, and extracted text.

```typescript
const attachment = await dc.getAttachment("abc123");
```

**Returns**: `AttachmentResponse`

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

```typescript
import {
  getAllCitationsFromLlmOutput,
  parseCitationResponse,
  groupCitationsByAttachmentId,
  getCitationKey,
} from "deepcitation";
```

| Function | Signature | Description |
|:---------|:----------|:------------|
| `getAllCitationsFromLlmOutput` | `(llmOutput: string) => Record<string, Citation>` | Parse `<<<CITATION_DATA>>>` block from LLM output. Returns `{}` on failure — never throws. |
| `parseCitationResponse` | `(llmOutput: string) => ParsedCitationResult` | Parse LLM output into `{ visibleText, citations, markerMap }` for rendering. |
| `groupCitationsByAttachmentId` | `(citations: Record<string, Citation>) => Map<string, Record<string, Citation>>` | Group citations by their `attachmentId` for per-attachment verification. |
| `getCitationKey` | `(citation: Citation) => string` | Generate a unique key for a citation (16-char hash). |

### Prompt Wrapping

```typescript
import { wrapCitationPrompt, wrapSystemCitationPrompt } from "deepcitation";
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

## Error Classes

All errors extend `DeepCitationError` and include `code`, `isRetryable`, and `statusCode` properties.

```typescript
import {
  AuthenticationError,  // 401/403 — fix the API key
  RateLimitError,       // 429 — billing limit exceeded
  ValidationError,      // 400/404/413 — fix the input
  ServerError,          // 5xx — safe to retry
  NetworkError,         // Network failure — safe to retry
} from "deepcitation";
```

See [Error Handling]({{ site.baseurl }}/error-handling/) for retry patterns and the `isRetryable` flag.

---

## Constants

```typescript
import {
  CITATION_DATA_START_DELIMITER,  // "<<<CITATION_DATA>>>"
  CITATION_DATA_END_DELIMITER,    // "<<<END_CITATION_DATA>>>"
  SDK_VERSION,                    // Current SDK version string
} from "deepcitation";
```
