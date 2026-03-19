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
| Scroll lock + haptics on popover open/close | `src/react/Citation.tsx` |

Do not define new timing values, easing strings, or gesture thresholds inline. Add them to `constants.ts` and import from there.

---

## Timing Scale

Five tiers cover all UI interactions. Match the tier to the perceptual weight of the motion:

| Constant | Value | Use |
|---|---|---|
| `ANIM_INSTANT_MS` | 80ms | Hover background, trigger color change |
| `ANIM_FAST_MS` | 120ms | Micro-interactions, exits, chevron rotations |
| `ANIM_STANDARD_MS` | 180ms | Popover entry fade, grid row expand |
| `ANIM_MEASURED_MS` | 250ms | Drawer slide-in, content morph |
| `ANIM_SLOW_MS` | 350ms | Full-page transitions |

The popover height morph uses asymmetric durations separate from this scale:

- Expand: `POPOVER_MORPH_EXPAND_MS` = 120ms
- Collapse: `POPOVER_MORPH_COLLAPSE_MS` = 80ms

Collapse is always faster than expand — collapsing content should feel snappy and responsive, not linger.

### Ambient / Decorative Tier

For CSS-driven passive animations only — carousels, idle-state logo fades, background motion:

| Tier | Range | Canonical Value | Rules |
|------|-------|-----------------|-------|
| Ambient Decorative | 800–2000ms | 1500ms | CSS-only. Never JS-triggered. Never represents state the user must notice. |

**Rules:**
- Must set `animation-play-state: paused` when `prefers-reduced-motion: reduce` is active.
- Never apply to elements triggered by user interaction — use the 5-tier scale for those.
- 1500ms is the canonical value, established by the `IntegrationStackSection` logo fade pattern.
- Durations above 2000ms will be perceived as "broken" by users; durations below 800ms will feel interactive rather than ambient.

---

## Easing Curves

Two named curves are used throughout. Do not inline `cubic-bezier()` values directly — reference these constants.

| Constant | Value | Intent |
|---|---|---|
| `EASE_EXPAND` | `cubic-bezier(0.34, 1.02, 0.64, 1)` | Restrained ~2% overshoot — crisp settle without visible bounce |
| `EASE_COLLAPSE` | `cubic-bezier(0.2, 0, 0, 1)` | Decisive deceleration — collapsing content exits cleanly |

Use `EASE_EXPAND` for things growing into view. Use `EASE_COLLAPSE` for things leaving.

### Overshoot Pixel Budget

A fixed percentage is misleading — what matters is **absolute pixel displacement on the viewer's screen**. 2% of a 40px chevron = 0.8px (imperceptible). 2% of a 400px fly-out on a 390px phone = 8px (clearly visible bounce).

**Rule: keep absolute overshoot ≤ 4px.** At 2% that means `EASE_EXPAND` is appropriate when total travel ≤ ~200px. For anything larger — VT geometry morphs, full-page transitions, content-zone height morphs — use `EASE_COLLAPSE` or `BLINK_ENTER_EASING` (both zero-overshoot).

| Travel distance | 2% overshoot | Verdict |
|---|---|---|
| ≤ 100px (chevrons, icons, small reveals) | ≤ 2px | `EASE_EXPAND` ✓ — imperceptible |
| 100–200px (card expand, tray reveal) | 2–4px | `EASE_EXPAND` ✓ — subtle settle |
| > 200px (VT morphs, page transitions, height morphs) | > 4px | `EASE_COLLAPSE` or `BLINK_ENTER_EASING` — no overshoot |

Content that appears *after* a container expands uses `CONTENT_STAGGER_DELAY_MS` = 30ms so the container leads and content follows.

---

## Blink Standard Pattern

Use this as the default for popover/card show-hide and expanded-page step transitions:

- Enter: `BLINK_ENTER_TOTAL_MS` = 120ms
- Exit: `BLINK_EXIT_TOTAL_MS` = 80ms
- Motion type: opacity + very subtle scale settle (no directional travel)

Phase shape (reference sequence):

1. Initial: hidden.
2. Enter A (instant): mostly-final size, low opacity.
3. Enter B: subtle settle toward final scale, near-full opacity.
4. Steady: full size, full opacity.
5. Exit: opacity drops quickly with tiny scale change.
6. Unmount.

Implementation rules:

- Do not use top-to-bottom reveals (`gridTemplateRows`, padding grow) for this pattern.
- Do not use directional translation as the dominant motion cue.
- Keep motion subtle; readability should stay stable throughout.
- Keep durations asymmetric (expand slower than collapse).
- Use constants from `src/react/constants.ts`; never inline timing/easing.

---

## Evidence List Pattern

For `EvidenceTray` search-attempt list expansion/collapse (toggle + caret):

- Expand: `EVIDENCE_LIST_EXPAND_TOTAL_MS` = 120ms
- Expand settle step: `EVIDENCE_LIST_EXPAND_STEP_MS` = 60ms
- Collapse: `EVIDENCE_LIST_COLLAPSE_TOTAL_MS` = 80ms

The evidence list uses an inlined motion state machine in `EvidenceTray.tsx` (not `useBlinkMotionStage`) because it needs proportional height reveal from measured `scrollHeight` and per-stage multi-property CSS transitions.

### Expand frame sequence (120ms)

| Stage | Reveal | Opacity | Transition | Visual |
|---|---|---|---|---|
| `idle` | 0% | 0 | — | List hidden, caret at 0° |
| `enter-a` (instant, 1 frame) | 20% | 0.72 | none | ~2/11 items, medium/high opacity, 4px pad + 1px shift |
| → `enter-b` (CSS 60ms) | 95% | 0.88 | 60ms BLINK_ENTER | ~10/11 items, light opacity (nearly visible) |
| → `steady` (CSS 60ms settle) | 100% | 1.0 | 60ms BLINK_ENTER | All items, full opacity, bottom pixels settle |

### Collapse frame sequence (80ms)

| Stage | Reveal | Opacity | Transition | Visual |
|---|---|---|---|---|
| `exit-a` (instant, 1 frame) | 70% | 0.65 | none | ~7/11 items, moderate fade, caret starts rotating |
| → `exit-b` (CSS 80ms) | 0% | 0.06 | 80ms BLINK_EXIT | Items shrink to hidden, barely visible |
| → `idle` (setTimeout) | 0% | 0 | — | Unmounted, caret at 0° |

The two-phase exit (`exit-a` → `exit-b`) forces the browser to paint the initial collapse state before starting the CSS transition. Without this, the browser may batch both style changes and skip the transition entirely.

### Rules

- Caret rotation uses the same 120/80 envelope and easing curves in the footer toggle.
- Large lists must remain reachable via inner scroll (`max-height + overflow-y:auto`), not by clipping.
- Opacity must increase during expand (0.72 → 0.88 → 1.0) — items become more visible as they reveal, never less.

---

## Popover View State Machine

The popover has three states: `"summary"` → `"expanded-keyhole"` → `"expanded-page"`.

Rules:
- Side is picked once on open (`useLockedPopoverSide`) and never changes for the lifetime of the popover. Do not re-evaluate or flip.
- `avoidCollisions` is unconditionally `false` on `<PopoverContent>`. Collision avoidance is disabled — `Popover.tsx` handles positioning directly via `computePosition`.
- `expanded-page` records which state preceded it (`prevBeforeExpandedPageRef`) so Escape navigates back correctly.
- Width snaps to target — no `transition: width`. Intermediate frames during width changes are incoherent for content-heavy containers (text rewraps, images rescale).

Positioning is three-layer:

1. `Popover.tsx` `computePosition` → `translate3d()` — primary placement
2. `sideOffset` + `alignOffset` from hooks — optimize common cases
3. `useViewportBoundaryGuard` CSS `translate` — hard safety net, no-op when layers 1–2 are correct

Popover view-state transitions are snap-based at container level:
- Width/height still snap at layout level (no `transition: width`)
- Positioning stability is handled by the three positioning layers above
- Per-content motion should happen inside evidence/content zones, not by morphing the outer popover container

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

**Never conditionally mount or unmount a component inside the evidence zone.** React 19's StrictMode corrupts the fiber effect linked-list when components with hooks are conditionally swapped inside a portaled popover. This manifests as: `"Cannot read properties of undefined (reading 'destroy')"` in `commitHookEffectListUnmount`.

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
- Both keyhole and expanded-page use scroll-to-zoom (no `Ctrl` key required). `requireCtrl` defaults to `false`.
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

## Evidence Image View Transition

The keyhole→expanded-keyhole transition uses a CSS View Transition (`viewTransitionName: DC_EVIDENCE_VT_NAME`) to morph the evidence image between states.

### VT Element Assignment

| View state | VT-named element | Why |
|---|---|---|
| Keyhole strip (old) | `containerRef` — scroll container with `height: stripHeightStyle` | Height-constrained visible rect |
| Expanded-keyhole (new, non-fill) | `containerRef` — scroll container with `maxHeight: min(600px, 80dvh)` | Height-constrained visible rect — matches old state |
| Expanded-page (new, fill) | `animatedShellRef` (or annotation marker if `annotationVtRect`) | Full-height content fills popover |

**Critical**: In non-fill mode, both old and new VT elements must be height-constrained scroll containers. If the VT name is on an unconstrained inner `<div>`, the browser morphs to the full image height — overshooting the visible area.

### Easing & Timing

| Direction | Duration | Easing | Constant |
|---|---|---|---|
| Expand | `VT_EVIDENCE_EXPAND_MS` (180ms) | `EASE_COLLAPSE` — decisive deceleration, no overshoot | `ANIM_STANDARD_MS` tier |
| Collapse | `VT_EVIDENCE_COLLAPSE_MS` (120ms) | `EASE_COLLAPSE` — decisive deceleration | `ANIM_FAST_MS` tier |

**Do not use `EASE_EXPAND` for VT geometry morphs.** VT morphs typically travel > 200px, exceeding the 4px overshoot pixel budget. Use `EASE_COLLAPSE` (zero overshoot, decisive deceleration) for all VT geometry transitions.

### Cross-Fade Strategy

Dip-then-reveal: old snapshot fades to ~45% early so the user perceives spatial motion over content detail, then the new snapshot fades in crisp near the end.

```css
@keyframes dc-evidence-fade-out {
  0%   { opacity: 1; }
  30%  { opacity: 0.45; }   /* Dip early — blur the detail, show the motion */
  100% { opacity: 0; }
}
@keyframes dc-evidence-fade-in {
  0%   { opacity: 0; }
  60%  { opacity: 0; }   /* Hidden during geometry morph */
  100% { opacity: 1; }   /* Reveal near end when geometry settled */
}
```

The early opacity dip acts as perceptual motion blur — the user tracks the shape moving, not individual text lines. The new content appears crisp once the geometry has settled.

### Reduced Motion

`prefers-reduced-motion: reduce` sets `animation-duration: 0s !important` on all VT pseudo-elements — instant swap, no morph.

---

## Page-Expand Ghost Animation

The keyhole→expanded-page transition uses a dedicated ghost element (not the View Transitions API) because the popover shell must snap to expanded-page layout while the image region animates independently.

### Architecture

```
startEvidencePageExpandTransition (viewTransition.ts)
  1. capturePageExpandSource    — snapshot keyhole geometry + image
  2. Dim popover root           — opacity: PAGE_EXPAND_CONTENT_OPACITY_START
  3. flushSync(update)          — popover snaps to expanded-page layout (already dimmed)
  4. createPageExpandGhost      — fixed-position clone of keyhole image
  5. waitForPageExpandTarget    — rAF poll until target is stable (~50ms)
  6. runPageExpandGhostAnimation — ghost + popover content animate together
  7. Cleanup                    — ghost.remove(), popover opacity cleared
```

**Critical**: The popover root (not just `[data-dc-inline-expanded]`) is dimmed. This
ensures the header (Zone 1), status section (Zone 2), and image (Zone 3) are ALL
dimmed together. Previously only the image container was dimmed, leaving the header
at full opacity — which created a "page popped in" flash.

### Choreography (250ms total)

Mirrors the collapse's "dip-then-reveal" temporal structure:
- **Collapse**: old snapshot dominates, dims early; new snapshot hidden until 60%, reveals sharply.
- **Expand**: ghost dominates the first 60%; page near-invisible, reveals sharply in the last 40%.

Two coordinated `Element.animate()` calls run in parallel:

| Phase | Ghost | Page content | Visual effect |
|---|---|---|---|
| Polling (~50ms) | Not yet started | Dim at 0.03 | Nearly invisible — ghost will lead |
| 0–18% | 0.55→0.75 | 0.03 | Ghost clearly dominates, page hidden |
| 18–45% | 0.75→0.88 | 0.03 | Ghost at peak, eye tracks its motion |
| 45–58% | 0.88→0.92 | 0.03→0.08 | Ghost landing, page barely emerging |
| 58–72% | 0.92 | 0.08→0.35 | Handoff zone — ghost holds, page ramps |
| 72–92% | 0.92→0.88 | 0.35→0.80 | Page takes over, ghost preparing exit |
| 92–100% | 0.88→0 | 0.80→1.0 | Ghost exits decisively, page revealed |

### Ghost mechanics

- **`transform-origin: 0 0`** — mandatory. The `translate(tx, ty) scale(sx, sy)` math assumes top-left origin. Center origin causes the ghost to fly off-screen.
- **Motion blur** — `filter: blur()` peaks at 6px mid-flight to mask the non-uniform scale distortion (squashed text from different scaleX/scaleY). Blur ramps: 0→3→6→4→1.5→0px across the keyframe offsets. GPU-composited, no layout cost.
- **Ghost target** — `buildGhostTargetRect` queries `[data-dc-spotlight]` (the annotation overlay's dimming cutout). This is the "light area" — annotation rect + `SPOTLIGHT_PADDING`.
- **Source priming** — `primeEvidencePageExpandSource(containerRef)` is called from the click handler. The primed ref is consumed within 500ms.
- **Easing** — Ghost uses `EASE_COLLAPSE` (> 200px travel, per overshoot pixel budget rule). Page content uses `BLINK_ENTER_EASING` (near-linear settle).

### Stale target detection

`InlineExpandedImage` uses a ResizeObserver with `prevContainerVisibleRef` to detect `display:none → visible` transitions. On each visibility change, `pageExpandReady` and `hasAutoScrolledToAnnotationRef` are reset, forcing re-settle.

### What NOT to change

- Do not remove `transform-origin: 0 0` from `createPageExpandGhost`.
- Do not remove `filter: blur()` from ghost keyframes — without it, non-uniform scale produces visibly squashed text mid-flight.
- Do not use `startViewTransition` for page-expand — it uses `flushSync` + ghost.
- Do not use the page container rect or full image rect as ghost target (giant flash).
- Do not use `width`/`height` animation on the ghost — layout-triggering. Use `transform: scale()` + blur.
- Do not let the popover shell visually participate in the motion.

---

## Anti-Patterns

- **No `EASE_EXPAND` on travel > 200px.** Absolute overshoot must stay ≤ 4px. VT morphs, page transitions, and height morphs exceed this — use `EASE_COLLAPSE` or `BLINK_ENTER_EASING`.
- **No inline easing values.** Use `EASE_EXPAND` / `EASE_COLLAPSE` from `constants.ts`.
- **No inline duration values.** Use the 5-tier timing constants.
- **No `transition: width`** on content-heavy containers. Snap to target width instead.
- **No `avoidCollisions={true}`** on `<PopoverContent>`. It is unconditionally `false`.
- **No conditional mount/unmount in EvidenceZone.** Always-render with `display: none`.
- **No haptics on hover or scroll.** Only on committed user actions.
- **No `document.body.setAttribute("inert", "")`** for focus trapping. It makes the popover portal inert. Target `<main>` or individual body children instead.
- **No `animation-duration: 0s` as a reduced-motion workaround.** Pass `0` to the hook params instead — `transitionend` does not fire at 0ms, leaving stale inline styles.
