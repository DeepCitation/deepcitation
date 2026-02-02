---
layout: default
title: API Reference
nav_order: 3
description: "REST API endpoints for file preparation and citation verification"
has_children: true
---

# API Reference

REST API endpoints for preparing files and verifying citations.

---

## POST /prepareFile

Upload and process a document for citation verification. Extracts text with line IDs for LLM prompts.

### Content-Type

`multipart/form-data`

### Request Parameters

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `file` | File | Yes | PDF or image file (max 10MB) |
| `filename` | string | No | Override filename |

### Response Fields

| Field | Type | Description |
|:------|:-----|:------------|
| `attachmentId` | string | System-generated ID for verification calls. Store this to avoid re-uploading. |
| `deepTextPromptPortion` | string | Formatted text with page markers and line IDs for `wrapCitationPrompt()` |
| `status` | `"ready"` \| `"error"` | Processing status |
| `metadata` | object | File metadata (filename, mimeType, pageCount, textByteSize) |
| `processingTimeMs` | number | Processing time in milliseconds |
| `error` | string | Error message if status is "error" |

### Example Request

```bash
curl -X POST "https://api.deepcitation.com/prepareFile" \
  -H "Authorization: Bearer dc_live_your_api_key" \
  -F "file=@document.pdf"
```

### Example Response

```json
{
  "attachmentId": "abc123-def456-ghi789",
  "deepTextPromptPortion": "[Page 1]\n[L1] Revenue increased by 25% in Q4...\n[L2] Net profit margin improved...",
  "metadata": {
    "filename": "document.pdf",
    "mimeType": "application/pdf",
    "pageCount": 2,
    "textByteSize": 4096
  },
  "status": "ready",
  "processingTimeMs": 1234
}
```

---

## POST /verifyCitations

Verify citations from LLM output against the source document. Returns verification status and visual proof.

### Content-Type

`application/json`

### Request Parameters

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `data.attachmentId` | string | Yes | From prepareFile response. The SDK handles this automatically with `deepcitation.verify()`. |
| `data.citations` | `Record<string, Citation>` | Yes | Map of citation keys to Citation objects |
| `data.outputImageFormat` | `"jpeg"` \| `"png"` \| `"avif"` | No | Image format for proofs (default: "avif") |

### Response Fields

| Field | Type | Description |
|:------|:-----|:------------|
| `verifications` | `Record<string, Verification>` | Map of citation keys to verification results |

### Example Request

```bash
curl -X POST "https://api.deepcitation.com/verifyCitations" \
  -H "Authorization: Bearer dc_live_your_api_key" \
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
      "verificationImageBase64": "data:image/avif;base64,AAAAIGZ0eXBhdmlm...",
      "searchState": {
        "status": "found"
      },
      "verifiedAt": "2024-01-15T10:30:00.000Z"
    },
    "citation-2": {
      "pageNumber": 1,
      "lowerCaseSearchTerm": "net profit margin improved",
      "matchSnippet": "...operating costs. Net profit margin improved by 3.2 percentage points...",
      "verificationImageBase64": "data:image/avif;base64,AAAAIGZ0eXBhdmlm...",
      "searchState": {
        "status": "found"
      },
      "verifiedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

---

## Error Codes

| Status | Code | Description |
|:-------|:-----|:------------|
| 400 | `invalid-argument` | Missing required parameters or invalid file format |
| 401 | `unauthenticated` | Invalid or expired API key |
| 404 | `not-found` | Attachment not found (may have expired after 30 days) |
| 405 | `method-not-allowed` | Only POST requests are allowed |
| 429 | `resource-exhausted` | Free tier limit exceeded - add a payment method |
| 503 | `service-unavailable` | Temporary service issue - retry with exponential backoff |

---

## Rate Limits & Pricing

### Rate Limits

- 30 day file retention (re-upload if needed)
- 429 status when limit exceeded

### Pricing

- First $10/month free (no credit card required)
- Pay only for what you use
- Volume discounts available

See [full pricing](https://deepcitation.com/pricing) for details.
