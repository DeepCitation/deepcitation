---
layout: default
title: Getting Started
nav_order: 2
description: "Installation and quick start guide for DeepCitation"
has_children: true
commit_sha: "cc9c7aa"
stale_after_commits: 20
watch_paths:
  - src/index.ts
  - src/client/DeepCitation.ts
  - src/client/types.ts
  - README.md
  - INTEGRATION.md
---

# Getting Started

Learn how to install and integrate DeepCitation into your application.

---

## How DeepCitation Works

{: .note }
DeepCitation works in 3 sections: install & setup, server side, and display.

### Section 1: Install & Setup

Install, import types, initialize client, prepare sources, and configure proof images.

### Section 2: Server Side

Wrap prompts, call your LLM, verify citations, and optionally persist results.

### Section 3: Display with CitationComponent

Parse `<cite>` tags, generate citation keys, and render inline with verification status.

---

## Installation

Install the SDK using your preferred package manager:

```bash
# npm
npm install deepcitation

# yarn
yarn add deepcitation

# pnpm
pnpm add deepcitation

# bun
bun add deepcitation
```

---

## Full Integration Example

```typescript
import { DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput } from "deepcitation";

const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// 1. Upload your source document
const { attachmentId, deepTextPromptPortion } = await deepcitation.uploadFile(pdfBuffer, {
  filename: "report.pdf"
});

// 2. Wrap your prompts with citation instructions
const systemPrompt = "You are a helpful assistant that cites sources.";

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt,
  deepTextPromptPortion // Pass file content directly
});

// 3. Call your LLM
const response = await yourLLM.chat({
  messages: [
    { role: "system", content: enhancedSystemPrompt },
    { role: "user", content: enhancedUserPrompt },
  ]
});

// 4. Extract and verify citations
const citations = getAllCitationsFromLlmOutput(response.content);
const verified = await deepcitation.verify(attachmentId, citations);

// 5. Use verification results
for (const [key, result] of Object.entries(verified.verifications)) {
  console.log(`Citation ${key}: ${result.searchState?.status}`);
  if (result.verificationImageBase64) {
    // Display visual proof to users
  }
}
```

---

## Authentication

Include your API key in the Authorization header:

```
Authorization: Bearer dc_live_your_api_key
```

Get your API key from the [API Keys Page](https://deepcitation.com/signup).

---

## Base URL

All API endpoints are available at:

```
https://api.deepcitation.com
```

{: .note }
The SDK handles API routing automatically. You only need to configure your API key.

---

## Supported File Types

| Type | Formats |
|:-----|:--------|
| PDFs | `.pdf` |
| Images | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` (auto-OCR) |
| Office Docs | Word, Excel, PowerPoint, Google Docs |
| URLs | Web pages via `prepareUrl` endpoint |

---

## Next Steps

- [API Reference]({{ site.baseurl }}/api-reference/) - Learn about the REST API endpoints
- [Components]({{ site.baseurl }}/components/) - Display citations with React components
- [Code Examples]({{ site.baseurl }}/code-examples/) - See more integration patterns
- [Error Handling]({{ site.baseurl }}/error-handling/) - Production error patterns and retry logic
- [Styling]({{ site.baseurl }}/styling/) - CSS customization and theming
