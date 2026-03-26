---
name: verify
description: Verify AI claims against source documents and generate a branded DeepCitation HTML report
allowed-tools: Read, Write, Bash, Glob, Grep, Edit, Agent
---

# /verify — DeepCitation Report

Verify claims against source documents using the DeepCitation 2-step API, saving JSON artifacts at each step, and generate a branded interactive HTML report.

## Prerequisites

- `DEEPCITATION_API_KEY` environment variable must be set. If not set, try loading saved credentials:
  ```bash
  eval "$(npx -y deepcitation env 2>/dev/null)"
  ```
  If that also fails (no saved credentials), tell the user to run `npx -y deepcitation login` first, then retry.
- Source files (PDF, DOCX, images, etc.) must be accessible on disk or via URL

## Workflow

### Step 0: Analyze Input & Determine What to Verify

**Bias for action**: This skill should DO things, not ask questions. Scan everything available, make a plan, and execute. Only ask the user if you genuinely cannot determine what they want.

Before calling any API, scan all available context to find verifiable content:

1. **Parse `$ARGUMENTS`** — file paths, URLs, or empty?
2. **Scan conversation history** (ALWAYS, even when arguments are provided):
   - Look for ANY substantive AI-generated content: reports, summaries, analyses, dashboards, bullet-pointed findings, HTML output, etc.
   - Look for `[N]` citation markers and `<<<CITATION_DATA>>>` blocks (already-cited output)
   - Look for mentions of source files (PDFs, DOCX, URLs) that the AI referenced or was given
   - Look for links to generated artifacts (HTML reports, dashboards, etc.)
3. **Scan the working directory**: check for `.deepcitation/` artifacts from prior runs, and for source documents (PDF, DOCX, images) in the current directory
4. **Scan for generated HTML files**: `glob .deepcitation/report-*.html` and any other HTML files mentioned in conversation

**Then act based on what you found:**

**A) Source files provided as arguments** (`/verify report.pdf quarterly-results.docx`)
→ Prepare these files, generate a cited analysis, verify, and generate a report.

**B) Existing cited output found** (conversation contains `[N]` markers + `<<<CITATION_DATA>>>`)
→ Skip Step 2. Extract citations and source file references, prepare any source files not yet uploaded, then verify and generate a report.

**C) Uncited AI-generated content found** (conversation contains a report, summary, analysis, or substantive claims WITHOUT citation markers)
→ This is the most common case when a user runs `/verify` after getting a response. Identify the source documents the AI used (from conversation context, file references, or ask if truly unclear), prepare them, then re-generate the content WITH citations against those sources, verify, and generate a report.

**D) A text/HTML file provided** (`/verify analysis.txt` or `/verify report.html`)
→ Read the file. If it contains `<<<CITATION_DATA>>>`, treat as path B. Otherwise, treat the file's content as the claims to verify — identify what sources back it and proceed through the full pipeline.

**E) Multiple verifiable items found** (e.g., multiple reports, multiple AI responses)
→ **Verify ALL of them.** Run the pipeline for each one and generate a separate report for each. Do NOT ask which one to verify — verify them all.

**F) Nothing found and no arguments**
→ Only in this case, ask the user what they want to verify.

### Step 1: Prepare Sources → save JSON

Upload **every** source file to the DeepCitation API. If Step 0 / 2B-1 identified 15 source files, prepare all 15. Every prepared file enables verification of the claims it backs — skipping a file means those claims go unverified and the user has to check them manually. The API cost is negligible compared to the user's time.

Save the full response as JSON — it contains the `attachmentId` (needed for verify) and `deepTextPromptPortion` (the extracted text with page/line metadata for accurate lookups).

```bash
mkdir -p .deepcitation

# Upload each source file — save with descriptive name
curl -s -X POST https://api.deepcitation.com/prepareAttachments \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -F "file=@source.pdf" \
  -F "filename=source.pdf" \
  > .deepcitation/prepare-source.json
```

**Save** `.deepcitation/prepare-{source-name}.json` — you MUST retain the `attachmentId` AND the `deepTextPromptPortion` from this response. The `attachmentId` is the key used in Step 3. The `deepTextPromptPortion` is the **sole source of truth** for `lineIds` and `pageNumber` values in your citations — you MUST read it before building citations in Step 2.

**Important**: If multiple source files are uploaded, save each prepare response separately and track the `attachmentId` for each one. The `attachmentId` maps directly to the source file and is required by the verify endpoint.

**Important**: Always read the `deepTextPromptPortion` from the saved prepare JSON before building citations. The line IDs in the deepTextPromptPortion are **sparse** (not every line is tagged) — see Step 2B-3 for details.

### Step 2: Build Citations

This step depends on what Step 0 found:

#### Path A: Existing cited output with `<<<CITATION_DATA>>>`
Skip this step — go directly to Step 3.

#### Path B: Existing HTML with claims but no citation markers

This is the most interesting case — e.g., a medical dashboard, a report, or any HTML that makes factual claims and links to source files.

**2B-1. Identify and prepare ALL source files.** Read the HTML and extract **every** referenced source document (PDFs, JPGs, etc.) from `href` attributes, inline references, data attributes, and link text. Resolve relative paths against the HTML file's location.

**Prepare ALL of them in Step 1** — not just one. A dashboard might reference a blood work PDF, an MRI report, an InBody scan, a medication list, a psychological assessment, endoscopy images, etc. Each one is a separate prepare call and produces a separate `attachmentId` + `deepTextPromptPortion`. Every API call saves the user minutes of manual checking.

If the HTML has 15 source file links, prepare 15 files. If some are duplicates (same file linked from multiple places), deduplicate, but never skip a unique source. The cost of preparing is low; the cost of missing a source means every claim backed by that source goes unverified.

**2B-2. Identify verifiable claims — EXHAUSTIVE coverage.** Scan the **entire** HTML for factual assertions. The goal is to verify **every claim the user would otherwise have to check manually**. Missing a claim means the user still has to verify it themselves — that defeats the purpose.

**What to cite:**

- **Quantitative values**: lab results, measurements, scores, percentages, dosages, counts
- **Dates and timelines**: diagnosis dates, medication start dates, appointment dates, "since" dates
- **Diagnoses and conditions**: named conditions, severity, type (e.g. "inattentive type")
- **Medications**: drug names, dosages, frequencies
- **Imaging/procedure findings**: specific findings from MRIs, endoscopies, etc.
- **Body composition**: weight, BMI, muscle mass, body fat percentages
- **Historical facts**: "diagnosed ~1997", "confirmed 2001", prior values ("was 5.7%")
- **Reference ranges**: "ref 4.0–6.0%", "ref <5.2" — these come from the source document
- **Trend comparisons**: "was 5.7%", "improved from", "up from ~12%" — the prior value is a claim

**Where to look — common blind spots:**

1. **Collapsed/hidden content.** Cards, accordions, detail panels that are `display:none` or behind a toggle. These contain values just as important as visible ones. Expand mentally and cite every value inside.
2. **Summary/alert banners.** Introductory text, status banners, and narrative summaries often restate values ("HbA1c 5.5%, improved from 5.7%"). Each restated value is a separate verifiable claim.
3. **Footer and metadata.** Dates, patient identifiers, report dates, "Latest: Mar 2026" — if it came from a source document, cite it.
4. **Tabs and alternate views.** Timeline tabs, file lists, history views. Walk through every tab's content.
5. **Inline narrative.** Text like "Large left paracentral disc protrusion at L4-5" in a timeline description is a verifiable finding from an MRI report.
6. **"All normal" summaries.** If the HTML says "Urinalysis: all normal" that's a claim about every individual urinalysis value — cite the specific values behind it.
7. **Citation/source areas.** If the HTML has a references section, bibliography, or source links area at the bottom or on a separate page/tab, add a citation drawer trigger there (see 2B-7).

**Signals that something needs a citation:**
- It's a **value** (number, measurement, percentage, date, score)
- There are **citation links nearby** (e.g. `<a href="report.pdf">View report</a>` — the values near that link came from that report)
- It **restates or summarizes** content from a source document
- A human would need to **open a PDF to verify it**

**Be exhaustive.** The whole point is that the user doesn't have to manually check anything. Every uncited claim is something the user still has to verify themselves. When in doubt, cite it. The API handles the verification — overciting costs nothing, underciting defeats the purpose.

Think like a lawyer: every claim, every entity, every date, every location, every value, every name. If it asserts a fact about the world, it needs a source.

**Multi-source awareness.** A single HTML page often draws from many sources. A medical dashboard might have blood work values from a lab PDF, body composition from an InBody scan, medication names from a prescription, diagnoses from specialist reports, imaging findings from an MRI report. Each claim must be traced back to its specific source document — don't assume everything comes from one file. If a claim references "Concerta 36mg" and there's a medication list PDF linked nearby, that's the source. If it says "L4-5 disc protrusion" and there's an MRI report linked, that's the source. Follow the proximity of `href` links as a signal for which source backs which claims.

**2B-3. Build citation data.** Create a citation record with human-readable keys mapping each claim to its source. **Each citation must use the `attachmentId` of the specific source document that backs it** — if you prepared 8 files, different citations will point to different attachmentIds. Read each `deepTextPromptPortion` to find the text and correct lineIds.

**CRITICAL — lineIds and pageNumber come from `deepTextPromptPortion`, NOT from sequential counting.**

The `deepTextPromptPortion` returned by the prepare endpoint uses **sparse, non-sequential** `<line id="N">` tags. Only some lines are tagged — untagged lines have no id attribute. You MUST read the `deepTextPromptPortion` and find the actual `<line id>` value for the line containing your citation text. Do NOT count lines sequentially.

Example — the deepTextPromptPortion might look like:
```
<page_number_1_index_0>
<line id="1">Mã BN/ID:  260006301</line>
Đối tượng/Group: Không bảo hiểm           ← NO line id (untagged)
Lis Barcode: 2603160079                    ← NO line id (untagged)
Họ và tên/Name:BENSON WONG Nam/ Male ...   ← NO line id (untagged)
<line id="5">Địa chỉ/Address:...</line>
...
WBC (BẠCH CẦU) 5.71 G/L 3.9 - 10         ← NO line id (untagged)
<line id="15">- NEU % 59.6 % 45 - 75</line>
```

For "BENSON WONG" on page 1: the text is on an **untagged** line between `<line id="1">` and `<line id="5">`. Use the nearest line id — `lineIds: [1]` (before) or `[5]` (after). Do NOT use `[4]` — there is no line 4.

For "WBC 5.71": the text is untagged, between `<line id="10">` and `<line id="15">`. Use `lineIds: [10]` or `[15]`.

**How to find the right lineId:**
1. Read the `deepTextPromptPortion` from `.deepcitation/prepare-*.json`
2. Search for your citation text in the deepTextPromptPortion
3. Find the nearest `<line id="N">` tag on or before that text
4. Use that N as the lineId. If the text spans multiple tagged lines, include all of them.
5. For `pageNumber`, use the number from the enclosing `<page_number_N_index_I>` tag (use N, not I)

**Why this matters:** The verify API searches by line id. If you provide a lineId that doesn't exist in the deepTextPromptPortion, the exact line match fails and the API falls back to broader page-level search — resulting in `partial_text_found` instead of `found`.

```json
{
  "cite-hba1c": {
    "fullPhrase": "Định lượng HbA1c 5.5 % 4.0 - 6.0",
    "anchorText": "5.5",
    "pageNumber": 2,
    "lineIds": [13],
    "attachmentId": "ATTACHMENT_ID_FROM_STEP_1"
  }
}
```

Save as `.deepcitation/citations.json`.

**2B-4. Generate deterministic keys.** The DeepCitation API uses content-hashed keys (SHA-1 based). Use the CLI to compute them:

```bash
npx -y deepcitation keygen \
  --citations .deepcitation/citations.json \
  --out .deepcitation/citations-keyed.json
```

This prints the mapping (e.g. `cite-hba1c → bfd6ec10bd261161`) to stderr and writes the re-keyed citations to `citations-keyed.json`. Use `citations-keyed.json` for the verify request in Step 3.

**2B-5. Annotate the HTML with hashed keys.** For each claim, add `data-citation-key` with the **hashed key** (not the human-readable label). The hashed key must match what the verify API returns.

```html
<!-- Before -->
<div class="stat-value">5.5%</div>

<!-- After -->
<div class="stat-value" data-citation-key="bfd6ec10bd261161">5.5%</div>
```

Write the annotated HTML to `.deepcitation/annotated.html`.

**CRITICAL — anchorText comes from the source document. The component handles display mismatches.**

`anchorText` and `fullPhrase` are always **verbatim from the source document** (the `deepTextPromptPortion`). The verification API searches the source for these exact strings. The indicator (✓/⚠/✗) reflects whether **that exact source text** was found.

If the HTML displays a different value than what's in the source, there are exactly two correct outcomes:

1. **The citation uses source text as anchorText.** The popover component detects the mismatch between the source's anchorText and the HTML's displayed text, and shows a `displayLabel` annotation ("displayed as X") so the user understands the discrepancy. The indicator is trustworthy — it reflects what the source actually says.

2. **Don't cite it.** If the displayed value can't be traced to any source document, it shouldn't get an indicator at all. An unverified claim is honest. A ✓ next to a value verified against a *different* value is a lie.

**The skill must NEVER:**
- Set `anchorText` to the HTML's displayed text to force a match — that's fabricating evidence
- Add interpretive text, labels, or inline annotations near `data-cite` elements — the indicator is the SOLE visual signal and must not compete with skill-generated annotations
- Assume a value in the HTML matches the source without checking the `deepTextPromptPortion`

**Example:** The HTML displays "PHN 305005112". The source document contains "Mã BN/ID: 260006301". These are different identifiers — 305005112 is a provincial health number, 260006301 is a hospital patient ID. The skill must NOT cite "305005112" using the source text for "260006301". Either find "305005112" in a source document, or leave it uncited.

**2B-6. Choose where to place `data-citation-key`.** The attribute should go on the most specific element containing the claim. Placement rules:

- **Single value** (e.g. `<span class="stat-value">5.5%</span>`) → put it directly on the value element
- **Value + label pair** (e.g. `HbA1c: 5.5%`) → put it on the value element, not the label
- **Compound claim** (e.g. `ADHD (inattentive type), diagnosed ~1997`) → put it on the container that holds the full claim
- **Table cells** → put it on the `<td>` containing the verifiable value
- **List items** → put it on the `<li>` or the inline element wrapping the specific claim
- **Never** put it on wrapper/layout elements (`<div class="card">`, `<section>`) — be specific

The CDN runtime automatically appends a small status indicator icon (✓/⚠/✗) next to each annotated element. The icon inherits the element's font size and is styled inline, so it works regardless of the host page's CSS framework.

**Do NOT add your own text, labels, or visual annotations near cited elements.** The verification indicators are the SOLE visual signal of verification status. Adding interpretive text like "(verified)", "(source: report.pdf)", or inline notes next to cited values undermines the indicator system — users must be able to trust that ✓ means "this exact value was found in the source" without competing annotations muddying the signal.

**2B-7. Citation drawer for source/reference areas.** If the HTML has **any** area that collects sources, references, files, or citations — a "Files" tab, a references section, a sidebar with document links, a footer with source attributions — you MUST inject a citation drawer trigger there. This gives users a single place to browse all verification results. Do not skip this step.

Look for: file listing tabs, "Sources" or "References" sections, document link collections, bibliography areas, "View report" link groups. If there are multiple such areas (e.g. a "Files" tab AND a footer), add a trigger to each.

Use your judgement on placement:
- **Bottom of page / footer area**: Place a horizontal drawer trigger that opens a bottom drawer
- **Sidebar / navigation area**: Place a side drawer trigger
- **Tab content area** (e.g. "All Files" tab): Place the trigger at the top or bottom of the tab content

To add a drawer trigger, insert this HTML at the appropriate location:

```html
<!-- Citation drawer trigger — place in the source/reference area -->
<div data-dc-drawer-trigger style="margin-top: 1rem;">
  <button type="button" onclick="window.DeepCitationPopover?.showDrawer?.()"
    style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 1rem;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#1a2332;font-size:0.85rem;cursor:pointer;">
    <span style="color:#10b981;">✓</span> View all verification results
  </button>
</div>
```

The drawer shows a scrollable list of all citations with their verification status, making it easy to audit the entire document's factual claims in one place.

#### Path C: Generate new cited response from scratch

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

The citation data block format (group by `attachmentId` from Step 1).

**CRITICAL**: `page_id` and `line_ids` MUST come from the `deepTextPromptPortion` — use the `<page_number_N_index_I>` tags for page_id, and the `<line id="N">` tags for line_ids. These are **sparse** (not every line is tagged). See Step 2B-3 for details.

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

Use the saved JSON artifacts to generate the report. Choose the right approach based on whether the content is already HTML or plain text.

All CLI commands use `npx -y deepcitation` — no pre-install needed.

**Option A: Generate a new branded report** (from LLM text output)

```bash
npx -y deepcitation report \
  --llm-output .deepcitation/llm-output.txt \
  --verify-response .deepcitation/verify-response.json \
  --title "Your Report Title" \
  --source-labels '{"ATTACHMENT_ID": "Source Name"}' \
  --theme auto \
  --out .deepcitation/
```

**Option B: Inject into an existing HTML file** (dashboard, report, etc.)

Use this when you followed Path B in Step 2 — you already annotated the HTML with `data-citation-key` attributes. The `inject` command adds the verification data and interactive runtime on top.

```bash
npx -y deepcitation inject \
  --html .deepcitation/annotated.html \
  --verify-response .deepcitation/verify-response.json \
  --out .deepcitation/dashboard-verified.html
```

This injects before `</body>`:
- Verification JSON (`<script id="dc-data">`)
- The CDN runtime bundle (Preact + real React popover components + Tailwind CSS)
- Auto-init script that wires up `[data-citation-key]` click handlers

The original design is fully preserved. The injected popover uses the same React component tree as the DeepCitation web app — including animations, highlighted phrases with anchor text, evidence images with click-to-expand, and status icons.

**Then open the result:**
```bash
# Open the most recent report/injected file
ls -t .deepcitation/*.html | head -1 | xargs open   # macOS
ls -t .deepcitation/*.html | head -1 | xargs xdg-open  # Linux
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
