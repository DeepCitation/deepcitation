# DeepCitation SDK — Sub-Brand Guide

The SDK is a **sub-brand** of DeepCitation. It is designed to embed harmoniously within any host application, so its visual defaults intentionally differ from the DeepCitation web app.

---

## Sub-Brand vs Web App

| Property | Web App | SDK |
|----------|---------|-----|
| Color palette | Slate scale (`slate-*`) | `--dc-*` CSS custom properties |
| Border radius | Sharp (`rounded-none`) | Soft (`rounded-dc-lg` / 0.5rem) |
| Font | Inter (loaded) | System font stack (`--dc-font-family`) |
| Customization | Tailwind classes | `--dc-*` tokens + `<DeepCitationTheme>` React prop |

The soft corners and system font ensure the SDK feels at home in any host UI without imposing the web app's editorial aesthetic.

---

## Color Tokens

All SDK colors are expressed as `--dc-*` CSS custom properties. Host applications can override the entire palette via CSS or the `DeepCitationTheme` React component.

### Surface & Text

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--dc-background` | `#ffffff` | `#27272a` | Card / popover / drawer surface |
| `--dc-muted` | `#f4f4f5` | `#3f3f46` | Subdued surface: code blocks, tab bars |
| `--dc-foreground` | `#18181b` | `#fafafa` | Primary text |
| `--dc-muted-foreground` | `#71717a` | `#a1a1aa` | Body text, secondary labels |
| `--dc-subtle-foreground` | `#a1a1aa` | `#71717a` | Icons, timestamps, tertiary text |
| `--dc-border` | `#e4e4e7` | `#3f3f46` | Borders and dividers |
| `--dc-ring` | `#3b82f6` | `#3b82f6` | Focus ring |

### Primary Accent

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--dc-primary` | `#3b82f6` | `#60a5fa` | Active tabs, links, interactive accent |
| `--dc-primary-foreground` | `#ffffff` | `#ffffff` | Text on primary surfaces |

### Verification Status

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--dc-verified` | `#10b981` | `#34d399` | Verified citation (emerald-500 / emerald-400) |
| `--dc-partial` | `#f59e0b` | `#fbbf24` | Partial match |
| `--dc-destructive` | `#ef4444` | `#f87171` | Not found / error |
| `--dc-pending` | `#a1a1aa` | `#71717a` | Pending / loading |

### Status Tint Backgrounds

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
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

---

## Customization

### CSS (global override)

```css
:root {
  --dc-background: #fdfbf7;
  --dc-border: #e2e0dc;
  --dc-verified: #0d9488;
  --dc-primary: #6366f1;
  --dc-radius-lg: 0.75rem;
}
.dark {
  --dc-background: #1c1917;
  --dc-border: #44403c;
  --dc-primary: #818cf8;
}
```

### React component

```tsx
import { DeepCitationTheme } from "deepcitation/react";

<DeepCitationTheme
  theme={{
    background: "#fdfbf7",
    border: "#e2e0dc",
    verified: "#0d9488",
    primary: "#6366f1",
    radiusLg: "0.75rem",
  }}
  darkTheme={{ background: "#1c1917", border: "#44403c", primary: "#818cf8" }}
/>
```

### Scoped theming (per-instance)

```tsx
<DeepCitationTheme scoped theme={{ primary: "#ec4899" }}>
  <CitationComponent citation={citation} verification={verification} />
</DeepCitationTheme>
```

All `--dc-*` tokens are accepted as camelCase props (e.g. `mutedForeground`, `verifiedBg`, `radiusLg`, `fontFamily`).

---

## Typography

The SDK uses the system font stack. **Never** load or reference Inter, Playfair Display, or any external font in SDK components.

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
```

Override via `--dc-font-family` or the `fontFamily` prop on `<DeepCitationTheme>`.

---

## Animation Timing

Shared 5-tier scale with the web app. Import constants from `src/react/constants.ts` — never inline values.

| Constant | Duration | Easing | Usage |
|----------|----------|--------|-------|
| `ANIM_INSTANT_MS` | 80ms | `EASE_EXPAND` | Hover states ("The Spark") |
| `ANIM_FAST_MS` | 120ms | `EASE_EXPAND` | Popover entry, list expand |
| `ANIM_STANDARD_MS` | 180ms | `EASE_COLLAPSE` | Geometry changes, drawer |
| `ANIM_MEASURED_MS` | 250ms | `EASE_COLLAPSE` | Cross-component morph |
| `ANIM_SLOW_MS` | 350ms | `ease-out` | Staged sequences |

**Asymmetric timing is required:** expand >= collapse. Use `EASE_EXPAND = cubic-bezier(0.34, 1.02, 0.64, 1)` and `EASE_COLLAPSE = cubic-bezier(0.2, 0, 0, 1)` — never inline cubic-bezier strings.

---

## Border Radius

SDK uses `rounded-dc-lg` (`--dc-radius-lg`, default 0.5rem) as default. This is the opposite of the web app's `rounded-none`.

| Element | Token/Class |
|---------|-------------|
| Popover container | `rounded-dc-lg` |
| Evidence tray | `rounded-dc-lg` |
| Tab bars, code blocks | `rounded-dc-md` / `rounded-dc-lg` |
| Buttons within popover | `rounded-dc-md` |
| Status badges | `rounded-full` (not tokenized) |

---

## Key Rules for Contributors

- Use `text-dc-*` / `bg-dc-*` / `border-dc-*` Tailwind classes — never hardcode `slate-N` or `green-N` for persistent colors
- Use `bg-dc-verified-bg` not `bg-green-100`, `text-dc-primary` not `text-blue-700`
- Use `rounded-dc-lg` / `rounded-dc-md` / `rounded-dc-sm` — never plain `rounded-lg` for brandable containers
- Do not add external font dependencies
- Do not override `--dc-*` tokens with `!important` or inline styles
- Animation timing constants live in `src/react/constants.ts` — do not inline values

---

## References

- Full implementation rules for contributors modifying SDK internals: [`docs/agents/branding.md`](docs/agents/branding.md)
- Web app brand (full brand spec): [`packages/deepcitation-web/BRANDING.md`](../deepcitation-web/BRANDING.md)
- Styling guide for consumers: [docs.deepcitation.com/styling](https://docs.deepcitation.com/styling)
