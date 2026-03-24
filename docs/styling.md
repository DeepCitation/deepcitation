---
layout: default
title: Styling
nav_order: 8
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

DeepCitation ships with a full set of dark-mode tokens that activate when a `.dark` class is present on **any ancestor element** (including `<html>` or `<body>`). No extra CSS import is needed — the built-in `tokens.css` already defines both `:root` (light) and `.dark` (dark) defaults.

### How dark mode activates

| Approach | How it works |
|----------|-------------|
| **Class-based** (Tailwind, shadcn/ui, Next.js themes) | Add `class="dark"` to `<html>` or `<body>`. DeepCitation's `.dark { … }` selector matches automatically. |
| **`prefers-color-scheme`** | Use a media query to set tokens when the OS is in dark mode. |
| **React component** | Pass `darkTheme` to `<DeepCitationTheme>` — it injects a `.dark { … }` style block for you. |

### Force dark mode (class-based)

If your app already toggles a `.dark` class, DeepCitation picks it up with zero config. To **always** render citations in dark mode regardless of user preference:

```html
<!-- Wrap citations in a .dark ancestor -->
<div class="dark">
  <!-- all DeepCitation components inside here render in dark mode -->
</div>
```

Or set it globally:

```html
<html class="dark">
```

You can override specific dark-mode tokens in CSS:

```css
.dark {
  --dc-primary: #818cf8;
  --dc-verified: #34d399;
  --dc-verified-bg: rgba(34, 197, 94, 0.1);
  --dc-verified-border: #166534;
  --dc-radius-lg: 0.75rem;
}
```

### Auto dark mode (`prefers-color-scheme`)

Let the browser switch automatically based on the OS setting:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --dc-background: #27272a;
    --dc-muted: #3f3f46;
    --dc-foreground: #fafafa;
    --dc-muted-foreground: #a1a1aa;
    --dc-border: #3f3f46;
    --dc-primary: #818cf8;
    --dc-verified: #34d399;
    --dc-verified-bg: rgba(34, 197, 94, 0.1);
  }
}
```

> **Tip:** If you use `prefers-color-scheme`, you generally don't need the `.dark` class approach — pick one or the other to avoid conflicts.

### Force dark mode (React)

```tsx
import { DeepCitationTheme } from "deepcitation/react";

// Apply dark tokens globally, regardless of .dark class
<DeepCitationTheme
  theme={{
    background: "#27272a",
    muted: "#3f3f46",
    foreground: "#fafafa",
    mutedForeground: "#a1a1aa",
    border: "#3f3f46",
    primary: "#60a5fa",
    verified: "#34d399",
    verifiedBg: "rgba(34, 197, 94, 0.1)",
  }}
/>
```

This injects the dark palette into `:root` directly, so it applies everywhere — no `.dark` class needed.

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

### Y Combinator

A complete rebrand showing how to match an external brand identity — YC's signature orange with clean, tight UI.

```css
:root {
  /* YC orange as the primary accent */
  --dc-primary: #f26522;
  --dc-primary-foreground: #ffffff;

  /* Surfaces — warm off-white background */
  --dc-background: #ffffff;
  --dc-muted: #faf5f0;
  --dc-foreground: #1a1a1a;
  --dc-muted-foreground: #6b6b6b;
  --dc-subtle-foreground: #999999;
  --dc-border: #e5e0db;

  /* Status colors in the YC palette */
  --dc-verified: #f26522;
  --dc-verified-bg: #fff4ed;
  --dc-verified-border: #fdba8c;
  --dc-verified-hover: #c44d15;
  --dc-partial: #d97706;
  --dc-partial-bg: #fffbeb;
  --dc-partial-border: #fcd34d;
  --dc-destructive: #dc2626;
  --dc-destructive-bg: #fef2f2;
  --dc-destructive-border: #fca5a5;

  /* Tight, modern radii */
  --dc-radius-sm: 0.125rem;
  --dc-radius-md: 0.25rem;
  --dc-radius-lg: 0.375rem;

  /* Clean sans-serif stack */
  --dc-font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
}
```

Dark mode companion:

```css
.dark {
  --dc-primary: #ff8c55;
  --dc-background: #1a1a1a;
  --dc-muted: #2a2420;
  --dc-foreground: #f5f5f5;
  --dc-muted-foreground: #a3a3a3;
  --dc-subtle-foreground: #737373;
  --dc-border: #3d3530;

  --dc-verified: #ff8c55;
  --dc-verified-bg: rgba(242, 101, 34, 0.1);
  --dc-verified-border: #7c2d12;
  --dc-verified-hover: #fdba8c;
}
```

Or via the React component:

```tsx
<DeepCitationTheme
  theme={{
    primary: "#f26522",
    primaryForeground: "#ffffff",
    background: "#ffffff",
    muted: "#faf5f0",
    foreground: "#1a1a1a",
    mutedForeground: "#6b6b6b",
    border: "#e5e0db",
    verified: "#f26522",
    verifiedBg: "#fff4ed",
    verifiedBorder: "#fdba8c",
    verifiedHover: "#c44d15",
    radiusSm: "0.125rem",
    radiusMd: "0.25rem",
    radiusLg: "0.375rem",
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  }}
  darkTheme={{
    primary: "#ff8c55",
    background: "#1a1a1a",
    muted: "#2a2420",
    foreground: "#f5f5f5",
    border: "#3d3530",
    verified: "#ff8c55",
    verifiedBg: "rgba(242, 101, 34, 0.1)",
    verifiedBorder: "#7c2d12",
    verifiedHover: "#fdba8c",
  }}
/>
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

Or reference the Tailwind v4 source configuration for your own build:

```css
@import "deepcitation/tailwind.css";
```

> **Important (Tailwind v4):** Tailwind does not scan `node_modules` for class
> usage. Add an explicit `@source` directive so the utility classes used by
> DeepCitation components are generated:
>
> ```css
> @source "../node_modules/deepcitation/lib/react";
> ```
>
> Adjust the relative path to match your CSS file's location relative to
> `node_modules`.

---

## Related

- [Components]({{ site.baseurl }}/components/) - Component API reference
- [Getting Started]({{ site.baseurl }}/getting-started/) - Installation and setup
