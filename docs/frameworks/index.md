---
layout: default
title: Frameworks
nav_order: 6
description: "Framework-specific integration guides for DeepCitation"
has_children: true
commit_sha: "cc9c7aa"
stale_after_commits: 30
watch_paths:
  - src/index.ts
  - src/client/DeepCitation.ts
---

# Framework Guides

DeepCitation works with any LLM provider or framework. These guides show the exact integration pattern for the most common setups, so you spend 10 minutes wiring, not 30 minutes figuring it out.

---

## Available Guides

| Guide | Best for | Example |
|:------|:---------|:--------|
| [LangChain]({{ site.baseurl }}/frameworks/langchain) | Backend RAG pipelines — legal, medical, financial AI | [langchain-rag-chat](https://github.com/DeepCitation/deepcitation/tree/main/examples/langchain-rag-chat) ([demo](https://langchain-rag-chat-deepcitation.vercel.app/)) |
| [Next.js App Router]({{ site.baseurl }}/frameworks/nextjs) | Full-stack apps with React Server Components + streaming | [nextjs-ai-sdk](https://github.com/DeepCitation/deepcitation/tree/main/examples/nextjs-ai-sdk) ([demo](https://nextjs-ai-sdk-deepcitation.vercel.app/)) |
| [Vercel AI SDK]({{ site.baseurl }}/frameworks/vercel-ai-sdk) | `useChat` / `streamText` apps on Vercel infrastructure | [nextjs-ai-sdk](https://github.com/DeepCitation/deepcitation/tree/main/examples/nextjs-ai-sdk) (shared with Next.js, [demo](https://nextjs-ai-sdk-deepcitation.vercel.app/)) |
| [Express.js]({{ site.baseurl }}/frameworks/express) | Node.js REST APIs with upload, chat, and verification routes | [basic-verification](https://github.com/DeepCitation/deepcitation/tree/main/examples/basic-verification) |
| [Mastra]({{ site.baseurl }}/frameworks/mastra) | Mastra RAG pipelines with TypeScript-native chunking + verification | [mastra-rag-chat](https://github.com/DeepCitation/deepcitation/tree/main/examples/mastra-rag-chat) ([demo](https://mastra-rag-deepcitation.vercel.app/)) |
| [AG-UI]({{ site.baseurl }}/frameworks/agui) | AG-UI protocol agents with SSE streaming + verification | [agui-chat](https://github.com/DeepCitation/deepcitation/tree/main/examples/agui-chat) ([demo](https://agui-chat-deepcitation.vercel.app/)) |
| [Python / FastAPI]({{ site.baseurl }}/frameworks/python) | Python backends using the REST API directly | — |

---

## How DeepCitation Fits Any Framework

DeepCitation is framework-agnostic. It adds two server-side steps around your existing LLM call:

```
[your docs] → prepareAttachments() → [enhanced prompt] → [your LLM] → verifyAttachment() → [verified output]
```

1. **Before the LLM call** — `prepareAttachments()` uploads source files and returns a `deepTextPromptPortion` string you inject into your prompt
2. **After the LLM call** — `verifyAttachment()` checks citations in the LLM's response against the source, returning visual proof

The React components (`CitationComponent`, `CitationDrawer`) are client-only and optional — they render the verification results. You can use a plain text or Slack renderer instead.
