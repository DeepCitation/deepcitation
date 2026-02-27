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
