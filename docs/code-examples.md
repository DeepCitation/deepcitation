---
layout: default
title: Code Examples
nav_order: 4
description: "SDK usage examples and integration patterns"
has_children: true
---

# Code Examples

Common integration patterns and code examples for DeepCitation.

---

## Multi-File Workflow

Work with multiple documents and verify citations across files:

```typescript
import {
  DeepCitation,
  wrapCitationPrompt,
  getAllCitationsFromLlmOutput,
  groupCitationsByAttachmentId
} from "deepcitation";

const deepcitation = new DeepCitation({ apiKey: process.env.DEEPCITATION_API_KEY });

// 1. Upload multiple documents
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareAttachments([
  { file: contractPdf, filename: "contract.pdf" },
  { file: invoicePdf, filename: "invoice.pdf" },
]);

// 2. Wrap prompts with combined file content
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt: "You are a document analyst that cites sources.",
  userPrompt: "Compare the contract terms with the invoice amounts.",
  deepTextPromptPortion, // All files combined into one string
});

// 3. Call your LLM
const response = await yourLLM.chat({
  messages: [
    { role: "system", content: enhancedSystemPrompt },
    { role: "user", content: enhancedUserPrompt },
  ]
});

// 4. Group and verify citations by attachment
const citations = getAllCitationsFromLlmOutput(response.content);
const citationsByAttachment = groupCitationsByAttachmentId(citations);

// Verify in parallel for each attachment
const verificationPromises = [];
for (const [attachmentId, attachmentCitations] of citationsByAttachment) {
  verificationPromises.push(deepcitation.verifyAttachment(attachmentId, attachmentCitations));
}
const results = await Promise.all(verificationPromises);
```

---

## React Component

Use the React component to display verified citations with hover tooltips showing visual proof:

```tsx
import { CitationComponent } from "deepcitation/react";

function VerifiedResponse({ citations, verifications }) {
  return (
    <div>
      <p>
        According to the report, revenue grew by{" "}
        <CitationComponent
          citation={citations["1"]}
          verification={verifications["1"]}
        />
        this quarter, while{" "}
        <CitationComponent
          citation={citations["2"]}
          verification={verifications["2"]}
        />
        .
      </p>
    </div>
  );
}
```

---

## Display Variants

Choose from different display variants to match your UI design:

{% raw %}
```tsx
import { CitationComponent } from "deepcitation/react";

// Brackets variant (default) - [anchorText] with square brackets
<CitationComponent
  citation={{ citationNumber: 1, anchorText: "25% growth" }}
  verification={verification}
  variant="brackets"
/>
// Renders: [25% growth]

// Chip variant - pill/badge style with background color
<CitationComponent
  citation={{ citationNumber: 1, anchorText: "Revenue Growth" }}
  verification={verification}
  variant="chip"
/>
// Renders: Revenue Growth (styled pill)

// Text variant - plain text, inherits parent styling
<CitationComponent
  citation={{ citationNumber: 1, anchorText: "25% growth" }}
  verification={verification}
  variant="text"
/>
// Renders: 25% growth

// Superscript variant - small raised text like footnotes
<CitationComponent
  citation={{ citationNumber: 1 }}
  verification={verification}
  variant="superscript"
/>
// Renders: ¹

// Linter variant (default) - semantic underlines based on status
<CitationComponent
  citation={{ citationNumber: 1, anchorText: "Revenue Growth" }}
  verification={verification}
  variant="linter"
/>
// Renders: Revenue Growth with colored underline

// Badge variant - badge/pill style with name + count
<CitationComponent
  citation={{ citationNumber: 1, sourceName: "Wikipedia" }}
  verification={verification}
  variant="badge"
  additionalCount={2}
/>
// Renders: Wikipedia +2

// Controlling content separately from variant
// Use content prop to override what text is displayed:
// - "anchorText": Descriptive text (default for linter, chip, brackets, text)
// - "number": Citation number (default for superscript)
// - "indicator": Only the status icon, no text
// - "source": Source name (default for badge variant)

<CitationComponent
  citation={{ citationNumber: 1, anchorText: "Revenue Growth" }}
  verification={verification}
  variant="brackets"
  content="number"  // Override to show number instead of anchorText
/>
// Renders: [1] instead of [Revenue Growth]
```
{% endraw %}

---

## Popover Options

Control the verification popover position or hide it entirely:

```tsx
import { CitationComponent } from "deepcitation/react";

// Default popover position (top)
<CitationComponent
  citation={citation}
  verification={verification}
  popoverPosition="top"
/>

// Popover at bottom
<CitationComponent
  citation={citation}
  verification={verification}
  popoverPosition="bottom"
/>

// Hidden popover (no hover preview)
<CitationComponent
  citation={citation}
  verification={verification}
  popoverPosition="hidden"
/>
```

---

## Event Handlers

Add custom click and hover handlers for interactive citations:

{% raw %}
```tsx
import { CitationComponent } from "deepcitation/react";

<CitationComponent
  citation={citation}
  verification={verification}
  eventHandlers={{
    onClick: (citation, key, event) => {
      console.log("Citation clicked:", key);
      // Navigate to source, open modal, etc.
    },
    onMouseEnter: (citation, key) => {
      console.log("Hovering:", key);
    },
    onMouseLeave: (citation, key) => {
      console.log("Left:", key);
    },
  }}
/>
```
{% endraw %}

---

## Error Handling

Handle common API errors gracefully:

```typescript
try {
  const result = await deepcitation.verifyAttachment(attachmentId, citations);
  // Handle success
} catch (error) {
  if (error.message.includes("401")) {
    // Invalid or expired API key
  } else if (error.message.includes("429")) {
    // Rate limit exceeded - add payment method or wait
  } else if (error.message.includes("404")) {
    // Attachment not found - may have expired (30 day retention)
  } else {
    // Other error
  }
}
```

---

## Next Steps

- [Components]({{ site.baseurl }}/components/) - Full CitationComponent documentation
- [Types]({{ site.baseurl }}/types/) - TypeScript interface definitions
- [Real-World Examples]({{ site.baseurl }}/real-world-examples/) - Industry-specific integrations
