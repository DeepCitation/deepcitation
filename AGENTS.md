# AGENTS.md

Instructions for AI coding agents working on the DeepCitation repository.

## Project Overview

DeepCitation is a citation verification library for AI-generated content. Provides citation extraction, normalization, verification against attachments, and visual proof generation.

- **Package**: `@deepcitation/deepcitation-js`
- **License**: MIT
- **Node**: >=18

## Commands

```bash
npm install        # Install dependencies
npm run build      # Build library (tsup + CSS)
npm test           # Run tests (bun test)
npm run test:ct    # Playwright component tests
npm run size       # Check bundle size
```

## Project Structure

```
src/
├── index.ts          # Main exports
├── client/           # DeepCitation API client
├── parsing/          # Citation parsing & normalization
├── prompts/          # LLM prompt utilities
├── react/            # React components (CitationComponent, etc.)
├── types/            # TypeScript types
└── utils/            # Utilities
docs/                 # Jekyll documentation (docs.deepcitation.com)
examples/             # Usage examples (nextjs-ai-sdk, basic-verification)
```

## Code Conventions

- TypeScript with strict typing
- ESM modules
- Tests colocated in `src/__tests__/`
- React components use Tailwind CSS
- Keep bundle size under limits (see size-limit in package.json)

## Important Notes

- Product name is **DeepCitation** (not "DeepCite")
- Example app models: `gpt-5-mini` (OpenAI), `gemini-2.0-flash-lite` (Google) — DO NOT CHANGE
- Always use `extractVisibleText()` before displaying LLM output to users
- The `<<<CITATION_DATA>>>` block must be stripped before showing to users

## React Component Notes

- **CitationComponent** supports `interactionMode` prop: `"eager"` (default) or `"lazy"`
  - Eager: hover shows popover, click zooms image (or toggles details if no image)
  - Lazy: hover only styles, click toggles popover, second click toggles search details
  - Use lazy mode for dense citation layouts
- **UrlCitationComponent** always opens URL on click (no config needed)
- Status indicators use `XCircleIcon` SVG for not-found states (centered, not subscript)

## API Endpoints

- `POST https://api.deepcitation.com/prepareFile` — Upload attachments
- `POST https://api.deepcitation.com/verifyCitations` — Verify citations

## Testing

```bash
npm test                    # Unit tests
npm run test:ct             # Playwright component tests
npm run test:ct:ui          # Component tests with UI
```

## Documentation

- Docs hosted at docs.deepcitation.com (Jekyll/GitHub Pages)
- For implementing DeepCitation in your project, see [INTEGRATION.md](./INTEGRATION.md)
