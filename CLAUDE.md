# CLAUDE.md - DeepCitation Package

This file provides guidance to Claude Code when working with the DeepCitation npm package.

## Package Overview

DeepCitation is a citation verification and parsing library that enables AI-generated content to include verifiable references. It provides citation extraction, normalization, verification against source documents, and visual proof generation.

## NPM Package

- **Package Name**: `@deepcitation/deepcitation-js`
- **Registry**: npm public registry
- **Version Strategy**: Semantic versioning
- **License**: MIT
- **Repository**: https://github.com/deepcitation/deepcitation-js

### Installation
```bash
npm install @deepcitation/deepcitation-js
# or
yarn add @deepcitation/deepcitation-js
# or
bun add @deepcitation/deepcitation-js
```

## Key Exports

### Core Functions (from main entry)
```typescript
import {
  wrapSystemCitationPrompt,      // Wrap LLM system prompts with citation instructions
  CITATION_JSON_OUTPUT_FORMAT,   // JSON schema for structured output LLMs
  getAllCitationsFromLlmOutput,  // Extract citations from LLM response text
} from "@deepcitation/deepcitation-js";
```

### React Components (from /react)
```typescript
import { CitationComponent } from "@deepcitation/deepcitation-js/react";
```

### Types
```typescript
import type { Citation, Verification } from "@deepcitation/deepcitation-js";
```

## Integration Workflow

### 1. Upload Source Files
```bash
curl -X POST https://api.deepcitation.com/prepareFile \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -F "file=@document.pdf"
```
Returns: `fileId`, `promptContent` with page/line IDs.

### 2. Wrap System Prompt
```typescript
import { wrapSystemCitationPrompt } from "@deepcitation/deepcitation-js";

const systemPrompt = `You are a helpful assistant...`;
const enhanced = wrapSystemCitationPrompt({ systemPrompt });
```

For structured JSON output:
```typescript
import { CITATION_JSON_OUTPUT_FORMAT } from "@deepcitation/deepcitation-js";

const responseFormat = {
  type: "json_schema",
  json_schema: {
    schema: {
      properties: {
        citation: CITATION_JSON_OUTPUT_FORMAT,
      }
    }
  }
};
```

### 3. Extract & Verify Citations
```typescript
import { getAllCitationsFromLlmOutput } from "@deepcitation/deepcitation-js";

const citations = getAllCitationsFromLlmOutput(llmResponse);
// Returns: { "1": { pageNumber: 1, lineId: "1", fullPhrase: "..." }, ... }
```

```bash
curl -X POST https://api.deepcitation.com/verifyCitations \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "fileId": "...",
      "citations": { ... },
      "outputImageFormat": "avif"
    }
  }'
```

### 4. Display Results
```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

// Default: shows keySpan in brackets [keySpan✓]
<CitationComponent
  citation={citation}
  verification={verification}
/>

// Numeric only: shows just citation number [1✓]
<CitationComponent
  citation={citation}
  verification={verification}
  displayKeySpan={false}
/>

// Without brackets: shows keySpan without brackets
<CitationComponent
  citation={citation}
  verification={verification}
  displayBrackets={false}
/>
```

## API Endpoints

- `POST https://api.deepcitation.com/prepareFile` - Upload and process source documents
- `POST https://api.deepcitation.com/verifyCitations` - Verify citations against source


## Package Structure

```
src/
├── index.ts              # Main exports
├── client/               # DeepCitation client
├── parsing/              # Citation parsing & normalization
│   ├── parseCitation.ts
│   ├── normalizeCitation.ts
│   └── parseWorkAround.ts
├── prompts/              # LLM prompt utilities
│   ├── citationPrompts.ts
│   └── promptCompression.ts
├── react/                # React components
│   ├── index.ts
│   ├── CitationComponent.tsx
│   ├── CitationVariants.tsx
│   └── UrlCitationComponent.tsx
├── types/                # TypeScript types
│   ├── citation.ts
│   ├── verification.ts
│   ├── boxes.ts
│   └── search.ts
└── utils/                # Utilities
    └── sha.ts
```

## Example App Models

The Next.js example uses these models (DO NOT CHANGE):
- **OpenAI**: `gpt-5-mini`
- **Google**: `gemini-2.0-flash-lite`

## Common Issues & Solutions

### API Key Issues
- Store in environment variables (`DEEPCITATION_API_KEY`)
- Never commit to version control
- Rotate keys regularly

### File Upload Limits
- Check file size before upload
- Implement chunked upload for large files
- Handle timeout errors gracefully

### Citation Parsing
- Normalize citation formats
- Handle multiple citation styles
- Preserve original formatting
