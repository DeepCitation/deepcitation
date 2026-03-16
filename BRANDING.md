# DeepCitation SDK — Sub-Brand Guide

The SDK is a **sub-brand** of DeepCitation. It is designed to embed harmoniously within any host application, so its visual defaults intentionally differ from the DeepCitation web app.

---

## Sub-Brand vs Web App

| Property | Web App | SDK |
|----------|---------|-----|
| Color palette | Slate scale (`slate-*`) | `--dc-*` CSS custom properties |
| Border radius | Sharp (`rounded-none`) | Soft (`rounded-lg` / 8px) |
| Font | Inter (loaded) | System font stack |
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

### Verification Status

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--dc-verified` | `#16a34a` | `#22c55e` | Verified citation |
| `--dc-partial` | `#f59e0b` | `#fbbf24` | Partial match |
| `--dc-destructive` | `#ef4444` | `#f87171` | Not found / error |
| `--dc-pending` | `#a1a1aa` | `#71717a` | Pending / loading |

---

## Customization

### CSS (global override)

```css
:root {
  --dc-background: #fdfbf7;
  --dc-border: #e2e0dc;
  --dc-verified: #0d9488;
}
.dark {
  --dc-background: #1c1917;
  --dc-border: #44403c;
}
```

### React component

```tsx
import { DeepCitationTheme } from "deepcitation";

<DeepCitationTheme
  theme={{ background: "#fdfbf7", border: "#e2e0dc", verified: "#0d9488" }}
  darkTheme={{ background: "#1c1917", border: "#44403c" }}
/>
```

All `--dc-*` tokens are accepted as camelCase props (e.g. `mutedForeground`, `subtleForeground`).

---

## Typography

The SDK uses the system font stack. **Never** load or reference Inter, Playfair Display, or any external font in SDK components.

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
```

---

## Key Rules for Contributors

- Use `text-dc-*` / `bg-dc-*` / `border-dc-*` Tailwind classes — never hardcode `slate-N` for persistent colors
- Use `rounded-lg` (8px) for containers — never `rounded-none`
- Do not add external font dependencies
- Do not override `--dc-*` tokens with `!important` or inline styles
- Animation timing constants live in `src/react/constants.ts` — do not inline values

---

## References

- Full implementation rules for contributors modifying SDK internals: [`docs/agents/branding.md`](docs/agents/branding.md)
- Web app brand (full brand spec): [`packages/deepcitation-web/BRANDING.md`](../deepcitation-web/BRANDING.md)
- Styling guide for consumers: [docs.deepcitation.com/styling](https://docs.deepcitation.com/styling)
