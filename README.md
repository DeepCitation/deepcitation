![DeepCitation cover](https://deepcitation.com/og-images/deepcitation-og-1200x630.png)


<div align="center"><strong>DeepCitation</strong></div>

<div align="center">
Build Trusted AI Products. <br />
Show proof for every AI citation.
</div>


<div align="center">

[![CI](https://img.shields.io/github/actions/workflow/status/DeepCitation/deepcitation/ci.yml?style=flat-square&label=CI)](https://github.com/DeepCitation/deepcitation/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-005595?style=flat-square)](https://opensource.org/licenses/MIT)
[![Zero Dependencies](https://img.shields.io/badge/Zero%20Dependencies-trusted-005595?style=flat-square)](https://www.npmjs.com/package/deepcitation)
[![~17KB](https://img.shields.io/badge/gzip-~17KB-005595?style=flat-square)](https://bundlephobia.com/package/deepcitation)

</div>


<div align="center">

[Documentation](https://docs.deepcitation.com) · [Get API Key](https://deepcitation.com/signup) · [Examples](./examples) · [Agent Integration](./INTEGRATION.md) · [Terms](https://deepcitation.com/legal/terms-of-service) · [Privacy](https://deepcitation.com/legal/privacy)

</div>

![DeepCitation demo](https://raw.githubusercontent.com/DeepCitation/deepcitation/main/examples/assets/deepcitation-demo.avif)

We believe AI citations should follow **show, don't tell**; they should prove their citations so you don't have to blindly chase them down yourself. DeepCitation replaces 'trust me' citations with a deterministic verification layer.

DeepCitation turns model citations into deterministic, inspectable proof.

## Install

```sh
npm install deepcitation  # or bun add / yarn add / pnpm add
```

## Quick Start

```typescript
import { DeepCitation, extractVisibleText, wrapCitationPrompt } from "deepcitation";

const deepCitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY,
});

// 1) Process documents 
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
// IMPORTANT: 'verifications' is a Record<string, Verification> (object map, not an array).
// Use Object.keys(verifications).length to count results, not .length.

// 4) Strip citation metadata before showing model text to users
const visibleText = extractVisibleText(response.content);
```



## Components

A set of high-quality React components to help you build production-ready attribution systems. Skip the complexity of reading multiple file formats, rendering multiple formats, coordinate mapping, and visual proof generation.

- [Citation](https://github.com/DeepCitation/deepcitation/tree/main/src/react/Citation.tsx)
- [CitationDrawer](https://github.com/DeepCitation/deepcitation/tree/main/src/react/CitationDrawer.tsx)


## Support

**Works with any LLM** -- OpenAI, Anthropic, Google, AI SDK, local models, or any leading model.

| <picture><source media="(prefers-color-scheme: dark)" srcset="https://deepcitation.com/logos/color/openai.svg"><img src="https://deepcitation.com/logos/openai.svg" width="32" height="32" alt="OpenAI logo"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="https://deepcitation.com/logos/color/anthropic.svg"><img src="https://deepcitation.com/logos/anthropic.svg" width="32" height="32" alt="Anthropic logo"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="https://deepcitation.com/logos/color/google.svg"><img src="https://deepcitation.com/logos/google.svg" width="32" height="32" alt="Google Gemini logo"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/DeepCitation/deepcitation/main/docs/assets/vercel-white.svg"><img src="https://deepcitation.com/logos/vercel.svg" width="32" height="32" alt="Vercel AI SDK logo"></picture> |
| --- | --- | --- | --- |
| OpenAI ✔ | Anthropic ✔ | Gemini ✔ | AI SDK ✔ |

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
