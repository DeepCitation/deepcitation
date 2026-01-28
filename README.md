<div align="center">

# @deepcitation/deepcitation-js

**Instantly trustworthy AI content with eliminated hallucination risk.**

[![npm version](https://img.shields.io/npm/v/@deepcitation/deepcitation-js.svg)](https://www.npmjs.com/package/@deepcitation/deepcitation-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

[Documentation](https://deepcitation.com/docs) · [New API Key](https://deepcitation.com/signup) · [Examples](./examples) · [Agent Guide](./AGENTS.md)

</div>

---

## Overview

LLMs hallucinate citations and cite pages that don't exist. **Citations alone are not enough.**

DeepCitation solves this by deterministically verifying every citation against your sources. We provide visual proof for every claim, making content instantly trustworthy and safer to present to users.

<div align="center">
<img src="./examples/assets/deepcitation-financial-demo.avif" alt="DeepCitation demo showing instant certainty with verified inline citations" width="700" />
<br />
<em>DeepCitation demo showing instant certainty with verified inline citations</em>
</div>

```
Before: "Recent results indicate 35% EF [1]"  →  ❓ Did the LLM make this up?
After:  "Recent results indicate 35% EF [1]"  →  ✅ Verified on page 1, line 12 (with screenshot)
```

## Installation

```bash
npm install @deepcitation/deepcitation-js
```

## Documentation

Full documentation is available at [deepcitation.com/docs](https://deepcitation.com/docs).

## Quick Start

DeepCitation works in three steps: **Pre-Prompt**, **Post-Prompt**, and **Display**.

### Step 1: Pre-Prompt

Upload attachments and enhance your prompt with citation instructions.

```typescript
import { DeepCitation, wrapCitationPrompt } from "@deepcitation/deepcitation-js";

const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// Upload source files
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
  { file: pdfBuffer, filename: "report.pdf" },
]);

// Wrap prompts with citation instructions
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a helpful assistant...",
  userPrompt: "Analyze this document",
  deepTextPromptPortion,
});

// Call your LLM
const response = await llm.chat({
  messages: [
    { role: "system", content: enhancedSystemPrompt },
    { role: "user", content: enhancedUserPrompt },
  ],
});
```

### Step 2: Post-Prompt

Verify citations against the attachments.

```typescript
const result = await deepcitation.verify({
  llmOutput: response.content,
});

// result.verifications contains verification status + visual proof
const { verifications } = result;
```

### Step 3: Display

Parse the LLM output and render verified citations inline with React components.

```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";
import { parseCitation, generateCitationKey } from "@deepcitation/deepcitation-js";
import "@deepcitation/deepcitation-js/react/styles.css";

function Response({ llmOutput, verifications }) {
  const renderWithCitations = (text: string) => {
    const parts = text.split(/(<cite\s+[^>]*\/>)/g);

    return parts.map((part, index) => {
      if (part.startsWith("<cite")) {
        const { citation } = parseCitation(part);
        const citationKey = generateCitationKey(citation);

        return (
          <CitationComponent
            key={index}
            citation={citation}
            verification={verifications[citationKey]}
          />
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return <div>{renderWithCitations(llmOutput)}</div>;
}
```

## Examples

Check out the [examples directory](./examples) for complete, runnable examples:

- [**basic-verification**](./examples/basic-verification) – Core 3-step workflow
- [**nextjs-ai-sdk**](./examples/nextjs-ai-sdk) – Full-stack Next.js chat app

```bash
cd examples/basic-verification
npm install
cp .env.example .env  # Add your API keys
npm run start:openai
```

## Supported Formats

- **Documents:** PDF (Text & Scanned), DOCX, XLSX, PPTX, HTML
- **Images:** JPG, PNG, TIFF, WebP, HEIC
- **Web:** Public URLs

## Development & Testing

### Running Tests

```bash
# Run all tests
npm test

# Run Playwright component tests
npm run test:ct

# Run Playwright tests in UI mode (interactive)
npm run test:ct:ui
```

### Visual Regression Testing

This package includes comprehensive visual regression tests using Playwright component testing. The tests verify that citation components render correctly across different states, variants, and viewports.

**First-time Setup:**

Visual regression tests will fail on the first CI run because baseline snapshots don't exist yet. To generate baselines:

1. Trigger a workflow run with the `UPDATE_SNAPSHOTS=1` environment variable
2. The workflow will generate baseline snapshots for all viewports (desktop, mobile, tablet)
3. Baseline images will be saved in `src/__tests__/playwright/__snapshots__/`
4. Commit these baseline snapshots to the repository

**Updating Snapshots:**

If you intentionally change component styling and need to update the baselines:

```bash
# Update snapshots locally
UPDATE_SNAPSHOTS=1 npm run test:ct

# Commit the updated snapshots
git add src/__tests__/playwright/__snapshots__/
git commit -m "chore: Update visual regression baselines"
```

**What's Tested:**
- All 5 citation variants (brackets, chip, text, superscript, minimal)
- All verification states (verified, partial, not found, pending)
- All 16 URL fetch status types
- Responsive design (desktop 1280×720, mobile 375×667, tablet 768×1024)
- Long text handling and truncation
- Audit log display with failed search attempts
- Inline usage in text contexts

## Support

- **Feature requests:** [GitHub Discussions](https://github.com/deepcitation/deepcitation-js/discussions)
- **Bug reports:** [GitHub Issues](https://github.com/deepcitation/deepcitation-js/issues)
- **For Coding Agents:** [Step-by-step DeepCitation implementation guide for AI code agents (Claude, Cursor, Copilot)](./AGENTS.md) 


## Contributing

We welcome contributions! Please start a discussion in [GitHub Discussions](https://github.com/deepcitation/deepcitation-js/discussions) before submitting a pull request.


## License

MIT License - see [LICENSE](./LICENSE) for details.
