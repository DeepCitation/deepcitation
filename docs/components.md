---
layout: default
title: Components
nav_order: 7
description: "React CitationComponent documentation"
commit_sha: "80dfecd"
stale_after_commits: 15
watch_paths:
  - src/react/Citation.tsx
  - src/react/index.ts
  - src/react/DefaultPopoverContent.tsx
  - src/react/SourcesListComponent.tsx
  - src/react/DeepCitationTheme.tsx
---

# CitationComponent

Display verified citations with status indicators and interactive popovers.

{: .note }
See all variants and verification states interactively at [deepcitation.com](https://deepcitation.com).

---

## Which Component Should I Use?

| Use case | Component | Variant | Why |
|:---------|:----------|:--------|:----|
| **Chat messages** (inline citations) | `CitationComponent` | `chip` or `superscript` | Compact, fits within flowing text |
| **Articles / reports** | `CitationComponent` | `footnote` or `brackets` | Academic feel, familiar to readers |
| **Code/technical docs** | `CitationComponent` | `linter` | Underline style like IDE diagnostics |
| **Minimal / clean UI** | `CitationComponent` | `text` or `badge` | Subtle, doesn't dominate the content |
| **ChatGPT-style bottom sheet** | `CitationDrawer` | — | Full verification details in a slide-up panel |
| **References section** | `SourcesListComponent` | — | Anthropic-style aggregated citation list at the end |
| **Search results** | `UrlCitationComponent` | — | URL citations with favicon and domain display |

Start with `CitationComponent` using the `chip` variant — it works for most use cases. Switch variants or components as your UI matures.

---

## Key Concepts

{: .note }
Citations have **four distinct states**, each with its own color and indicator.

| State | Color | Indicator | Meaning |
|:------|:------|:----------|:--------|
| **Verified** | Green (`--dc-verified`) | ✓ checkmark | Exact match found in source |
| **Partial** | Amber (`--dc-partial`) | * asterisk | Found but not an exact match |
| **Not Found** | Red (`--dc-destructive`) | ✗ x-mark | Citation not found in source |
| **Pending** | Gray (subtle) | Spinner | Verification still in progress |

How these colors apply depends on the variant. For example, the **linter** variant uses underline styles (solid green, dashed amber, wavy red, dotted gray) while the **chip** variant uses background, border, and text colors.

---

## Installation

```bash
npm install deepcitation
```

Then import the component and stylesheet:

```typescript
import { CitationComponent } from "deepcitation/react";
```

{: .note }
All `deepcitation/react` exports are marked with `"use client"`, making them safe to import from React Server Components (RSC) without additional wrappers.

{: .important }
You must also import the stylesheet. With Tailwind v4, add `@import "deepcitation/tailwind.css"` to your CSS. Without Tailwind, use `import "deepcitation/styles.css"` in JS. See [Styling]({{ site.baseurl }}/styling/) for details.

---

## Basic Usage

{% raw %}
```tsx
import { CitationComponent } from "deepcitation/react";

// Basic citation with verification result
<CitationComponent
  citation={{
    type: "document",
    citationNumber: 1,
    sourceContext: "Revenue increased by 25%",
    sourceMatch: "25% growth",
    attachmentId: "report-2024",
    pageNumber: 1,
  }}
  verification={{
    status: "found",
    verifiedPageNumber: 1,
    sourceSnippet: "...Revenue increased by 25% in Q4...",
  }}
/>
// Renders: [25% growth] with blue text
```
{% endraw %}

---

## Display Variants

The `variant` prop controls the visual style, and `content` controls what text to display.

Available variants: `"linter"` | `"chip"` | `"brackets"` | `"text"` | `"superscript"` | `"footnote"` | `"badge"`

### Linter (Default)

Inline text with semantic underlines based on verification status. Best for inline quotes, articles, natural reading flow.

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  variant="linter"
/>
// Renders: underlined text with color based on status
// Verified = solid green underline
// Partial = dashed amber underline
// Not found = wavy red underline
// Pending = dotted gray underline
```

### Chip

Neutral gray pill/badge style with status shown via indicator icon. Best for highlighted citations, visual emphasis.

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  variant="chip"
/>
```

### Brackets

Shows sourceMatch in square brackets with blue styling. Best for academic papers, legal documents.

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  variant="brackets"
/>
// Renders: [Junior to creditors]
```

### Brackets with Number

Shows only citation number in brackets. Best for footnote references, compact layouts.

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  variant="brackets"
  content="number"
/>
// Renders: [1]
```

### Text

Plain text that inherits parent styling. Best for inline quotes, pull quotes.

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  variant="text"
/>
```

### Superscript

Small raised text like footnotes. Best for academic writing, traditional citation style.

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  variant="superscript"
/>
// Renders: ¹
```

### Footnote

Clean footnote marker with neutral gray default. Best for minimal footnotes, reports, clean reading experience.

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  variant="footnote"
/>
// Renders: ¹ (neutral gray, colored when status resolves)
```

### Badge

Source badge/pill showing name + count with status indicator. Best for chat interfaces, conversational AI.

{% raw %}
```tsx
<CitationComponent
  citation={{ ...citation, title: "YC SAFE Agreement", domain: "ycombinator.com" }}
  verification={verification}
  variant="badge"
  additionalCount={2}  // Shows "+2" suffix
/>
```
{% endraw %}

### Indicator Only

Shows only the verification status indicator. Best for space-constrained UIs, tables.

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  content="indicator"
/>
```

---

## Interaction Modes

Control how eagerly citations respond to user interactions:

### Eager Mode (Default)

Hover shows popover immediately, click opens full-size image. Best for sparse citations where users want quick access to verification details.

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  interactionMode="eager"
/>
```

### Lazy Mode

Hover only applies style effects (no popover). First click toggles popover, second click toggles search details. Best for dense citation layouts where hover popovers would be distracting.

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  interactionMode="lazy"
/>
```

| Mode | Hover | First Click | Second Click | Best For |
|:-----|:------|:------------|:-------------|:---------|
| `"eager"` | Shows popover | Opens image (or toggles details if no image) | - | Sparse citations, detailed review |
| `"lazy"` | Style effects only | Toggles popover | Toggles search details | Dense citations, less intrusive UX |

{: .note }
In lazy mode, the popover behaves like a standard tooltip: click to open, click outside or repeat click to close. The cursor is `cursor-pointer` in lazy mode, and `cursor-zoom-in` in eager mode (when image is available).

---

## Event Handlers

Add interactivity with mouse and touch event handlers:

{% raw %}
```tsx
import { CitationComponent } from "deepcitation/react";
import { useState } from "react";

function MyComponent() {
  const [activeCitation, setActiveCitation] = useState(null);

  return (
    <CitationComponent
      citation={citation}
      verification={verification}
      // Event handlers for side effects (disables default behaviors)
      eventHandlers={{
        onMouseEnter: (citation, citationKey) => {
          console.log("Hovered:", citationKey);
        },
        onMouseLeave: (citation, citationKey) => {
          console.log("Left:", citationKey);
        },
        onClick: (citation, citationKey, event) => {
          setActiveCitation(citationKey);
        },
      }}
      // Or use behaviorConfig for custom behavior that returns actions
      behaviorConfig={{
        onClick: (context, event) => {
          // context contains: citation, citationKey, verification,
          // isTooltipExpanded, isImageExpanded, hasImage
          if (context.hasImage) {
            return { setImageExpanded: true };
          }
          // Return false to prevent any action
          // Return void for no state changes
        },
      }}
    />
  );
}
```
{% endraw %}

---

## Custom Rendering

### Custom Indicator

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  renderIndicator={(status) => (
    status.isVerified ? <MyCheckIcon /> : <MyWarningIcon />
  )}
/>
```

### Full Custom Rendering

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  renderContent={({ citation, displayText, status, citationKey, isMergedDisplay }) => (
    <span className="my-custom-citation">
      {displayText}
      {status.isVerified && <span className="verified-badge"></span>}
      {status.isPartialMatch && <span className="partial-badge">~</span>}
      {status.isMiss && <span className="miss-badge"></span>}
      {status.isPending && <span className="pending-badge"></span>}
    </span>
  )}
/>
```

### Loading State

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  isLoading={true}  // Explicitly show loading spinner
/>
```

---

## Popover Options

### Hide Popover

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  popoverPosition="hidden"
/>
```

### Bottom Position

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  popoverPosition="bottom"
/>
```

### Custom Popover Content

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  renderPopoverContent={({ citation, verification, status }) => (
    <div className="p-4">
      <h4>Custom Verification Card</h4>
      <p>Page: {verification?.pageNumber}</p>
      <p>Status: {status.isVerified ? "Verified" : "Not Found"}</p>
    </div>
  )}
/>
```

---

## Props Reference

| Prop | Type | Required | Description |
|:-----|:-----|:---------|:------------|
| `citation` | `Citation` | Yes | The citation data to display |
| `verification` | `Verification \| null` | No | Verification result data from the API |
| `variant` | `"linter" \| "chip" \| "brackets" \| "text" \| "superscript" \| "footnote" \| "badge"` | No | Visual style variant (default: "linter") |
| `content` | `"sourceMatch" \| "number" \| "indicator" \| "source"` | No | What content to display. Defaults based on variant. |
| `interactionMode` | `"eager" \| "lazy"` | No | How eagerly to respond to interactions (default: "eager") |
| `isLoading` | `boolean` | No | Explicitly show loading spinner |
| `children` | `ReactNode` | No | Content to render before the citation |
| `className` | `string` | No | Additional CSS classes |
| `innerWidthClassName` | `string` | No | Class name for inner content width |
| `fallbackText` | `string \| null` | No | Fallback text when sourceMatch is empty |
| `isMobile` | `boolean` | No | Enable mobile touch handlers |
| `eventHandlers` | `CitationEventHandlers` | No | Interaction callbacks (disables default behaviors) |
| `behaviorConfig` | `CitationBehaviorConfig` | No | Custom click/hover behavior configuration |
| `renderIndicator` | `(status: CitationStatus) => ReactNode` | No | Custom indicator renderer |
| `renderContent` | `(props: CitationRenderProps) => ReactNode` | No | Full custom content renderer |
| `popoverPosition` | `"top" \| "bottom" \| "hidden"` | No | Popover position (default: "top") |
| `renderPopoverContent` | `(props) => ReactNode` | No | Custom popover content renderer |
| `additionalCount` | `number` | No | Number of additional citations for badge variant |
| `faviconUrl` | `string` | No | Favicon URL for badge variant |
| `sourceTitle` | `string` | No | Override the source name displayed in popover headers (see below) |
| `onSourceDownload` | `(citation: Citation) => void` | No | Callback when user clicks the download button in popover header. Button only renders when provided. |
| `indicatorVariant` | `"icon" \| "dot" \| "caret" \| "none"` | No | Visual style for status indicators: `"icon"` (checkmarks/spinners, default), `"dot"` (subtle colored dots), `"caret"` (disclosure chevron), or `"none"` (hidden) |

---

## Custom Source Labels

The `sourceTitle` prop allows you to override the filename or URL title displayed in the citation popover header.

{: .important }
**The citation and verification objects only store the *original* filename from when the document was uploaded.** If users rename files in your application, you must use `sourceTitle` to display the updated name—the verification system has no way to know about filename changes.

### Document Citations

{% raw %}
```tsx
// Shows "Q4 Financial Report" instead of "report_q4_2024_final.pdf"
<CitationComponent
  citation={citation}
  verification={verification}
  sourceLabel="Q4 Financial Report"
/>

// Common pattern: Use your app's current filename
<CitationComponent
  citation={citation}
  verification={verification}
  sourceLabel={attachment.displayName}
/>
```
{% endraw %}

### URL Citations

{% raw %}
```tsx
// Shows "Official Documentation" instead of "developer.example.com/api/v2/reference"
<CitationComponent
  citation={urlCitation}
  verification={verification}
  sourceLabel="Official Documentation"
/>
```
{% endraw %}

### When to Use

- User has renamed a file after uploading it
- You want to show a friendly display name instead of technical filename
- The original filename is cryptic (e.g., `doc_abc123.pdf`) but you have a better title
- You're aggregating citations from multiple sources and want consistent naming

### Behavior by Citation Type

| Citation Type | Without `sourceTitle` | With `sourceTitle` |
|:--------------|:----------------------|:-------------------|
| Document | Shows `verification.label` (original filename) | Shows your custom label |
| URL | Shows URL domain/path | Shows your custom label |

---

## Source Download Button

The `onSourceDownload` prop adds a download button to the popover header. The button only renders when the callback is provided — no layout shift when absent. Your callback receives the full `Citation` object so you can determine the download logic based on citation type.

{% raw %}
```tsx
// Document citation — download the original attachment
<CitationComponent
  citation={citation}
  verification={verification}
  onSourceDownload={(c) => {
    if (c.type === "document") {
      downloadAttachment(c.attachmentId);
    }
  }}
/>

// URL citation — open in new tab or trigger save
<CitationComponent
  citation={urlCitation}
  verification={verification}
  onSourceDownload={(c) => {
    if (c.type === "url") {
      window.open(c.url, "_blank");
    }
  }}
/>
```
{% endraw %}

{: .note }
Pass a stable callback reference (via `useCallback`) to avoid unnecessary re-renders of the popover content.

---

## Primitives (Experimental)

{: .warning }
The compound component API is experimental and may change in minor releases. For stable usage, use `CitationComponent`.

For fully custom citation layouts, composable primitives are available:

{% raw %}
```tsx
import { Citation } from "deepcitation/react";

<Citation.Root citation={citation} verification={verification}>
  <Citation.Trigger>
    <Citation.AnchorText />
    <Citation.Indicator />
  </Citation.Trigger>
</Citation.Root>
```
{% endraw %}

Available primitives:
- `Citation.Root` - Context provider
- `Citation.Trigger` - Clickable wrapper
- `Citation.AnchorText` - Display text
- `Citation.Number` - Citation number
- `Citation.Indicator` - Status indicator icon
- `Citation.Bracket` - Bracket characters

Use these when `CitationComponent` doesn't fit your layout requirements.

---

## CitationDrawer

A bottom sheet (or side panel) that displays citations grouped by source document — similar to ChatGPT's citation panel. Use it alongside `CitationComponent` for a full citation browsing experience.

### Setup

```tsx
import {
  CitationDrawer,
  CitationDrawerTrigger,
  useCitationDrawer,
  groupCitationsBySource,
} from "deepcitation/react";
```

### Usage with `useCitationDrawer()`

The hook manages drawer state and citation collection:

{% raw %}
```tsx
function ChatMessage({ citations, verifications }) {
  const drawer = useCitationDrawer();
  const citationGroups = groupCitationsBySource(drawer.citations);

  return (
    <>
      {/* Inline citations that feed into the drawer */}
      <CitationComponent
        citation={citation}
        verification={verification}
        eventHandlers={{
          onClick: (c, key) => {
            drawer.addCitation({
              citationKey: key,
              citation: c,
              verification: verifications[key],
            });
            drawer.openDrawer();
          },
        }}
      />

      {/* Trigger button showing source summary */}
      <CitationDrawerTrigger
        citationGroups={citationGroups}
        onClick={drawer.toggleDrawer}
        isOpen={drawer.isOpen}
      />

      {/* The drawer itself */}
      <CitationDrawer
        isOpen={drawer.isOpen}
        onClose={drawer.closeDrawer}
        citationGroups={citationGroups}
      />
    </>
  );
}
```
{% endraw %}

### CitationDrawer Props

| Prop | Type | Required | Description |
|:-----|:-----|:---------|:------------|
| `isOpen` | `boolean` | Yes | Whether the drawer is visible |
| `onClose` | `() => void` | Yes | Called when the user closes the drawer |
| `citationGroups` | `SourceCitationGroup[]` | Yes | Citation groups from `groupCitationsBySource()` |
| `title` | `string` | No | Drawer heading override |
| `label` | `string` | No | Source name override |
| `position` | `"bottom" \| "right"` | No | Drawer position (default: `"bottom"`) |
| `onCitationClick` | `(item) => void` | No | Click handler for individual citations |
| `onReadMore` | `(item) => void` | No | Handler for "read more" action |
| `indicatorVariant` | `IndicatorVariant` | No | Status indicator style (default: `"icon"`) |
| `sourceLabelMap` | `Record<string, string>` | No | Map of attachmentId/URL to friendly display label |
| `className` | `string` | No | Additional CSS class |

### CitationDrawerTrigger Props

| Prop | Type | Required | Description |
|:-----|:-----|:---------|:------------|
| `citationGroups` | `SourceCitationGroup[]` | Yes | Same groups as the drawer |
| `onClick` | `() => void` | No | Click handler (typically toggles the drawer) |
| `onSourceClick` | `(group) => void` | No | Click handler for a specific source icon |
| `isOpen` | `boolean` | No | Controls `aria-expanded` attribute |
| `label` | `string` | No | Label text override (default: auto-generated from status counts) |
| `maxIcons` | `number` | No | Max source icons before +N overflow (default: `5`) |
| `className` | `string` | No | Additional CSS class |

### Helper Functions

- `groupCitationsBySource(citations, sourceLabelMap?)` — Groups drawer items by source document, returning `SourceCitationGroup[]`
- `resolveGroupLabels(groups, sourceLabelMap?)` — Resolves display labels for each group from the label map or auto-derives from metadata

---

## DeepCitationTheme

Override `--dc-*` design tokens for all citation components without writing raw CSS. Supports light/dark mode and scoped (per-instance) theming.

```tsx
import { DeepCitationTheme } from "deepcitation/react";

// Global override: injects a <style> block targeting :root / .dark
<DeepCitationTheme
  theme={{ verified: "#16a34a", primary: "#2563eb", radiusMd: "8px" }}
  darkTheme={{ background: "#1e1e2e", foreground: "#cdd6f4" }}
>
  <App />
</DeepCitationTheme>

// Scoped override: wraps children in a <div> with inline CSS custom properties
<DeepCitationTheme scoped theme={{ verified: "#16a34a" }}>
  <CitationComponent ... />
</DeepCitationTheme>
```

### DeepCitationTheme Props

| Prop | Type | Required | Description |
|:-----|:-----|:---------|:------------|
| `theme` | `DeepCitationThemeColors` | No | Light-mode token overrides (targets `:root`) |
| `darkTheme` | `DeepCitationThemeColors` | No | Dark-mode token overrides (targets `.dark`). Ignored when `scoped` is true. |
| `scoped` | `boolean` | No | Render a `<div>` wrapper with inline CSS vars instead of global `<style>` injection |
| `children` | `ReactNode` | No | Content to render |

Token names map 1:1 to `--dc-*` CSS custom properties (e.g., `verified` sets `--dc-verified`). See `DeepCitationThemeColors` in the TypeScript source for the full list of overridable tokens including status colors, backgrounds, borders, radii, and font family.

---

## UrlCitationComponent

For URL-based citations (web pages), use `UrlCitationComponent` instead of `CitationComponent`. It displays the source domain, favicon, and OG metadata.

```tsx
import { UrlCitationComponent } from "deepcitation/react";

<UrlCitationComponent
  citation={urlCitation}
  verification={verification}
/>
```

Use `UrlCitationComponent` when `citation.type === "url"`. For document citations (`citation.type === "document"`), use `CitationComponent`.

{: .note }
`UrlCitationComponent` is exported from `"deepcitation/react"` alongside `CitationComponent`. Internally it lives in `Citation.tsx` (not a separate file).

---

## SourcesListComponent

Renders a list of source documents with their verification status summaries — similar to Anthropic's citation sources panel. Useful for showing all sources referenced in a response.

{% raw %}
```tsx
import { SourcesListComponent } from "deepcitation/react";

<SourcesListComponent
  sources={[
    {
      id: "src-1",
      url: "https://example.com/report.pdf",
      title: "Q4 Financial Report",
      domain: "example.com",
      citationNumbers: [1, 2, 5],
      verificationStatus: "verified",
    },
    {
      id: "src-2",
      url: "https://sec.gov/filing",
      title: "SEC Filing 10-K",
      domain: "sec.gov",
      citationNumbers: [3, 4],
      verificationStatus: "partial",
    },
  ]}
  onSourceClick={(source, event) => console.log("Selected:", source.title)}
  showVerificationIndicators
  showCitationBadges
/>
```
{% endraw %}

### SourcesListComponent Props

| Prop | Type | Required | Description |
|:-----|:-----|:---------|:------------|
| `sources` | `SourcesListItemProps[]` | Yes | Array of source items to display |
| `variant` | `"panel" \| "inline" \| "drawer"` | No | Visual layout variant |
| `isOpen` | `boolean` | No | Whether the list is visible (for collapsible variants) |
| `onOpenChange` | `(isOpen: boolean) => void` | No | Callback when visibility toggles |
| `header` | `SourcesListHeaderConfig` | No | Header configuration (title, subtitle, show count) |
| `isLoading` | `boolean` | No | Show loading skeleton |
| `emptyMessage` | `string` | No | Message when no sources |
| `maxHeight` | `string \| number` | No | Max height before scrolling (panel/inline variants) |
| `className` | `string` | No | Additional CSS class for container |
| `listClassName` | `string` | No | CSS class for the list items container |
| `onSourceClick` | `(source, event) => void` | No | Click handler for source items |
| `showVerificationIndicators` | `boolean` | No | Show status indicators on items |
| `showCitationBadges` | `boolean` | No | Show citation number badges |
| `groupByDomain` | `boolean` | No | Group sources by domain/platform |
| `renderItem` | `(props, index) => ReactNode` | No | Custom render for source items |
| `renderEmpty` | `() => ReactNode` | No | Custom render for empty state |
| `renderLoading` | `() => ReactNode` | No | Custom render for loading state |

### SourcesListItemProps

Each source item in the `sources` array:

| Prop | Type | Required | Description |
|:-----|:-----|:---------|:------------|
| `id` | `string` | Yes | Unique identifier |
| `url` | `string` | Yes | Source URL |
| `title` | `string` | Yes | Page/document title |
| `domain` | `string` | Yes | Display domain (e.g., "sec.gov") |
| `sourceType` | `SourceType` | No | Platform type for icon selection |
| `faviconUrl` | `string` | No | Custom favicon URL |
| `citationNumbers` | `number[]` | No | Citation numbers referencing this source |
| `verificationStatus` | `"verified" \| "partial" \| "pending" \| "failed" \| "unknown"` | No | Verification status |
| `onClick` | `(source, event) => void` | No | Item-level click handler |
| `showVerificationIndicator` | `boolean` | No | Show status indicator |
| `showCitationBadges` | `boolean` | No | Show citation number badges |

### Compact Trigger

Use `SourcesTrigger` to show a compact bar of source favicons that opens the full list:

```tsx
import { SourcesTrigger, SourcesListComponent } from "deepcitation/react";
import { useState } from "react";

function SourcesPanel({ sources }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <SourcesTrigger sources={sources} onClick={() => setIsOpen(!isOpen)} />
      <SourcesListComponent sources={sources} isOpen={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
```

---

## Internationalization

The React components ship with built-in i18n support for English (default), Spanish, French, and Vietnamese.

```tsx
import { DeepCitationI18nProvider } from "deepcitation/react";
import { esMessages } from "deepcitation/react"; // or frMessages, viMessages

function App() {
  return (
    <DeepCitationI18nProvider messages={esMessages}>
      <CitationComponent ... />
    </DeepCitationI18nProvider>
  );
}
```

Available locale packs: `esMessages` (Spanish), `frMessages` (French), `viMessages` (Vietnamese).

### Custom Translations

Use `createTranslator` to build a custom locale or override specific strings:

```tsx
import { DeepCitationI18nProvider, createTranslator, defaultMessages } from "deepcitation/react";

// Override specific messages while keeping English defaults
const customMessages = {
  ...defaultMessages,
  "status.verified": "Confirmed",
  "status.notFound": "Unverified",
  "message.exactMatch": "This quote was confirmed in the source document.",
};

function App() {
  return (
    <DeepCitationI18nProvider messages={customMessages}>
      <CitationComponent ... />
    </DeepCitationI18nProvider>
  );
}
```

You can also create a standalone translator for server-side rendering or non-React contexts:

```typescript
import { createTranslator } from "deepcitation/react";

const t = createTranslator({ "status.verified": "Bestätigt" }); // German
console.log(t("status.verified")); // "Bestätigt"
```

### Hooks

Two hooks are available for custom components that need to read locale values at render time:

```typescript
import { useTranslation, useLocale } from "deepcitation/react";

function MyVerificationBadge({ status }) {
  const t = useTranslation(); // returns the translate function
  const locale = useLocale(); // returns the current locale string, e.g. "en"

  return (
    <span lang={locale}>
      {status.isVerified ? t("status.verified") : t("status.notFound")}
    </span>
  );
}
```

| Hook | Return type | Description |
|:-----|:------------|:------------|
| `useTranslation()` | `TranslateFunction` | Returns the current `t(key)` function from the nearest `DeepCitationI18nProvider`. Use this in custom components that render citation UI strings. |
| `useLocale()` | `string` | Returns the current locale identifier (e.g. `"en"`, `"es"`). Useful for `lang` attributes and locale-aware third-party libraries. |

Both hooks must be called inside a `DeepCitationI18nProvider`.

---

## Accessibility

CitationComponent includes built-in accessibility support:

- **Keyboard navigation**: Citations are focusable and can be activated with Enter/Space
- **ARIA attributes**: `aria-expanded` on popovers, `aria-label` on status indicators
- **Screen readers**: Status text is announced (e.g., "Verified citation" / "Citation not found")
- **Focus management**: Popover traps focus when open, returns focus on close
- **Reduced motion**: Animations respect `prefers-reduced-motion` media query

---

## Advanced Components

The following components are exported from `deepcitation/react` for building custom verification UIs. They power the built-in popover and drawer internals.

| Component | Import | Description |
|:----------|:-------|:------------|
| `VerificationTabs` | `deepcitation/react` | Tabbed panel showing search attempts, diff view, and proof image for a single citation |
| `VerificationLog` | `deepcitation/react` | Timeline display of search attempts with status indicators and match snippets |
| `SplitDiffDisplay` | `deepcitation/react` | Side-by-side diff comparing the cited phrase with the matched text |
| `CollapsibleText` | `deepcitation/react` | Text block that collapses long content with "Show more" toggle |
| `MatchQualityBar` | `deepcitation/react` | Visual bar showing match quality percentage |
| `DefaultPopoverContent` | `deepcitation/react` | The standard popover body used inside `CitationComponent`. Export this when you want a custom trigger but the default popover internals (evidence image, verification tabs, search log). Pass it via `renderPopoverContent`. |
| `CitationOverlayProvider` | `deepcitation/react` | Context provider that coordinates expanded image overlays across citations |
| `DeepCitationTheme` | `deepcitation/react` | Centralized design token overrides via `--dc-*` CSS custom properties |
| `extractDomain` | `deepcitation/react` | Extract display domain from a URL string |

### Performance Hooks

| Hook | Description |
|:-----|:------------|
| `useCitationTiming` | Track verification timing for a single citation (time-to-certainty metrics) |
| `useTtcMetrics` | Aggregate timing metrics across multiple citations |
| `prefetchImages` | Pre-fetch proof images before hover for instant popover display |
| `usePrefetchImage` | React hook version of `prefetchImages` for component-level prefetching |
| `usePrefersReducedMotion` | Respect user's `prefers-reduced-motion` system setting |
| `useLocale` | Access the current locale from `DeepCitationI18nProvider` |

### Search Narrative Utilities

| Function | Description |
|:---------|:------------|
| `buildSearchNarrative` | Convert raw search attempts into display-ready narrative rows |
| `buildSearchSummary` | Summarize search results into outcome + context window |
| `deriveContextWindow` | Extract the context window (surrounding text) from search attempts |
| `buildIntentSummary` | Summarize the search intent (query groups and outcomes) |
| `getStatusColorScheme` | Map verification status to color scheme (green/amber/red) |
| `getContextualStatusMessage` | Get human-readable status message for display |

---

## Next Steps

- [Types]({{ site.baseurl }}/types/) - Full TypeScript interface definitions
- [SDK Reference]({{ site.baseurl }}/sdk-reference/) - All client methods and utility functions
- [Styling]({{ site.baseurl }}/styling/) - CSS customization
- [Error Handling]({{ site.baseurl }}/error-handling/) - Production error patterns
