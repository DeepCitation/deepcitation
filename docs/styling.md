---
layout: default
title: Styling
parent: Code Examples
nav_order: 2
description: "CSS customization options for CitationComponent"
commit_sha: "cc9c7aa"
stale_after_commits: 20
watch_paths:
  - src/react/constants.ts
  - src/react/Citation.tsx
  - src/react/CitationVariants.tsx
  - src/react/DeepCitationTheme.tsx
  - src/tailwind.css
  - src/styles.css
---

# Styling

Customize the appearance of DeepCitation components using `--dc-*` CSS custom properties, the `<DeepCitationTheme>` React component, or Tailwind utilities.

---

## Brand Your Citations in 5 Lines

```css
:root {
  --dc-primary: #6366f1;        /* indigo accent */
  --dc-verified: #059669;       /* teal success */
  --dc-verified-bg: #ecfdf5;    /* light teal chip bg */
  --dc-radius-lg: 0.75rem;      /* rounder corners */
}
```

---

## Token Reference

### Surface & Text

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--dc-background` | `#ffffff` | `#27272a` | Card / popover / drawer surface |
| `--dc-muted` | `#f4f4f5` | `#3f3f46` | Subdued surface: code blocks, tab bars |
| `--dc-foreground` | `#18181b` | `#fafafa` | Primary text: headings, labels |
| `--dc-muted-foreground` | `#71717a` | `#a1a1aa` | Body text, secondary labels |
| `--dc-subtle-foreground` | `#a1a1aa` | `#71717a` | Icons, timestamps, tertiary text |
| `--dc-border` | `#e4e4e7` | `#3f3f46` | Borders and dividers |
| `--dc-ring` | `#3b82f6` | `#3b82f6` | Focus ring |

### Primary Accent

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--dc-primary` | `#3b82f6` | `#60a5fa` | Active tabs, links, interactive accent |
| `--dc-primary-foreground` | `#ffffff` | `#ffffff` | Text on primary surfaces |

### Status Colors

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--dc-verified` | `#10b981` | `#34d399` | Verified / success indicator |
| `--dc-partial` | `#f59e0b` | `#fbbf24` | Partial match / warning |
| `--dc-destructive` | `#ef4444` | `#f87171` | Not found / error |
| `--dc-pending` | `#a1a1aa` | `#71717a` | Loading / unresolved |

### Status Tint Backgrounds

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--dc-verified-bg` | `#f0fdf4` | `rgba(34,197,94,0.1)` | Verified chip/banner background |
| `--dc-verified-border` | `#86efac` | `#166534` | Verified chip/banner border |
| `--dc-verified-hover` | `#15803d` | `#bbf7d0` | Verified chip hover background |
| `--dc-partial-bg` | `#fffbeb` | `rgba(245,158,11,0.1)` | Partial chip/banner background |
| `--dc-partial-border` | `#fcd34d` | `#92400e` | Partial chip/banner border |
| `--dc-partial-hover` | `#b45309` | `#fde68a` | Partial chip hover background |
| `--dc-destructive-bg` | `#fef2f2` | `rgba(239,68,68,0.1)` | Error chip/banner background |
| `--dc-destructive-border` | `#fca5a5` | `#991b1b` | Error chip/banner border |
| `--dc-destructive-hover` | `#b91c1c` | `#fecaca` | Destructive chip hover background |
| `--dc-pending-bg` | `var(--dc-muted)` | `var(--dc-muted)` | Pending chip background |
| `--dc-pending-border` | `var(--dc-border)` | `var(--dc-border)` | Pending chip border |
| `--dc-pending-hover` | `#71717a` | `#a1a1aa` | Pending chip hover background |

### Border Radius

| Token | Default | Tailwind class |
|-------|---------|----------------|
| `--dc-radius-sm` | `0.25rem` | `rounded-dc-sm` |
| `--dc-radius-md` | `0.375rem` | `rounded-dc-md` |
| `--dc-radius-lg` | `0.5rem` | `rounded-dc-lg` |

### Font

| Token | Default | Tailwind class |
|-------|---------|----------------|
| `--dc-font-family` | system font stack | `font-dc` |

`--dc-popover-font` is a backward-compat alias that resolves to `var(--dc-font-family)`.

---

## Dark Mode

```css
.dark {
  --dc-primary: #818cf8;
  --dc-verified: #34d399;
  --dc-verified-bg: rgba(34, 197, 94, 0.1);
  --dc-verified-border: #166534;
  --dc-radius-lg: 0.75rem;
}
```

Or use `prefers-color-scheme`:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --dc-primary: #818cf8;
    --dc-verified: #34d399;
  }
}
```

---

## React Component Theming

### Global

```tsx
import { DeepCitationTheme } from "deepcitation/react";

<DeepCitationTheme
  theme={{
    primary: "#6366f1",
    verified: "#059669",
    verifiedBg: "#ecfdf5",
    radiusLg: "0.75rem",
    fontFamily: "Georgia, serif",
  }}
  darkTheme={{
    primary: "#818cf8",
    verified: "#34d399",
    verifiedBg: "rgba(34, 197, 94, 0.1)",
  }}
/>
```

### Scoped (per-instance)

```tsx
<DeepCitationTheme
  scoped
  theme={{ primary: "#ec4899", verified: "#14b8a6" }}
>
  <CitationComponent citation={citation} verification={verification} />
</DeepCitationTheme>
```

When `scoped` is true, a `<div>` wrapper sets CSS custom properties for that subtree only.

---

## Brand Examples

### Warm brand

```css
:root {
  --dc-primary: #d97706;
  --dc-verified: #059669;
  --dc-verified-bg: #ecfdf5;
  --dc-partial: #ea580c;
  --dc-partial-bg: #fff7ed;
  --dc-radius-lg: 0.75rem;
  --dc-font-family: Georgia, "Times New Roman", serif;
}
```

### Cool brand

```css
:root {
  --dc-primary: #6366f1;
  --dc-verified: #0891b2;
  --dc-verified-bg: #ecfeff;
  --dc-partial: #7c3aed;
  --dc-partial-bg: #f5f3ff;
  --dc-radius-lg: 1rem;
}
```

### Monochrome

```css
:root {
  --dc-primary: #525252;
  --dc-verified: #404040;
  --dc-verified-bg: #f5f5f5;
  --dc-partial: #737373;
  --dc-partial-bg: #fafafa;
  --dc-destructive: #525252;
  --dc-destructive-bg: #f5f5f5;
  --dc-radius-lg: 0;
}
```

---

## Indicator Variants

The `indicatorVariant` prop controls status display:

```tsx
<CitationComponent citation={citation} verification={verification} />
<CitationComponent citation={citation} verification={verification} indicatorVariant="dot" />
```

---

## CSS Class Targets

```css
[data-dc-indicator="verified"] { color: var(--dc-verified); }
[data-dc-indicator="partial"]  { color: var(--dc-partial); }
[data-dc-indicator="error"]    { color: var(--dc-destructive); }
[data-dc-indicator="pending"]  { color: var(--dc-pending); }
```

### Available Data Attributes

| Attribute | Values | Description |
|-----------|--------|-------------|
| `data-dc-indicator` | `verified`, `partial`, `pending`, `error` | Citation status indicator |
| `data-citation-id` | string | Unique citation identifier |
| `data-dc-theme-scope` | (present) | Scoped theme wrapper |

---

## Without Tailwind CSS

Import the bundled stylesheet:

```typescript
import "deepcitation/styles.css";
```

Or reference the Tailwind source for your own build:

```typescript
import "deepcitation/tailwind.css";
```

---

## Related

- [Components]({{ site.baseurl }}/components/) - Component API reference
- [Getting Started]({{ site.baseurl }}/getting-started/) - Installation and setup
