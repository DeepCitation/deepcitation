---
layout: default
title: Code Examples
nav_order: 5
description: "SDK usage examples and integration patterns"
has_children: true
commit_sha: "4a2c083"
stale_after_commits: 20
watch_paths:
  - src/index.ts
  - src/client/DeepCitation.ts
  - src/prompts/citationPrompts.ts
---

# Code Examples

Common integration patterns and code examples for DeepCitation.

---

## Runnable Examples

Complete, runnable apps you can clone and run locally. Each example includes setup instructions and environment configuration.

| Example | Description | Best For | Demo |
|:--------|:------------|:---------|:-----|
| [basic-verification](https://github.com/DeepCitation/deepcitation/tree/main/examples/basic-verification) | Core 3-step workflow with OpenAI/Anthropic | Learning the basics, quick integration | — |
| [langchain-rag-chat](https://github.com/DeepCitation/deepcitation/tree/main/examples/langchain-rag-chat) | Next.js + LangChain.js RAG app with verification | RAG pipelines, retrieval + proof UI | [Live Demo](https://langchain-rag-chat-deepcitation.vercel.app/) |
| [mastra-rag-chat](https://github.com/DeepCitation/deepcitation/tree/main/examples/mastra-rag-chat) | Next.js + Mastra RAG app with verification | Mastra framework, TypeScript-native RAG | [Live Demo](https://mastra-rag-deepcitation.vercel.app/) |
| [nextjs-ai-sdk](https://github.com/DeepCitation/deepcitation/tree/main/examples/nextjs-ai-sdk) | Next.js chat app with Vercel AI SDK streaming | Full-stack apps, streaming UI | [Live Demo](https://nextjs-ai-sdk-deepcitation.vercel.app/) |
| [agui-chat](https://github.com/DeepCitation/deepcitation/tree/main/examples/agui-chat) | AG-UI protocol chat with SSE streaming | AG-UI integration, protocol-level control | [Live Demo](https://agui-chat-deepcitation.vercel.app/) |
| [static-html](https://github.com/DeepCitation/deepcitation/tree/main/examples/static-html) | CDN popover in plain HTML, no build step | Static sites, CDN integration | — |

### Quick Start

```bash
# Clone the repo
git clone https://github.com/DeepCitation/deepcitation.git
cd deepcitation/examples

# Choose an example
cd basic-verification  # or nextjs-ai-sdk, langchain-rag-chat, etc.

# Install and run
npm install
cp .env.example .env   # Add your API keys
npm start
```

{: .note }
All examples require a free DeepCitation API key from [deepcitation.com/signup](https://deepcitation.com/signup). Some examples also require an OpenAI or Anthropic key.

---

## Multi-File Workflow

Work with multiple documents and verify citations across files:

```typescript
import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
  groupCitationsByAttachmentId
} from "deepcitation";

const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// 1. Upload multiple documents
const { fileDataParts, deepTextPagesByAttachmentId } = await deepcitation.prepareAttachments([
  { file: contractPdf, filename: "contract.pdf" },
  { file: invoicePdf, filename: "invoice.pdf" },
]);

// 2. Wrap prompts with the per-attachment raw page map
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a document analyst that cites sources.",
  userPrompt: "Compare the contract terms with the invoice amounts.",
  deepTextPagesByAttachmentId,
});

// 3. Call your LLM
const response = await yourLLM.chat({
  messages: [
    { role: "system", content: enhancedSystemPrompt },
    { role: "user", content: enhancedUserPrompt },
  ]
});

// 4. Group and verify citations by attachment
const citations = getAllCitationsFromLlmOutput(response.content);
const citationsByAttachment = groupCitationsByAttachmentId(citations);

// Verify in parallel for each attachment
const verificationPromises = [];
for (const [attachmentId, attachmentCitations] of citationsByAttachment) {
  verificationPromises.push(deepcitation.verifyAttachment(attachmentId, attachmentCitations));
}
const results = await Promise.all(verificationPromises);
```

---

## React Component

{: .important }
Requires CSS setup. Add `@import "deepcitation/tailwind.css"` to your CSS (Tailwind v4) or `import "deepcitation/styles.css"` in JS. See [Styling]({{ site.baseurl }}/styling/).

Use the React component to display verified citations with hover tooltips showing visual proof:

```tsx
import { CitationComponent } from "deepcitation/react";

function VerifiedResponse({ citations, verifications }) {
  return (
    <div>
      <p>
        According to the report, revenue grew by{" "}
        <CitationComponent
          citation={citations["1"]}
          verification={verifications["1"]}
        />
        this quarter, while{" "}
        <CitationComponent
          citation={citations["2"]}
          verification={verifications["2"]}
        />
        .
      </p>
    </div>
  );
}
```

---

## Display Variants

Choose from different display variants to match your UI design:

{% raw %}
```tsx
import { CitationComponent } from "deepcitation/react";

// Brackets variant (default) - [sourceMatch] with square brackets
<CitationComponent
  citation={{ citationNumber: 1, sourceMatch: "25% growth" }}
  verification={verification}
  variant="brackets"
/>
// Renders: [25% growth]

// Chip variant - pill/badge style with background color
<CitationComponent
  citation={{ citationNumber: 1, sourceMatch: "Revenue Growth" }}
  verification={verification}
  variant="chip"
/>
// Renders: Revenue Growth (styled pill)

// Text variant - plain text, inherits parent styling
<CitationComponent
  citation={{ citationNumber: 1, sourceMatch: "25% growth" }}
  verification={verification}
  variant="text"
/>
// Renders: 25% growth

// Superscript variant - small raised text like footnotes
<CitationComponent
  citation={{ citationNumber: 1 }}
  verification={verification}
  variant="superscript"
/>
// Renders: ¹

// Linter variant (default) - semantic underlines based on status
<CitationComponent
  citation={{ citationNumber: 1, sourceMatch: "Revenue Growth" }}
  verification={verification}
  variant="linter"
/>
// Renders: Revenue Growth with colored underline

// Badge variant - badge/pill style with name + count
<CitationComponent
  citation={{ citationNumber: 1, sourceName: "Wikipedia" }}
  verification={verification}
  variant="badge"
  additionalCount={2}
/>
// Renders: Wikipedia +2

// Controlling content separately from variant
// Use content prop to override what text is displayed:
// - "sourceMatch": Descriptive text (default for linter, chip, brackets, text)
// - "number": Citation number (default for superscript and footnote)
// - "indicator": Only the status icon, no text
// - "source": Source name (default for badge variant)

<CitationComponent
  citation={{ citationNumber: 1, sourceMatch: "Revenue Growth" }}
  verification={verification}
  variant="brackets"
  content="number"  // Override to show number instead of sourceMatch
/>
// Renders: [1] instead of [Revenue Growth]
```
{% endraw %}

---

## Popover Options

Control the verification popover position or hide it entirely:

```tsx
import { CitationComponent } from "deepcitation/react";

// Default popover position (top)
<CitationComponent
  citation={citation}
  verification={verification}
  popoverPosition="top"
/>

// Popover at bottom
<CitationComponent
  citation={citation}
  verification={verification}
  popoverPosition="bottom"
/>

// Hidden popover (no hover preview)
<CitationComponent
  citation={citation}
  verification={verification}
  popoverPosition="hidden"
/>
```

---

## Event Handlers

Add custom click and hover handlers for interactive citations:

{% raw %}
```tsx
import { CitationComponent } from "deepcitation/react";

<CitationComponent
  citation={citation}
  verification={verification}
  eventHandlers={{
    onClick: (citation, key, event) => {
      console.log("Citation clicked:", key);
      // Navigate to source, open modal, etc.
    },
    onMouseEnter: (citation, key) => {
      console.log("Hovering:", key);
    },
    onMouseLeave: (citation, key) => {
      console.log("Left:", key);
    },
  }}
/>
```
{% endraw %}

---

## Error Handling

Use structured error classes instead of string matching:

```typescript
import {
  AuthenticationError,
  RateLimitError,
  ValidationError,
  ServerError,
  NetworkError,
} from "deepcitation";

try {
  const result = await deepcitation.verifyAttachment(attachmentId, citations);
  // Handle success
} catch (err) {
  if (err instanceof AuthenticationError) {
    // Invalid or expired API key (401/403) — fix the key
  } else if (err instanceof RateLimitError) {
    // Rate limit exceeded (429) — retry after delay
  } else if (err instanceof ValidationError) {
    // Bad input: invalid format, not found, file too large (400/404/413)
  } else if (err instanceof ServerError) {
    // API error (5xx) — safe to retry with backoff
  } else if (err instanceof NetworkError) {
    // Network failure — safe to retry with backoff
  }
}
```

{: .note }
See [Error Handling]({{ site.baseurl }}/error-handling/) for retry patterns with exponential backoff, `isRetryable` flags, and the full error class reference.

---

## Next Steps

- [Framework Guides]({{ site.baseurl }}/frameworks/) — LangChain, Next.js, Vercel AI SDK, Express with runnable examples
- [Components]({{ site.baseurl }}/components/) — Full CitationComponent documentation
- [Types]({{ site.baseurl }}/types/) — TypeScript interface definitions
