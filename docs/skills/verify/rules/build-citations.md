# Build Citations

This step depends on what the [analyze-input](./analyze-input.md) step found.

## Path A: Existing cited output with `<<<CITATION_DATA>>>`

Skip this step — go directly to verification.

## Path B: Existing HTML with claims but no citation markers

### 1. Identify and prepare ALL source files

Read the HTML and extract every referenced source document from `href` attributes, inline references, data attributes, and link text. Resolve relative paths against the HTML file's location.

Prepare ALL of them — not just one. Each produces a separate `attachmentId` + `deepTextPromptPortion`. Deduplicate identical files, but never skip a unique source.

### 2. Identify verifiable claims — exhaustive coverage

Scan the **entire** HTML for factual assertions. Every uncited claim is something the user still has to verify manually.

**What to cite:** Every claim, value, or fact from attachments. If a human would need to open a source document to verify it, cite it. This includes values, dates, names, measurements, findings, diagnoses, reference ranges, and any restated or summarized content.

**Common blind spots:**

1. **Hidden/collapsed content.** Accordions, toggles, `display:none` panels — all values inside need citations.
2. **Restated values.** Summaries, banners, or narrative that repeats a value from elsewhere — each instance is a separate claim.
3. **Metadata.** Dates, identifiers, report timestamps in headers/footers.
4. **All views.** Tabs, timelines, alternate panels — walk every view, not just the default.
5. **Source/reference areas.** If the HTML has a references section, file list, or source links, add a citation drawer trigger there (see [annotate-html.md](./annotate-html.md)).

**Signals that something needs a citation:**
- It's a value (number, measurement, percentage, date, score)
- There are citation links nearby (e.g. `<a href="report.pdf">`)
- It restates or summarizes source document content
- A human would need to open a PDF to verify it

When in doubt, cite it — overciting costs nothing, underciting defeats the purpose. After citation generation, spawn a subagent to audit coverage: walk every section and confirm all facts, sources, names, dates, and values have deepcitations.

**Walk every section explicitly.** After building your initial list, enumerate every `<h2>` section and count citations per section. Any section with zero citations means the user has to check it manually.

**Multi-source awareness.** A single HTML page often draws from many sources. Each claim must be traced to its specific source document. Follow the proximity of `href` links as a signal for which source backs which claims.

### 3. Build citation data

Create a citation record mapping each claim to its source. Each citation must use the `attachmentId` of the specific source document that backs it.

For lineIds and pageNumber rules, read [line-ids.md](./line-ids.md).

```json
{
  "cite-revenue": {
    "fullPhrase": "Revenue grew 45% year-over-year to $2.3B",
    "anchorText": "$2.3B",
    "pageNumber": 2,
    "lineIds": [20],
    "attachmentId": "ATTACHMENT_ID_FROM_STEP_1"
  }
}
```

Save as `.deepcitation/citations-{timestamp}.json`.

**Anchor text guidelines.** Short anchor text (1-2 words) works for structured/tabular data. For narrative prose, use **5+ word** distinctive anchor text. Keep `fullPhrase` to a single line from the deepTextPromptPortion — multi-line values often degrade to `partial_text_found`.

Examples:
- **Good** (structured): `fullPhrase: "Revenue grew 45% year-over-year to $2.3B"`, `anchorText: "$2.3B"`
- **Good** (narrative): `fullPhrase: "The court held that Section 4(b) was unconstitutional"`, `anchorText: "Section 4(b) was unconstitutional"`
- **Bad** (narrative): `anchorText: "unconstitutional"` — too short, often results in `partial_text_found`

**anchorText and fullPhrase must be verbatim from the source document (`deepTextPromptPortion`).** The verification API searches the source for these exact strings. **Always cite using source text as anchorText** — even when the HTML displays a different value. The popover shows the user the verification status, surrounding context, and variant matches the API attempted. A ⚠ or ✗ next to a claim is more useful than no indicator at all.

Never:
- Set `anchorText` to the HTML's displayed text to force a match — that's fabricating evidence
- Add interpretive text or annotations near `data-citation-key` elements — the indicator is the sole visual signal
- Assume a value in the HTML matches the source without checking the `deepTextPromptPortion`

### 4. Generate deterministic keys

```bash
npx -y deepcitation keygen \
  --citations .deepcitation/citations.json \
  --out .deepcitation/citations-keyed.json
```

This prints the mapping to stderr and writes the re-keyed citations to `citations-keyed.json`. Use `citations-keyed.json` for the verify step.

### 5. Annotate HTML and build key map

See [annotate-html.md](./annotate-html.md) for `data-citation-key` placement rules, key-map building, and citation drawer triggers.

## Path C: Generate new cited response from scratch

You ARE the LLM. Read the canonical citation format spec:

```bash
DC_ROOT="$(node -e "console.log(require('path').resolve(require('path').dirname(require.resolve('deepcitation')), '..'))")"
cat "$DC_ROOT/docs/prompts/citation-format.md"
```

This is the single source of truth for field rules, format, and examples.

1. Read the `deepTextPromptPortion` from the saved prepare JSON
2. Read the citation format spec from the deepcitation package (see above)
3. Generate your response with:
   - `[N]` markers after each claim sourced from the documents — **every claim, value, or fact from attachments gets a sequential integer marker like [1], [2], [3] at the end of the claim. Each distinct piece of information needs its own unique marker number.**
   - A `<<<CITATION_DATA>>>` block at the end with structured citation metadata grouped by `attachmentId`

**Think out loud** for each citation — reason about which document, page, and line supports the claim before placing the marker.

`page_id` and `line_ids` MUST come from the `deepTextPromptPortion` — see [line-ids.md](./line-ids.md).

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
cat > .deepcitation/llm-output.txt << 'ENDOFOUTPUT'
... your generated response here ...
ENDOFOUTPUT
```
