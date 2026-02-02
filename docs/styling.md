---
layout: default
title: Styling
parent: Code Examples
nav_order: 2
description: "CSS customization options for CitationComponent"
---

# Styling

Customize the appearance of CitationComponent using CSS custom properties.

---

## CSS Custom Properties

Override the default colors using CSS custom properties:

```css
:root {
  /* Text colors */
  --dc-color-verified: #2563eb;     /* Blue for found citations */
  --dc-color-success: #16a34a;      /* Green checkmark for exact match */
  --dc-color-partial: #f59e0b;      /* Orange checkmark for partial match */

  /* Backgrounds */
  --dc-hover-bg: rgba(59, 130, 246, 0.08);
  --dc-verified-hover-bg: rgba(37, 99, 235, 0.08);
  --dc-miss-hover-bg: rgba(148, 163, 184, 0.1);

  /* Popover */
  --dc-popover-bg: #ffffff;
  --dc-border-color: #e2e8f0;
}
```

---

## Dark Mode

For dark mode support, define the variables within a dark mode context:

```css
/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
  :root {
    --dc-color-verified: #60a5fa;    /* Lighter blue for dark mode */
    --dc-color-success: #4ade80;     /* Lighter green */
    --dc-popover-bg: #1e293b;        /* Dark background */
    --dc-border-color: #334155;      /* Dark border */
  }
}

/* Or with a class-based approach */
.dark {
  --dc-color-verified: #60a5fa;
  --dc-popover-bg: #1e293b;
}
```

---

## CSS Class Targets

Target specific elements within the component:

| Class | Element | Description |
|:------|:--------|:------------|
| `.dc-citation-wrapper` | Outer container | The main wrapper element |
| `.dc-citation-text` | Text content | The citation text/anchorText |
| `.dc-citation-indicator` | Status icon | Checkmark, warning, or spinner |
| `.dc-citation-popover` | Popover container | The hover tooltip |

### Example: Custom Styling

```css
/* Make citations bold */
.dc-citation-text {
  font-weight: 600;
}

/* Increase indicator spacing */
.dc-citation-indicator {
  margin-left: 0.25rem;
}

/* Custom popover styling */
.dc-citation-popover {
  border-radius: 0.5rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}
```

---

## Using className Prop

Pass custom classes to the component:

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  className="my-custom-citation"
/>
```

```css
/* Target your custom class */
.my-custom-citation {
  /* Your styles */
}

.my-custom-citation .dc-citation-text {
  text-decoration: underline;
}
```

---

## Variant-Specific Styling

Each variant has its own base styles that can be overridden:

### Chip Variant

```css
/* Customize chip appearance */
.dc-citation-wrapper[data-variant="chip"] {
  border-radius: 9999px;
  padding: 0.25rem 0.75rem;
}
```

### Brackets Variant

```css
/* Customize brackets appearance */
.dc-citation-wrapper[data-variant="brackets"] .dc-citation-text::before {
  content: "[";
}
.dc-citation-wrapper[data-variant="brackets"] .dc-citation-text::after {
  content: "]";
}
```

### Superscript Variant

```css
/* Customize superscript size */
.dc-citation-wrapper[data-variant="superscript"] {
  font-size: 0.75em;
  vertical-align: super;
}
```

---

## Status-Based Styling

Style citations based on their verification status:

```css
/* Verified citations */
.dc-citation-wrapper[data-status="verified"] {
  /* Styles for found citations */
}

/* Partial matches */
.dc-citation-wrapper[data-status="partial"] {
  /* Styles for partial matches */
}

/* Not found (hallucinations) */
.dc-citation-wrapper[data-status="miss"] {
  opacity: 0.7;
  text-decoration: line-through;
}

/* Pending verification */
.dc-citation-wrapper[data-status="pending"] {
  opacity: 0.5;
}
```

---

## Tailwind CSS Integration

If using Tailwind CSS, you can use utility classes directly:

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  className="font-semibold hover:underline"
/>
```

Or define component styles in your CSS:

```css
@layer components {
  .citation-legal {
    @apply font-serif text-blue-800 dark:text-blue-300;
  }

  .citation-medical {
    @apply font-mono text-sm text-green-700 dark:text-green-400;
  }
}
```

```tsx
<CitationComponent
  citation={citation}
  verification={verification}
  className="citation-legal"
/>
```

---

## Animation

Add animations to citations:

```css
/* Fade in when verification completes */
.dc-citation-wrapper {
  transition: opacity 0.2s ease-in-out;
}

/* Pulse animation for pending state */
.dc-citation-wrapper[data-status="pending"] {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

---

## Print Styles

Optimize for printing:

```css
@media print {
  .dc-citation-wrapper {
    color: black !important;
    text-decoration: underline;
  }

  .dc-citation-indicator {
    display: none;
  }

  .dc-citation-popover {
    display: none;
  }
}
```
