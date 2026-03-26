---
name: verify
description: Verify AI claims against source documents and generate a branded DeepCitation HTML report
allowed-tools: Read, Write, Bash, Glob, Grep, Edit, Agent
---

# /verify — DeepCitation Report

Verify claims against source documents using the DeepCitation 2-step API, saving JSON artifacts at each step, and generate a branded interactive HTML report.

## Setup

### 1. Get an API key

Sign up at [deepcitation.com/keys](https://deepcitation.com/keys) and create a new API key.

### 2. Set the environment variable

Add your key to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export DEEPCITATION_API_KEY="dc_your_key_here"
```

Or add it to your project's `.env` file (make sure `.env` is in `.gitignore`).

### 3. Install the skill in Claude Code

1. Open **Claude Code** → go to [claude.ai/customize/skills](https://claude.ai/customize/skills)
2. Click **"Add Skill"**
3. Paste the raw URL of this file:
   ```
   https://raw.githubusercontent.com/DeepCitation/deepcitation/main/docs/skills/verify/SKILL.md
   ```
   Or copy this file into your project at `.claude/skills/verify/SKILL.md`.

### 4. Install the SDK (for report generation)

```bash
npm install deepcitation
```

### 5. Use it

In any Claude Code conversation with source documents available:

```
/verify my-report.pdf
```

Claude will upload the source, generate cited analysis, verify each citation against the document, and produce a branded HTML report you can open in your browser.

## Prerequisites

- `DEEPCITATION_API_KEY` environment variable must be set
- `deepcitation` npm package installed (for HTML report generation)
- Source files (PDF, DOCX, images, etc.) must be accessible on disk or via URL

## Workflow

### Step 1: Prepare Sources → save JSON

Upload each source file to the DeepCitation API. Save the full response as JSON — it contains the `attachmentId` (needed for verify) and `deepTextPromptPortion` (the extracted text with page/line metadata for accurate lookups).

```bash
mkdir -p .deepcitation

# Upload each source file — save with descriptive name
curl -s -X POST https://api.deepcitation.com/prepareAttachments \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -F "file=@source.pdf" \
  -F "filename=source.pdf" \
  > .deepcitation/prepare-source.json
```

**Save** `.deepcitation/prepare-{source-name}.json` — you MUST retain the `attachmentId` from this response. It is the key used in Step 3 to efficiently look up citations against this specific source.

**Important**: If multiple source files are uploaded, save each prepare response separately and track the `attachmentId` for each one. The `attachmentId` maps directly to the source file and is required by the verify endpoint.

### Step 2: Generate Response with Citations

You ARE the LLM. Use the `deepTextPromptPortion` from Step 1 as context and follow the citation prompt pattern from the open-source prompts:
https://github.com/DeepCitation/deepcitation/blob/main/src/prompts/citationPrompts.ts

1. Read the `deepTextPromptPortion` from the saved prepare JSON
2. Wrap your system and user prompts with DeepCitation's citation instructions:
   - Add the citation format instructions to your system prompt
   - Include the `deepTextPromptPortion` in the user prompt as source context
3. Generate your response with:
   - `[N]` markers after each claim sourced from the documents
   - A `<<<CITATION_DATA>>>` block at the end with structured citation metadata

**Think out loud** for each citation — reason about which document, page, and line supports the claim before placing the marker.

The citation data block format (group by `attachmentId` from Step 1):
```
<<<CITATION_DATA>>>
{
  "ATTACHMENT_ID_FROM_STEP_1": [
    {
      "id": 1,
      "reasoning": "why this citation is correct",
      "fullPhrase": "exact verbatim quote from source",
      "anchorText": "1-3 key words from the phrase",
      "page_id": "page_number_N_index_I",
      "line_ids": [LINE_NUMBER]
    }
  ]
}
<<<END_CITATION_DATA>>>
```

Save the full output (including the citation data block):
```bash
# Save the raw LLM output
cat > .deepcitation/llm-output.txt << 'ENDOFOUTPUT'
... your generated response here ...
ENDOFOUTPUT
```

### Step 3: Verify Claims → save JSON

Extract citations from your response and call the verify endpoint using the `attachmentId` from Step 1. Save the full verification response as JSON.

Build the verify request, keyed by the `attachmentId`:

```bash
# Build verify-request.json using the attachmentId from Step 1
cat > .deepcitation/verify-request.json << 'ENDOFJSON'
{
  "attachmentId": "ATTACHMENT_ID_FROM_STEP_1",
  "citations": {
    "citation-key-1": {
      "fullPhrase": "exact verbatim quote",
      "anchorText": "key words",
      "pageNumber": 1,
      "lineIds": [1],
      "attachmentId": "ATTACHMENT_ID_FROM_STEP_1"
    }
  },
  "outputImageFormat": "avif"
}
ENDOFJSON

# Call verify
curl -s -X POST https://api.deepcitation.com/verifyCitations \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d @.deepcitation/verify-request.json \
  > .deepcitation/verify-response.json
```

**Save** `.deepcitation/verify-response.json` — contains verification statuses and evidence images.

Also save the extracted citations as a separate file:
**Save** `.deepcitation/citations.json` — the `CitationRecord` (object keyed by citation key, NOT an array).

### Step 4: Generate Branded HTML Report

Use the saved JSON artifacts to generate the report. The report filename should include the topic and timestamp to avoid clobbering previous runs.

```javascript
import { renderBrandedReport } from 'deepcitation/vanilla';
import { writeFileSync, readFileSync } from 'fs';

const llmOutput = readFileSync('.deepcitation/llm-output.txt', 'utf-8');
const verifyResponse = JSON.parse(readFileSync('.deepcitation/verify-response.json', 'utf-8'));

const html = renderBrandedReport(llmOutput, {
  verifications: verifyResponse.verifications,
  title: 'Your Report Title',
  sourceLabels: { 'ATTACHMENT_ID': 'Source Name' },
  theme: 'auto',
});

// Timestamp prevents clobbering previous reports
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const slug = 'your-topic'.replace(/\s+/g, '-').toLowerCase();
const filename = `.deepcitation/report-${slug}-${timestamp}.html`;
writeFileSync(filename, html);
```

Then open the report:
```bash
# Open the most recent report
ls -t .deepcitation/report-*.html | head -1 | xargs open   # macOS
ls -t .deepcitation/report-*.html | head -1 | xargs xdg-open  # Linux
```

## Output Artifacts

All artifacts are saved in `.deepcitation/` for auditability and re-runs:

| File | Contents |
|------|----------|
| `prepare-{source}.json` | Upload response with `attachmentId` and `deepTextPromptPortion` |
| `llm-output.txt` | Full LLM response including `<<<CITATION_DATA>>>` block |
| `citations.json` | Extracted `CitationRecord` (parsed from LLM output) |
| `verify-request.json` | Request body sent to `/verifyCitations` |
| `verify-response.json` | Verification results with statuses and evidence |
| `report-{topic}-{timestamp}.html` | Branded interactive HTML report |

Reports use `{topic}-{timestamp}` naming so re-runs don't clobber previous results.

## Important Rules

- **Product name**: Always "DeepCitation" (never "DeepCite")
- **Track attachmentId**: Always retain the `attachmentId` from Step 1 — it's the key for efficient verification lookups
- **Strip before display**: Use `extractVisibleText()` to remove `<<<CITATION_DATA>>>` before showing text to user
- **CitationRecord is an object**: Check emptiness with `Object.keys(citations).length === 0`
- **API key security**: Never log or display `DEEPCITATION_API_KEY`
- **Verbatim quotes**: `fullPhrase` must be copied exactly from the source — do not paraphrase

## Verification Status Reference

| Status | Display | Meaning |
|--------|---------|---------|
| `found` | ✓ Verified | Exact match in source |
| `partial_text_found` | ⚠ Partial | Full phrase found, anchor text missed |
| `found_anchor_text_only` | ⚠ Partial | Only anchor text matched |
| `found_on_other_page` | ⚠ Partial | Found on different page |
| `not_found` | ✗ Not Found | Could not verify |

## References

- Open-source prompts: https://github.com/DeepCitation/deepcitation/blob/main/src/prompts/citationPrompts.ts
- Citation parser: https://github.com/DeepCitation/deepcitation/blob/main/src/parsing/parseCitation.ts
- Branded report: https://github.com/DeepCitation/deepcitation/blob/main/src/vanilla/renderBrandedReport.ts
- API docs: https://deepcitation.com/docs

ARGUMENTS: $ARGUMENTS
