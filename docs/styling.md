---
layout: default
title: Styling
parent: Code Examples
nav_order: 2
description: "CSS customization options for CitationComponent"
---

# Styling

Customize the appearance of CitationComponent using CSS custom properties, class names, and Tailwind utilities.

---

## CSS Custom Properties

Override these CSS variables to theme all DeepCitation components at once:

```css
:root {
  /* Status indicator colors */
  --dc-verified-color: #16a34a;   /* Green - verified/exact match (default: green-600) */
  --dc-partial-color: #f59e0b;    /* Amber - partial match (default: amber-500) */
  --dc-error-color: #ef4444;      /* Red - not found/hallucination (default: red-500) */
  --dc-pending-color: #9ca3af;    /* Gray - loading/pending (default: gray-400) */

  /* Wavy underline for "not found" status (non-linter variants) */
  --dc-wavy-underline-color: #ef4444;  /* Default: red-500 */

  /* Linter variant underline colors */
  --dc-linter-success: #16a34a;   /* Solid green underline for verified */
  --dc-linter-warning: #f59e0b;   /* Dashed amber underline for partial */
  --dc-linter-error: #ef4444;     /* Wavy red underline for not found */
  --dc-linter-pending: #9ca3af;   /* Dotted gray underline for pending */

  /* Popover dimensions */
  --dc-popover-width: 384px;      /* Popover container width */
}
```

### Dark Mode

```css
@media (prefers-color-scheme: dark) {
  :root {
    --dc-verified-color: #4ade80;     /* green-400 */
    --dc-partial-color: #fbbf24;      /* amber-400 */
    --dc-error-color: #f87171;        /* red-400 */
    --dc-pending-color: #6b7280;      /* gray-500 */
    --dc-linter-success: #4ade80;
    --dc-linter-warning: #fbbf24;
    --dc-linter-error: #f87171;
    --dc-linter-pending: #6b7280;
  }
}

/* Or with a class-based approach (Tailwind dark mode) */
.dark {
  --dc-verified-color: #4ade80;
  --dc-partial-color: #fbbf24;
  --dc-error-color: #f87171;
  --dc-pending-color: #6b7280;
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

---

## Tailwind CSS Integration

If using Tailwind CSS, components work out of the box. You can add utility classes:

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

---

## Without Tailwind CSS

Import the bundled stylesheet:

```typescript
import "@deepcitation/deepcitation-js/styles.css";
```

Or reference the Tailwind source for your own build:

```typescript
import "@deepcitation/deepcitation-js/tailwind.css";
```

---

## CSS Class Targets

Target specific citation elements using data attributes and selectors:

```css
/* All citations with verified status */
[data-dc-indicator="verified"] {
  font-weight: 500;
}

/* Verified citations - specific styling */
[data-dc-indicator="verified"] {
  color: var(--dc-verified-color);
}

/* Partial match citations */
[data-dc-indicator="partial"] {
  color: var(--dc-partial-color);
}

/* Not found / hallucination citations */
[data-dc-indicator="error"] {
  color: var(--dc-error-color);
}

/* Pending / loading citations */
[data-dc-indicator="pending"] {
  color: var(--dc-pending-color);
}

/* Citation trigger element */
[data-citation-id] {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

/* On hover */
[data-citation-id]:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

[data-citation-id]:hover:dark {
  background-color: rgba(255, 255, 255, 0.05);
}
```

### Available Data Attributes

| Attribute | Values | Description |
|-----------|--------|-------------|
| `data-dc-indicator` | `verified`, `partial`, `pending`, `error` | Citation status indicator |
| `data-citation-id` | string | Unique citation identifier (present on trigger element) |

---

## Animation

Add animations to citations:

```css
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

---

## Related

- [Components]({{ site.baseurl }}/components/) - Component API reference
- [Getting Started]({{ site.baseurl }}/getting-started/) - Installation and setup
- [Error Handling]({{ site.baseurl }}/error-handling/) - Production error patterns
