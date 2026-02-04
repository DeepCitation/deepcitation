# CLAUDE.md - DeepCitation Package

This file provides guidance to Claude Code when working with the DeepCitation npm package.

## Package Overview

DeepCitation is a citation verification and parsing library that enables AI-generated content to include verifiable references. It provides citation extraction, normalization, verification against attachments, and visual proof generation.

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
  // Record types (object dictionaries, NOT arrays)
  CitationRecord,      // Record<string, Citation> - for getAllCitationsFromLlmOutput return type
  VerificationRecord,  // Record<string, Verification> - for verification results
} from "@deepcitation/deepcitation-js";
```

## Integration Workflow

### 1. Prepare Source Content

The `/prepareFile` endpoint handles all source types with a unified API:

**Processing Times:**
- **Images/PDFs**: <1 second
- **URLs/Office files**: ~30 seconds (requires conversion)

#### Upload a File (PDF, Image)
```bash
curl -X POST https://api.deepcitation.com/prepareFile \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -F "file=@document.pdf"
```

#### Prepare a URL
```bash
curl -X POST https://api.deepcitation.com/prepareFile \
  -H "Authorization: Bearer $DEEPCITATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article"}'
```

#### Using the TypeScript Client
```typescript
import { DeepCitation } from "@deepcitation/deepcitation-js";

const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// For files (PDF, images) - fast (<1s)
const { attachmentId, deepTextPromptPortion } = await deepcitation.uploadFile(buffer, {
  filename: "document.pdf"
});

// For URLs - slower (~30s, includes conversion)
const { attachmentId, deepTextPromptPortion } = await deepcitation.prepareUrl({
  url: "https://example.com/article"
});

// For URLs - UNSAFE fast mode (<1s, extracts HTML text directly)
// WARNING: Vulnerable to hidden text, fine print, and prompt injection!
// Only use for trusted URLs where you control the content.
const { attachmentId, deepTextPromptPortion } = await deepcitation.prepareUrl({
  url: "https://your-trusted-site.com/article",
  unsafeFastUrlOutput: true,
});

// For multiple files
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([
  { file: buffer1, filename: "doc1.pdf" },
  { file: buffer2, filename: "doc2.pdf" },
]);
```

Returns: `attachmentId`, `deepTextPromptPortion` with page/line IDs.

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
import type { CitationRecord } from "@deepcitation/deepcitation-js";

const citations: CitationRecord = getAllCitationsFromLlmOutput(llmResponse);
// Returns CitationRecord (an OBJECT keyed by citationKey hash, NOT an array):
// { "a1b2c3d4e5f67890": { pageNumber: 1, lineIds: [5], fullPhrase: "..." }, ... }

// Check if empty (NOT .length!)
if (Object.keys(citations).length === 0) {
  console.log("No citations found");
}
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

// Default: linter variant with anchorText content → inline text with semantic underlines
<CitationComponent citation={citation} verification={verification} />

// Chip with anchorText (neutral gray background, status via icon) → pill badge with "Revenue Growth✓"
<CitationComponent citation={citation} verification={verification} variant="chip" />

// Chip with number → pill badge with "1✓"
<CitationComponent citation={citation} verification={verification} variant="chip" content="number" />

// Brackets with anchorText → [Revenue Growth✓]
<CitationComponent citation={citation} verification={verification} variant="brackets" content="anchorText" />

// Superscript footnote style → ¹✓
<CitationComponent citation={citation} verification={verification} variant="superscript" />

// Just the indicator → ✓
<CitationComponent citation={citation} verification={verification} content="indicator" />

// Badge variant (ChatGPT-style) → source chip with favicon + count
<CitationComponent citation={citation} verification={verification} variant="badge" />
```

#### Linter Variant

The `linter` variant displays citations as inline text with semantic underlines, similar to grammar/spell-check tools developers are familiar with. The underline style conveys verification status:

| Status      | Underline Style | Background              | Familiar From                |
|-------------|-----------------|-------------------------|------------------------------|
| **Verified**| Solid           | Hover: subtle green     | "Valid" indicator            |
| **Partial** | Dashed          | Hover: subtle amber     | "Suggestion" style           |
| **Not Found** | Wavy          | Hover: subtle red       | Spell-checker errors         |
| **Pending** | Dotted          | Hover: subtle gray      | Processing indicator         |

```tsx
// Linter variant displays inline text with underlines
<CitationComponent citation={citation} verification={verification} variant="linter" />

// Example output in paragraph context:
// "The company's <span with solid green underline>valuation is $500M</span> as of Q4."
// "The <span with wavy red underline>hiring freeze announcement</span> remains unverified."
```

**CSS Custom Properties:** The linter variant uses CSS custom properties for colors that can be overridden (defaults match Tailwind colors used elsewhere in the component):
- `--dc-linter-success`: Green color for verified (default: `#16a34a` / green-600)
- `--dc-linter-warning`: Amber color for partial matches (default: `#f59e0b` / amber-500)
- `--dc-linter-error`: Red color for not found (default: `#ef4444` / red-500)
- `--dc-linter-pending`: Gray color for pending (default: `#9ca3af` / gray-400)

**Wavy Underline Custom Property:** Non-linter variants (chip, brackets, superscript, text) use a wavy underline for "not found" status. The color can be customized:
- `--dc-wavy-underline-color`: Red color for wavy underline (default: `#ef4444` / red-500)

```css
/* Example: Customize citation colors */
:root {
  --dc-linter-success: #22c55e;      /* brighter green */
  --dc-linter-warning: #eab308;      /* yellow-500 */
  --dc-wavy-underline-color: #dc2626; /* darker red */
}
```

#### Variant (Visual Style)

| Variant       | Output Example          | Description                                    |
|---------------|-------------------------|------------------------------------------------|
| `"linter"`    | <u>Revenue Growth</u>   | Inline with semantic underlines (default)      |
| `"brackets"`  | `[1✓]`                  | Square brackets, monospace                     |
| `"chip"`      | `Revenue Growth✓`       | Pill/badge with neutral gray background        |
| `"text"`      | `Revenue Growth✓`       | Plain text, inherits parent styling            |
| `"superscript"` | `¹✓`                  | Small raised footnote style                    |
| `"badge"`     | `[favicon] Source +2✓`  | Source chip with favicon + count (ChatGPT-style) |

**Note:** All variants use status-aware hover colors (green for verified, amber for partial, red for not found, gray for pending).

#### Content (What's Displayed)

| Content       | Output Example     | Description                                    |
|---------------|--------------------|------------------------------------------------|
| `"anchorText"`   | `Revenue Growth`   | Descriptive text from citation                 |
| `"number"`    | `1`                | Citation number (defaults to "1" if missing)   |
| `"indicator"` | `✓`                | Only the status icon, no text                  |
| `"source"`    | `Wikipedia +2`     | Source name with count (for badge variant)     |

**Default content per variant:**
- `linter` → `anchorText`
- `chip` → `anchorText`
- `brackets` → `anchorText`
- `text` → `anchorText`
- `superscript` → `number`
- `badge` → `source`

### 5. Status Indicators

The component displays different indicators based on `verification.status`:

| Status        | Indicator          | Color  | `status` values                              |
|---------------|--------------------| -------|----------------------------------------------|
| **Pending**   | Spinner ◌          | Gray   | `"pending"`, `"loading"`, or `null`/`undefined`          |
| **Verified**  | Checkmark ✓        | Green  | `"found"`, `"found_anchor_text_only"`, `"found_phrase_missed_anchor_text"` |
| **Partial**   | Checkmark ✓        | Amber  | `"found_on_other_page"`, `"found_on_other_line"`, `"partial_text_found"`, `"first_word_found"` |
| **Not Found** | X in circle ⊗      | Red    | `"not_found"`                                            |

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
- **Hover**: Style effects only (underline/highlight changes)
- **First Click**: Shows popover with verification details and image
- **Second Click**: Toggles search details expansion within the popover
- **Click Outside / Escape**: Closes the popover

The popover uses a portal to render at the document body level, so it won't be clipped by parent `overflow:hidden` containers.

```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

// Standard usage - click to open popover, click again to expand search details
<CitationComponent
  citation={citation}
  verification={verification}
/>
```

| Action | Behavior |
|--------|----------|
| Hover | Style effects only (no popover) |
| First Click | Opens popover with verification details |
| Second Click | Toggles search details section |
| Click Outside | Closes popover |

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

### 9. Custom Source Labels

The `sourceLabel` prop allows you to override the filename or URL title displayed in the citation popover header. This is useful when you want to show a more user-friendly name instead of the raw filename or URL.

**Important:** The citation and verification objects only store the *original* filename from when the document was uploaded. If users rename their files in your application, you must use `sourceLabel` to display the updated name - the verification system has no way to know about filename changes.

```tsx
import { CitationComponent } from "@deepcitation/deepcitation-js/react";

// Document citation with custom source label
// Shows "Q4 Financial Report" instead of "report_q4_2024_final.pdf"
<CitationComponent
  citation={documentCitation}
  verification={verification}
  sourceLabel="Q4 Financial Report"
/>

// URL citation with custom source label
// Shows "Official API Documentation" instead of "developer.example.com/api/v2/reference"
<CitationComponent
  citation={urlCitation}
  verification={verification}
  sourceLabel="Official API Documentation"
/>

// Common pattern: Use your app's current filename, not the original upload name
<CitationComponent
  citation={citation}
  verification={verification}
  sourceLabel={attachment.displayName} // Your app's current name for this file
/>
```

**Behavior by citation type:**
- **Document citations**: The `sourceLabel` overrides `verification.label` (the original filename) in the popover header
- **URL citations**: The `sourceLabel` overrides the URL/domain display in the popover header

When `sourceLabel` is not provided, the component falls back to:
- Document citations: Shows `verification.label` (original filename) if available, otherwise nothing
- URL citations: Shows the URL domain/path

**When to use `sourceLabel`:**
- User has renamed a file after uploading it
- You want to show a friendly display name instead of technical filename
- The original filename is cryptic (e.g., `doc_abc123.pdf`) but you have a better title
- You're aggregating citations from multiple sources and want consistent naming

### 10. URL-Based Citations

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
  anchorText: "increased by 15%",
  citationNumber: 1,
};

// URL citation (type: "url")
// Note: anchorText should be a substring of fullPhrase
const urlCitation: Citation = {
  type: "url",
  url: "https://www.fitandwell.com/features/kettlebell-moves",
  domain: "fitandwell.com",
  title: "Build muscular arms and a strong upper body with these seven kettlebell moves",
  siteName: "Fit&Well",
  description: "Targets Shoulders, triceps, upper back, core...",
  faviconUrl: "https://www.fitandwell.com/favicon.ico",
  fullPhrase: "The TGU transitions and Halos require control, not brute strength.",
  anchorText: "require control, not brute strength",
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
- `anchorText` - The specific anchor text (must be substring of fullPhrase)
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

### 11. UrlCitationComponent

Display URL citations with a clean badge design, status indicators, and favicon:

```tsx
import { UrlCitationComponent } from "@deepcitation/deepcitation-js/react";

// Default: badge variant with favicon and checkmark → stripe.com/docs ✓
<UrlCitationComponent
  urlMeta={{
    url: "https://stripe.com/docs/api",
    fetchStatus: "verified",
  }}
/>

// Chip variant → pill style
<UrlCitationComponent
  urlMeta={{ url: "https://example.com", fetchStatus: "verified" }}
  variant="chip"
/>

// Inline variant → underlined link
<UrlCitationComponent
  urlMeta={{ url: "https://example.com", fetchStatus: "pending" }}
  variant="inline"
/>
```

#### UrlCitationComponent Variants

| Variant   | Description                                              |
|-----------|----------------------------------------------------------|
| `"badge"` | Clean bordered badge with favicon (default)              |
| `"chip"`  | Pill/badge style with background color                   |
| `"inline"`| Underlined inline link                                   |
| `"bracket"`| [text✓] with square brackets                            |

#### Status Indicators

| Status      | Indicator        | Color  | Description                     |
|-------------|------------------|--------|---------------------------------|
| Verified    | Checkmark ✓      | Green  | URL content verified            |
| Partial     | Checkmark ✓      | Amber  | Partial match found             |
| Pending     | Pulsing dot ◌    | Gray   | Verification in progress        |
| Blocked     | Lock icon 🔒     | Amber  | Paywall, login, or geo-blocked  |
| Error       | X icon ✕         | Red    | Not found, timeout, or error    |

#### UrlCitationMeta Interface

```typescript
interface UrlCitationMeta {
  url: string;                    // The source URL
  fetchStatus: UrlFetchStatus;    // Verification/fetch status
  domain?: string;                // Display domain
  title?: string;                 // Page title
  faviconUrl?: string;            // Custom favicon URL
  errorMessage?: string;          // Error details for display
}

type UrlFetchStatus =
  | "verified" | "partial" | "pending"
  | "blocked_paywall" | "blocked_login" | "blocked_geo"
  | "error_not_found" | "error_timeout" | "error_server"
  | "unknown";
```

### 12. SourcesListComponent

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

- `POST https://api.deepcitation.com/prepareFile` - Upload and process attachments
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

## Important: Internal vs External Data

### Line IDs are Internal Only

**Do NOT expose `lineIds` to end users.** Line IDs are internal identifiers used by the verification system and do not correspond directly to visible line numbers in documents. Displaying them would cause confusion.

- **Internal use**: `lineIds` are used for verification matching and are stored in `Citation.lineIds`
- **User-facing display**: Show only `pageNumber` (e.g., "Page 3") - never show line IDs
- **Markdown output**: Reference sections should show page numbers only, not lines
- **API responses**: `lineIds` may be present in verification responses but should not be surfaced in UI

```typescript
// WRONG - exposes internal line IDs
`Page 3, Lines 12-15`  // ❌ Confusing - these aren't visible line numbers

// CORRECT - page number only
`Page 3`  // ✓ Clear and verifiable
```

When building user-facing features (markdown export, reference sections, tooltips), always use `pageNumber` and omit `lineIds`.
