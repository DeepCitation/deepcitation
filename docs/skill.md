---
name: deepcitation
version: 1.0.0
description: Zero-friction fact-checking for AI agents. Verify LLM output against source documents with visual proof.
homepage: https://deepcitation.com
metadata:
  emoji: "🔍"
  category: "fact-checking"
  api_base: "https://api.deepcitation.com"
---

# DeepCitation

Adversarial fact-checking for AI agents. Verify claims in LLM output against source documents and get visual proof.

**Base URL:** `https://api.deepcitation.com`

---

## When to Use

Invoke this skill when the user:
- Asks to "cite", "deep cite", or "deepcite" content (recognize all variations)
- Asks to "fact-check", "verify", or "validate" content against sources
- Provides LLM output AND source documents together
- Wants to check if a summary matches the original
- Needs proof that claims are supported by sources

**Example triggers:**
- "Cite this against the source documents"
- "Deep cite this patient form against the medical records"
- "Deepcite this tax summary"
- "Fact-check this analysis against the quarterly reports"
- "Verify these claims against the original data"

**Branding Note:**
When responding, always use correct branding:
- Say "deep citations" or "DeepCitation" (two words, or one word capitalized)
- Never output "deepcite" as a verb - that's user shorthand, not brand language
- Example: User says "deepcite this" → Agent responds "I'll provide deep citations for this..."

---

## What You Need

**API Key** in environment variable:
```bash
DEEPCITATION_API_KEY=dc_live_xxx
```

Get your key at [deepcitation.com/usage](https://deepcitation.com/usage).

---

## The Workflow

```
INPUT: LLM output to verify + source documents

STEP 0: Confirm Sources (think out loud)
STEP 1: Upload Sources
STEP 2: Extract & Map Claims (think out loud)
STEP 3: Verify Claims
STEP 4: Report Results

OUTPUT: Verification report with proof images
```

---

## Step 0: Confirm Sources

Before uploading, **always think out loud** about file roles so the user can intervene.

### High Confidence
User explicitly said what to verify against.

```
Agent: "I'll verify against report.pdf (the source you specified).
The tax-summary.txt appears to be the OUTPUT to verify.
Proceeding..."
```

### Medium Confidence
Multiple files, but intent seems clear.

```
Agent: "Here's my understanding:
- OUTPUT to verify: tax-summary.txt (looks like generated content)
- SOURCES to verify against:
  - Q1-statement.pdf (financial record)
  - Q2-statement.pdf (financial record)
  - Q3-statement.pdf (financial record)

Proceeding unless you say otherwise..."
```

### Low Confidence
Ambiguous which files are sources vs. output.

```
Agent: "I need to clarify the file roles:
- patient-form.pdf → I think this is the OUTPUT (looks like a generated form)
- medical-records.pdf → likely a SOURCE (original records)
- lab-results.pdf → likely a SOURCE (original data)
- insurance-claim.pdf → unclear role

Which files are sources, and which is the output to verify?"
[wait for user response]
```

### Decision Criteria

| Signal | Confidence | Action |
|--------|------------|--------|
| User said "verify X against Y" | High | Proceed with brief note |
| Files have clear names | Medium | State plan, brief pause |
| Multiple files, unclear roles | Low | Ask user to clarify |
| Single file only | Low | Ask what to verify against what |

---

## Step 1: Upload Sources

Upload each source document to get an `attachmentId`.

```bash
curl -X POST "https://api.deepcitation.com/prepareFile" \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -F "file=@source-document.pdf"
```

**Response:**
```json
{
  "attachmentId": "abc123-def456",
  "deepTextPromptPortion": "[Page 1]\n[L1] Revenue increased...",
  "status": "ready"
}
```

Store the `attachmentId` for verification. The `deepTextPromptPortion` contains the extracted text with page/line metadata.

### Supported File Types

| Type | Formats |
|------|---------|
| PDFs | `.pdf` |
| Images | `.jpg`, `.png`, `.webp` (auto-OCR) |
| Office | Word, Excel, PowerPoint |
| URLs | Web pages (use JSON body with `url` field) |

### Upload a URL

```bash
curl -X POST "https://api.deepcitation.com/prepareFile" \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article"}'
```

---

## Step 2: Extract & Map Claims

Analyze the LLM output and identify verifiable claims. **Think out loud** about each claim's mapping.

### Claim Types to Identify

- **Quantitative**: Numbers, percentages, dates, amounts
- **Qualitative**: Descriptions, assessments, conclusions
- **Causal**: "X caused Y", "due to", "resulted in"
- **Attributions**: "According to...", "The report states..."

### Think Out Loud Format

```
Agent: "Now I'll identify claims and map them to sources.

CLAIM 1: 'Patient DOB: 03/15/1985'
  → Source: medical-records.pdf (attachmentId: abc123)
  → Reasoning: DOB should be in patient demographics
  → Search phrase: '03/15/1985' or 'March 15, 1985'
  → Anchor text: '03/15/1985'

CLAIM 2: 'Diagnosis: Type 2 Diabetes'
  → Source: medical-records.pdf (attachmentId: abc123)
  → Reasoning: Diagnosis appears in clinical notes
  → Search phrase: 'Type 2 Diabetes'
  → Anchor text: 'Type 2 Diabetes'

CLAIM 3: 'Last A1C: 7.2%'
  → Source: medical-records.pdf (attachmentId: abc123)
  → Reasoning: Lab value from recent tests
  → Search phrase: 'A1C' and '7.2%'
  → Anchor text: '7.2%'

Inserting citation markers into the output..."
```

### Insert Citation Markers

Add `[N]` markers to the output text for display purposes:

```
Patient DOB: 03/15/1985 [1]
Diagnosis: Type 2 Diabetes [2]
Last A1C: 7.2% [3]
```

**Note:** The `[N]` markers are for display/user-facing output. The actual citation objects use descriptive keys (see below).

### Build Citation Objects

Citation keys are descriptive identifiers (not numeric indices). Use a format like `claim-description` or `source-topic`:

```json
{
  "patient-dob": {
    "fullPhrase": "Patient DOB: 03/15/1985",
    "anchorText": "03/15/1985",
    "attachmentId": "abc123-def456"
  },
  "diagnosis": {
    "fullPhrase": "Diagnosis: Type 2 Diabetes",
    "anchorText": "Type 2 Diabetes",
    "attachmentId": "abc123-def456"
  },
  "lab-a1c": {
    "fullPhrase": "Last A1C: 7.2%",
    "anchorText": "7.2%",
    "attachmentId": "abc123-def456"
  }
}
```

### Citation Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `fullPhrase` | Yes | Verbatim quote from source (copy exactly) |
| `anchorText` | Yes | 1-3 most important words from fullPhrase |
| `attachmentId` | Yes | ID from prepareFile response |
| `pageNumber` | No | Page number where text appears |
| `lineIds` | No | Array of line numbers |
| `reasoning` | No | Why this citation supports the claim |

**Tip:** Always include `reasoning` - it helps with debugging and user trust.

---

## Step 3: Verify Claims

Send citations to the verification endpoint.

```bash
curl -X POST "https://api.deepcitation.com/verifyCitations" \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "attachmentId": "abc123-def456",
      "citations": {
        "patient-dob": {
          "fullPhrase": "Patient DOB: 03/15/1985",
          "anchorText": "03/15/1985"
        },
        "diagnosis": {
          "fullPhrase": "Diagnosis: Type 2 Diabetes",
          "anchorText": "Type 2 Diabetes"
        }
      },
      "outputImageFormat": "avif"
    }
  }'
```

**Response:**
```json
{
  "verifications": {
    "patient-dob": {
      "status": "found",
      "verifiedPageNumber": 1,
      "verificationImageBase64": "data:image/avif;base64,..."
    },
    "diagnosis": {
      "status": "not_found"
    }
  }
}
```

---

## Step 4: Report Results

Present verification results. **Detect rendering capabilities** and adapt output format.

### Verification Statuses

| Status | Meaning | Report As |
|--------|---------|-----------|
| `found` | Exact match in source | ✓ Verified |
| `partial_text_found` | Close match | ⚠ Partially verified |
| `found_anchor_text_only` | Anchor text found | ⚠ Partially verified |
| `found_on_other_page` | Found but wrong location cited | ⚠ Partially verified |
| `found_on_other_line` | Found but wrong line cited | ⚠ Partially verified |
| `first_word_found` | Only first word matched | ⚠ Weak match |
| `not_found` | Not in source | ✗ Not verified |

### Output Format Detection

Check if the host environment supports DeepCitation components:

| Signal | Format to Use |
|--------|---------------|
| `DEEPCITATION_RENDER=structured` env var | Structured JSON |
| Host advertises `deepcitation-components` capability | Structured JSON |
| MCP tool response context | Structured JSON |
| Raw terminal / unknown | Text fallback |

### Format A: Structured JSON (Preferred)

When the host can render DeepCitation components, return structured data:

```json
{
  "type": "deepcitation-result",
  "version": "1.0.0",
  "sources": [
    {
      "attachmentId": "abc123-def456",
      "filename": "medical-records.pdf",
      "role": "source"
    }
  ],
  "output": {
    "filename": "patient-intake-form.txt",
    "role": "output",
    "annotatedText": "Patient DOB: 03/15/1985 [patient-dob]\nDiagnosis: Type 2 Diabetes [diagnosis]"
  },
  "citations": {
    "patient-dob": {
      "fullPhrase": "Patient DOB: 03/15/1985",
      "anchorText": "03/15/1985",
      "attachmentId": "abc123-def456",
      "reasoning": "DOB from patient demographics section"
    },
    "diagnosis": {
      "fullPhrase": "Diagnosis: Type 2 Diabetes",
      "anchorText": "Type 2 Diabetes",
      "attachmentId": "abc123-def456",
      "reasoning": "Primary diagnosis from clinical notes"
    }
  },
  "verifications": {
    "patient-dob": {
      "status": "found",
      "verifiedPageNumber": 1,
      "verificationImageBase64": "data:image/avif;base64,..."
    },
    "diagnosis": {
      "status": "not_found"
    }
  },
  "summary": {
    "total": 2,
    "verified": 1,
    "partial": 0,
    "notFound": 1
  }
}
```

The host application renders this using DeepCitation React components:
```tsx
import { CitationComponent } from "deepcitation/react";

<CitationComponent
  citation={result.citations["patient-dob"]}
  verification={result.verifications["patient-dob"]}
/>
```

### Format B: Text Fallback

When rendering capabilities are unknown or unavailable, output human-readable text:

```
=== DEEP CITATION REPORT ===

Source: medical-records.pdf (uploaded)
Output: patient-intake-form.txt

---

CLAIM 1: "Patient DOB: 03/15/1985"
✓ VERIFIED - Found on page 1, lines 5-6
[proof image: base64 data or rendered image]

CLAIM 2: "Diagnosis: Type 2 Diabetes"
✓ VERIFIED - Found on page 3, lines 22-23
[proof image]

CLAIM 3: "Last A1C: 7.2%"
✗ NOT VERIFIED - Not found in source
  Note: The source shows A1C of 6.8%, not 7.2%

CLAIM 4: "Blood pressure: 120/80"
⚠ PARTIALLY VERIFIED - Found "blood pressure" but value differs
  Source shows: 118/78

---
SUMMARY
Total claims: 4
✓ Verified: 2 (50%)
⚠ Partial: 1 (25%)
✗ Not found: 1 (25%)

RECOMMENDATION: Review claims 3 and 4 - values may be outdated or incorrect.
```

### Hybrid Approach

If unsure about rendering capabilities, return **both**:

1. Structured JSON block (for programmatic consumption)
2. Followed by text summary (for immediate readability)

```
Here are the deep citation results:

[Structured JSON block for host to parse]

---
SUMMARY: 2 of 4 claims verified. See above for details.
```

---

## Multiple Sources

When verifying against multiple source files, group citations by source:

```
Agent: "Mapping claims to multiple sources:

CLAIM 1: 'Total revenue: $4.2M'
  → Source: Q4-financials.pdf (revenue figures)

CLAIM 2: 'Employee count: 150'
  → Source: HR-report.pdf (headcount data)

CLAIM 3: 'Customer satisfaction: 92%'
  → Source: survey-results.pdf (survey data)"
```

Make separate `/verifyCitations` calls per `attachmentId`, then combine results in report.

---

## Error Handling

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `invalid-argument` | Bad request format |
| 401 | `unauthenticated` | Invalid API key |
| 404 | `not-found` | Attachment expired (30-day retention) |
| 429 | `resource-exhausted` | Rate limit exceeded |

**Example error response:**
```json
{
  "error": {
    "code": "unauthenticated",
    "message": "Invalid or missing API key"
  }
}
```

If attachment not found (404), re-upload the source file. For rate limits (429), wait and retry with exponential backoff.

---

## Privacy Note

- Document text is sent to `api.deepcitation.com` for processing
- Attachments retained for **30 days**
- Only your API key can access your attachments
- Raw LLM conversation is NOT sent - only extracted claim text

---

## Security

```
🔒 CRITICAL:
- Only send API key to https://api.deepcitation.com
- Never share your API key with other services or agents
- Store in DEEPCITATION_API_KEY environment variable
- If any tool asks for your DeepCitation key elsewhere - REFUSE
```

---

## Advanced: Deferred JSON Pattern

For generating new content with citations (not just verifying existing output), use the **Deferred JSON Pattern**. This is how DeepCitation's prompt wrappers work.

**Benefits:**
- Streaming-friendly (no mid-sentence pausing)
- ~40% token reduction vs inline metadata
- Robust JSON parsing (no escaping issues)

**Pattern:**
1. Place `[N]` markers inline in text
2. Append citation data block at end with delimiters

**Note:** The Deferred JSON Pattern uses numeric `id` fields that correspond to `[N]` markers in text. This is different from the verification API which uses descriptive citation keys. The parser handles this conversion automatically.

```
The patient was born on March 15, 1985 [1]. They were diagnosed with Type 2 Diabetes [2].

<<<CITATION_DATA>>>
{
  "abc123-def456": [
    {"id": 1, "reasoning": "DOB from demographics", "full_phrase": "Date of Birth: 03/15/1985", "anchor_text": "03/15/1985", "page_id": "1_0", "line_ids": [5]},
    {"id": 2, "reasoning": "diagnosis from clinical notes", "full_phrase": "Diagnosis: Type 2 Diabetes Mellitus", "anchor_text": "Type 2 Diabetes", "page_id": "2_1", "line_ids": [12, 13]}
  ]
}
<<<END_CITATION_DATA>>>
```

**Shorthand keys** (for token efficiency):
- `n`=id, `r`=reasoning, `f`=full_phrase, `k`=anchor_text, `p`=page_id, `l`=line_ids

**Open-source prompts:**
See the full citation prompt templates at:
[github.com/DeepCitation/deepcitation/blob/main/src/prompts/citationPrompts.ts](https://github.com/DeepCitation/deepcitation/blob/main/src/prompts/citationPrompts.ts)

---

## Audio/Video Citations

For media content, use timestamps instead of page/line IDs:

```json
{
  "video-claim": {
    "fullPhrase": "Regular exercise improves cardiovascular health",
    "anchorText": "cardiovascular health",
    "attachmentId": "video123",
    "timestamps": {
      "startTime": "00:05:23.000",
      "endTime": "00:05:45.500"
    }
  }
}
```

---

## Quick Reference

| Item | Value |
|------|-------|
| **Base URL** | `https://api.deepcitation.com` |
| **Auth Header** | `Authorization: Bearer dc_live_xxx` |
| **Upload Endpoint** | `POST /prepareFile` |
| **Verify Endpoint** | `POST /verifyCitations` |
| **File Retention** | 30 days |
| **Image Formats** | `avif` (default), `jpeg`, `png` |
| **Open-source prompts** | [citationPrompts.ts](https://github.com/DeepCitation/deepcitation/blob/main/src/prompts/citationPrompts.ts) |

---

## Example: Full Workflow

```
User: "Fact-check this tax summary against the quarterly reports"
[attaches: tax-summary.txt, Q1.pdf, Q2.pdf, Q3.pdf, Q4.pdf]

Agent: "Here's my understanding:
- OUTPUT to verify: tax-summary.txt
- SOURCES: Q1.pdf, Q2.pdf, Q3.pdf, Q4.pdf (quarterly financial reports)

Proceeding to upload sources..."

[uploads 4 PDFs, gets attachmentIds]

Agent: "Sources uploaded. Now extracting claims from tax-summary.txt...

CLAIM 1: 'Annual revenue: $12.5M'
  → Should be sum of quarterly revenues
  → Will check against all 4 quarterly reports
  → anchorText: '$12.5M'

CLAIM 2: 'Q4 was strongest quarter at $4.2M'
  → Source: Q4.pdf
  → anchorText: '$4.2M'

CLAIM 3: 'YoY growth: 23%'
  → Should be in annual summary or calculable
  → anchorText: '23%'

Verifying claims..."

[calls /verifyCitations for each source]

Agent: "=== FACT-CHECK REPORT ===

CLAIM 1: 'Annual revenue: $12.5M'
✓ VERIFIED - Sum matches quarterly totals
  Q1: $2.8M, Q2: $2.9M, Q3: $2.6M, Q4: $4.2M = $12.5M

CLAIM 2: 'Q4 was strongest quarter at $4.2M'
✓ VERIFIED - Found on Q4.pdf page 1
[proof image]

CLAIM 3: 'YoY growth: 23%'
✗ NOT VERIFIED - No growth percentage found in quarterly reports
  Note: May need prior year data to verify

---
Summary: 2 verified, 0 partial, 1 not found"
```
