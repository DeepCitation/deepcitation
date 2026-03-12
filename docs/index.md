---
layout: default
title: Home
nav_order: 1
description: "DeepCitation - Verify AI citations against source documents with visual proof"
permalink: /
commit_sha: "cc9c7aa"
stale_after_commits: 30
watch_paths:
  - src/index.ts
  - README.md
---

# DeepCitation Documentation

Verify AI citations against source documents. Visual proof for every claim.

{: .fs-6 .fw-300 }

[Get Started]({{ site.baseurl }}/getting-started){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/DeepCitation/deepcitation){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## Quick Navigation

| Section | Description |
|:--------|:------------|
| [Getting Started]({{ site.baseurl }}/getting-started) | Installation and quick start guide |
| [API Reference]({{ site.baseurl }}/api-reference) | REST API endpoints for file preparation and verification |
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
3. **Display with CitationComponent** — Parse `<cite>` tags, generate citation keys, render inline with verification status

---

## Example Projects

Complete working examples are available on GitHub:

- [Basic Verification](https://github.com/DeepCitation/deepcitation/tree/main/examples/basic-verification) - Simple file upload and verification
- [Next.js AI SDK](https://github.com/DeepCitation/deepcitation/tree/main/examples/nextjs-ai-sdk) - Integration with Vercel AI SDK

---

## Quick Install

```bash
npm install deepcitation
```

```typescript
import { DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput } from "deepcitation";

const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// Upload and verify in 3 steps
const { attachmentId, deepTextPromptPortion } = await deepcitation.uploadFile(pdfBuffer, { filename: "report.pdf" });
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({ systemPrompt, userPrompt, deepTextPromptPortion });
// ... call your LLM ...
const citations = getAllCitationsFromLlmOutput(response.content);
const verified = await deepcitation.verify(attachmentId, citations);
```
