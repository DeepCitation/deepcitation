---
layout: default
title: Components
parent: Code Examples
nav_order: 1
description: "React CitationComponent documentation"
---

# CitationComponent

Display verified citations with status indicators and interactive popovers.

---

## Key Concepts

{: .note }
Understanding the difference between **found status** and **match quality** is essential.

**Found Status (text styling):**
Whether the citation was found in the document. Both verified and partial matches show blue text (found), while misses show gray text.

**Match Quality (indicator):**
How well the citation matched. Green checkmark for exact match, orange checkmark for partial match, no indicator for miss.

{: .highlight }
**Partial matches** have blue text (because they were found) but an orange indicator (because they didn't match exactly).

---

## Installation

```bash
npm install deepcitation
```

Then import the component:

```typescript
import { CitationComponent } from "deepcitation/react";
```

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
    fullPhrase: "Revenue increased by 25%",
    anchorText: "25% growth",
    attachmentId: "report-2024",
    pageNumber: 1,
  }}
  verification={{
    status: "found",
    verifiedPageNumber: 1,
    verifiedMatchSnippet: "...Revenue increased by 25% in Q4...",
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

Shows anchorText in square brackets with blue styling. Best for academic papers, legal documents.

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
| `content` | `"anchorText" \| "number" \| "indicator" \| "source"` | No | What content to display. Defaults based on variant. |
| `interactionMode` | `"eager" \| "lazy"` | No | How eagerly to respond to interactions (default: "eager") |
| `isLoading` | `boolean` | No | Explicitly show loading spinner |
| `children` | `ReactNode` | No | Content to render before the citation |
| `className` | `string` | No | Additional CSS classes |
| `innerWidthClassName` | `string` | No | Class name for inner content width |
| `fallbackDisplay` | `string \| null` | No | Fallback text when anchorText is empty |
| `isMobile` | `boolean` | No | Enable mobile touch handlers |
| `eventHandlers` | `CitationEventHandlers` | No | Interaction callbacks (disables default behaviors) |
| `behaviorConfig` | `CitationBehaviorConfig` | No | Custom click/hover behavior configuration |
| `renderIndicator` | `(status: CitationStatus) => ReactNode` | No | Custom indicator renderer |
| `renderContent` | `(props: CitationRenderProps) => ReactNode` | No | Full custom content renderer |
| `popoverPosition` | `"top" \| "bottom" \| "hidden"` | No | Popover position (default: "top") |
| `renderPopoverContent` | `(props) => ReactNode` | No | Custom popover content renderer |
| `additionalCount` | `number` | No | Number of additional citations for badge variant |
| `faviconUrl` | `string` | No | Favicon URL for badge variant |
| `sourceLabel` | `string` | No | Override the source name displayed in popover headers (see below) |
| `onSourceDownload` | `(citation: Citation) => void` | No | Callback when user clicks the download button in popover header. Button only renders when provided. |
| `indicatorVariant` | `"icon" \| "dot" \| "caret" \| "none"` | No | Visual style for status indicators: `"icon"` (checkmarks/spinners, default), `"dot"` (subtle colored dots), `"caret"` (disclosure chevron), or `"none"` (hidden) |

---

## Custom Source Labels

The `sourceLabel` prop allows you to override the filename or URL title displayed in the citation popover header.

{: .important }
**The citation and verification objects only store the *original* filename from when the document was uploaded.** If users rename files in your application, you must use `sourceLabel` to display the updated name—the verification system has no way to know about filename changes.

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

| Citation Type | Without `sourceLabel` | With `sourceLabel` |
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

## Next Steps

- [Proof Hosting]({{ site.baseurl }}/proof-hosting/) - Shareable proof page URLs and view modes
- [Types]({{ site.baseurl }}/types/) - Full TypeScript interface definitions
- [Styling]({{ site.baseurl }}/styling/) - CSS customization
- [Error Handling]({{ site.baseurl }}/error-handling/) - Production error patterns
- [Real-World Examples]({{ site.baseurl }}/real-world-examples/) - Industry-specific integrations
- [Migration Guide]({{ site.baseurl }}/migration/) - API changes by version
