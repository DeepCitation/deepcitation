# Package Reference

Open this file for API usage examples, package capabilities, and API endpoints.

## Package Overview

DeepCitation is a citation verification library for AI-generated content:

- citation extraction and normalization
- citation verification against attachments/URLs
- visual proof generation and rendering helpers

## Public API Examples

Main package:

```ts
import {
  wrapSystemCitationPrompt,
  wrapCitationPrompt,
  CITATION_JSON_OUTPUT_FORMAT,
  CITATION_REMINDER,
  getAllCitationsFromLlmOutput,
} from "deepcitation";
```

React package:

```ts
import {
  CitationComponent,
  SourcesListComponent,
  SourcesTrigger,
  SourcesListItem,
} from "deepcitation/react";
```

Types:

```ts
import type {
  Citation,
  CitationType,
  Verification,
  SourceType,
  CitationRecord,
  VerificationRecord,
} from "deepcitation";
```

`CitationRecord` is a `Record<string, Citation>` keyed by citation key hash.
Check emptiness via `Object.keys(citations).length === 0`.

## Capabilities Map

High-level package areas:

- `src/client`: API client and client-facing error types.
- `src/parsing`: citation parsing, normalization, status derivation.
- `src/prompts`: prompt wrappers and prompt compression.
- `src/react`: citation components, hooks, variants, UI behavior.
- `src/rendering`: Slack/GitHub/HTML/terminal rendering targets.
- `src/utils`: security and safety utilities.
- `src/types`: shared TypeScript models.

## API Endpoints

- `POST https://api.deepcitation.com/prepareAttachments`
- `POST https://api.deepcitation.com/verifyCitations`
