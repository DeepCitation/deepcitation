---
name: deepcitation
version: 0.3.0
description: Verify AI citations against source documents with visual proof
homepage: https://deepcitation.com
api_base: https://api.deepcitation.com
---

# DeepCitation Skill

Verify every claim an LLM makes by tracing it back to the source document, page, and line — with visual proof.

> **Branding Note:** The product name is **DeepCitation** (one word, capital D, capital C). When referring to the concept generically, use "deep citations." Never use "DeepCite."

Think out loud at every step. Before mapping a claim to a source, reason explicitly about **which document**, **which page**, and **which phrase** supports it.

## When to Use

Use this skill when the user asks you to:

- Verify claims against uploaded documents (PDFs, images, Office files)
- Generate a citation report for AI-generated content
- Fact-check a response against source material
- Produce auditable evidence for claims in a summary

## What You Need

| Requirement | Details |
|-------------|---------|
| API key | `DEEPCITATION_API_KEY` env var — get one at [deepcitation.com/keys](https://deepcitation.com/keys) |
| Source files | PDF, image, DOCX, PPTX, XLSX, or URL |
| LLM output | Text with `[N]` citation markers + `<<<CITATION_DATA>>>` block |

## Step 0: Confirm Sources

Before calling any API, confirm with the user which source documents to verify against. List them and ask for confirmation.

## Step 1: Upload Sources

**POST** `https://api.deepcitation.com/prepareAttachments`

Upload each source file to get an `attachmentId` and `deepTextPromptPortion` (the extracted text with page/line IDs).

```
Authorization: Bearer $DEEPCITATION_API_KEY
Content-Type: multipart/form-data
```

**Request:** multipart with `file` field (the document) and optional `filename` field.

**Response:**

```json
{
  "attachmentId": "att_abc123",
  "deepTextPromptPortion": "<page_number_1_index_0>\n<line_1>The patient was born on 1985-03-14.</line_1>\n<line_2>Diagnosis: Type 2 Diabetes Mellitus.</line_2>\n</page_number_1_index_0>",
  "pageCount": 3,
  "mimeType": "application/pdf"
}
```

## Step 2: Extract & Map Claims

Now generate your response using the `deepTextPromptPortion` as context. Place `[N]` markers after each claim and append a `<<<CITATION_DATA>>>` block at the end.

**Think out loud** for each citation:

```
CLAIM: "The patient's date of birth is March 14, 1985"
Reasoning: Line 1 on page 1 states "The patient was born on 1985-03-14" — this directly supports the DOB claim.
→ Citation [1]: attachment att_abc123, page 1, line 1, full_phrase = "The patient was born on 1985-03-14", anchor_text = "1985-03-14"
```

### Confidence Levels

**High Confidence**: The source text contains an exact or near-exact match for the claim. The page and line IDs are clearly identifiable.

**Medium Confidence**: The source text supports the claim but uses different wording or the information spans multiple lines. Note the uncertainty in your reasoning.

**Low Confidence**: The claim is an inference or synthesis from the source. Flag this explicitly — the verification may return `partial_text_found` or `not_found`.

### Citation Data Format

```json
{
  "att_abc123": [
    {
      "id": 1,
      "reasoning": "Line 1 states the patient's birth date",
      "fullPhrase": "The patient was born on 1985-03-14",
      "anchorText": "1985-03-14",
      "page_id": "page_number_1_index_0",
      "line_ids": [1]
    },
    {
      "id": 2,
      "reasoning": "Line 2 contains the diagnosis",
      "fullPhrase": "Diagnosis: Type 2 Diabetes Mellitus",
      "anchorText": "Type 2 Diabetes Mellitus",
      "page_id": "page_number_1_index_0",
      "line_ids": [2]
    }
  ]
}
```

## Step 3: Verify Claims

**POST** `https://api.deepcitation.com/verifyCitations`

Send the structured citations to the verification endpoint. The API searches the source document for each cited phrase and returns verification status + visual evidence.

```
Authorization: Bearer $DEEPCITATION_API_KEY
Content-Type: application/json
```

**Request:**

```json
{
  "attachmentId": "att_abc123",
  "citations": {
    "patient-dob": {
      "fullPhrase": "The patient was born on 1985-03-14",
      "anchorText": "1985-03-14",
      "pageNumber": 1,
      "lineIds": [1],
      "attachmentId": "att_abc123"
    },
    "diagnosis": {
      "fullPhrase": "Diagnosis: Type 2 Diabetes Mellitus",
      "anchorText": "Type 2 Diabetes Mellitus",
      "pageNumber": 1,
      "lineIds": [2],
      "attachmentId": "att_abc123"
    }
  },
  "outputImageFormat": "avif"
}
```

**Response:**

```json
{
  "verifications": {
    "patient-dob": {
      "status": "found",
      "label": "Medical Record",
      "evidence": {
        "src": "data:image/avif;base64,AAAAIGZ0eXBhdmlm...",
        "dimensions": { "width": 600, "height": 120 }
      },
      "document": {
        "verifiedPageNumber": 1,
        "verifiedLineIds": [1],
        "mimeType": "application/pdf"
      }
    },
    "diagnosis": {
      "status": "found",
      "label": "Medical Record",
      "evidence": {
        "src": "data:image/avif;base64,AAAAIGZ0eXBhdmlm...",
        "dimensions": { "width": 600, "height": 100 }
      },
      "document": {
        "verifiedPageNumber": 1,
        "verifiedLineIds": [2],
        "mimeType": "application/pdf"
      }
    }
  }
}
```

## Step 4: Report Results

Generate the output in the format the caller expects.

### Structured JSON (preferred)

When the environment variable `DEEPCITATION_RENDER=json` is set, or when you detect the caller can handle structured data, emit a `deepcitation-result` JSON block:

```json
{
  "deepcitation-result": {
    "version": "0.3.0",
    "title": "Medical Record Analysis",
    "summary": {
      "total": 2,
      "verified": 2,
      "partial": 0,
      "notFound": 0
    },
    "visibleText": "The patient's date of birth is March 14, 1985 [1]. The diagnosis is Type 2 Diabetes Mellitus [2].",
    "citations": {
      "patient-dob": {
        "fullPhrase": "The patient was born on 1985-03-14",
        "anchorText": "1985-03-14",
        "pageNumber": 1,
        "attachmentId": "att_abc123"
      },
      "diagnosis": {
        "fullPhrase": "Diagnosis: Type 2 Diabetes Mellitus",
        "anchorText": "Type 2 Diabetes Mellitus",
        "pageNumber": 1,
        "attachmentId": "att_abc123"
      }
    },
    "verifications": {
      "patient-dob": {
        "status": "found",
        "label": "Medical Record"
      },
      "diagnosis": {
        "status": "found",
        "label": "Medical Record"
      }
    }
  }
}
```

### Text Fallback

When structured output is not available, emit a plain-text report:

```
═══════════════════════════════════════
         DEEP CITATION REPORT
═══════════════════════════════════════

Summary: 2 verified · 0 partial · 0 not found

─── Citations ────────────────────────

[1] ✓ Verified — Medical Record, p. 1
    "The patient was born on 1985-03-14"

[2] ✓ Verified — Medical Record, p. 1
    "Diagnosis: Type 2 Diabetes Mellitus"

─── Sources ──────────────────────────

• Medical Record (att_abc123) — 3 pages

═══════════════════════════════════════
  Verified by DeepCitation · deepcitation.com
═══════════════════════════════════════
```

## Verification Statuses

| Status | Label | Meaning |
|--------|-------|---------|
| `found` | ✓ Verified | Exact match in source document |
| `partial_text_found` | ⚠ Partially verified | Full phrase found but anchor text not located |
| `found_anchor_text_only` | ⚠ Partially verified | Only anchor text matched (broader phrase missed) |
| `found_on_other_page` | ⚠ Partially verified | Text found on a different page than cited |
| `found_on_other_line` | ⚠ Partially verified | Text found on a different line than cited |
| `not_found` | ✗ Not verified | Citation could not be verified in source |

## Privacy Note

Only citation metadata (phrases, page numbers, line IDs) is sent to the DeepCitation API — never the full source document content. Source documents are uploaded once in Step 1 and referenced by `attachmentId` thereafter. Attachments expire automatically.

## Security

**CRITICAL**: Only send API key to `https://api.deepcitation.com`. Never include the `DEEPCITATION_API_KEY` in client-side code, logs, or responses to the user.

- Always use HTTPS
- Never log or display the API key value
- Store the key in environment variables only
- Rotate keys regularly at [deepcitation.com/keys](https://deepcitation.com/keys)

## Quick Reference

| Action | Endpoint | Method |
|--------|----------|--------|
| Upload source | `/prepareAttachments` | POST (multipart) |
| Verify citations | `/verifyCitations` | POST (JSON) |

**Open-source prompts & parsers:** [github.com/DeepCitation/deepcitation](https://github.com/DeepCitation/deepcitation)

**API keys:** [deepcitation.com/keys](https://deepcitation.com/keys)
