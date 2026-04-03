---
layout: default
title: API Reference
nav_order: 3
description: "REST API endpoints for file preparation and citation verification"
has_children: true
commit_sha: "869c09d"
stale_after_commits: 10
watch_paths:
  - src/client/DeepCitation.ts
  - src/client/types.ts
  - src/client/errors.ts
  - src/client/index.ts
---

# API Reference

REST API endpoints for preparing files, verifying citations, and managing attachments.

**Base URL**: `https://api.deepcitation.com`

**Authentication**: All requests require a Bearer token in the `Authorization` header:
```
Authorization: Bearer dc_live_YOUR_API_KEY
```

---

## POST /prepareAttachments (File Upload)

Upload a document or image for citation verification. Extracts text with line IDs for LLM prompts.

### Content-Type

`multipart/form-data`

### Supported File Types

| Category | Formats |
|:---------|:--------|
| **Documents** | PDF |
| **Images** | JPEG, PNG, TIFF, BMP, GIF, WebP (auto-OCR) |

{: .note }
For Office files (DOCX, XLSX, PPTX, ODT, ODS, ODP) and web pages, use the [URL preparation endpoint](#post-prepareattachments-url-preparation) or the SDK's `prepareUrl()` method, which handles conversion automatically.

### Request Parameters

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `file` | File | Yes | Document or image file |
| `filename` | string | No | Override filename |
| `attachmentId` | string | No | Custom attachment ID (auto-generated if omitted) |
| `endUserId` | string | No | Your end-user identifier for usage attribution |

### Response Fields

| Field | Type | Description |
|:------|:-----|:------------|
| `attachmentId` | string | System-generated or custom ID for verification calls |
| `deepTextPages` | string[] | Raw page text returned by `prepareAttachments()` and preferred input for `wrapCitationPrompt()` |
| `status` | `"ready"` \| `"error"` | Processing status |
| `metadata` | object | File metadata (filename, mimeType, pageCount, textByteSize) |
| `processingTimeMs` | number | Processing time in milliseconds |
| `expiresAt` | string \| `"never"` | Attachment expiration date (ISO 8601) |
| `pageImages` | PageImage[] | Pre-assigned page structure with dimensions and storage paths |
| `pageImagesStatus` | string | Status of page image generation (`"completed"`, `"pending"`, `"failed"`) |
| `originalDownload` | object | Download link for the original file (when available) |
| `error` | string | Error message if status is `"error"` |

### Example Request

```bash
curl -X POST "https://api.deepcitation.com/prepareAttachments" \
  -H "Authorization: Bearer dc_live_YOUR_API_KEY" \
  -F "file=@document.pdf"
```

### Example Response

```json
{
  "attachmentId": "abc123-def456-ghi789",
  "deepTextPages": [
    "Revenue increased by 25% in Q4...",
    "Net profit margin improved..."
  ],
  "metadata": {
    "filename": "document.pdf",
    "mimeType": "application/pdf",
    "pageCount": 2,
    "textByteSize": 4096
  },
  "status": "ready",
  "processingTimeMs": 1234,
  "expiresAt": "2026-04-22T00:00:00.000Z"
}
```

---

## POST /prepareAttachments (URL Preparation)

Convert a web page or hosted document to PDF and prepare it for citation verification. This is the recommended approach for web content and Office files.

### Content-Type

`application/json`

### Request Parameters

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `url` | string | Yes | URL of the web page or document to process |
| `attachmentId` | string | No | Custom attachment ID (auto-generated if omitted) |
| `filename` | string | No | Custom filename for the converted document |
| `skipCache` | boolean | No | Force a fresh conversion, bypassing the URL cache (default: `false`) |
| `endUserId` | string | No | Your end-user identifier for usage attribution |

### Response Fields

Same as [file upload response](#response-fields), plus:

| Field | Type | Description |
|:------|:-----|:------------|
| `urlSource` | object | Source URL information (`url` and `domain`) — use these to populate `Citation.url` and `Citation.domain` |
| `urlCache` | object | Cache metadata (`cached`, `cacheExpiresAt`, `cacheKey`) |
| `convertedDownload` | object | Download link for the converted PDF rendition |

### Example Request

```bash
curl -X POST "https://api.deepcitation.com/prepareAttachments" \
  -H "Authorization: Bearer dc_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/article"
  }'
```

### Example Response

```json
{
  "attachmentId": "url-abc123-def456",
  "deepTextPages": [
    "Example Article Title...",
    "Published on March 15, 2026..."
  ],
  "metadata": {
    "filename": "article.pdf",
    "mimeType": "application/pdf",
    "pageCount": 3,
    "textByteSize": 8192
  },
  "status": "ready",
  "processingTimeMs": 28500,
  "urlSource": {
    "url": "https://example.com/article",
    "domain": "example.com"
  },
  "urlCache": {
    "cached": false,
    "cacheExpiresAt": "2026-03-24T00:00:00.000Z",
    "cacheKey": "a1b2c3d4e5f6"
  }
}
```

{: .note }
URL preparation takes ~30 seconds for the initial conversion (pages are rendered to PDF via headless browser). Subsequent requests for the same URL within the cache window return instantly.

---

## POST /verifyCitations

Verify citations from LLM output against a source document. Returns verification status and visual proof.

### Content-Type

`application/json`

### Request Parameters

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `data.attachmentId` | string | Yes | From prepareAttachments response |
| `data.citations` | `Record<string, Citation>` | Yes | Map of citation keys to Citation objects |
| `data.outputImageFormat` | `"jpeg"` \| `"png"` \| `"avif"` | No | Image format for proof screenshots (default: `"avif"`) |
| `data.endUserId` | string | No | Your end-user identifier for usage attribution |

### Response Fields

| Field | Type | Description |
|:------|:-----|:------------|
| `verifications` | `Record<string, Verification>` | Map of citation keys to verification results |

Each `Verification` contains:

| Field | Type | Description |
|:------|:-----|:------------|
| `status` | `SearchStatus` | Verification outcome (`"found"`, `"partial_text_found"`, `"not_found"`) |
| `verifiedFullPhrase` | string | The full phrase that was matched |
| `verifiedMatchSnippet` | string | Text context around the match |
| `evidence` | object | Visual proof screenshot (`{ src: "data:image/..." }`) |
| `document` | object | Document-specific results (includes `pageNumber`, `lineId`, `boundingBoxes`) |
| `url` | object | URL-specific results (when verifying against a web page) |
| `verifiedAt` | string | ISO 8601 timestamp of verification |

### Example Request

```bash
curl -X POST "https://api.deepcitation.com/verifyCitations" \
  -H "Authorization: Bearer dc_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "attachmentId": "abc123-def456-ghi789",
      "citations": {
        "citation-1": {
          "fullPhrase": "Revenue increased by 25% in Q4",
          "pageNumber": 1
        },
        "citation-2": {
          "fullPhrase": "Net profit margin improved",
          "value": "profit margin"
        }
      },
      "outputImageFormat": "avif"
    }
  }'
```

### Example Response

```json
{
  "verifications": {
    "citation-1": {
      "pageNumber": 1,
      "lowerCaseSearchTerm": "revenue increased by 25% in q4",
      "matchSnippet": "...the company reported that Revenue increased by 25% in Q4 compared to...",
      "evidence": { "src": "data:image/avif;base64,AAAAIGZ0eXBhdmlm..." },
      "searchState": {
        "status": "found"
      },
      "verifiedAt": "2026-01-15T10:30:00.000Z"
    },
    "citation-2": {
      "pageNumber": 1,
      "lowerCaseSearchTerm": "net profit margin improved",
      "matchSnippet": "...operating costs. Net profit margin improved by 3.2 percentage points...",
      "evidence": { "src": "data:image/avif;base64,AAAAIGZ0eXBhdmlm..." },
      "searchState": {
        "status": "found"
      },
      "verifiedAt": "2026-01-15T10:30:00.000Z"
    }
  }
}
```

{: .note }
**SDK users**: The TypeScript SDK provides two verification methods — `verifyAttachment(attachmentId, citations)` for explicit control, and `verify({ llmOutput })` as a convenience wrapper that parses and groups citations automatically. See [SDK Reference]({{ site.baseurl }}/sdk-reference/) for all client methods.

---

## POST /getAttachment

Retrieve full attachment metadata by ID, including page renders, verifications, and extracted text.

### Content-Type

`application/json`

### Request Parameters

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `attachmentId` | string | Yes | The attachment ID to query |
| `endUserId` | string | No | Your end-user identifier for usage attribution |

### Response Fields

| Field | Type | Description |
|:------|:-----|:------------|
| `id` | string | The attachment ID |
| `status` | `"ready"` \| `"processing"` \| `"error"` | Current processing status |
| `source` | string | Source identifier (filename or URL) |
| `originalFilename` | string | Original filename |
| `mimeType` | string | File MIME type |
| `pageCount` | number | Number of pages |
| `pageImages` | PageImage[] | Page renders with dimensions |
| `pageImagesStatus` | string | Page image generation status |
| `verifications` | `Record<string, Verification>` | All verification results for this attachment |
| `deepTextPages` | string[] | Raw extracted page text |
| `urlSource` | object | Source URL information (for URL-based attachments) |
| `expiresAt` | string \| `"never"` | Expiration date |
| `uploadedAt` | string | Upload timestamp (ISO 8601) |
| `processedAt` | string | Processing completion timestamp (ISO 8601) |

### Example Request

```bash
curl -X POST "https://api.deepcitation.com/getAttachment" \
  -H "Authorization: Bearer dc_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "attachmentId": "abc123-def456-ghi789" }'
```

---

## POST /attachments/:id/extend

Extend the expiration date of an attachment.

### Content-Type

`application/json`

### Path Parameters

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `id` | string | Yes | Attachment ID to extend |

### Request Parameters

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `duration` | `"month"` \| `"year"` | Yes | Extension period (30 days or 365 days) |

### Response Fields

| Field | Type | Description |
|:------|:-----|:------------|
| `attachmentId` | string | The extended attachment ID |
| `expiresAt` | string \| `"never"` | New expiration date |
| `previousExpiresAt` | string \| `"never"` | Previous expiration date |

### Example Request

```bash
curl -X POST "https://api.deepcitation.com/attachments/abc123-def456-ghi789/extend" \
  -H "Authorization: Bearer dc_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "duration": "month" }'
```

### Example Response

```json
{
  "attachmentId": "abc123-def456-ghi789",
  "expiresAt": "2026-05-22T00:00:00.000Z",
  "previousExpiresAt": "2026-04-22T00:00:00.000Z"
}
```

---

## DELETE /attachments/:id

Permanently delete an attachment and all associated data. This action is irreversible.

### Example Request

```bash
curl -X DELETE "https://api.deepcitation.com/attachments/abc123-def456-ghi789" \
  -H "Authorization: Bearer dc_live_YOUR_API_KEY"
```

### Example Response

```json
{
  "attachmentId": "abc123-def456-ghi789",
  "deleted": true
}
```

---

## Error Codes

| Status | Code | Description |
|:-------|:-----|:------------|
| 400 | `invalid-argument` | Missing required parameters or invalid file format |
| 401 | `unauthenticated` | Invalid or expired API key |
| 404 | `not-found` | Attachment not found (may have expired) |
| 405 | `method-not-allowed` | Unsupported HTTP method for this endpoint |
| 429 | `resource-exhausted` | Free tier limit exceeded — add a payment method |
| 503 | `service-unavailable` | Temporary service issue — retry with exponential backoff |

{: .note }
See [Error Handling]({{ site.baseurl }}/error-handling/) for retry patterns with exponential backoff, `isRetryable` flags, and the full error class reference.

---

## Limits & Pricing

### File Limits

| Limit | Value |
|:------|:------|
| **Maximum file size** | 100 MB |
| **File retention** | 365 days (auto-renewing with active account) |

The server returns the current maximum via the `X-DeepCitation-Max-File-Size` response header. Files exceeding this limit return a `413` error.

### Billing Model

DeepCitation uses **billing-based limits** rather than request-per-minute rate limits. You can make as many API calls as your account balance allows.

| Operation | Cost |
|:----------|:-----|
| **Free tier** | $20/month (no credit card required) |
| **Document processing** | $0.05 per 25-page unit |
| **Verification request** | $0.01 per request (includes first 25 citations) |
| **Additional citations** | $0.01 per block of 25 citations beyond first 25 |

The `X-DeepCitation-Included-Citations` response header indicates how many citations are included per verification request.

When your free tier or account balance is exhausted, the API returns `429 resource-exhausted`. Add a payment method to continue.

See [full pricing](https://deepcitation.com/pricing) for volume discounts and enterprise plans.
