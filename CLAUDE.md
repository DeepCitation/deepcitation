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
  wrapCitationPrompt,            // Wrap both system and user prompts
  CITATION_JSON_OUTPUT_FORMAT,   // JSON schema for structured output LLMs
  CITATION_REMINDER,             // Short reminder for reinforcement in user prompts
  getAllCitationsFromLlmOutput,  // Extract citations from LLM response text
} from "@deepcitation/deepcitation-js";

import type { CitationPosition } from "@deepcitation/deepcitation-js";
```

### React Components (from /react)
```typescript
import {
  CitationComponent,
  SourcesListComponent,
  SourcesTrigger,
  SourcesListItem,
} from "@deepcitation/deepcitation-js/react";
```

### Types
```typescript
import type {
  Citation,
  CitationType,
  Verification,
  SourceType,
} from "@deepcitation/deepcitation-js";
```

## Integration Workflow

### 1. Upload Source Files
```bash
curl -X POST https://api.deepcitation.com/prepareFile \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -F "file=@document.pdf"
```
Returns: `attachmentId`, `promptContent` with page/line IDs.

### 2. Wrap System Prompt
```typescript
import { wrapSystemCitationPrompt } from "@deepcitation/deepcitation-js";

const systemPrompt = `You are a helpful assistant...`;

// Default (append) - instructions at end of system prompt
const enhanced = wrapSystemCitationPrompt({ systemPrompt });

// Prepend - recommended for large system prompts (highest priority)
const enhanced = wrapSystemCitationPrompt({ systemPrompt, position: 'prepend' });

// Wrap - maximum emphasis (instructions at start AND reminder at end)
const enhanced = wrapSystemCitationPrompt({ systemPrompt, position: 'wrap' });
```

#### Position Options

| Position   | Description                                      | Best For                        |
|------------|--------------------------------------------------|---------------------------------|
| `'append'` | Instructions at end (default)                    | Short system prompts            |
| `'prepend'`| Instructions at start                            | Large system prompts            |
| `'wrap'`   | Full instructions at start + reminder at end     | Maximum reliability             |

#### Citation Reminders

For additional reinforcement, you can add reminders to user prompts:

```typescript
import { wrapCitationPrompt, CITATION_REMINDER } from "@deepcitation/deepcitation-js";

const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt,
  position: 'prepend',           // Instructions at start of system prompt
});

// Or manually add CITATION_REMINDER where needed
const userPromptWithReminder = `${userPrompt}\n\n${CITATION_REMINDER}`;
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
      "attachmentId": "...",
      "citations": { ... },
      "outputImageFormat": "avif"
    }
  }'
```

### 4. Display Results

The CitationComponent uses two orthogonal props:

- **`variant`**: Visual style (how it looks)
- **`content`**: What text to display

```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

// Default: brackets variant with number content → [1✓]
<CitationComponent citation={citation} verification={verification} />

// Chip with keySpan (the default content for chip) → pill badge with "Revenue Growth✓"
<CitationComponent citation={citation} verification={verification} variant="chip" />

// Chip with number → pill badge with "1✓"
<CitationComponent citation={citation} verification={verification} variant="chip" content="number" />

// Brackets with keySpan → [Revenue Growth✓]
<CitationComponent citation={citation} verification={verification} variant="brackets" content="keySpan" />

// Superscript footnote style → ¹✓
<CitationComponent citation={citation} verification={verification} variant="superscript" />

// Just the indicator → ✓
<CitationComponent citation={citation} verification={verification} content="indicator" />
```

#### Variant (Visual Style)

| Variant       | Output Example          | Description                                    |
|---------------|-------------------------|------------------------------------------------|
| `"brackets"`  | `[1✓]`                  | Square brackets, monospace (default)           |
| `"chip"`      | `Revenue Growth✓`       | Pill/badge with background color               |
| `"text"`      | `Revenue Growth✓`       | Plain text, inherits parent styling            |
| `"superscript"` | `¹✓`                  | Small raised footnote style                    |
| `"minimal"`   | `1✓`                    | Compact text with truncation                   |

#### Content (What's Displayed)

| Content       | Output Example     | Description                                    |
|---------------|--------------------|------------------------------------------------|
| `"keySpan"`   | `Revenue Growth`   | Descriptive text from citation                 |
| `"number"`    | `1`                | Citation number (defaults to "1" if missing)   |
| `"indicator"` | `✓`                | Only the status icon, no text                  |

**Default content per variant:**
- `chip` → `keySpan`
- `brackets` → `keySpan`
- `text` → `keySpan`
- `superscript` → `number`
- `minimal` → `number`

### 5. Status Indicators

The component displays different indicators based on `verification.status`:

| Status        | Indicator          | Color  | `status` values                              |
|---------------|--------------------| -------|----------------------------------------------|
| **Pending**   | Spinner ◌          | Gray   | `"pending"`, `"loading"`, or `null`/`undefined`          |
| **Verified**  | Checkmark ✓        | Green  | `"found"`, `"found_key_span_only"`, `"found_phrase_missed_value"` |
| **Partial**   | Checkmark ✓        | Amber  | `"found_on_other_page"`, `"found_on_other_line"`, `"partial_text_found"`, `"first_word_found"` |
| **Not Found** | Warning △          | Red    | `"not_found"`                                            |

```tsx
// Pending state (spinner)
<CitationComponent citation={citation} verification={null} />
<CitationComponent citation={citation} verification={{ status: "pending" }} />

// Verified state (green check)
<CitationComponent citation={citation} verification={{ status: "found" }} />

// Partial match (amber check)
<CitationComponent citation={citation} verification={{ status: "found_on_other_page" }} />

// Not found (red warning)
<CitationComponent citation={citation} verification={{ status: "not_found" }} />
```

#### Custom Indicator Rendering

```tsx
// Custom indicator rendering
<CitationComponent
  citation={citation}
  verification={verification}
  renderIndicator={(status) => status.isVerified ? <MyCheckIcon /> : null}
/>
```

### 6. Interaction Behavior

The CitationComponent has simple, predictable default behaviors:
- **Hover**: Shows popover with verification image/details
- **Click**: Opens full-size image overlay (zooms the image)
- **Escape / Click overlay**: Closes the image overlay

The popover uses a portal to render at the document body level, so it won't be clipped by parent `overflow:hidden` containers.

### 7. Styling

The component uses **Tailwind CSS** classes. Make sure your project has Tailwind configured. The component is designed to be copy/paste friendly - you can copy the component source into your project and customize as needed.

### 8. Customizing Click/Hover Behavior

**Key principle**: When you provide `onClick` in `eventHandlers` OR `behaviorConfig`, the default click behavior is disabled. Use `behaviorConfig.onClick` to implement custom click actions.

```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

// Custom click behavior (replaces default)
<CitationComponent
  citation={citation}
  verification={verification}
  behaviorConfig={{
    onClick: (context, event) => {
      // Your custom action
      console.log('Clicked:', context.citationKey);
      // Return actions to control state
      return { setImageExpanded: true };
    }
  }}
/>

// Disable all click behavior
<CitationComponent
  citation={citation}
  verification={verification}
  behaviorConfig={{ onClick: () => false }}
/>

// Custom hover callbacks (run alongside default hover behavior)
<CitationComponent
  citation={citation}
  verification={verification}
  behaviorConfig={{
    onHover: {
      onEnter: (context) => console.log('Hovering:', context.citationKey),
      onLeave: (context) => console.log('Left:', context.citationKey),
    }
  }}
/>
```

#### Behavior Types

```typescript
// Context provided to behavior handlers
interface CitationBehaviorContext {
  citation: Citation;
  citationKey: string;
  verification: Verification | null;
  isTooltipExpanded: boolean;  // Is popover currently showing (hover)?
  isImageExpanded: boolean;    // Is full-size image showing?
  hasImage: boolean;           // Is verification image available?
}

// Actions you can return from onClick
interface CitationBehaviorActions {
  setImageExpanded?: boolean | string; // Open/close image (or provide src)
}

// Config interface
interface CitationBehaviorConfig {
  onClick?: (context, event) => CitationBehaviorActions | false | void;
  onHover?: {
    onEnter?: (context) => void;
    onLeave?: (context) => void;
  };
}
```

### 9. URL-Based Citations

The Citation interface uses a `type` field to discriminate between document and URL citations:

```typescript
import type { Citation, CitationType } from "@deepcitation/deepcitation-js";

// Document citation (type: "document" or omitted - default)
const docCitation: Citation = {
  type: "document",
  attachmentId: "abc123",
  pageNumber: 5,
  lineIds: [12, 13],
  fullPhrase: "Revenue increased by 15% in Q4.",
  keySpan: "increased by 15%",
  citationNumber: 1,
};

// URL citation (type: "url")
// Note: keySpan should be a substring of fullPhrase
const urlCitation: Citation = {
  type: "url",
  url: "https://www.fitandwell.com/features/kettlebell-moves",
  domain: "fitandwell.com",
  title: "Build muscular arms and a strong upper body with these seven kettlebell moves",
  siteName: "Fit&Well",
  description: "Targets Shoulders, triceps, upper back, core...",
  faviconUrl: "https://www.fitandwell.com/favicon.ico",
  fullPhrase: "The TGU transitions and Halos require control, not brute strength.",
  keySpan: "require control, not brute strength",
  citationNumber: 1,
};

// Display with minimal variant for compact inline display
<CitationComponent
  citation={urlCitation}
  verification={verification}
  variant="minimal"
  content="indicator"
/>
```

#### Citation Fields by Type

**Common fields (both types):**
- `fullPhrase` - The full context/excerpt containing the cited information
- `keySpan` - The specific key phrase (must be substring of fullPhrase)
- `citationNumber` - Citation number for display
- `reasoning` - Why this citation was included

**Document fields (`type: "document"`):**
- `attachmentId` - Attachment ID from prepareFile
- `pageNumber` - Page number in the document
- `lineIds` - Line IDs within the page
- `selection` - Selection box coordinates

**URL fields (`type: "url"`):**
- `url` - The source URL
- `domain` - Display domain (e.g., "fitandwell.com")
- `title` - Page/article title
- `description` - Brief description/snippet
- `faviconUrl` - Favicon URL
- `sourceType` - Platform type ("video", "news", "social", etc.)
- `platform` - Platform name (e.g., "Twitch", "YouTube")
- `siteName` - Site name (e.g., "Fit&Well")
- `author` - Author name
- `publishedAt` - Publication date
- `imageUrl` - OG/social image URL
- `accessedAt` - When the source was accessed

### 10. SourcesListComponent

Display all sources in a panel/drawer at the end of content (like Gemini's "Sources" section):

```tsx
import {
  SourcesListComponent,
  SourcesTrigger,
  useSourcesList,
  sourceCitationsToListItems,
} from "@deepcitation/deepcitation-js/react";

// Basic usage with drawer (mobile-friendly)
const { sources, isOpen, setIsOpen } = useSourcesList([
  { id: "1", url: "https://twitch.tv/theo", title: "Theo - Twitch", domain: "twitch.tv" },
  { id: "2", url: "https://fitandwell.com/article", title: "Kettlebell Guide", domain: "fitandwell.com" },
]);

// Trigger button (shows stacked favicons)
<SourcesTrigger
  sources={sources}
  onClick={() => setIsOpen(true)}
  label="Sources"
/>

// Sources list drawer
<SourcesListComponent
  sources={sources}
  variant="drawer"
  isOpen={isOpen}
  onOpenChange={setIsOpen}
/>

// Or inline list
<SourcesListComponent
  sources={sources}
  variant="inline"
/>
```

#### SourcesListComponent Variants

| Variant   | Description                                    |
|-----------|------------------------------------------------|
| `"drawer"`| Bottom sheet modal (mobile-friendly, default)  |
| `"modal"` | Centered modal overlay                         |
| `"panel"` | Collapsible panel inline with content          |
| `"inline"`| Inline list without modal/container styling    |

#### SourcesListItemProps Interface

```typescript
interface SourcesListItemProps {
  id: string;           // Unique identifier
  url: string;          // Source URL
  title: string;        // Page/document title
  domain: string;       // Display domain (e.g., "Twitch", "LinkedIn")
  sourceType?: SourceType;     // Platform type for icon selection
  faviconUrl?: string;         // Custom favicon URL
  citationNumbers?: number[];  // Which citations reference this source
  verificationStatus?: "verified" | "partial" | "pending" | "failed" | "unknown";
}
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
│   ├── SourcesListComponent.tsx  # Aggregated sources list/drawer
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
