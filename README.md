<div align="center">

# @deepcitation/deepcitation-js

**Verify AI citations against source documents. Visual proof for every claim.**

[![npm version](https://img.shields.io/npm/v/@deepcitation/deepcitation-js.svg)](https://www.npmjs.com/package/@deepcitation/deepcitation-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/@deepcitation/deepcitation-js)

[Documentation](https://docs.deepcitation.com) · [Get API Key](https://deepcitation.com/signup) · [Examples](./examples)

</div>

---

<div align="center">
<img src="https://raw.githubusercontent.com/DeepCitation/deepcitation-js/main/tests/playwright/specs/__snapshots__/visualShowcase.spec.tsx-snapshots/desktop-showcase-chromium-linux.png" alt="DeepCitation Component Showcase" width="700" />
</div>

## Install

```bash
npm install @deepcitation/deepcitation-js
```

## Quick Start

```typescript
import { DeepCitation, wrapCitationPrompt } from "@deepcitation/deepcitation-js";
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

// 1. Upload sources
const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });
const { deepTextPromptPortion } = await deepcitation.prepareFiles([{ file: pdfBuffer, filename: "report.pdf" }]);

// 2. Wrap prompts & call LLM
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a helpful assistant...",
  userPrompt: "Analyze this document",
  deepTextPromptPortion,
});

// 3. Verify citations
const { verifications } = await deepcitation.verify({ llmOutput: response.content });

// 4. Display with React
<CitationComponent citation={citation} verification={verifications[key]} />
```

## React Components

| Component | Description |
|-----------|-------------|
| `CitationComponent` | Inline citations with 6 variants: `brackets`, `chip`, `text`, `superscript`, `minimal`, `linter` |
| `UrlCitationComponent` | URL citations with favicon and status badges |
| `SourcesListComponent` | Aggregated sources panel/drawer (like Gemini) |

> Requires Tailwind CSS or import `@deepcitation/deepcitation-js/styles.css`

## Supported Formats

PDF, DOCX, XLSX, PPTX, HTML, Images (JPG, PNG, TIFF, WebP, HEIC), URLs

## Resources

- [Full Documentation](https://docs.deepcitation.com)
- [Examples](./examples) – Basic verification, Next.js chat app
- [Integration Guide](./INTEGRATION.md) – For AI coding assistants

## License

[MIT](./LICENSE)
