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
  If that also fails, tell the user to run `npx -y deepcitation login` first, then retry.
- Source files (PDF, DOCX, images, etc.) must be accessible on disk or via URL
- Accepted file types: PDF, images (JPG, PNG), Office files (DOCX, XLSX, PPTX), CSV, TSV, ODF

## Key Rules

- **`page_id` and `line_ids` MUST come from the `deepTextPromptPortion`** — use `<page_number_N_index_I>` tags for page_id and `<line id="N">` tags for line_ids. These are **sparse** (not every line is tagged). Always read the `deepTextPromptPortion` from Step 1 as context. See Step 2B-3 for details.
- **Coverage audit**: After generating citations, spawn a subagent to audit the report/chat and confirm all facts, sources, names, dates, and values have deepcitations. The subagent should flag any uncited claims. Do not rely on absolute count thresholds — coverage depends on the document's content density.

## Workflow

### Step 0: Analyze Input & Determine What to Verify

**Bias for action**: DO things, don't ask questions. Scan everything available, make a plan, and execute. Only ask the user if you genuinely cannot determine what they want.

Before calling any API, scan all available context:

1. **Parse `$ARGUMENTS`** — file paths, URLs, or empty?
2. **Scan conversation history** (always, even when arguments are provided):
   - AI-generated content: reports, summaries, analyses, dashboards, HTML output
   - `[N]` citation markers and `<<<CITATION_DATA>>>` blocks
   - Source file mentions (PDFs, DOCX, URLs)
   - Links to generated artifacts (HTML reports, dashboards)
3. **Scan the working directory**: `.deepcitation/` artifacts from prior runs, source documents
4. **Scan for generated HTML files**: `glob .deepcitation/report-*.html` and any other HTML files mentioned in conversation

**Then act based on what you found:**

**A) Source files provided as arguments** (`/verify report.pdf quarterly-results.docx`)
→ Prepare these files, generate a cited analysis, verify, and generate a report.

**B) Existing cited output found** (conversation contains `[N]` markers + `<<<CITATION_DATA>>>`)
→ Skip Step 2. Extract citations and source file references, prepare any source files not yet uploaded, then verify and generate a report.

**C) Uncited AI-generated content found** (substantive claims WITHOUT citation markers)
→ Most common case when a user runs `/verify` after getting a response. Identify the source documents (from conversation context or file references), prepare them, re-generate the content WITH citations, verify, and generate a report.

**D) A text/HTML file provided** (`/verify analysis.txt` or `/verify report.html`)
→ Read the file. If it contains `<<<CITATION_DATA>>>`, treat as path B. Otherwise, treat the file's content as the claims to verify and proceed through the full pipeline.

**E) Multiple verifiable items found** (e.g., multiple reports, multiple AI responses)
→ Verify ALL of them. Run the pipeline for each one and generate a separate report for each.

**F) Nothing found and no arguments**
→ Only in this case, ask the user what they want to verify.

### Step 1: Prepare Sources → save JSON

Upload **every** source file to the DeepCitation API. Every prepared file enables verification of the claims it backs — skipping a file means those claims go unverified.

Save the full response as JSON — it contains the `attachmentId` (needed for verify) and `deepTextPromptPortion` (extracted text with page/line metadata).

```bash
mkdir -p .deepcitation

# Upload each source file — save with descriptive name
curl -s -X POST https://api.deepcitation.com/prepareAttachments \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -F "file=@source.pdf" \
  -F "filename=source.pdf" \
  > .deepcitation/prepare-source.json
```

**Save** `.deepcitation/prepare-{source-name}.json` — retain both the `attachmentId` and `deepTextPromptPortion`. The `deepTextPromptPortion` is the **sole source of truth** for `lineIds` and `pageNumber` values — read it before building citations in Step 2.

If multiple source files are uploaded, save each prepare response separately and track each `attachmentId`.

Always read the `deepTextPromptPortion` before building citations. Line IDs are **sparse** (not every line is tagged) — see Step 2B-3.

**URL sources**: If a source is a URL, download it first and upload the file:
```bash
curl -sL "https://example.com/report.pdf" -o .deepcitation/downloaded-report.pdf
# Check it's actually a PDF/document (not an HTML redirect page)
file .deepcitation/downloaded-report.pdf
```
If the download returns HTML instead of the expected document (common with auth walls), warn the user. Do not upload HTML disguised as PDF — the API will reject it with "File content does not match its declared type."

If a URL is inaccessible (DNS failure, 403, auth required), report it clearly and continue with available sources. Do not fabricate citations for sources you couldn't prepare.

### Step 2: Build Citations

This step depends on what Step 0 found:

#### Path A: Existing cited output with `<<<CITATION_DATA>>>`
Skip this step — go directly to Step 3.

#### Path B: Existing HTML with claims but no citation markers

**2B-1. Identify and prepare ALL source files.** Read the HTML and extract every referenced source document from `href` attributes, inline references, data attributes, and link text. Resolve relative paths against the HTML file's location.

Prepare ALL of them in Step 1 — not just one. Each produces a separate `attachmentId` + `deepTextPromptPortion`. Deduplicate identical files, but never skip a unique source.

**2B-2. Identify verifiable claims — exhaustive coverage.** Scan the **entire** HTML for factual assertions. Every uncited claim is something the user still has to verify manually.

**What to cite:**

- **Quantitative values**: lab results, measurements, scores, percentages, dosages, counts
- **Dates and timelines**: diagnosis dates, medication start dates, "since" dates
- **Diagnoses and conditions**: named conditions, severity, type (e.g. "inattentive type")
- **Medications**: drug names, dosages, frequencies
- **Imaging/procedure findings**: specific findings from MRIs, endoscopies, etc.
- **Body composition**: weight, BMI, muscle mass, body fat percentages
- **Historical facts**: "diagnosed ~1997", "confirmed 2001", prior values ("was 5.7%")
- **Reference ranges**: "ref 4.0–6.0%", "ref <5.2" — these come from the source document
- **Trend comparisons**: "was 5.7%", "improved from", "up from ~12%" — the prior value is a claim

**Common blind spots:**

1. **Collapsed/hidden content.** Cards, accordions, `display:none` panels — cite every value inside.
2. **Summary/alert banners.** Restated values ("HbA1c 5.5%, improved from 5.7%") — each restated value is a separate claim.
3. **Footer and metadata.** Dates, patient identifiers, report dates.
4. **Tabs and alternate views.** Walk through every tab's content.
5. **Inline narrative.** Text like "Large left paracentral disc protrusion at L4-5" is a verifiable finding.
6. **"All normal" summaries.** "Urinalysis: all normal" is a claim about every individual value — cite the specifics.
7. **Citation/source areas.** If the HTML has a references section or source links, add a citation drawer trigger there (see 2B-7).

**Signals that something needs a citation:**
- It's a value (number, measurement, percentage, date, score)
- There are citation links nearby (e.g. `<a href="report.pdf">`)
- It restates or summarizes source document content
- A human would need to open a PDF to verify it

Think like a lawyer: every claim, every entity, every date, every value. If it asserts a fact, it needs a source. When in doubt, cite it — overciting costs nothing, underciting defeats the purpose. After citation generation, spawn a subagent to audit coverage: walk every section and confirm all facts, sources, names, dates, and values have deepcitations.

**Coverage target: 50-150 citations for a typical multi-section report.** Hard floor: 30 (below this the validation script warns). Target: 50+. Common failure: only citing the first section and skipping the rest.

**Walk every section explicitly.** After building your initial list, enumerate every `<h2>` section and count citations per section. Any section with zero citations means the user has to check it manually.

**Multi-source awareness.** A single HTML page often draws from many sources. Each claim must be traced to its specific source document. Follow the proximity of `href` links as a signal for which source backs which claims.

**2B-3. Build citation data.** Create a citation record mapping each claim to its source. Each citation must use the `attachmentId` of the specific source document that backs it.

**lineIds and pageNumber come from `deepTextPromptPortion`, not from sequential counting.**

The `deepTextPromptPortion` uses **sparse, non-sequential** `<line id="N">` tags. Only some lines are tagged. You must find the actual `<line id>` value for the line containing your citation text.

Example:
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

**Why this matters:** If you provide a nonexistent lineId, the API falls back to page-level search, resulting in `partial_text_found` instead of `found`.

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

**Anchor text guidelines.** Short anchor text (1-2 words) works for structured/tabular data. For narrative prose, use **5+ word** distinctive anchor text. Keep `fullPhrase` to a single line from the deepTextPromptPortion — multi-line values often degrade to `partial_text_found`.

Examples:
- **Good** (structured): `fullPhrase: "WBC 5.71 G/L 3.9 - 10"`, `anchorText: "5.71"`
- **Good** (narrative): `fullPhrase: "Large left paracentral disc protrusion at L4-5"`, `anchorText: "Large left paracentral disc protrusion"`
- **Bad** (narrative): `anchorText: "disc protrusion"` — too short, often results in `partial_text_found`

**2B-4. Generate deterministic keys.** The DeepCitation API uses content-hashed keys (SHA-1 based). Use the CLI to compute them:

```bash
npx -y deepcitation keygen \
  --citations .deepcitation/citations.json \
  --out .deepcitation/citations-keyed.json
```

This prints the mapping (e.g. `cite-hba1c → bfd6ec10bd261161`) to stderr and writes the re-keyed citations to `citations-keyed.json`. Use `citations-keyed.json` for the verify request in Step 3.

**2B-5. Annotate the HTML with `data-cite` attributes.** Use human-readable keys from `citations.json` (e.g., `cite-hba1c`), NOT hashed keys. The CDN runtime resolves these via the key map (see Step 4).

```html
<!-- Before -->
<div class="stat-value">5.5%</div>

<!-- After -->
<div class="stat-value" data-cite="cite-hba1c">5.5%</div>
```

Write the annotated HTML to `.deepcitation/annotated.html`.

**2B-5a. Build the key map.** After running `keygen`, build a key-map JSON mapping human-readable keys to hashed keys:

```json
{
  "cite-hba1c": "bfd6ec10bd261161",
  "cite-glucose": "a3f7b2c1d8e9f012"
}
```

Build this by comparing `citations.json` keys with `citations-keyed.json` keys. Save as `.deepcitation/key-map.json`.

**anchorText and fullPhrase must be verbatim from the source document (`deepTextPromptPortion`).**

The verification API searches the source for these exact strings. If the HTML displays a different value than the source, there are two correct approaches:

1. **Cite using source text.** The popover component detects the mismatch and shows a `displayLabel` annotation ("displayed as X") so the user understands the discrepancy. The indicator remains trustworthy.

2. **Don't cite it.** If the displayed value can't be traced to any source document, leave it uncited. An unverified claim is honest; a checkmark verified against a *different* value is a lie.

Never:
- Set `anchorText` to the HTML's displayed text to force a match — that's fabricating evidence
- Add interpretive text or annotations near `data-cite` elements — the indicator is the sole visual signal
- Assume a value in the HTML matches the source without checking the `deepTextPromptPortion`

**Example:** The HTML displays "PHN 305005112". The source contains "Mã BN/ID: 260006301". These are different identifiers. Do NOT cite "305005112" using the source text for "260006301". Either find "305005112" in a source document, or leave it uncited.

**2B-6. Choose where to place `data-cite`.** Place it on the most specific element containing the claim:

- **Single value** (e.g. `<span class="stat-value">5.5%</span>`) → directly on the value element
- **Value + label pair** (e.g. `HbA1c: 5.5%`) → on the value element, not the label
- **Compound claim** (e.g. `ADHD (inattentive type), diagnosed ~1997`) → on the container holding the full claim
- **Table cells** → on the `<td>` containing the verifiable value
- **List items** → on the `<li>` or the inline element wrapping the specific claim
- **Never** on wrapper/layout elements (`<div class="card">`, `<section>`)

The CDN runtime appends a small status indicator icon next to each annotated element, inheriting the element's font size.

**2B-7. Citation drawer for source/reference areas.** If the HTML has any area that collects sources or references (file listing tabs, "Sources" sections, bibliography areas, document link collections), inject a citation drawer trigger there. If there are multiple such areas, add a trigger to each.

Use your judgement on placement:
- **Bottom of page / footer area**: horizontal drawer trigger opening a bottom drawer
- **Sidebar / navigation area**: side drawer trigger
- **Tab content area** (e.g. "All Files" tab): trigger at top or bottom of the tab content

```html
<!-- Citation drawer trigger — place in the source/reference area -->
<div data-dc-drawer-trigger style="margin-top: 1rem;">
  <button type="button" onclick="window.DeepCitationPopover?.showDrawer?.()"
    style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 1rem;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#1a2332;font-size:0.85rem;cursor:pointer;">
    <span style="color:#10b981;">✓</span> View all verification results
  </button>
</div>
```

#### Path C: Generate new cited response from scratch

You ARE the LLM. Read the canonical citation format spec:

```bash
cat docs/prompts/citation-format.md
```

This is the single source of truth for field rules, format, and examples.

1. Read the `deepTextPromptPortion` from the saved prepare JSON
2. Read `docs/prompts/citation-format.md` for the citation format specification
3. Generate your response with:
   - `[N]` markers after each claim sourced from the documents — **every claim, value, or fact from attachments gets a sequential integer marker like [1], [2], [3] at the end of the claim. Each distinct piece of information needs its own unique marker number.**
   - A `<<<CITATION_DATA>>>` block at the end with structured citation metadata grouped by `attachmentId`

**Think out loud** for each citation — reason about which document, page, and line supports the claim before placing the marker.

The citation data block format (group by `attachmentId` from Step 1):

`page_id` and `line_ids` MUST come from the `deepTextPromptPortion` — use `<page_number_N_index_I>` tags for page_id and `<line id="N">` tags for line_ids. These are **sparse** (see Step 2B-3).

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

Extract citations and call the verify endpoint using the `attachmentId` from Step 1.

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

**Multi-attachment verification**: The API verifies against one attachment at a time. Group citations from `citations-keyed.json` by `attachmentId`, send one request per group, then merge all responses:

```bash
# For each attachmentId, build a request with only that attachment's citations
# Then merge all responses:
python3 -c "
import json, glob, sys
merged = {'verifications': {}}
for f in sorted(glob.glob('.deepcitation/verify-resp-*.json')):
    data = json.loads(open(f).read())
    if 'verifications' not in data:
        print(f'WARNING: {f} has no verifications key — skipping (got keys: {list(data.keys())})', file=sys.stderr)
        continue
    merged['verifications'].update(data['verifications'])
json.dump(merged, open('.deepcitation/verify-response.json', 'w'), indent=2)
print(f'Merged {len(merged[\"verifications\"])} verifications')
"
```

Also save the extracted citations as `.deepcitation/citations.json` — the `CitationRecord` (object keyed by citation key, NOT an array).

### Step 4: Generate Branded HTML Report

Use the saved JSON artifacts to generate the report. All CLI commands use `npx -y deepcitation` — no pre-install needed.

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

Use this when you followed Path B in Step 2 — you annotated the HTML with `data-cite` attributes and built a key-map.

```bash
npx -y deepcitation inject \
  --html .deepcitation/annotated.html \
  --verify-response .deepcitation/verify-response.json \
  --key-map .deepcitation/key-map.json \
  --out .deepcitation/dashboard-verified.html
```

The `--key-map` flag embeds a `<script id="dc-key-map">` block that the CDN runtime uses to resolve `data-cite` to `data-citation-key` at runtime.

This injects before `</body>`:
- Verification JSON (`<script id="dc-data">`)
- The CDN runtime bundle (Preact + React popover components + Tailwind CSS)
- Auto-init script that resolves `data-cite` → `data-citation-key` via the key map, then wires up click handlers

### Step 5: Validate Before Declaring Done

Do not tell the user the report is ready until you've run these checks:

```bash
python3 -c "
import json
from html.parser import HTMLParser

class CiteCounter(HTMLParser):
    def __init__(self): super().__init__(); self.cites = []
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if 'data-cite' in d: self.cites.append(d['data-cite'])

# 1. Count data-cite elements in annotated HTML
html = open('.deepcitation/annotated.html').read()
p = CiteCounter(); p.feed(html)
cite_count = len(set(p.cites))

# 2. Count key-map entries
km = json.load(open('.deepcitation/key-map.json'))

# 3. Count verifications
vr = json.load(open('.deepcitation/verify-response.json'))
vdata = vr.get('verifications', vr)

# 4. Check resolution chain
orphans = [c for c in set(p.cites) if c not in km]
missing_verify = [c for c, h in km.items() if h not in vdata]

PARTIAL_STATUSES = {'partial_text_found', 'found_anchor_text_only', 'found_on_other_page'}
found = sum(1 for v in vdata.values() if v.get('status') == 'found')
partial = sum(1 for v in vdata.values() if v.get('status') in PARTIAL_STATUSES)
nf = sum(1 for v in vdata.values() if v.get('status') == 'not_found')

print(f'data-cite elements: {cite_count} unique')
print(f'key-map entries:    {len(km)}')
print(f'verifications:      {len(vdata)} (found={found}, partial={partial}, not_found={nf})')
print(f'orphan data-cites:  {len(orphans)} {orphans[:5] if orphans else \"\"}')
print(f'missing verifies:   {len(missing_verify)} {missing_verify[:5] if missing_verify else \"\"}')
if orphans: print('ERROR: data-cite elements with no key-map entry — popovers will not activate')
if missing_verify: print('ERROR: key-map entries with no verification — indicators will show but popover will be empty')
if cite_count < 30: print(f'WARNING: only {cite_count} citations — likely underciting. Expected 50+ for a multi-section document.')
"
```

If orphans or missing verifications are found, fix them before injecting. If the citation count is low, go back to Step 2B-2 and add more citations.

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
| `citations.json` | Extracted `CitationRecord` with human-readable keys |
| `citations-keyed.json` | Re-keyed citations with hashed keys (from `keygen`) |
| `key-map.json` | Human-readable key → hashed key mapping |
| `annotated.html` | HTML with `data-cite` attributes (before injection) |
| `verify-request.json` | Request body sent to `/verifyCitations` |
| `verify-response.json` | Verification results with statuses and evidence |
| `report-{topic}-{timestamp}.html` | Branded interactive HTML report |
| `dashboard-verified.html` | Injected HTML with CDN runtime (Path B output) |

Reports use `{topic}-{timestamp}` naming so re-runs don't clobber previous results.

## Important Rules

- **Product name**: Always "DeepCitation" (never "DeepCite")
- **Track attachmentId**: Always retain the `attachmentId` from Step 1 — it's the key for verification lookups
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

- Citation format spec (read at runtime): `docs/prompts/citation-format.md`
- SDK prompt implementation: `src/prompts/citationPrompts.ts`
- Citation parser: https://github.com/DeepCitation/deepcitation/blob/main/src/parsing/parseCitation.ts
- Branded report: https://github.com/DeepCitation/deepcitation/blob/main/src/vanilla/renderBrandedReport.ts
- API docs: https://deepcitation.com/docs

ARGUMENTS: $ARGUMENTS
