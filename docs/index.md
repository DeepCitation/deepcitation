---
layout: default
title: Home
nav_order: 1
description: "DeepCitation - Verify AI citations against source documents with visual proof"
permalink: /
commit_sha: "0ba7a82"
stale_after_commits: 30
watch_paths:
  - src/index.ts
  - README.md
---

# DeepCitation Documentation

Verify AI citations against source documents. Visual proof for every claim.

{: .fs-6 .fw-300 }

[Start Building]({{ site.baseurl }}/getting-started){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/DeepCitation/deepcitation){: .btn .fs-5 .mb-4 .mb-md-0 }

DeepCitation is an API and React component library that verifies whether your AI's citations actually appear in the source documents. Upload a PDF, let your LLM cite it, and get back visual proof screenshots showing exactly where each claim was found — or flagging it as hallucinated.

---

## Quick Navigation

| Section | Description |
|:--------|:------------|
| [Getting Started]({{ site.baseurl }}/getting-started) | Installation and quick start guide |
| [Prompts]({{ site.baseurl }}/prompts) | How DeepCitation instructs LLMs to produce verifiable citations |
| [API Reference]({{ site.baseurl }}/api-reference) | REST API endpoints for file preparation and verification |
| [SDK Reference]({{ site.baseurl }}/sdk-reference) | TypeScript SDK client methods and utility functions |
| [Curl Guide]({{ site.baseurl }}/curl-guide) | Direct API usage with curl examples |
| [Types]({{ site.baseurl }}/types) | TypeScript interface definitions |
| [Verification Statuses]({{ site.baseurl }}/verification-statuses) | Understanding verification result statuses |
| [Framework Guides]({{ site.baseurl }}/frameworks) | LangChain, Next.js App Router, Vercel AI SDK |
| [Code Examples]({{ site.baseurl }}/code-examples) | SDK usage examples and patterns |
| [Components]({{ site.baseurl }}/components) | React CitationComponent documentation |
| [Styling]({{ site.baseurl }}/styling) | CSS customization options |
| [Error Handling]({{ site.baseurl }}/error-handling) | Production error patterns and retry logic |

---

## How DeepCitation Works

1. **Install & Setup** — Install, import types, initialize client, prepare sources, configure proof images
2. **Server Side** — Wrap prompts, call your LLM, verify citations, optionally persist results
3. **Display with CitationComponent** — Parse numeric `[N]` markers via `parseCitationResponse`, map to citation keys, render inline with verification status

---

## Example Projects

Complete, runnable examples are available on GitHub:

| Example | Description | Demo |
|:--------|:------------|:-----|
| [basic-verification](https://github.com/DeepCitation/deepcitation/tree/main/examples/basic-verification) | Core 3-step workflow with OpenAI/Anthropic | -- |
| [langchain-rag-chat](https://github.com/DeepCitation/deepcitation/tree/main/examples/langchain-rag-chat) | Next.js + LangChain.js RAG app with verification | [Live Demo](https://langchain-rag-chat-deepcitation.vercel.app/) |
| [mastra-rag-chat](https://github.com/DeepCitation/deepcitation/tree/main/examples/mastra-rag-chat) | Next.js + Mastra RAG app with verification | [Live Demo](https://mastra-rag-deepcitation.vercel.app/) |
| [nextjs-ai-sdk](https://github.com/DeepCitation/deepcitation/tree/main/examples/nextjs-ai-sdk) | Next.js chat app with Vercel AI SDK streaming | [Live Demo](https://nextjs-ai-sdk-deepcitation.vercel.app/) |
| [agui-chat](https://github.com/DeepCitation/deepcitation/tree/main/examples/agui-chat) | AG-UI protocol chat with SSE streaming | [Live Demo](https://agui-chat-deepcitation.vercel.app/) |
| [static-html](https://github.com/DeepCitation/deepcitation/tree/main/examples/static-html) | CDN popover in plain HTML, no build step | -- |

---

## Quick Install

```bash
npm install deepcitation
```

```typescript
import { DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput } from "deepcitation";

const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// Prepare, wrap, verify in 3 steps
const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([{ file: pdfBuffer, filename: "report.pdf" }]);
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({ systemPrompt, userPrompt, deepTextPromptPortion });
// ... call your LLM ...
const citations = getAllCitationsFromLlmOutput(response.content);
const { verifications } = await dc.verifyAttachment(fileDataParts[0].attachmentId, citations);
```
