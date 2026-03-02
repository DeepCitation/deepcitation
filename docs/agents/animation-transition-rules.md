# Animation, Transition, and Gesture Rules

Open this file before adding, modifying, or reviewing any animation, transition, gesture, or motion behavior in the React UI layer.

## Canonical Source Files

| Concern | File |
|---|---|
| Timing constants, easing strings, gesture thresholds, zoom limits | `src/react/constants.ts` |
| Height morph between view states | `src/react/hooks/useAnimatedHeight.ts` |
| Wheel/trackpad zoom (GPU, debounced) | `src/react/hooks/useWheelZoom.ts` |
| Drag-to-pan with momentum | `src/react/hooks/useDragToPan.ts` |
| Drawer drag-to-close (touch, rubber-band, flick) | `src/react/hooks/useDrawerDragToClose.ts` |
| OS reduced-motion detection | `src/react/hooks/usePrefersReducedMotion.ts` |
| Mobile haptic feedback | `src/react/haptics.ts` |
| Body scroll lock (ref-counted) | `src/react/scrollLock.ts` |
| Popover side-locking (no flip on scroll) | `src/react/hooks/useLockedPopoverSide.ts` |
| Expanded-page vertical offset | `src/react/hooks/useExpandedPageSideOffset.ts` |
| Horizontal viewport clamping | `src/react/hooks/usePopoverAlignOffset.ts` |
| Hard viewport boundary guard (Layer 3) | `src/react/hooks/useViewportBoundaryGuard.ts` |
| Popover view state machine + height morph wiring | `src/react/DefaultPopoverContent.tsx` |
| Keyhole zoom, drag-to-pan, expanded-image viewer | `src/react/EvidenceTray.tsx` |
| Scroll lock + haptics on popover open/close | `src/react/CitationComponent.tsx` |

Do not define new timing values, easing strings, or gesture thresholds inline. Add them to `constants.ts` and import from there.

---

## Timing Scale

Five tiers cover all UI interactions. Match the tier to the perceptual weight of the motion:

| Constant | Value | Use |
|---|---|---|
| `ANIM_INSTANT_MS` | 75ms | Hover background, trigger color change |
| `ANIM_FAST_MS` | 120ms | Micro-interactions, exits, chevron rotations |
| `ANIM_STANDARD_MS` | 180ms | Popover entry fade, grid row expand |
| `ANIM_MEASURED_MS` | 250ms | Drawer slide-in, content morph |
| `ANIM_SLOW_MS` | 350ms | Full-page transitions |

The popover height morph uses asymmetric durations separate from this scale:

- Expand: `POPOVER_MORPH_EXPAND_MS` = 200ms
- Collapse: `POPOVER_MORPH_COLLAPSE_MS` = 100ms

Collapse is always faster than expand — collapsing content should feel snappy and responsive, not linger.

---

## Easing Curves

Two named curves are used throughout. Do not inline `cubic-bezier()` values directly — reference these constants.

| Constant | Value | Intent |
|---|---|---|
| `EASE_EXPAND` | `cubic-bezier(0.34, 1.06, 0.64, 1)` | Spring-like ~6% overshoot — expanding content feels alive |
| `EASE_COLLAPSE` | `cubic-bezier(0.2, 0, 0, 1)` | Decisive deceleration — collapsing content exits cleanly |

Use `EASE_EXPAND` for things growing into view. Use `EASE_COLLAPSE` for things leaving.

Content that appears *after* a container expands uses `CONTENT_STAGGER_DELAY_MS` = 30ms so the container leads and content follows.

---

## Popover View State Machine

The popover has three states: `"summary"` → `"expanded-keyhole"` → `"expanded-page"`.

Rules:
- Side is picked once on open (`useLockedPopoverSide`) and never changes for the lifetime of the popover. Do not re-evaluate or flip.
- `avoidCollisions` is unconditionally `false` on `<PopoverContent>`. Radix's flip/shift middleware is fully disabled. The hooks handle positioning.
- `expanded-page` records which state preceded it (`prevBeforeExpandedPageRef`) so Escape navigates back correctly.
- Width snaps to target — no `transition: width`. Intermediate frames during width changes are incoherent for content-heavy containers (text rewraps, images rescale).

Positioning is three-layer:

1. Radix `transform: translate3d()` — primary placement
2. `sideOffset` + `alignOffset` from hooks — optimize common cases
3. `useViewportBoundaryGuard` CSS `translate` — hard safety net, no-op when layers 1–2 are correct

For full positioning documentation see `CLAUDE.md` → "Popover `avoidCollisions` Must Always Be `false`".

---

## Height Morph (`AnimatedHeightWrapper`)

`AnimatedHeightWrapper` in `DefaultPopoverContent.tsx` smoothly animates the claim-quote zone height when view state changes cause text to rewrap.

Rules:
- The wrapper `<div>` must always stay in the DOM. Do **not** conditionally render it or swap it for a Fragment.
- When `prefersReducedMotion` is true, pass `0` for both duration params to `useAnimatedHeight`. The hook bails out and clears inline styles immediately. Do not return `<>{children}</>` — the wrapper div must remain.
- A 0ms CSS transition does not fire `transitionend` (per CSS Transitions spec §3.1). `useAnimatedHeight` handles this by skipping the transition entirely and clearing styles inline when duration is 0.
- `onTransitionEnd` on the wrapper clears `height`, `overflow`, and `transition` inline styles after the animation completes. This is required to restore natural height after the pin.

---

## Always-Render Invariant (React 19)

All three evidence view states (summary `EvidenceTray`, expanded-keyhole `InlineExpandedImage`, expanded-page `InlineExpandedImage`) must be rendered simultaneously. Inactive views are hidden with `display: none`.

**Never conditionally mount or unmount a component inside the evidence zone.** React 19's StrictMode corrupts the fiber effect linked-list when components with hooks are conditionally swapped inside a Radix portal. This manifests as: `"Cannot read properties of undefined (reading 'destroy')"` in `commitHookEffectListUnmount`.

This applies to the `EvidenceZone` component in `DefaultPopoverContent.tsx`. If you need to add a fourth view state, add a fourth always-rendered slot — do not use conditional rendering.

---

## Gesture System

### Drag-to-Pan (`useDragToPan`)
- Momentum physics: deceleration 0.88× per frame, velocity boost 2.0×, 5-sample history.
- Click is suppressed when drag distance exceeds 5px (`TAP_SLOP_PX` = 10px for touch).
- Supports x-only or xy direction via `direction` option.
- Fade-mask gradients (`buildKeyholeMaskImage`) show pan affordance at edges when content overflows by ≥ `MIN_PAN_OVERFLOW_PX` (24px).

### Wheel/Trackpad Zoom (`useWheelZoom`)
- GPU `transform: scale()` during gesture — zero layout reflow.
- Commits zoom to React state after 150ms debounce (prevents thrashing).
- Expanded-page requires `Ctrl` key (`requireCtrl: true`). Keyhole does not.
- Sensitivities: `KEYHOLE_WHEEL_ZOOM_SENSITIVITY` = 0.008, `WHEEL_ZOOM_SENSITIVITY` = 0.005.
- Zoom limits: keyhole 1.0–2.5, expanded 0.5–3.0. Clamp before setting state.

### Drawer Drag-to-Close (`useDrawerDragToClose`)
- Touch-only (touchstart on handle, touchmove/touchend on document).
- Rubber-band factor 0.4× past threshold — drag feels resistive, not free.
- Velocity ring buffer (4 samples), flick threshold 0.5px/ms.
- Snap-back via CSS transition when released within `DRAWER_DRAG_CLOSE_THRESHOLD_PX` (80px).
- Fires `triggerHaptic("collapse")` at threshold crossing.

### Pinch-to-Zoom (InlineExpandedImage)
- Handled inline in `EvidenceTray.tsx` via pointer events on `imageWrapperRef`.
- `applyGestureZoomTransform()` applies GPU `transform: translate + scale()` during gesture.
- On gesture end, committed zoom is clamped and set to React state.

### Keyboard Panning
- `InlineExpandedImage` supports arrow-key panning: 50px/keypress, Shift+200px.
- All four directions: ArrowLeft/Right → `scrollLeft`, ArrowUp/Down → `scrollTop`.
- Only `Enter` and `Space` collapse the expanded view (not arrow keys).

---

## Haptics

Use `triggerHaptic(event)` from `src/react/haptics.ts` at discrete confirm moments only.

| Event | Duration | When |
|---|---|---|
| `"expand"` | 12ms | User confirms expand to full-page |
| `"collapse"` | 10ms | User confirms collapse back |

Rules:
- Global 300ms debounce prevents multiple pulses from blurring together.
- `triggerHaptic` is a no-op when `prefers-reduced-motion: reduce` is set.
- Do not trigger haptics on hover, scroll, or intermediate drag positions — only on committed state changes.

---

## Scroll Lock

`acquireScrollLock()` / `releaseScrollLock()` from `src/react/scrollLock.ts` are ref-counted.

- Always pair acquire with release (use `useEffect` cleanup).
- Multiple components (popover, drawer) can lock simultaneously — the ref count handles stacking.
- Sets `overscroll-behavior: none` to prevent mobile pull-to-refresh during popover interactions.
- Compensates for scrollbar width via `padding-right` to prevent layout shift on lock.

---

## Reduced Motion

Always consult `usePrefersReducedMotion()` before applying motion. Rules:

- Pass `0` for duration params rather than skipping the component or returning a Fragment — DOM structure must be identical regardless of motion preference.
- Tailwind `animate-in` / `fade-in-0` classes are applied unconditionally — they degrade gracefully under `prefers-reduced-motion: reduce` because Tailwind respects the media query.
- Do not add separate reduced-motion code paths for transitions that are already handled by `AnimatedHeightWrapper` or the hooks.
- The one exception: fill-mode stagger animation on `InlineExpandedImage` in expanded-page is skipped entirely (`prefersReducedMotion ? {} : { animationDelay, animationTimingFunction }`).

---

## Anti-Patterns

- **No inline easing values.** Use `EASE_EXPAND` / `EASE_COLLAPSE` from `constants.ts`.
- **No inline duration values.** Use the 5-tier timing constants.
- **No `transition: width`** on content-heavy containers. Snap to target width instead.
- **No `avoidCollisions={true}`** on `<PopoverContent>`. It is unconditionally `false`.
- **No conditional mount/unmount in EvidenceZone.** Always-render with `display: none`.
- **No haptics on hover or scroll.** Only on committed user actions.
- **No `document.body.setAttribute("inert", "")`** for focus trapping. It makes the Radix portal inert. Target `<main>` or individual body children instead.
- **No `animation-duration: 0s` as a reduced-motion workaround.** Pass `0` to the hook params instead — `transitionend` does not fire at 0ms, leaving stale inline styles.
