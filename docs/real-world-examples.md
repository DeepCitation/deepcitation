---
layout: default
title: Real-World Examples
parent: Code Examples
nav_order: 3
description: "Industry-specific integration examples"
---

# Real-World Examples

Examples showing how to integrate citations in different industry contexts.

---

## Legal Document Analysis

Using the default `brackets` variant for formal legal documents:

{% raw %}
```tsx
// Legal document with default brackets variant
<p>
  The YC Post-Money SAFE establishes a specific priority for payouts.
  In the event of dissolution, the instrument is{" "}
  <CitationComponent
    citation={{
      type: "document",
      citationNumber: 1,
      anchorText: "Junior to creditors",
      fullPhrase: "Junior to payment of the Company's indebtedness",
      attachmentId: "yc-safe-2024",
      pageNumber: 1,
    }}
    verification={{
      status: "found",
      verifiedPageNumber: 1,
      verifiedMatchSnippet: "Junior to payment of the Company's indebtedness...",
    }}
  />
  , meaning creditors are paid first.
</p>
```
{% endraw %}

**Result:** The YC Post-Money SAFE establishes a specific priority for payouts. In the event of dissolution, the instrument is [Junior to creditors], meaning creditors are paid first.

---

## Medical SOAP Notes

Using `linter` and `text` variants for clinical documentation:

{% raw %}
```tsx
// Medical notes using linter and text variants
<div>
  <h4>Subjective</h4>
  <p>
    Patient presents with a{" "}
    <CitationComponent
      citation={{
        type: "document",
        citationNumber: 1,
        anchorText: "3 day history",
        fullPhrase: "3 day history of worsening lower extremity edema",
        attachmentId: "med-001",
        pageNumber: 1,
      }}
      verification={{
        status: "found",
        verifiedPageNumber: 1,
        verifiedMatchSnippet: "3 day history of worsening lower extremity edema",
      }}
      variant="linter"
    />{" "}
    of worsening edema.
  </p>

  <h4>Objective</h4>
  <p>
    Recent Echo indicates{" "}
    <CitationComponent
      citation={{
        type: "document",
        citationNumber: 2,
        anchorText: "35% EF",
        fullPhrase: "Echo EF of 35% on admission",
        attachmentId: "med-001",
        pageNumber: 1,
      }}
      verification={{
        status: "partial_text_found",
        verifiedPageNumber: 1,
        verifiedMatchSnippet: "Echo EF of 35% on echo performed 3 months ago",
      }}
      variant="text"
    />
    .
  </p>
</div>
```
{% endraw %}

{: .note }
The `text` variant inherits styling from the parent element, making it ideal for clinical notes where citations should blend with the text.

---

## Hallucination Detection

Showing how unverified citations (hallucinations) are visually distinct from verified ones:

{% raw %}
```tsx
// Hallucination detection - miss status shows strikethrough
<CitationComponent
  citation={{
    type: "document",
    citationNumber: 3,
    anchorText: "8% annual interest rate",
    fullPhrase: "This Safe shall accrue interest at 8% per annum",
    attachmentId: "yc-safe-2024",
    pageNumber: 2,
  }}
  verification={{
    status: "not_found",  // Not found in document
  }}
  variant="linter"
/>
// Renders with wavy red underline to indicate hallucination
```
{% endraw %}

{: .warning }
The citation above was not found in the source document (hallucination). Notice the wavy red underline indicating a miss.

This visual differentiation helps users immediately identify when an AI has made a claim that cannot be verified against the source documents.

---

## Financial Analysis

Using the `badge` variant for source badge citations in financial reports:

{% raw %}
```tsx
<p>
  According to the SEC filing{" "}
  <CitationComponent
    citation={{
      type: "document",
      citationNumber: 1,
      anchorText: "80,000 shares",
      fullPhrase: "80,000 shares",
      attachmentId: "nvda-form144",
      pageNumber: 1,
      title: "NVIDIA Form 144",
      domain: "sec.gov",
    }}
    verification={{
      status: "found",
      verifiedPageNumber: 1,
    }}
    variant="badge"
    additionalCount={3}
  />
  , the insider plans to sell shares over the next quarter.
</p>
```
{% endraw %}

---

## Chat Interface

Integrating citations in a conversational AI interface:

```tsx
function ChatMessage({ message, citations, verifications }) {
  // Parse message and replace citation markers with components
  return (
    <div className="chat-message">
      <p>
        Based on the documents you provided, the contract specifies{" "}
        <CitationComponent
          citation={citations["1"]}
          verification={verifications["1"]}
          variant="chip"
        />
        {" "}and the invoice shows{" "}
        <CitationComponent
          citation={citations["2"]}
          verification={verifications["2"]}
          variant="chip"
        />
        .
      </p>

      {/* Sources list at bottom */}
      <div className="sources">
        <h4>Sources</h4>
        {Object.entries(citations).map(([key, citation]) => (
          <CitationComponent
            key={key}
            citation={citation}
            verification={verifications[key]}
            variant="badge"
          />
        ))}
      </div>
    </div>
  );
}
```

---

## Custom Styling with className

Override default styles using CSS class targeting:

```tsx
// Common style overrides using className
<CitationComponent
  citation={citation}
  verification={verification}
  className="my-custom-citation"
  variant="linter"
/>
```

### CSS Class Targets

| Class | Element |
|:------|:--------|
| `.dc-citation-wrapper` | The outer container |
| `.dc-citation-text` | The text content |
| `.dc-citation-indicator` | The checkmark/warning icon |

```css
/* Example: Custom styling for your application */
.my-custom-citation .dc-citation-text {
  font-weight: 600;
}

.my-custom-citation .dc-citation-indicator {
  margin-left: 0.25rem;
}
```

---

## Next Steps

- [Components]({{ site.baseurl }}/components/) - Full component API reference
- [Styling]({{ site.baseurl }}/styling/) - CSS customization options
- [Code Examples]({{ site.baseurl }}/code-examples/) - More integration patterns
