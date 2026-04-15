![DeepCitation cover](https://deepcitation.com/og-images/deepcitation-og-1200x630.png?v=2)


<div align="center"><strong>DeepCitation</strong></div>

<div align="center">
Stop hallucinations <br />
/verify citations
</div>


<div align="center">

[![CI](https://img.shields.io/github/actions/workflow/status/DeepCitation/deepcitation/ci.yml?style=flat-square&label=CI)](https://github.com/DeepCitation/deepcitation/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-005595?style=flat-square)](https://opensource.org/licenses/MIT)
[![Zero Dependencies](https://img.shields.io/badge/Zero%20Dependencies-trusted-005595?style=flat-square)](https://www.npmjs.com/package/deepcitation)
[![~9KB](https://img.shields.io/badge/gzip-~9KB-005595?style=flat-square)](https://bundlephobia.com/package/deepcitation)

</div>


<div align="center">

[Documentation](https://docs.deepcitation.com) · [Get API Key](https://deepcitation.com/signup) · [Examples](./examples) · [Integration Guide](./INTEGRATION.md) · [Error Handling](./docs/error-handling.md) · [Terms](https://deepcitation.com/legal/terms-of-service) · [Privacy](https://deepcitation.com/legal/privacy)

</div>

![DeepCitation demo](https://raw.githubusercontent.com/DeepCitation/deepcitation/main/examples/assets/deepcitation-demo.avif)

We believe AI citations should follow **show, don't tell**; they should prove their citations so you don't have to blindly chase them down yourself. DeepCitation replaces 'trust me' citations with a deterministic verification layer.

DeepCitation turns model citations into deterministic, inspectable proof.

## Agent Skills

The fastest way to use DeepCitation is to install the `/verify` Agent Skill and ask Claude to verify your AI claims.

```bash
npx skills add DeepCitation/skills
```

Or

1. Download [`verify.zip`](https://github.com/DeepCitation/skills/releases/download/verify-latest/verify.zip)
2. Go to [claude.ai/customize/skills](https://claude.ai/customize/skills)
3. Upload `verify.zip`

Then ask Claude to `/verify`.

## Building your own integration?

Install the package:

```sh
npm install deepcitation  # or bun add / yarn add / pnpm add
```

### Quick Start

```typescript
import { DeepCitation, extractVisibleText, wrapCitationPrompt } from "deepcitation";

const deepCitation = new DeepCitation({
  apiKey: process.env.DEEPCITATION_API_KEY,
});

// 1) Process documents 
const { deepTextPages } = await deepCitation.prepareAttachments([
  { file: pdfBuffer, filename: "report.pdf" },
]);

// 2) Wrap prompts before calling your model
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a helpful assistant...",
  userPrompt: "Summarize the key findings",
  deepTextPages,
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

> **Complete integration guide**: See **[INTEGRATION.md](./INTEGRATION.md)** for golden rules, 5 ready-to-use recipes, and common mistakes to avoid. Read **[Error Handling](./docs/error-handling.md)** for production error patterns.

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
# Quickest start — Next.js chat with Vercel AI SDK
git clone https://github.com/DeepCitation/deepcitation.git
cd deepcitation/examples/nextjs-ai-sdk
cp .env.example .env.local  # add your API keys
npm install && npm run dev
```

For RAG pipelines with LangChain.js and in-memory vector search:

```bash
cd deepcitation/examples/langchain-rag-chat
cp .env.example .env.local  # add DEEPCITATION_API_KEY + OPENAI_API_KEY
npm install && npm run dev
```

## Examples

- [Basic Verification](./examples/basic-verification)
- [LangChain RAG Chat](./examples/langchain-rag-chat) — [Live Demo](https://langchain-rag-chat-deepcitation.vercel.app/)
- [Mastra RAG Chat](./examples/mastra-rag-chat) — [Live Demo](https://mastra-rag-deepcitation.vercel.app/)
- [Next.js AI SDK Chat App](./examples/nextjs-ai-sdk) — [Live Demo](https://nextjs-ai-sdk-deepcitation.vercel.app/)
- [AG-UI Chat](./examples/agui-chat) — [Live Demo](https://agui-chat-deepcitation.vercel.app/)
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
- [Examples](./examples) -- Basic verification, LangChain RAG chat, Next.js chat app, URL citations
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
