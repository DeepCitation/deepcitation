---
layout: default
title: Getting Started
nav_order: 2
description: "Installation and quick start guide for DeepCitation"
has_children: true
commit_sha: "80dfecd"
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

Parse numeric `[N]` markers via `parseCitationResponse`, map to citation keys, and render inline with verification status.

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

### Import Styles

If you use React components from `deepcitation/react`, you must also import the stylesheet.

**With Tailwind CSS v4** — add to your main CSS file (e.g. `globals.css`):

```css
@import "tailwindcss";
@import "deepcitation/tailwind.css";
```

**Without Tailwind** — import the pre-built stylesheet in your JS/TS entry point:

```typescript
import "deepcitation/styles.css";
```

See [Styling]({{ site.baseurl }}/styling/) for CSS custom properties and theming options.

---

## Quick Test (No LLM Required)

Verify that your API key works by uploading a document and verifying a citation — no LLM provider needed:

```bash
# 1. Upload a document
curl -X POST "https://api.deepcitation.com/prepareAttachments" \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -F "file=@your-document.pdf"

# Response includes attachmentId and deepTextPromptPortion
# Copy the attachmentId from the response

# 2. Verify a citation against it
curl -X POST "https://api.deepcitation.com/verifyCitations" \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "attachmentId": "PASTE_ATTACHMENT_ID_HERE",
      "citations": {
        "test-1": {
          "fullPhrase": "paste a sentence from your document here"
        }
      }
    }
  }'

# Expected: { "verifications": { "test-1": { "searchState": { "status": "found" }, ... } } }
```

{: .note }
This isolates DeepCitation's verification — you can confirm it works before integrating with an LLM. See the [Curl Guide]({{ site.baseurl }}/curl-guide/) for more examples.

---

## Full Integration Example

```typescript
import { DeepCitation, wrapCitationPrompt, getAllCitationsFromLlmOutput } from "deepcitation";

const dc = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY, // must start with "sk-dc-" (≥20 chars)
  // maxRetries: 3,        // retries for transient network failures (default: 3)
  // requestSource: "my-app", // optional tag identifying request origin
  // onLatestVersion: (v) => console.log(`New SDK version available: ${v}`),
});

// 1. Prepare your source document
const { fileDataParts, deepTextPromptPortion } = await dc.prepareAttachments([
  { file: pdfBuffer, filename: "report.pdf" },
]);
const attachmentId = fileDataParts[0].attachmentId;

// 2. Wrap your prompts with citation instructions
const systemPrompt = "You are a helpful assistant that cites sources.";

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt,
  deepTextPromptPortion,
});

// 3. Call your LLM
const response = await yourLLM.chat({
  messages: [
    { role: "system", content: enhancedSystemPrompt },
    { role: "user", content: enhancedUserPrompt },
  ],
});

// 4. Extract and verify citations
const citations = getAllCitationsFromLlmOutput(response.content);
const { verifications } = await dc.verifyAttachment(attachmentId, citations);

// 5. Use verification results
for (const [key, result] of Object.entries(verifications)) {
  console.log(`Citation ${key}: ${result.status}`);
  if (result.evidence?.src) {
    // Display visual proof to users
  }
}
```

### Section 3: Render (React)

Use a remark plugin to replace `[N]` markers inline — this preserves markdown formatting (bold, lists, headers) that splitting on markers would break.

{: .note }
This requires `react-markdown`, `remark-gfm`, and `unist-util-visit`. Install them with: `npm install react-markdown remark-gfm unist-util-visit`

{% raw %}
```tsx
import { parseCitationResponse } from "deepcitation";
import { CitationComponent } from "deepcitation/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit, CONTINUE } from "unist-util-visit";

// Remark plugin — replaces [N] text with custom AST nodes
const MARKER_RE = /(\[\d+\])/g;
function remarkCitationMarkers() {
  return (tree: any) => {
    visit(tree, "text", (node: any, index: any, parent: any) => {
      if (index == null || !parent || !node.value) return;
      const parts = node.value.split(MARKER_RE);
      if (parts.length <= 1) return;
      const newNodes = parts.filter(Boolean).map((part: string) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (m) return { type: "citation-marker", data: { hName: "citation-marker", hProperties: { n: m[1] } } };
        return { type: "text", value: part };
      });
      parent.children.splice(index, 1, ...newNodes);
      return [CONTINUE, index + newNodes.length];
    });
  };
}

// Render LLM output with inline CitationComponents
function RenderWithCitations({ content, verifications }) {
  const result = parseCitationResponse(content);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkCitationMarkers]}
      components={{
        "citation-marker": ({ n }) => {
          const key = result.markerMap[Number(n)];
          const citation = key ? result.citations[key] : null;
          if (!key || !citation) return <sup>[{n}]</sup>;
          return <CitationComponent citation={citation} verification={verifications[key]} />;
        },
      }}
    >
      {result.visibleText}
    </ReactMarkdown>
  );
}
```
{% endraw %}

See the [Next.js guide]({{ site.baseurl }}/frameworks/nextjs/#pattern-3-rendering-citations-client-side) or the [Vercel AI SDK guide]({{ site.baseurl }}/frameworks/vercel-ai-sdk/#rendering-citationcomponent) for framework-specific patterns.

---

## Authentication

Include your API key in the Authorization header:

```
Authorization: Bearer sk-dc-YOUR_API_KEY
```

API keys must start with `sk-dc-` and be at least 20 characters long. The SDK validates this on construction and throws an `AuthenticationError` if the format is invalid.

Get your API key from the [API Keys Page](https://deepcitation.com/signup).

---

## Base URL

All API endpoints are available at:

```
https://api.deepcitation.com
```

{: .note }
The SDK handles API routing automatically. You only need to configure your API key. If you provide a custom `apiUrl`, it must use HTTPS (except `http://localhost` for local development).

---

## Supported File Types

| Type | Formats |
|:-----|:--------|
| PDFs | `.pdf` |
| Images | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` (auto-OCR) |
| Audio | `.mp3`, `.wav`, `.m4a`, `.ogg` and other audio formats (auto-transcribed) |
| Video | `.mp4`, `.webm`, `.mov` and other video formats (auto-transcribed) |
| Office Docs | Word, Excel, PowerPoint, Google Docs |
| URLs | Web pages via `prepareUrl` endpoint |

---

## Troubleshooting

{: .note }
Having issues? Error objects include a `docUrl` property linking to relevant documentation (e.g. `https://docs.deepcitation.com/errors#AUTH_INVALID_KEY`). Check [Common Mistakes]({{ site.baseurl }}/error-handling/#common-mistakes) for the most frequent integration problems (unstyled citations, unexpected `not_found` results, exposed API keys).

---

## Next Steps

- [API Reference]({{ site.baseurl }}/api-reference/) - Learn about the REST API endpoints
- [Components]({{ site.baseurl }}/components/) - Display citations with React components
- [Code Examples]({{ site.baseurl }}/code-examples/) - See more integration patterns
- [Error Handling]({{ site.baseurl }}/error-handling/) - Production error patterns and retry logic
- [Styling]({{ site.baseurl }}/styling/) - CSS customization and theming
