<div align="center">

# DeepCitation

**Your RAG app cited page 47 -- but the doc only has 30 pages.**
**Verify every citation. Show the source. Flag what's fabricated.**

[![npm version](https://img.shields.io/npm/v/deepcitation.svg)](https://www.npmjs.com/package/deepcitation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zero Dependencies](https://img.shields.io/badge/Zero%20Dependencies-trusted-green)](https://www.npmjs.com/package/deepcitation)
[![< 25KB](https://img.shields.io/badge/gzip-<25KB-brightgreen)](https://bundlephobia.com/package/deepcitation)

[Documentation](https://docs.deepcitation.com) · [Get API Key](https://deepcitation.com/signup) · [Examples](./examples) · [Agent Integration](./INTEGRATION.md) · [Terms](https://deepcitation.com/legal/terms-of-service) · [Privacy](https://deepcitation.com/legal/privacy)

</div>

---

<div align="center">
  <img
    src="https://raw.githubusercontent.com/DeepCitation/deepcitation/main/examples/assets/hero-before-after-loop.avif"
    alt="Before-and-after DeepCitation demo showing unverified citations transforming into green verified and red fabricated markers with a proof popover."
    width="900"
  />
  <br />
  <em>Same model answer, now with citation truth status and source-backed proof.</em>
</div>

DeepCitation turns model citations into deterministic, inspectable proof.

## Install

```bash
npm install deepcitation
```

**Works with any LLM** -- OpenAI, Anthropic, Google, Mistral, local models, or any provider that returns text.

## Quick Start

```typescript
import { DeepCitation, extractVisibleText, wrapCitationPrompt } from "deepcitation";

const deepCitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY!,
});

// 1) Upload files once
const { deepTextPromptPortion } = await deepCitation.prepareAttachments([
  { file: pdfBuffer, filename: "report.pdf" },
]);

// 2) Wrap prompts before calling your model
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a helpful assistant...",
  userPrompt: "Summarize the key findings",
  deepTextPromptPortion,
});

const response = await yourLLM.chat({
  system: enhancedSystemPrompt,
  user: enhancedUserPrompt,
});

// 3) Verify citations
const { verifications } = await deepCitation.verify({ llmOutput: response.content });

// 4) Strip citation metadata before showing model text to users
const visibleText = extractVisibleText(response.content);
```

> **Heads up:** `verifications` is a `Record<string, Verification>` object, not an array.
> Use `Object.keys(verifications).length` to count results, not `.length`.

## Why DeepCitation

- Works with any LLM provider.
- Verifies citations deterministically against uploaded sources.
- Supports seven production-ready citation UI variants.
- Supports local-only extraction and rendering without an API key.

## 7 Citation Display Variants

<div align="center">
  <img
    src="https://raw.githubusercontent.com/DeepCitation/deepcitation/main/examples/assets/variants-grid-desktop.avif"
    alt="Grid view of seven DeepCitation citation display variants with labels and sample output."
    width="1000"
  />
  <br />
  <em>Use the variant that matches your UI, from chat chips to footnotes and inline linter-style underlines.</em>
</div>

| Variant | Style | Best for |
|---------|-------|----------|
| `linter` | Inline underlines (like a spell-checker) | Long-form content, research tools |
| `chip` | Pill badges | Chat interfaces |
| `brackets` | `[text]` with status | Technical/academic |
| `text` | Plain text with indicator | Minimal UI |
| `superscript` | Footnote style `¹` | Articles, reports |
| `footnote` | Clean neutral marker | Minimal footnotes |
| `badge` | Source chip with favicon | ChatGPT-style source attribution |

## Chat Example (Chip Variant)

<div align="center">
  <img
    src="https://raw.githubusercontent.com/DeepCitation/deepcitation/main/examples/assets/chip-chat-demo-loop.avif"
    alt="Chat interface demo where citation chips are clicked to show verified and fabricated outcomes."
    width="900"
  />
  <br />
  <em>Chat-native citation chips with per-citation verification state.</em>
</div>

## Inspectable Proof

<div align="center">
  <img
    src="https://raw.githubusercontent.com/DeepCitation/deepcitation/main/examples/assets/proof-popover-zoom-loop.avif"
    alt="Citation popover opening to show matched quote text and exact source location."
    width="900"
  />
  <br />
  <em>Each citation can open source-backed proof your users can inspect.</em>
</div>

## Building with DeepCitation?

We're looking for design partners to showcase and help shape the future of citation verification.

**[Become a design partner →](https://github.com/DeepCitation/deepcitation/issues/new?labels=design-partner&template=design_partner.md)** Get early access, direct support, and influence the roadmap.

## What Works Without an API Key

<div align="center">
  <img
    src="https://raw.githubusercontent.com/DeepCitation/deepcitation/main/examples/assets/api-key-boundary-diagram.png"
    alt="Two-column DeepCitation feature boundary diagram separating local capabilities from API-key-required capabilities."
    width="900"
  />
</div>

Build locally first, add verification when ready.

| Feature | API key needed? |
|---------|----------------|
| Citation extraction from LLM output | No -- fully local |
| Markdown/Slack/GitHub/HTML/Terminal rendering | No -- fully local |
| Prompt wrapping utilities | No -- fully local |
| React display components | No -- fully local |
| Source document upload & processing | **Yes** |
| Citation verification against sources | **Yes** |
| Visual proof image generation | **Yes** |

[Get a free API key](https://deepcitation.com/signup)

## Try it now

Clone a working example and have citations running in under 2 minutes:

```bash
# Next.js chat app with streaming citations
git clone https://github.com/DeepCitation/deepcitation.git
cd deepcitation/examples/nextjs-ai-sdk
cp .env.example .env.local  # add your API keys
npm install && npm run dev
```

## Examples

- [Basic Verification](./examples/basic-verification)
- [Next.js AI SDK Chat App](./examples/nextjs-ai-sdk)
- [URL Citations](./examples/url-example)

## Works with anything your users upload

PDF, DOCX, XLSX, PPTX, HTML, Images (JPG, PNG, TIFF, WebP, HEIC), URLs

## React Components

```bash
npm install deepcitation react react-dom @radix-ui/react-popover
```

> **Styling:** Requires Tailwind CSS, or import the bundled stylesheet:
> ```typescript
> import "deepcitation/styles.css";
> ```

| Component | Description |
|-----------|-------------|
| [`CitationComponent`](https://docs.deepcitation.com) | Inline citations with 7 variants and verification popovers |
| [`UrlCitationComponent`](https://docs.deepcitation.com) | URL citations with favicon and status badges |
| [`CitationDrawer`](https://docs.deepcitation.com) | ChatGPT-style bottom sheet grouping citations by source |
| [`SourcesListComponent`](https://docs.deepcitation.com) | Aggregated sources panel with stacked favicons |

### Advanced: Primitives (Experimental)

For custom layouts, composable primitives are available. API may change:

```tsx
import { Citation } from "deepcitation/react";

<Citation.Root citation={citation} verification={verification}>
  <Citation.Trigger>
    <Citation.AnchorText />
    <Citation.Indicator />
  </Citation.Trigger>
</Citation.Root>
```

## Non-React Rendering

Render citations anywhere -- no React required:

```typescript
import { renderCitationsForSlack } from "deepcitation/slack";
import { renderCitationsForGitHub } from "deepcitation/github";
import { renderCitationsAsHtml } from "deepcitation/html";
import { renderCitationsForTerminal } from "deepcitation/terminal";
```

## Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | >= 20 |
| React (optional, for components) | >= 19 |
| `@radix-ui/react-popover` (optional, for popovers) | >= 1.0 |
| Tailwind CSS (optional, or use `styles.css`) | >= 3 |
| Browser target | ES2020+ |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Error: API key is required` | Set `DEEPCITATION_API_KEY` env var or pass `apiKey` to constructor |
| `Cannot find module '@radix-ui/react-popover'` | Install it: `npm install @radix-ui/react-popover` (only needed for React components) |
| Citations not showing underlines/colors | Import `deepcitation/styles.css` or configure Tailwind |
| `getAllCitationsFromLlmOutput` returns `{}` | Check that your LLM output contains `<cite ... />` tags or deferred JSON blocks -- use `wrapCitationPrompt` to add citation instructions |
| `Object.keys(verifications).length` is 0 | Ensure the attachment was uploaded before the LLM call, and the LLM output contains citation references |

## Error Handling

```typescript
import {
  AuthenticationError,
  RateLimitError,
  NetworkError,
  ValidationError,
  ServerError,
} from "deepcitation";

try {
  const { verifications } = await deepCitation.verify({ llmOutput: response.content });
} catch (err) {
  if (err instanceof AuthenticationError) {
    // Invalid or missing API key
    console.error("Check your DEEPCITATION_API_KEY");
  } else if (err instanceof RateLimitError) {
    // Hit rate limit -- safe to retry after delay
    if (err.isRetryable) {
      await new Promise(r => setTimeout(r, 1000)); // Implement exponential backoff
      // retry verify()
    }
  } else if (err instanceof NetworkError) {
    // Network timeout or temporary failure
    if (err.isRetryable) {
      // Safe to retry
    }
  } else if (err instanceof ValidationError) {
    // Bad request (invalid citations, file format, etc.)
    console.error("Check your input format");
  } else if (err instanceof ServerError) {
    // Server error (5xx)
    if (err.isRetryable) {
      // Safe to retry
    }
  }
}
```

## Observability

Connect to **Datadog, Sentry, CloudWatch, OpenTelemetry, or any logging service** via an optional logger interface:

```typescript
const deepCitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY,
  logger: {
    debug: (msg, data) => console.debug(msg, data),
    info: (msg, data) => console.info(msg, data),
    warn: (msg, data) => console.warn(msg, data),
    error: (msg, data) => console.error(msg, data),
  },
});
```

The logger receives events for: file uploads, verification requests, cache hits/misses, and errors. Default is a no-op logger.

## Development

### Running Tests

```bash
# Run unit tests
npm test

# Run Playwright component tests
npm run test:ct

# Run visual snapshot tests
npm run test:ct -- --grep "visual snapshot"
```

## Go deeper

- [Full Documentation](https://docs.deepcitation.com)
- [Examples](./examples) -- Basic verification, Next.js chat app, URL citations
- [Integration Guide](./INTEGRATION.md) -- For AI coding assistants
- [Error Handling Guide](./docs/error-handling.md) -- Production error patterns
- [Styling Guide](./docs/styling.md) -- CSS custom properties and theming

## Community

- [Documentation](https://docs.deepcitation.com)
- [Report an Issue](https://github.com/DeepCitation/deepcitation/issues)
- [Join Discussions](https://github.com/DeepCitation/deepcitation/discussions)
- [Become a Design Partner](https://github.com/DeepCitation/deepcitation/issues/new?labels=design-partner&template=design_partner.md)

## Contributing

See [CONTRIBUTING](./docs/CONTRIBUTING.md).

## License

[MIT](./LICENSE)

> Hosted API/service is subject to [Terms](https://deepcitation.com/legal/terms-of-service) and [Privacy Policy](https://deepcitation.com/legal/privacy). Patent pending. "DeepCitation" is a trademark.
