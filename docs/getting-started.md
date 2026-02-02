---
layout: default
title: Getting Started
nav_order: 2
description: "Installation and quick start guide for DeepCitation"
has_children: true
---

# Getting Started

Learn how to install and integrate DeepCitation into your application.

---

## How DeepCitation Works

{: .note }
DeepCitation works in 4 simple steps: prepare files, wrap prompts, verify citations, and display results.

### Step 1: Pre-Prompt - Prepare Files

Upload source documents to extract text with line IDs for your LLM prompt.

### Step 2: Wrap Prompts & Call Your LLM

Add citation instructions to your prompts and call any LLM provider (OpenAI, Anthropic, Google, etc.).

### Step 3: Post-Prompt - Verify Citations

Verify citations with deterministic matching and get visual proof images.

### Step 4: Display Results

Parse citations from markdown output and render with React components or your own UI.

---

## Installation

Install the SDK using your preferred package manager:

```bash
# npm
npm install @deepcitation/deepcitation-js

# yarn
yarn add @deepcitation/deepcitation-js

# pnpm
pnpm add @deepcitation/deepcitation-js

# bun
bun add @deepcitation/deepcitation-js
```

---

## Full Integration Example

```typescript
import { DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput } from "@deepcitation/deepcitation-js";

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

Get your API key from the [dashboard](https://deepcitation.com/usage).

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
| Office Docs | Word, Excel, Google Docs |
| URLs | Web pages via `prepareUrl` endpoint |

---

## Next Steps

- [API Reference]({{ site.baseurl }}/api-reference/) - Learn about the REST API endpoints
- [Components]({{ site.baseurl }}/components/) - Display citations with React components
- [Code Examples]({{ site.baseurl }}/code-examples/) - See more integration patterns
