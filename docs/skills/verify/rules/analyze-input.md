# Analyze Input & Determine What to Verify

**Bias for action**: DO things, don't ask questions. Scan everything available, make a plan, and execute. Only ask the user if you genuinely cannot determine what they want.

Before calling any API, scan all available context:

1. **Parse `$ARGUMENTS`** — file paths, URLs, or empty?
2. **Scan conversation history** (always, even when arguments are provided):
   - AI-generated content: reports, summaries, analyses, dashboards, HTML output
   - `[N]` citation markers and `<<<CITATION_DATA>>>` blocks
   - Source file mentions (PDFs, images, DOCX/XLSX/PPTX, URLs)
   - Links to generated artifacts (HTML reports, dashboards)
3. **Scan the working directory**: `.deepcitation/` artifacts from prior runs, source documents
4. **Scan for generated HTML files**: `glob .deepcitation/report-*.html` and any other HTML files mentioned in conversation

## Decision paths

**A) Source files provided as arguments** (`/verify report.pdf quarterly-results.docx`)
→ Prepare these files, generate a cited analysis, verify, and inject.

**B) Existing cited output found** (conversation contains `[N]` markers + `<<<CITATION_DATA>>>`)
→ Skip citation building. Extract citations and source file references, prepare any source files not yet uploaded, then verify and inject.

**C) Uncited AI-generated content found** (substantive claims WITHOUT citation markers)
→ Most common case when a user runs `/verify` after getting a response. Identify the source documents (from conversation context, file references, or ask if truly unclear). **Ask before guessing** — especially when sources are internal/intranet URLs or documents the user may need to manually download, print to PDF, or upload for the API to access. Running the full pipeline against the wrong sources wastes time and produces misleading results. Prepare them, re-generate the content WITH citations, verify, and inject.

**D) A text/HTML file provided** (`/verify analysis.txt` or `/verify report.html`)
→ Read the file. If it contains `<<<CITATION_DATA>>>`, treat as path B. Otherwise, treat the file's content as the claims to verify and proceed through the full pipeline.

**E) Multiple verifiable items found** (e.g., multiple reports, multiple AI responses)
→ Verify ALL of them. Run the pipeline for each one.

**F) Nothing found and no arguments**
→ Only in this case, ask the user what they want to verify.
