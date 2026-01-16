<div align="center">

# @deepcitation/deepcitation-js

**Deterministic AI citation verification. Eliminate hallucination risk by proving every AI citation against source documents.**

[![npm version](https://img.shields.io/npm/v/@deepcitation/deepcitation-js.svg)](https://www.npmjs.com/package/@deepcitation/deepcitation-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

[Documentation](https://deepcitation.com/docs) · [Get Free API Key](https://deepcitation.com/signup) · [Examples](./examples) · [Discord](https://discord.gg/deepcitation)

</div>

---

## Why DeepCitation?

LLMs hallucinate. Even when given source documents, they make up quotes, invent statistics, and cite pages that don't exist. DeepCitation solves this by **deterministically verifying every citation** against your source documents—and generating visual proof.

<div align="center">
<img src="./examples/assets/deepcitation-medical-demo.gif" alt="DeepCitation medical documentation demo showing verified inline citations" width="700" />
<br />
<em>Medical documentation with verified inline citations — certainty at a glance</em>
</div>

```
Before: "Revenue grew 45% [1]"  →  ❓ Did the LLM make this up?
After:  "Revenue grew 45% [1]"  →  ✅ Verified on page 3, line 12 (with screenshot)
```

## Features

- **Deterministic Matching** – Every citation traced to its exact location. No fuzzy matching, no guessing.
- **Visual Proof** – Automated screenshots with highlighted text show exactly where citations come from.
- **Any LLM Provider** – Works with OpenAI, Anthropic, Google, Azure, or your own models.
- **React Components** – Pre-built components + composable primitives for citation UIs.
- **TypeScript Native** – Full type safety with comprehensive type definitions.

## Installation

```bash
npm install @deepcitation/deepcitation-js
```

Get a free API key at [deepcitation.com](https://deepcitation.com/signup) — no credit card required.

```bash
# .env
DEEPCITATION_API_KEY=sk-dc-your_api_key_here
```

---

## Quick Start

DeepCitation works in three steps: **Pre-Prompt**, **Post-Prompt**, and **Display**.

### Step 1: Pre-Prompt

Upload source documents and enhance your prompt with citation instructions.

```typescript
import { DeepCitation, wrapCitationPrompt } from "@deepcitation/deepcitation-js";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// Upload source files, this can be done before the user types their prompt
const { fileDataParts, deepTextPromptPortion } = await dc.prepareFiles([
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

Verify citations against the source documents.

```typescript
const result = await dc.verifyCitations({
  llmOutput: response.content,
  fileDataParts, //optional 
});

// result.verifications contains verification status + visual proof
const { citations, verifications } = result;

```

### Step 3: Display

Parse the LLM output and render verified citations inline with React components.

```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";
import {
  parseCitation,
  generateCitationKey,
} from "@deepcitation/deepcitation-js";
import "@deepcitation/deepcitation-js/react/styles.css";

function Response({ llmOutput, verifications }) {
  // Split LLM output by citation tags and render inline
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

---

## Core API

### DeepCitation Client

```typescript
const dc = new DeepCitation({
  apiKey: string      // Your API key (sk-dc-*)
});

// Upload and prepare source files
await dc.prepareFiles(files: FileInput[])

// Convert URLs/Office docs to PDF
await dc.convertToPdf(urlOrOptions: string | ConvertOptions)

// Verify LLM citations
await dc.verifyCitations({ llmOutput, fileDataParts?, outputImageFormat? })
```

### Prompt Utilities

```typescript
import {
  wrapCitationPrompt,              // Wrap system + user prompts
  wrapSystemCitationPrompt,         // Wrap system prompt only
  getAllCitationsFromLlmOutput,     // Extract citations from response
  CITATION_JSON_OUTPUT_FORMAT,      // JSON schema for structured output
} from "@deepcitation/deepcitation-js";
```

### React Components

```typescript
import {
  CitationComponent,         // Primary citation display component
  CitationVariants,          // Alternative citation styles
  UrlCitationComponent,      // For URL-based citations
} from "@deepcitation/deepcitation-js/react";
```

### Types

```typescript
import type {
  Citation,
  Verification,
  SearchStatus,
  SearchAttempt,
} from "@deepcitation/deepcitation-js";
```

---

## Examples

Check out the [examples directory](./examples) for complete, runnable examples:

- [**basic-verification**](./examples/basic-verification) – Core 3-step workflow
- [**support-bot**](./examples/support-bot) – Customer support bot with invisible citations
- [**nextjs-ai-sdk**](./examples/nextjs-ai-sdk) – Full-stack Next.js chat app

```bash
cd examples/basic-verification
npm install
cp .env.example .env  # Add your API keys
npm run start:openai
```

---

## Documentation

For comprehensive documentation including:
- Full API reference
- Integration patterns
- Error handling
- Advanced React components
- TypeScript types

Visit **[deepcitation.com/docs](https://deepcitation.com/docs)**

---

## Supported File Types

**Documents:** PDF (native and scanned), URLs, Office formats (`.docx`, `.xlsx`, `.pptx`, etc.)
**Images:** PNG, JPEG, TIFF, WebP, AVIF, HEIC
**Media:** Audio and video (with timestamp-based citations)

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

## Links

- [Documentation](https://deepcitation.com/docs)
- [Get API Key](https://deepcitation.com/signup)
- [Discord Community](https://discord.gg/deepcitation)
- [GitHub Issues](https://github.com/deepcitation/deepcitation-js/issues)
- [Examples](./examples)
