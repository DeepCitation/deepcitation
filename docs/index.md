---
layout: default
title: Home
nav_order: 1
description: "DeepCitation - Verify AI citations against source documents with visual proof"
permalink: /
---

# DeepCitation Documentation

Verify AI citations against source documents. Visual proof for every claim.

{: .fs-6 .fw-300 }

[Get Started]({{ site.baseurl }}/getting-started){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/DeepCitation/deepcitation-js){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## Quick Navigation

| Section | Description |
|:--------|:------------|
| [Getting Started]({{ site.baseurl }}/getting-started) | Installation and quick start guide |
| [API Reference]({{ site.baseurl }}/api-reference) | REST API endpoints for file preparation and verification |
| [Curl Guide]({{ site.baseurl }}/curl-guide) | Direct API usage with curl examples |
| [Types]({{ site.baseurl }}/types) | TypeScript interface definitions |
| [Verification Statuses]({{ site.baseurl }}/verification-statuses) | Understanding verification result statuses |
| [Code Examples]({{ site.baseurl }}/code-examples) | SDK usage examples and patterns |
| [Components]({{ site.baseurl }}/components) | React CitationComponent documentation |
| [Real-World Examples]({{ site.baseurl }}/real-world-examples) | Industry-specific integration examples |
| [Styling]({{ site.baseurl }}/styling) | CSS customization options |

---

## How DeepCitation Works

1. **Pre-Prompt: Prepare Files** - Upload source documents to extract text with line IDs for your LLM prompt
2. **Wrap Prompts & Call Your LLM** - Add citation instructions and call any LLM provider
3. **Post-Prompt: Verify Citations** - Verify citations with deterministic matching and get visual proof
4. **Display Results** - Parse citations from output and render with React components or your own UI

---

## Example Projects

Complete working examples are available on GitHub:

- [Basic Verification](https://github.com/DeepCitation/deepcitation-js/tree/main/examples/basic-verification) - Simple file upload and verification
- [Next.js AI SDK](https://github.com/DeepCitation/deepcitation-js/tree/main/examples/nextjs-ai-sdk) - Integration with Vercel AI SDK
- [Intercom Bot](https://github.com/DeepCitation/deepcitation-js/tree/main/examples/intercom-bot) - Customer support chatbot with citations

---

## Quick Install

```bash
npm install @deepcitation/deepcitation-js
```

```typescript
import { DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput } from "@deepcitation/deepcitation-js";

const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// Upload and verify in 3 steps
const { attachmentId, deepTextPromptPortion } = await deepcitation.uploadFile(pdfBuffer, { filename: "report.pdf" });
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({ systemPrompt, userPrompt, deepTextPromptPortion });
// ... call your LLM ...
const citations = getAllCitationsFromLlmOutput(response.content);
const verified = await deepcitation.verify(attachmentId, citations);
```
