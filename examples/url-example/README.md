# DeepCitation URL Example

An interactive TUI (Text User Interface) that demonstrates citation verification from web URLs using DeepCitation.

## What it does

1. Prompts you to enter a URL
2. Prepares the URL for citation verification (~30s for URLs vs <1s for PDFs/images)
3. Prompts you for a question about the content
4. Gets an answer from OpenAI with embedded citations
5. Verifies each citation against the source and displays results

## Setup

1. Copy `.env.example` to `.env` and add your API keys:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
bun install
# or
npm install
```

3. Run the example:

```bash
bun run start
# or
npm run start
```

## Example Session

```
============================================================
  DeepCitation URL Example - Interactive TUI (gpt-5-mini)
============================================================

Enter a URL to analyze: https://en.wikipedia.org/wiki/TypeScript

Preparing URL for citation verification...
(URLs take ~30s to process vs. <1s for images/PDFs)
  Filename: typescript-wikipedia.pdf
  Pages: 5
  Text size: 45KB
  Processing time: 28.3s

Enter your question about this content: What year was TypeScript first released?

Querying gpt-5-mini...

Response:
--------------------------------------------------
TypeScript was first made public in October 2012 <cite attachment_id='abc123xyz' full_phrase='TypeScript was first made public in October 2012' anchor_text='October 2012' line_ids='42'/>
--------------------------------------------------

Verifying citations...

Found 1 citation(s). Verifying...

Verification Results:
============================================================

Citation [1]: ✅ found
--------------------------------------------------
  Claimed: "TypeScript was first made public in October 2012"
  Status: ✅ found
  Page: 1
  Found: "TypeScript was first made public in October 2012..."
  Proof image: Yes (23KB)

============================================================

Clean Response (with verification status):
--------------------------------------------------
TypeScript was first made public in October 2012 [1✅]
--------------------------------------------------

Summary:
  Total citations: 1
  Verified: 1 (100%)
  Partial: 0 (0%)
  Not found: 0
```

## How it works

The example uses DeepCitation's unified `prepareUrl` method:

```typescript
// Single call to prepare URL - handles conversion and text extraction
const { attachmentId, deepTextPromptPortion } = await deepcitation.prepareUrl({
  url: "https://example.com/article"
});

// Use deepTextPromptPortion in LLM prompts
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt: question,
  deepTextPromptPortion,
});

// Call LLM and verify citations
const parsedCitations = getAllCitationsFromLlmOutput(llmResponse);
const verified = await deepcitation.verifyAttachment(attachmentId, parsedCitations);
```

## Processing Times

| Source Type | Processing Time | Notes |
|-------------|-----------------|-------|
| Images (PNG, JPEG, etc.) | <1 second | |
| PDF documents | <1 second | |
| URLs (web pages) | ~30 seconds | Safe PDF conversion |
| URLs (unsafe fast mode) | <1 second | Vulnerable to hidden text/prompt injection |
| Office files (DOCX, XLSX, etc.) | ~30 seconds | |

### Unsafe Fast Mode

The example offers an "unsafe fast mode" option that extracts text directly from HTML instead of converting to PDF first. This is much faster (<1s vs ~30s) but **vulnerable to**:

- Hidden text (CSS `display:none`, tiny fonts, white-on-white text)
- Fine print that users can't see
- Prompt injection attacks embedded in the page

**Only use this for trusted URLs where you control the content.**

```typescript
// Safe mode (default) - ~30s, converts to PDF first
const result = await deepcitation.prepareUrl({ url });

// Unsafe fast mode - <1s, extracts HTML text directly
const result = await deepcitation.prepareUrl({
  url,
  unsafeFastUrlOutput: true
});
```

## Supported URL types

- Web pages (HTML)
- PDF documents (direct links)
- Most publicly accessible URLs

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPCITATION_API_KEY` | Yes | Your DeepCitation API key |
| `OPENAI_API_KEY` | Yes | Your OpenAI API key |
| `SYSTEM_PROMPT` | No | Override the default system prompt |
