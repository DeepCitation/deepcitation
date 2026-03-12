# DeepCitation SDK — Sub-Brand Guide

Open this file before styling, theming, or modifying any visual element in the SDK's React layer.

The SDK is a **sub-brand** of DeepCitation, designed to embed harmoniously within host applications. It intentionally differs from the web app's full brand to ensure compatibility with any host design system.

---

## Sub-Brand vs Web App Brand

| Property | Web App (Full Brand) | SDK (Sub-Brand) | Rationale |
|----------|---------------------|-----------------|-----------|
| Palette | Slate scale (`slate-*`) | Gray scale (`gray-*`) | Gray is more neutral, blends with any host palette |
| Border Radius | `rounded-none` (sharp) | `rounded-lg` (soft) | Soft corners feel less intrusive in host UIs |
| Font | Inter (loaded) | System font stack | No external font dependency for SDK consumers |
| Customization | Tailwind classes | `--dc-*` CSS custom properties | Hosts override via standard CSS, no build tool needed |

**Never** apply web-app slate palette, Inter font, or `rounded-none` to SDK components.

---

## Color System

The SDK uses `--dc-*` CSS custom properties for all colors. Every color must be overridable by host applications.

### Status Indicator Colors

| Property | Default | Usage |
|----------|---------|-------|
| `--dc-verified-color` | `#16a34a` (green-600) | Verified/success indicator |
| `--dc-partial-color` | `#f59e0b` (amber-500) | Partial match indicator |
| `--dc-error-color` | `#ef4444` (red-500) | Error/not-found indicator |
| `--dc-pending-color` | `#9ca3af` (gray-400) | Pending/loading indicator |
| `--dc-wavy-underline-color` | `#ef4444` (red-500) | Miss/hallucination underline |

### Surface & Layout

| Property | Default | Usage |
|----------|---------|-------|
| `--dc-popover-width` | `480px` | Popover container width |
| `--dc-keyhole-strip-height` | `120px` | Evidence keyhole strip height |
| `--dc-document-canvas-bg-light` | `rgb(243 244 246)` | Light-mode proof image background |
| `--dc-document-canvas-bg-dark` | `rgb(31 41 55)` | Dark-mode proof image background |
| `--dc-guard-max-width` | `calc(100dvw - 2rem)` | Viewport-constrained max width |

### Host Override Example

```css
/* Host application override */
.my-app {
  --dc-verified-color: #22c55e;
  --dc-partial-color: #eab308;
  --dc-error-color: #dc2626;
  --dc-pending-color: #6b7280;
  --dc-popover-width: 500px;
}
```

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
| Instant | `ANIM_INSTANT_MS` | 75ms | Hover background, trigger color change |
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

SDK uses `rounded-lg` (8px) as default. This is the opposite of the web app's `rounded-none`.

| Element | Radius |
|---------|--------|
| Popover container | `rounded-lg` |
| Evidence tray | `rounded-lg` |
| Buttons within popover | `rounded-md` |
| Status badges | `rounded-full` |

---

## Do NOT

- Apply web-app slate palette to SDK components
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
