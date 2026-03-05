# React Citation UI Rules

Open this file for citation component behavior, popover interactions, timestamp presentation, SSR safety, and overflow/layout constraints.

## Interaction Modes

`CitationComponent` supports:

- `interactionMode="eager"` (default): hover opens popover; click zooms image or toggles details when no image.
- `interactionMode="lazy"`: hover only styles; first click opens popover; second click toggles search details.

Use lazy mode for dense citation layouts.

`UrlCitationComponent` should open the URL on click.
Not-found states should use centered `XCircleIcon`.

## Popover Timing Constants

These values are intentional and tested:

- `HOVER_CLOSE_DELAY_MS = 150`
- `REPOSITION_GRACE_PERIOD_MS = 300` (2x hover delay)
- `SPINNER_TIMEOUT_MS = 5000`
- `TOUCH_CLICK_DEBOUNCE_MS = 100`

Do not flag the grace-period behavior as a race condition without a reproducible failing test.

## Overflow and Sizing Rules

Prevent horizontal overflow in popover/modal UI:

- Max width pattern: `max-w-[min(400px,calc(100vw-2rem))]`
- Verification images: constrain with max dimensions + `object-contain`
- Scroll containers: `overflow-y-auto overflow-x-hidden`
- Avoid plain `overflow-hidden` on scrollable content
- Interaction transitions: 150ms
- Popover transitions: 200ms

After image/popover dimension changes, run `tests/playwright/specs/popoverImageWidth.spec.tsx`.

## SSR Safety

Guard all direct DOM access:

```typescript
if (typeof document !== "undefined") {
  // DOM-safe block
}
```

Use `getPortalContainer()` for portal mounting.

## Progressive Disclosure UX Goals

Maintain these user goals by disclosure level:

1. Inline indicator: immediate trust signal.
2. Popover: source attribution, verification/retrieval time, proof image, copy quote affordance.
3. Verification log: audit trail for match quality or not-found attempts.
4. Full-size proof image: deep context review.
5. Citation drawer: holistic source review across citations.

Design constraint: in success state, keep source identity and proof image primary; date/copy metadata secondary.

## Temporal Context Rules

- URL citations: show `crawledAt` as `Retrieved [absolute date]`.
- Document citations: show `verifiedAt` as `Verified [absolute date]`.
- Use absolute dates (for example, `Jan 15, 2026`), not relative dates.
- Expose full ISO timestamp via hover/title for audit precision.

## Popover Positioning — No Collision Avoidance

The custom popover (`Popover.tsx`) has no flip/shift middleware. The locked side (`useLockedPopoverSide`) handles placement for the popover's entire lifecycle — picking a side once on open and never changing it.

### Design Principle

Pick a side once, stick with it for the popover's entire lifecycle (matches Linear/Notion/Vercel behavior). Handle overflow with CSS constraints, not middleware-based repositioning.

### Three-Layer Positioning Defense

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| 1. Popover.tsx | `transform: translate3d(x,y,0)` | Primary positioning (computePosition) |
| 2. Hooks | `sideOffset` + `alignOffset` props | Optimize common cases |
| 3. Guard | CSS `translate` property (`useViewportBoundaryGuard`) | Hard safety net — catches everything |

### How Overflow Is Handled

- **Vertical**: `useLockedPopoverSide` picks top/bottom once on open. `useExpandedPageSideOffset` positions expanded-page at 1rem from viewport edge.
- **Horizontal**: `usePopoverAlignOffset` measures the rendered popover width and computes an `alignOffset` that clamps the popover within 1rem of both viewport edges. Uses ResizeObserver + window resize for reactive re-computation.
- **Size**: CSS `maxWidth: calc(100dvw - 2rem)` / `maxHeight: calc(100dvh - 2rem)` constrains all states.
- **Guard**: `useViewportBoundaryGuard` observes the popover's actual rendered rect and applies corrective CSS `translate` if any edge overflows. Uses CSS `translate` (separate from the wrapper's `transform`) so corrections compose additively. If Layers 1–2 got it right, the guard is a no-op.

### Correct Pattern

```tsx
// Citation.tsx — <PopoverContent> props
side={lockedSide}              // Same side for all view states
sideOffset={expandedPageSideOffset}  // Positions expanded-page at viewport edge
alignOffset={popoverAlignOffset}     // Horizontal viewport clamping
```

### Expanded-Page Side Offset

The `useExpandedPageSideOffset` hook computes a `sideOffset` that positions the expanded-page popover at 1rem from the viewport edge, respecting the locked side:
- **`side="bottom"`**: `sideOffset = 16 - triggerRect.bottom` — top edge at 1rem from viewport top
- **`side="top"`**: `sideOffset = triggerRect.top - (viewportHeight - 16)` — bottom edge at 1rem from viewport bottom

### Horizontal Align Offset

The `usePopoverAlignOffset` hook computes an `alignOffset` that prevents horizontal viewport overflow. With `align="start"`, it calculates where the popover edges would be and shifts if either edge would be within 1rem of the viewport boundary. Uses `useLayoutEffect` so the correction is applied before paint — no flash.

### Related: `EXPANDED_POPOVER_HEIGHT` Must Be Fixed

The base `maxHeight` in `Popover.tsx` uses `EXPANDED_POPOVER_HEIGHT` from `constants.ts`. This must be a fixed `calc(100vh - 2rem)`, **not** tied to trigger scroll position. A dynamic value would cause the popover to visibly resize on scroll.
