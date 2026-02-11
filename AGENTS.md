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

## User Goals in Citation Progressive Disclosure

Understanding WHY users interact with citations is critical for maintaining and extending the UI.
Each disclosure level serves specific user needs. When modifying or adding to the citation UX,
verify your changes serve at least one of these goals without adding cognitive load to the others.

### Level 0: Inline Indicator (No Interaction)
**"Is this real?"** — Quick trust signal at a glance.
- Green check = verified, trust the claim
- Amber check = partial match, may need investigation
- Red X = not found in source, treat with skepticism
- Spinner = still checking

All users see this. It must be instantly scannable. No interaction required.

### Level 1: Popover (First Click)
Serves four distinct user questions:

1. **"Where is this from?"** — Source attribution
   - Source name, favicon, domain, page number
   - Users need to evaluate source credibility before evaluating the claim

2. **"When was this checked?"** — Temporal validity
   - Crawl/verification timestamp
   - Critical for URLs (web content changes); important for audit trails
   - A URL verified yesterday vs six months ago has different reliability

3. **"Show me the evidence"** — Visual proof
   - Highlighted snippet image from the source document
   - Users see the actual text in situ, not just the AI's paraphrase

4. **"I need this quote"** — Content reuse
   - Copy button on anchor text
   - Researchers and writers copy exact quotes for their own work

**Design constraint:** The success state must feel clean and light. Source identity and
proof image are primary; timestamp and copy affordance are secondary (visible but not prominent).

### Level 2: Verification Log (Second Click)
**"How was this verified?"** / **"Why wasn't this found?"** — Audit trail.
- For verified: shows match type and confidence (exact vs normalized vs partial)
- For not-found: shows all search attempts, phrases tried, pages scanned
- Personas: developers debugging, compliance officers requiring audit trails

### Level 3: Full-Size Image Overlay (Click Proof Image)
**"Show me the original context"** — Deep verification.
- Full-screen view of proof image for reading actual source text
- Personas: fact-checkers, legal reviewers, academic peer reviewers

### Level 4: Citation Drawer (Separate Trigger)
**"What sources were used overall?"** — Holistic source review.
- All citations grouped by source with proof thumbnails
- Personas: editors reviewing draft quality, executives scanning report reliability

### Temporal Context Design Rules
- URL citations: show `crawledAt` as "Retrieved [date]" (web content is mutable)
- Document citations: show `verifiedAt` as "Verified [date]" (documents are stable)
- Use absolute dates, not relative ("Jan 15, 2026" not "2 days ago")
- Full ISO timestamp available on hover/title attribute for audit precision
- Date line appears as footer metadata — visible but not prominent

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
