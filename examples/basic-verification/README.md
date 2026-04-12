# Basic Verification Example

A minimal example demonstrating the DeepCitation 3-section workflow for verifying AI citations against attachments.

## What This Example Does

1. **Install & Setup**: Uploads a sample document and prepares sources for citation verification
2. **Server Side**: Wraps prompts, calls your LLM, and verifies all citations against the source document
3. **Display**: Shows verification results with status, matched text snippets, and summary statistics

## Quick Start

```bash
# Install dependencies
bun install

# Copy environment file and add your API keys
cp .env.example .env

# Run with OpenAI (interactive source picker)
bun run start:openai

# Or run with Anthropic Claude / Google Gemini
bun run start:anthropic
bun run start:gemini

# Pass a URL or file path directly (skips the interactive menu)
bun src/openai.ts https://arxiv.org/pdf/1706.03762
bun src/openai.ts /path/to/document.pdf

# Run all three providers on the same source (baseline comparison)
bun src/openai.ts <source>      # gpt-5-mini
bun src/gemini.ts <source>      # gemini-2.0-flash-lite
bun src/anthropic.ts <source>   # claude-haiku-4-5
```

## Required API Keys

1. **DeepCitation API Key** (free): Get one at [deepcitation.com/signup](https://deepcitation.com/signup)
2. **LLM Provider Key**: Either OpenAI or Anthropic API key

## Example Output

```
🔍 DeepCitation Basic Example - OpenAI

📄 Step 1: Uploading document and preparing prompts...
✅ Document uploaded successfully
   File ID: abc123...

🤖 Step 2: Calling OpenAI and verifying citations...
📝 LLM Response (raw with citations):
──────────────────────────────────────────────────
ACME Corporation achieved revenue growth of 23% in 2024 <cite attachment_id='abc123'
full_phrase='representing a 23% increase from the previous year' line_ids='5-6'/>.
The Asia-Pacific region performed best with 35% year-over-year growth <cite.../>
──────────────────────────────────────────────────

✨ Step 3: Verification Results

Found 2 citation(s):

Citation [1]: ✅
  Status: found
  Page: 1
  Match: "representing a 23% increase from the previous year..."
  Has proof image: true

Citation [2]: ✅
  Status: found
  Page: 1
  Match: "Asia-Pacific showed the strongest growth at 35% YoY..."
  Has proof image: true

📖 Clean Response (for display):
──────────────────────────────────────────────────
ACME Corporation achieved revenue growth of 23% in 2024.
The Asia-Pacific region performed best with 35% year-over-year growth.
──────────────────────────────────────────────────

📊 Summary:
   Total citations: 2
   Verified: 2 (100%)
   Not found: 0
```

## Using Your Own Documents

Pass a URL or file path as the first argument — no code changes needed:

```bash
# URL (HTML page, arXiv paper, etc.)
bun src/openai.ts https://example.com/document.html

# Local PDF or DOCX
bun src/openai.ts /path/to/document.pdf
bun src/openai.ts /path/to/report.docx

# Image (vision — only works with vision-capable providers)
bun src/openai.ts /path/to/chart.png
```

The workflow auto-detects the source type from the argument: URLs go through `prepareUrl()`, local files through `prepareAttachments()`, and image files also send base64 to the LLM for vision.

## Key Functions Used

| Function | Purpose |
|----------|---------|
| `deepcitation.prepareAttachments()` | Upload documents, get formatted text for LLM |
| `wrapCitationPrompt()` | Add citation instructions to your prompts |
| `deepcitation.verify()` | Parse LLM output and verify all citations (recommended) |
| `deepcitation.verifyAttachment()` | Verify citations against a specific attachment |
| `getCitationStatus()` | Get simplified status (isVerified, isMiss, etc.) |
| `replaceCitationMarkers()` | Replace citation markers with optional verification status |

## Raw API Usage (curl)

The `start:curl` example shows how to call the DeepCitation API directly without the client SDK. This is useful for:
- Integrating with other programming languages
- Understanding the underlying API
- Custom implementations

### API Endpoints

```bash
# Step 1: Upload file
curl -X POST "https://api.deepcitation.com/prepareAttachments" \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -F "file=@document.pdf"

# Returns: { "attachmentId": "...", "deepTextPages": "..." }

# Step 3: Verify citations
curl -X POST "https://api.deepcitation.com/verifyCitations" \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "attachmentId": "YOUR_ATTACHMENT_ID",
      "citations": {
        "1": { "fullPhrase": "exact quote from document", "pageNumber": 1 }
      },
      "outputImageFormat": "avif"
    }
  }'

# Returns: { "verifications": { "1": { "status": "found", ... } } }
```

## Next Steps

- Check out the [support-bot example](../support-bot) for invisible citations in customer-facing apps
- See the [full documentation](https://docs.deepcitation.com/) for advanced usage
- Explore [React components](../../README.md#react-components) for building citation UIs
