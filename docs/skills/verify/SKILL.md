---
name: verify
description: Verify AI claims against source documents using the DeepCitation API
allowed-tools: Read, Write, Bash, Glob, Grep, Edit, Agent
---

# /verify — DeepCitation Verification

Verify claims against source documents using the DeepCitation API, saving JSON artifacts at each step.

## Prerequisites

- `DEEPCITATION_API_KEY` environment variable must be set. If not set, try loading saved credentials:
  ```bash
  eval "$(npx -y deepcitation env 2>/dev/null)"
  ```
  If that also fails, tell the user to run `npx -y deepcitation login` first, then retry.
- Source files (PDF, DOCX, images, etc.) must be accessible on disk or via URL
- Accepted file types: PDF, images (JPG, PNG), Office files (DOCX, XLSX, PPTX), CSV, TSV, ODF

## Key Rules

- **`page_id` and `line_ids` MUST come from the `deepTextPromptPortion`** — see [rules/line-ids.md](rules/line-ids.md) for details.
- **Coverage audit**: After generating citations, spawn a subagent to audit the report/chat and confirm all facts, sources, names, dates, and values have deepcitations. The subagent should flag any uncited claims.

## Workflow

### Step 0: Analyze input

Load [rules/analyze-input.md](rules/analyze-input.md) to determine which path to follow (A–F) based on what's in the conversation, arguments, and working directory.

### Step 1: Prepare sources

Load [rules/prepare-sources.md](rules/prepare-sources.md) for CLI usage and what to retain from each prepare response.

### Step 2: Build citations

Load [rules/build-citations.md](rules/build-citations.md) for the full citation-building workflow:
- **Path A**: Existing `<<<CITATION_DATA>>>` — skip to Step 3
- **Path B**: Existing HTML with claims — identify claims, build citation data, generate keys, annotate HTML
- **Path C**: Generate new cited response from scratch using the canonical citation format spec

### Step 3–5: Verify, inject, validate

Load [rules/verify-and-inject.md](rules/verify-and-inject.md) for verification, HTML injection, and pre-delivery validation.

## When building citations

When dealing with `lineIds` and `pageNumber` values, load [rules/line-ids.md](rules/line-ids.md) for how sparse line IDs work and how to find the right one.

When annotating HTML with `data-citation-key` attributes, load [rules/annotate-html.md](rules/annotate-html.md) for placement rules, key-map building, and citation drawer triggers.

## Output artifacts

All artifacts are saved in `.deepcitation/`. Use `{topic}-{timestamp}` naming so re-runs don't clobber each other:

| File | Contents |
|------|----------|
| `prepare-{source}-{timestamp}.json` | Upload response with `attachmentId` and `deepTextPromptPortion` |
| `llm-output-{timestamp}.txt` | Full LLM response including `<<<CITATION_DATA>>>` block |
| `citations-{timestamp}.json` | Extracted `CitationRecord` with human-readable keys |
| `citations-keyed-{timestamp}.json` | Re-keyed citations with hashed keys (from `keygen`) |
| `key-map-{timestamp}.json` | Human-readable key → hashed key mapping |
| `annotated-{timestamp}.html` | HTML with `data-citation-key` attributes (before injection) |
| `verify-response-{timestamp}.json` | Verification results with statuses and evidence |
| `injected-{timestamp}.html` | Injected HTML with CDN runtime (Path B output) |

## Important rules

- **Product name**: Always "DeepCitation" (never "DeepCite")
- **Track attachmentId**: Always retain the `attachmentId` from Step 1 — it's the key for verification lookups
- **Strip before display**: Use `extractVisibleText()` to remove `<<<CITATION_DATA>>>` before showing text to user
- **CitationRecord is an object**: Check emptiness with `Object.keys(citations).length === 0`
- **API key security**: Never log or display `DEEPCITATION_API_KEY`
- **Verbatim quotes**: `fullPhrase` must be copied exactly from the source — do not paraphrase

## References

- Citation format spec: `$DC_ROOT/docs/prompts/citation-format.md` (resolve `DC_ROOT` with `node -e "..."` as shown in Path C)
- SDK prompt: `$DC_ROOT/src/prompts/citationPrompts.ts`
- Citation parser: https://github.com/DeepCitation/deepcitation/blob/main/src/parsing/parseCitation.ts
- API docs: https://deepcitation.com/docs

ARGUMENTS: $ARGUMENTS
