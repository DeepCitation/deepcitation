# DeepCitation SDK — Sub-Brand Guide

Open this file before styling, theming, or modifying any visual element in the SDK's React layer.

The SDK is a **sub-brand** of DeepCitation, designed to embed harmoniously within host applications. It intentionally differs from the web app's full brand to ensure compatibility with any host design system.

---

## Sub-Brand vs Web App Brand

| Property | Web App (Full Brand) | SDK (Sub-Brand) | Rationale |
|----------|---------------------|-----------------|-----------|
| Palette | Slate scale (`slate-*`) | `--dc-*` semantic tokens | Tokens make the whole palette host-overridable at once |
| Border Radius | `rounded-none` (sharp) | `rounded-lg` (soft) | Soft corners feel less intrusive in host UIs |
| Font | Inter (loaded) | System font stack | No external font dependency for SDK consumers |
| Customization | Tailwind classes | `--dc-*` CSS custom properties + `<DeepCitationTheme>` | Hosts override via standard CSS or React prop, no build tool needed |

**Never** apply Inter font or `rounded-none` to SDK components. Slate utility classes (`slate-*`) may appear for interaction states (hover, active) but all persistent colors must use `--dc-*` tokens.

---

## Color System

The SDK uses `--dc-*` CSS custom properties for all colors. Every color must be overridable by host applications via CSS or `<DeepCitationTheme>`.

The Tailwind classes `bg-dc-*`, `text-dc-*`, `border-dc-*` are registered via `@theme inline` in `src/styles.css` and `src/tailwind.css`. Each class resolves to the corresponding `--dc-*` custom property, so all components update automatically when a host overrides a token.

### Surface & Text Tokens

| Token | Light Default | Dark Default | Usage |
|-------|--------------|--------------|-------|
| `--dc-background` | `#ffffff` | `#27272a` | Card / popover / drawer surface |
| `--dc-muted` | `#f4f4f5` | `#3f3f46` | Subdued surface: code blocks, tab bars |
| `--dc-foreground` | `#18181b` | `#fafafa` | Primary text: headings, labels |
| `--dc-muted-foreground` | `#71717a` | `#a1a1aa` | Body text, secondary labels |
| `--dc-subtle-foreground` | `#a1a1aa` | `#71717a` | Icons, timestamps, tertiary text |
| `--dc-border` | `#e4e4e7` | `#3f3f46` | All borders and dividers |
| `--dc-ring` | `#3b82f6` | `#3b82f6` | Focus ring color |

### Primary Accent

| Token | Light Default | Dark Default | Usage |
|-------|--------------|--------------|-------|
| `--dc-primary` | `#3b82f6` | `#60a5fa` | Active tabs, links, interactive accent |
| `--dc-primary-foreground` | `#ffffff` | `#ffffff` | Text on primary surfaces |

### Status Indicator Colors

| Token | Light Default | Dark Default | Usage |
|-------|--------------|--------------|-------|
| `--dc-verified` | `#10b981` | `#34d399` | Verified/success indicator (emerald-500 / emerald-400) |
| `--dc-partial` | `#f59e0b` | `#fbbf24` | Partial match / warning indicator |
| `--dc-destructive` | `#ef4444` | `#f87171` | Error/not-found indicator |
| `--dc-pending` | `#a1a1aa` | `#71717a` | Pending/loading indicator |
| `--dc-wavy-underline-color` | `#ef4444` (red-500) | — | Miss/hallucination underline |

### Status Tint Backgrounds

| Token | Light Default | Dark Default | Usage |
|-------|--------------|--------------|-------|
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

### Border Radius Tokens

| Token | Default | Tailwind class |
|-------|---------|----------------|
| `--dc-radius-sm` | `0.25rem` | `rounded-dc-sm` |
| `--dc-radius-md` | `0.375rem` | `rounded-dc-md` |
| `--dc-radius-lg` | `0.5rem` | `rounded-dc-lg` |

### Font Token

| Token | Default | Tailwind class |
|-------|---------|----------------|
| `--dc-font-family` | system font stack | `font-dc` |

**Backward-compat aliases** (in `src/styles.css` only): `--dc-popover-bg`, `--dc-popover-font`, `--dc-verified-color`, `--dc-partial-color`, `--dc-error-color`, `--dc-pending-color` — these still resolve correctly for old consumer CSS that reads these vars. New code should use the canonical tokens above.

### Accent Considerations

The SDK has one notable secondary accent beyond the standard status palette: the anchor-text highlight used when a narrower verified anchor sits inside a broader verified phrase.

| Concept | Default | Usage |
|---------|---------|-------|
| Anchor text highlight (light) | `rgba(251, 191, 36, 0.2)` | Amber fill behind anchor text when it differs from the full verified phrase |
| Anchor text highlight (dark) | `rgba(251, 191, 36, 0.25)` | Slightly stronger amber fill for dark proof contexts |

These values come from `src/drawing/citationDrawing.ts` as `ANCHOR_HIGHLIGHT_COLOR` and `ANCHOR_HIGHLIGHT_COLOR_DARK`.

Treat this amber as a **difference-revealing accent** and a small part of the DeepCitation visual identity, not as a general brand color. It should appear only inside proof/evidence rendering where the UI needs to show that the anchor text is a subset of a larger verified phrase.

### Surface & Layout

| Property | Default | Usage |
|----------|---------|-------|
| `--dc-popover-width` | `480px` | Popover container width |
| `--dc-keyhole-strip-height` | `120px` | Evidence keyhole strip height |
| `--dc-document-canvas-bg-light` | `rgb(244 244 245)` | Light-mode proof image background |
| `--dc-document-canvas-bg-dark` | `rgb(39 39 42)` | Dark-mode proof image background |
| `--dc-guard-max-width` | `calc(100dvw - 2rem)` | Viewport-constrained max width |

### Surface Alignment Considerations

The web app brand uses a more editorial surface system built around warm whites and a slate structure:

| Web Brand Token | Value | Meaning |
|-----------------|-------|---------|
| `paper-white` | `#FDFBF7` | Warm white, selection highlight, editorial shell |
| `cream` | `#fdfcfa` | Page-level surfaces |
| `slate-0` | `#FFFFFF` | Pure white cards and inputs |
| `slate-50` | `#FAFAFA` | Light backgrounds, cards |
| `slate-100` | `#F4F4F5` | Secondary backgrounds |
| `slate-200` | `#E4E4E7` | Light borders |
| `slate-300` | `#D4D4D8` | Disabled states |
| `slate-400` | `#A1A1AA` | Tertiary text |
| `slate-500` | `#71717A` | Secondary text |
| `slate-600` | `#52525B` | Body text |
| `slate-700` | `#3F3F46` | Strong text, dark borders |
| `slate-800` | `#27272A` | Dark section backgrounds |
| `slate-900` | `#18181B` | Dark mode surfaces |
| `slate-950` | `#09090B` | Deepest dark / chassis |

For the SDK, these are **reference surfaces, not defaults**:

- Do not hardcode the web app's cream/slate tokens into reusable SDK components.
- If a demo page, docs page, or first-party wrapper wants to feel closer to the web brand, use `paper-white` or `cream` for the surrounding page shell and keep the embedded SDK itself host-overridable through `--dc-*` tokens.
- If you need a first-party preset that echoes the web brand, expose it through overridable custom properties rather than importing web-app Tailwind classes or fixed slate values directly.
- Keep proof/document canvases visually neutral enough that the amber anchor highlight and verified/error states remain legible against both host themes and first-party branded wrappers.
- Preserve the yellow anchor highlight as a special semantic accent; do not repurpose it for CTA chrome, warnings, or generic decorative emphasis.

### Host Override Examples

**CSS (global):**
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

**React component (declarative):**
```tsx
import { DeepCitationTheme } from "deepcitation/react";

<DeepCitationTheme
  theme={{ background: "#fdfbf7", border: "#e2e0dc", verified: "#0d9488" }}
  darkTheme={{ background: "#1c1917", border: "#44403c" }}
/>
```

All `--dc-*` tokens in the table above are accepted as camelCase props on `DeepCitationTheme` (e.g., `mutedForeground`, `subtleForeground`).

---

## Typography

The SDK uses the system font stack exclusively. **Never** load or reference Inter, Playfair Display, or any external font.

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
```

Monospace elements (quote text in popovers) inherit from the host or fall back to:

```css
font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo,
             Consolas, "Liberation Mono", monospace;
```

---

## Animation — Shared Brand Element

Animation timing and easing are the **shared DNA** between web app and SDK. Both surfaces use identical values from `src/react/constants.ts`.

### 5-Tier Timing Scale

| Tier | Constant | Value | Use |
|------|----------|-------|-----|
| Instant | `ANIM_INSTANT_MS` | 80ms | Hover background, trigger color change |
| Fast | `ANIM_FAST_MS` | 120ms | Micro-interactions, exits, chevron rotations |
| Standard | `ANIM_STANDARD_MS` | 180ms | Popover entry fade, grid row expand |
| Measured | `ANIM_MEASURED_MS` | 250ms | Drawer slide-in, content morph |
| Slow | `ANIM_SLOW_MS` | 350ms | Full-page transitions |

### Easing Curves

| Constant | Value | Intent |
|----------|-------|--------|
| `EASE_EXPAND` | `cubic-bezier(0.34, 1.02, 0.64, 1)` | Restrained ~2% overshoot for things growing into view |
| `EASE_COLLAPSE` | `cubic-bezier(0.2, 0, 0, 1)` | Decisive deceleration for things leaving |

### Asymmetry Rule

Collapse is always faster than expand:
- Popover morph expand: 120ms
- Popover morph collapse: 80ms
- Evidence VT expand: 180ms
- Evidence VT collapse: 120ms

### Blink Standard Pattern

Default show/hide for popover and card transitions:
- Enter: 120ms (`BLINK_ENTER_TOTAL_MS`)
- Exit: 80ms (`BLINK_EXIT_TOTAL_MS`)
- Motion: opacity + subtle scale settle (no directional travel)

### Content Stagger

`CONTENT_STAGGER_DELAY_MS` = 30ms — container leads, content follows.

### Overshoot Pixel Budget

Keep absolute overshoot ≤ 4px. Use `EASE_EXPAND` only when travel ≤ 200px. For larger motions (VT geometry morphs, height morphs), use `EASE_COLLAPSE` or `BLINK_ENTER_EASING`.

---

## Border Radius

SDK uses `rounded-dc-lg` (default 0.5rem) as the container radius. This is the opposite of the web app's `rounded-none`.

| Element | Token/Class |
|---------|-------------|
| Popover container | `rounded-dc-lg` |
| Evidence tray | `rounded-dc-lg` |
| Tab bars, code blocks | `rounded-dc-md` / `rounded-dc-lg` |
| Buttons within popover | `rounded-dc-md` |
| Status badges | `rounded-full` (not tokenized) |

**Never use plain `rounded-lg` / `rounded-md` / `rounded-sm`** for brandable containers — always use the `rounded-dc-*` variants so consumers can override via `--dc-radius-*` tokens.

---

## Font

The SDK font is controlled by `--dc-font-family` (Tailwind class: `font-dc`). The old `--dc-popover-font` is a backward-compat alias.

---

## Do NOT

- Hardcode persistent colors as `text-slate-N dark:text-slate-M` or `text-gray-N dark:text-gray-M` — use `text-dc-*` tokens instead
- Use `bg-green-100` or `bg-amber-100` for status backgrounds — use `bg-dc-verified-bg`, `bg-dc-partial-bg`, etc.
- Use `text-blue-700` for accents — use `text-dc-primary`
- Use old `--dc-*-color` property names in new code (`--dc-verified-color` etc.) — use canonical tokens (`--dc-verified` etc.)
- Use plain `rounded-lg` / `rounded-md` / `rounded-sm` for brandable containers — use `rounded-dc-lg` / `rounded-dc-md` / `rounded-dc-sm`
- Require Inter or any loaded font
- Use `rounded-none` in SDK (hosts expect soft corners)
- Bypass `--dc-*` overrides with `!important` or inline styles
- Inline timing or easing values — always import from `constants.ts`
- Use `avoidCollisions={true}` on PopoverContent (unconditionally `false`)
- Conditionally mount/unmount components in the evidence zone (always-render invariant)

---

## Reference

- All timing/easing constants: `src/react/constants.ts`
- Animation rules: `docs/agents/animation-transition-rules.md`
- React citation UI: `docs/agents/react-citation-ui.md`
- Web app full brand: `packages/deepcitation-web/BRANDING.md`
- Contributor-facing sub-brand overview: `packages/deepcitation/BRANDING.md`
- Consumer theming guide: `INTEGRATION.md` → Appendix E: Design Tokens
- Consumer styling docs: `docs/styling.md`
