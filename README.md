<div align="center">

# deepcitation

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
<a href="https://github.com/DeepCitation/deepcitation-js/blob/main/examples/assets/deepcitation-demo-medical.avif">
<img src="https://raw.githubusercontent.com/DeepCitation/deepcitation-js/main/examples/assets/deepcitation-demo-medical.avif" alt="DeepCitation Demo - solid underlines for verified citations, wavy red for hallucinations" width="600" />
</a>
<br/>
<em>Solid underline = verified in source. Wavy red = hallucination caught.</em>
</div>

<!-- TODO: Add before/after hero image showing the same AI output with and without DeepCitation -->
<!-- Before: Plain AI text with no way to tell what's real -->
<!-- After: Same text with green verified underlines + red wavy hallucination markers -->

## How it works

```typescript
const { verifications } = await deepcitation.verify({ llmOutput: response });
// verifications[key].status === "found"      --> AI told the truth
// verifications[key].status === "not_found"   --> hallucination caught
```

Upload a PDF. Ask your LLM a question. Get back **deterministic, visual proof** of what's real and what's fabricated -- for every single citation.

> **Proof, not detection.** Unlike hallucination detectors that flag problems after the fact, DeepCitation verifies each citation against your sources -- with visual proof you can show to users.

## 6 ways to display citations

<div align="center">
<img src="https://raw.githubusercontent.com/DeepCitation/deepcitation-js/main/tests/playwright/specs/__snapshots__/visualShowcase.spec.tsx-snapshots/desktop-showcase-chromium-linux.avif" alt="DeepCitation Component Showcase - linter, chip, brackets, text, superscript, and badge variants" width="700" />
</div>

| Variant | Style | Best for |
|---------|-------|----------|
| `linter` | Inline underlines (like a spell-checker) | Long-form content, research tools |
| `chip` | Pill badges | Chat interfaces |
| `brackets` | `[text]` with status | Technical/academic |
| `text` | Plain text with indicator | Minimal UI |
| `superscript` | Footnote style `¹` | Articles, reports |
| `badge` | Source chip with favicon | ChatGPT-style source attribution |

## Building with DeepCitation?

We're looking for design partners to showcase and help shape the future of citation verification.

**[Become a design partner →](https://github.com/DeepCitation/deepcitation-js/issues/new?labels=design-partner&template=design_partner.md)** Get early access, direct support, and influence the roadmap.

<!-- Logos will appear here as design partners join -->

## Install

```bash
npm install deepcitation
```

**Works with any LLM** -- OpenAI, Anthropic, Google, Mistral, local models, or any provider that returns text.

## What works without an API key

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

## Quick Start

```typescript
import { DeepCitation, wrapCitationPrompt } from "deepcitation";
import { CitationComponent } from "deepcitation/react";

// 1. Upload sources
const dc = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });
const { deepTextPromptPortion } = await dc.prepareFiles([
  { file: pdfBuffer, filename: "report.pdf" }
]);

// 2. Wrap prompts & call your LLM
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a helpful assistant...",
  userPrompt: "Summarize the key findings",
  deepTextPromptPortion,
});
const response = await yourLLM.chat({ system: enhancedSystemPrompt, user: enhancedUserPrompt });

// 3. Verify -- returns an object (not an array!) keyed by citation hash
const { verifications } = await dc.verify({ llmOutput: response.content });

// 4. Render
<CitationComponent citation={citation} verification={verifications[citationKey]} />
```

> **Heads up:** `verifications` is a `Record<string, Verification>` object, not an array.
> Use `Object.keys(verifications).length` to count results, not `.length`.

## Try it now

Clone a working example and have citations running in under 2 minutes:

```bash
# Next.js chat app with streaming citations
git clone https://github.com/DeepCitation/deepcitation-js.git
cd deepcitation-js/examples/nextjs-ai-sdk
cp .env.example .env.local  # add your API keys
npm install && npm run dev
```

See all examples: [basic-verification](./examples/basic-verification), [nextjs-ai-sdk](./examples/nextjs-ai-sdk), [url-example](./examples/url-example)

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
| [`CitationComponent`](https://docs.deepcitation.com) | Inline citations with 6 variants and verification popovers |
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
| Node.js | >= 18 |
| React (optional, for components) | >= 17 |
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
  const { verifications } = await dc.verify({ llmOutput: response.content });
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
  // See docs/error-handling.md for full error reference
}
```

## Observability

Connect to **Datadog, Sentry, CloudWatch, OpenTelemetry, or any logging service** via an optional logger interface:

```typescript
const dc = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY,
  logger: {
    debug: (msg, data) => console.debug(msg, data),
    info: (msg, data) => console.info(msg, data),
    warn: (msg, data) => console.warn(msg, data),
    error: (msg, data) => console.error(msg, data),
  },
});

// Or connect to your monitoring service:
// logger: {
//   info: (msg, data) => datadog.log('info', msg, data),
//   error: (msg, data) => sentry.captureException(new Error(msg), data),
// }
```

The logger receives events for: file uploads, verification requests, cache hits/misses, and errors. Default is a no-op logger.

## Development

### Running Tests

```bash
# Run unit tests
bun test

# Run Playwright component tests
npm run test:ct

# Run visual snapshot tests
npm run test:ct -- --grep "visual snapshot"
```

### Visual Snapshot Optimization

Visual test snapshots are automatically optimized to AVIF format in CI for ~50% size savings while maintaining quality:

- **Snapshots** are stored as AVIF files in `tests/playwright/specs/__snapshots__/`
- **Conversion** happens automatically in CI after tests run
- **Quality settings**: AVIF quality=60, effort=4 (good balance of compression vs quality)

#### Local Development

To convert snapshots locally after running visual tests:

```bash
# Convert PNG → AVIF and remove PNGs
node scripts/convert-snapshots-to-avif.js --remove-png

# Convert but keep original PNGs
node scripts/convert-snapshots-to-avif.js
```

**Note:** `sharp` is included in `devDependencies` and will be installed automatically with `npm install`.

#### Reverting to PNG

If you need to revert AVIF snapshots back to PNG:

1. Run tests with `--update-snapshots` (Playwright will generate PNGs)
2. Delete the corresponding AVIF files
3. Commit the PNG snapshots

Playwright supports both PNG and AVIF snapshot formats for visual regression testing.

## Go deeper

- [Full Documentation](https://docs.deepcitation.com)
- [Examples](./examples) -- Basic verification, Next.js chat app, URL citations
- [Integration Guide](./INTEGRATION.md) -- For AI coding assistants
- [Error Handling Guide](./docs/error-handling.md) -- Production error patterns
- [Styling Guide](./docs/styling.md) -- CSS custom properties and theming

## Get Involved

We're looking for design partners to help shape the future of citation verification:

- **🤝 [Become a Design Partner](https://github.com/DeepCitation/deepcitation-js/issues/new?labels=design-partner&template=design_partner.md)** -- Get early access to features, direct support, and influence the roadmap
- **🐛 [Report an Issue](https://github.com/DeepCitation/deepcitation-js/issues)** -- Found a bug or have a feature request? We'd love to hear from you
- **💬 [Join Discussions](https://github.com/DeepCitation/deepcitation-js/discussions)** -- Connect with other developers building with DeepCitation

## License

[MIT](./LICENSE)

> Hosted API/service is subject to [Terms](https://deepcitation.com/legal/terms-of-service) and [Privacy Policy](https://deepcitation.com/legal/privacy). Patent pending. "DeepCitation" is a trademark.
