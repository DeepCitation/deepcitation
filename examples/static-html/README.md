# Static HTML — CDN Popover Example

Demonstrates the CDN popover bundle in a plain HTML page with no build step.
Fixtures are generated from real DeepCitation API data (arXiv paper verification).

## Prerequisites

1. API keys in a `.env` file (copy from basic-verification if needed):

```bash
cp ../basic-verification/.env .env
```

The `.env` file needs:

```
DEEPCITATION_API_KEY=dc-...
OPENAI_API_KEY=sk-...
```

2. Dependencies installed in the package root:

```bash
cd ../../          # packages/deepcitation
bun install
```

## Generate Fixtures

```bash
bun run generate-fixtures.ts
```

This runs the full DeepCitation workflow:

1. Uploads the arXiv URL to DeepCitation
2. Calls OpenAI (gpt-5-mini) with citation-enhanced prompts
3. Parses and verifies all citations
4. Writes `fixtures.json` (verification data with evidence images) and `llm-response.txt` (visible LLM output)

Takes ~30-60 seconds depending on API latency.

## Build the CDN Bundle

From the package root:

```bash
bun scripts/build-vanilla-runtime.mjs
```

This produces `lib/vanilla/deepcitation-popover.cdn.js` which the HTML page loads.

## View the Example

Serve this directory (fetch doesn't work over `file://`):

```bash
python3 -m http.server 8080
# or: npx serve .
```

Open [http://localhost:8080](http://localhost:8080) and click any citation number.

## What You Should See

- Clicking a `[N]` citation opens the popover with:
  - Status header (Verified / Partial Match / Not Found)
  - Source label and domain
  - Highlighted claimed text vs. found text
  - Evidence keyhole image (click to expand)
  - Page images (click "View page" to see full-page render)
- Theme switching (Light / Dark / Auto)
- Escape or click outside to dismiss

## File Overview

| File | Purpose |
|------|---------|
| `generate-fixtures.ts` | Generates fixture data from real API calls |
| `fixtures.json` | Verification data (generated, gitignored) |
| `llm-response.txt` | Visible LLM output with `[N]` markers (generated, gitignored) |
| `index.html` | Static HTML page loading the CDN bundle |

## Regenerating Fixtures

To regenerate with fresh data (e.g., after API changes):

```bash
rm fixtures.json llm-response.txt
bun run generate-fixtures.ts
```

The LLM output will vary between runs since it's non-deterministic,
but the verification pipeline is deterministic for the same source.
