# Basic Verification Example

A minimal example demonstrating the DeepCitation 3-step workflow for verifying AI citations against attachments.

## What This Example Does

1. **Pre-Prompt**: Uploads a sample document and enhances your LLM prompt with citation instructions
2. **Post-Prompt**: Calls your LLM, then verifies all citations against the source document
3. **Display**: Shows verification results with status, matched text snippets, and summary statistics

## Quick Start

```bash
# Install dependencies
bun install

# Copy environment file and add your API keys
cp .env.example .env

# Run with OpenAI
bun run start:openai

# Or run with Anthropic Claude
bun run start:anthropic

# Or run with Google Gemini
bun run start:gemini

# Or run with raw API calls (curl/fetch)
bun run start:curl
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

Replace the sample document buffer in the source file with your own PDF:

```typescript
import { readFileSync } from "fs";

const myDocument = readFileSync("./path/to/your/document.pdf");

const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
  { file: myDocument, filename: "my-document.pdf" },
]);
```

## Key Functions Used

| Function | Purpose |
|----------|---------|
| `deepcitation.prepareFiles()` | Upload documents, get formatted text for LLM |
| `wrapCitationPrompt()` | Add citation instructions to your prompts |
| `deepcitation.verify()` | Parse LLM output and verify all citations (recommended) |
| `deepcitation.verifyAttachment()` | Verify citations against a specific attachment |
| `getCitationStatus()` | Get simplified status (isVerified, isMiss, etc.) |
| `replaceCitations()` | Replace citation tags with optional verification status |

## Raw API Usage (curl)

The `start:curl` example shows how to call the DeepCitation API directly without the client SDK. This is useful for:
- Integrating with other programming languages
- Understanding the underlying API
- Custom implementations

### API Endpoints

```bash
# Step 1: Upload file
curl -X POST "https://api.deepcitation.com/prepareFile" \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -F "file=@document.pdf"

# Returns: { "attachmentId": "...", "deepTextPromptPortion": "..." }

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
