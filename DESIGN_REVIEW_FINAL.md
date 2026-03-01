# Citation Component Specification — Design Engineering Review
## Final Assessment

**Reviewer perspective:** Design engineer with background at Apple HIG, Notion, Linear, GitHub
**Scope:** All citation components — popovers, keyhole image, page images, evidence drawer, citation drawer trigger, citation drawer, and supporting systems
**Method:** Four parallel audits of the existing codebase (~15,000 lines across 30+ files, 15 custom hooks, 100+ constants) cross-referenced against the proposed specification

---

## Executive Summary

The specification is ambitious and well-structured as an interaction design document. It correctly identifies the core gestures (tap, pan, zoom, dismiss) and provides reasonable animation timing. However, it describes a **different component** than the one that exists. The codebase has solved most of the problems the spec raises — often with more nuanced solutions — and the spec's proposed implementations would regress several carefully considered architectural decisions.

**Bottom line:** ~60% of the spec duplicates or conflicts with existing work. ~25% is directionally correct but needs adjustment. ~15% identifies genuine gaps worth implementing.

---

## Part 1: What the Spec Gets Wrong

### 1.1 The "Fullscreen Modal" Does Not Exist — and Should Not

**Spec proposes:** A separate fullscreen modal component (Section 1, 2.6, 3.6, 3.8) with its own lifecycle, FLIP animation, and close gestures.

**What actually exists:** Three view states within the same popover:

```
summary ──→ expanded-evidence ──→ expanded-page
   ↑              ↑                     │
   └──────────────┴─────────────────────┘
                 (Escape navigates back)
```

The popover stays mounted. Its content morphs via `useAnimatedHeight` (200ms expand / 100ms collapse with spring easing). Width adapts via `getExpandedPopoverWidth()`. The expanded-page state uses `calc(100dvh - 2rem)` height — effectively full-viewport, but still the same Radix popover.

**Why a separate modal would be worse:**

| Concern | Popover morph (current) | Separate modal (spec) |
|---------|------------------------|----------------------|
| Escape navigation | Two-stage: `expanded-page → previous → close` | Single-stage: close modal, lose context |
| Position continuity | Locked side preserved; no repositioning flash | New element, new positioning; FLIP animation tries to bridge the gap but creates coordinate system conflict |
| Scroll lock | Ref-counted `acquireScrollLock()` shared with drawer | Second scroll lock needed; potential count mismatch |
| Focus management | Focus stays within Radix dialog | Focus must transfer between two dialogs; return-focus on close must track original trigger |
| Bundle size | Zero additional code | FLIP animation OR Framer Motion layoutId adds 0-30KB |

**Verdict:** Remove Sections 2.6, 3.6, 3.8 entirely. Replace "fullscreen" references with "expanded-page view state."

### 1.2 Trigger Gesture: `setPointerCapture` + `preventDefault` Breaks Accessibility

**Spec proposes (Section 2.1):** Capture `pointerdown`, call `setPointerCapture` and `preventDefault()`, check distance on `pointerup`, open if < 3px.

**What actually exists:** Standard click handler with a touch-vs-scroll discriminator:

```typescript
// TAP_SLOP_PX = 10 — Euclidean distance threshold
// TOUCH_CLICK_DEBOUNCE_MS = 100 — prevents synthetic double-fire
//
// touchstart → store position
// touchmove → if distance > TAP_SLOP_PX², mark as scroll
// touchend → if !scrolled, open popover
// Also: wasPopoverOpenBeforeTap pattern for second-tap-closes
```

**Why the spec's approach is worse:**

1. `preventDefault()` on `pointerdown` kills:
   - Text selection across citation spans
   - Long-press context menu (iOS "Copy Link")
   - Assistive technology click synthesis (VoiceOver sends click, not pointer events)

2. `setPointerCapture` on the trigger steals the pointer from the browser's scroll handler — the exact problem the spec then tries to solve with a gesture arena (Section 5.1)

3. The 3px slop is too tight. Apple HIG recommends ≥10px for touch; the codebase uses 10px. At 3px, users with tremors or on bumpy surfaces will trigger opens on scroll attempts.

**Verdict:** Keep existing click-based open with `TAP_SLOP_PX = 10`. Remove Section 2.1's pointer capture pattern.

### 1.3 Image Pan Gesture Arena Replaces Working Native Scroll

**Spec proposes (Section 2.3):** A ~200-line custom gesture arena with `setPointerCapture`, direction analysis (1.5x aspect ratio), and custom momentum (0.95 decay per frame).

**What actually exists:** Two complementary systems:

1. **Native scroll** (`overflow-x: auto` on keyhole strip container) — handles touch panning with platform-native inertia, rubber-banding, and overscroll glow
2. **`useDragToPan` hook** — handles mouse drag with custom momentum:
   - `DRAG_THRESHOLD = 5px` (click vs drag discrimination)
   - `DECELERATION = 0.88` per frame (frame-rate-independent via `dt/16.67`)
   - `VELOCITY_BOOST = 2.0` (launch feel amplification)
   - `VELOCITY_CUTOFF = 0.3 px/frame` (momentum stop threshold)
   - Ring buffer of 5 samples for velocity estimation

**Why the spec's approach is worse:**

- Replaces iOS rubber-band and Android overscroll-glow with a DIY `0.95` decay that feels dead
- The codebase's `0.88` decay with `2.0x` velocity boost was tuned (it's TikTok-style flick); the spec's `0.95` is too floaty
- Native touch scroll is free — GPU-accelerated, doesn't block the main thread, respects accessibility scroll indicators
- The 1.5x direction ratio is clever in theory but unnecessary when native scroll handles vertical-vs-horizontal automatically via `overflow-x: auto` + `overscroll-behavior: none`

**Recommendation:** Remove the custom gesture arena. Note the existing momentum tuning values if adjustments are needed.

### 1.4 Pinch-to-Zoom in Keyhole Strip

**Spec proposes (Section 2.4.1):** Pinch zoom inside the popover image, 1x-3x in popover, 1x-5x in fullscreen.

**What actually exists:** Pinch zoom is implemented — **but only in the expanded-page state** (the large image viewer). In the keyhole strip (120px tall), zoom is wheel-only with these constraints:

```typescript
KEYHOLE_ZOOM_MIN = 1.0      // Never below natural pixel density
KEYHOLE_ZOOM_MAX = 2.5      // Enough to read small text
KEYHOLE_ZOOM_STEP = 0.15    // Per wheel notch
KEYHOLE_ZOOM_MIN_SIZE_RATIO = 3  // Image must be ≥3× container to enable zoom
```

**Why pinch-zoom in keyhole is wrong:**

- The strip is 120px tall. Pinch-zooming a 120px strip on a phone is like trying to read a newspaper through a mail slot while pinching it
- Pinch-to-zoom on mobile triggers browser page zoom (requires `touch-action: none` on the container, which breaks native scroll — the very scroll the keyhole depends on)
- The existing wheel zoom + zoom hint after 5s dwell (`ZOOM_HINT_DELAY_MS = 5000`) is more discoverable and doesn't conflict with platform gestures

**Verdict:** Pinch zoom is correctly scoped to expanded-page only. Remove pinch from keyhole/popover context. The spec's expanded-page pinch matches what's built (though the existing implementation uses `EXPANDED_ZOOM_MAX = 3.0`, not 5x).

### 1.5 Double-Tap Zoom Conflicts with Platform

**Spec proposes (Section 2.4.2):** Double-tap toggles 1x↔2x zoom with 300ms spring.

**Problem:** Double-tap on iOS Safari is a system gesture (Smart Zoom). Suppressing it requires `touch-action: manipulation` on the element, which also suppresses 300ms click delay on all child elements. On Android, double-tap is the "zoom and center" gesture.

The codebase doesn't implement double-tap zoom and instead offers:
- `ZoomToolbar` with −/+ buttons and a slider (always visible in expanded-page)
- Ctrl+Wheel on desktop (`requireCtrl: true` flag in `useWheelZoom`)
- Pinch-to-zoom on mobile (expanded-page only)

**Verdict:** Remove double-tap zoom. The existing zoom controls are more discoverable and accessible.

### 1.6 Swipe-to-Close Threshold Is Too Sensitive

**Spec proposes (Section 2.2.4):** "Swipe down on popover, 50px threshold."

**What exists:** `useDrawerDragToClose` with:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `DRAWER_DRAG_CLOSE_THRESHOLD_PX` | **80px** | Apple sheet dismiss threshold is ~75-80px |
| `FLICK_VELOCITY_THRESHOLD` | **0.5 px/ms** | Fast downward flick dismisses even below threshold |
| `RUBBER_BAND_FACTOR` | **0.4** | 40% damping past threshold (resistance feel) |
| `VELOCITY_SAMPLE_COUNT` | **4** | Ring buffer for velocity estimation |
| Haptic | `navigator.vibrate?.(10)` | 10ms pulse at threshold crossing |
| Snap-back | Two-phase RAF | `setIsDragging(false)` then `rAF(setDragOffset(0))` — enables CSS transition before resetting |

The spec's 50px would trigger on casual scrolls within the popover content area. 80px is correct — it requires intentional drag.

**Also:** This gesture only applies to the **drawer** (bottom sheet), not the popover. The popover is dismissed via click-outside, Escape, or close button.

**Verdict:** Reference existing `useDrawerDragToClose`. Don't add swipe-to-close on the popover.

---

## Part 2: What the Spec Gets Partially Right

### 2.1 Animation Timings — Close but Misaligned

**Spec timing table vs actual:**

| Animation | Spec | Actual | Assessment |
|-----------|------|--------|------------|
| Popover entry | 100ms, `cubic-bezier(0.16, 1, 0.3, 1)` | 200ms, `cubic-bezier(0.16, 1, 0.3, 1)` | Easing matches. Duration is 200ms — 100ms feels too snappy for a content-rich popover. **Keep 200ms.** |
| Popover exit | 200ms, ease-in | **80ms**, zoom-out-[0.97] + fade-out-0 | Spec is 2.5× too slow. 80ms is correct — dismissals should feel instant. |
| Height expand | N/A (spec doesn't describe) | 200ms, `cubic-bezier(0.34, 1.06, 0.64, 1)` | Missing from spec. The 6% spring overshoot (`1.06`) is critical to the "alive" feel. |
| Height collapse | N/A | 100ms, `cubic-bezier(0.2, 0, 0, 1)` | Missing from spec. Asymmetric timing (collapse faster than expand) is a Linear/Notion pattern. |
| Content stagger | 50ms visible text delay | **30ms** technical stagger | Spec's 50ms is a decorative animation that costs latency. 30ms is just enough to avoid empty-container flash. |
| Expand to fullscreen | 300ms FLIP | 200ms height morph (no FLIP) | No FLIP — morph within same element. 200ms is right. |

**Entry animation details the spec misses:**

```css
/* Actual entry: */
data-[state=open]:animate-in
data-[state=open]:fade-in-0
data-[state=open]:zoom-in-[0.96]           /* Scale from 96% */
data-[state=open]:data-[side=bottom]:slide-in-from-top-0.5  /* Side-aware slide */
data-[state=open]:duration-200
data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)]

/* Actual exit: */
data-[state=closed]:animate-out
data-[state=closed]:fade-out-0
data-[state=closed]:zoom-out-[0.97]        /* Scale to 97% (less dramatic) */
data-[state=closed]:duration-[80ms]
```

The entry has a **side-aware slide** (slides in from the trigger's direction). The spec doesn't mention this — it's what creates the spatial connection between trigger and popover.

### 2.2 Backdrop Blur — Skip It

**Spec proposes:** `backdrop-filter: blur(10px)` with 150ms animation.

**The codebase uses:** Opacity-only overlay for the drawer backdrop (`bg-black/40` light, `bg-black/60` dark). No backdrop-filter anywhere.

**Why:**
- `backdrop-filter: blur()` causes GPU memory spikes on mobile (especially with large page images behind the overlay)
- iOS Safari has longstanding compositing bugs with backdrop-filter inside fixed-position containers
- The popover doesn't even have a backdrop — it's a floating element over the content
- The drawer's black overlay is sufficient visual separation

**Verdict:** Remove backdrop-filter. Use opacity overlay for drawer; no overlay for popover.

### 2.3 Transform Origin — Can't Use Trigger Position

**Spec proposes:** `transform-origin: var(--trigger-x) var(--trigger-y)` to animate from the click point.

**Problem:** The popover is positioned by **three independent transform systems:**

| Layer | CSS Property | Purpose |
|-------|-------------|---------|
| Radix | `transform: translate3d(x, y, 0)` | Primary positioning |
| Guard | `translate: dx dy` (separate CSS property) | Corrective offset |
| Entry animation | `transform: scale(0.96)` | Entrance effect |

Adding `transform-origin` at trigger position creates a fourth coordinate system. Since Radix's `translate3d` already moves the popover to its final position, a transform-origin elsewhere would cause the scale to "orbit" around a point that's offset from the element's actual position — the popover would appear to slide during the scale animation.

**Recommendation:** Use the existing `zoom-in-[0.96]` which scales from center (the default `transform-origin: 50% 50%`). This works correctly with the existing positioning stack.

### 2.4 Gesture Conflict Resolution — Right Principle, Wrong Implementation

The spec's Section 5 (Gesture Conflict Resolution) correctly identifies three conflicts:
1. Parent scroll vs image pan
2. Image pan vs image tap
3. Pinch zoom vs vertical scroll

**How the codebase solves these (without a gesture arena):**

| Conflict | Solution | Key constant |
|----------|----------|-------------|
| Scroll vs pan | Native `overflow-x: auto` + `overscroll-behavior: none` — browser handles it | `overscrollBehavior: "none"` |
| Pan vs tap | `DRAG_THRESHOLD = 5px` in `useDragToPan`; `wasDraggingRef` suppresses click if drag detected | `DRAG_THRESHOLD = 5` |
| Zoom vs scroll | `requireCtrl: true` on expanded-page wheel zoom; bare scroll pans | `requireCtrl` flag |
| Touch scroll vs drawer drag | `TAP_SLOP_PX = 10` Euclidean distance check | `TAP_SLOP_PX = 10` |

No custom gesture arena needed. Each interaction surface has clear ownership:
- Keyhole strip: native scroll (touch) + `useDragToPan` (mouse)
- Expanded page: Ctrl+wheel zoom, bare-scroll pan, touch pinch zoom
- Drawer handle: `useDrawerDragToClose` (vertical drag only)

**Recommendation:** Replace Section 5 with a "Gesture Ownership Table" documenting which surface owns which gesture, rather than proposing a unified arena.

---

## Part 3: What the Spec Gets Right

### 3.1 Multiple Close Affordances

The spec correctly lists: close button, click outside, Escape, swipe-down. All four exist in the codebase:

| Method | Desktop | Mobile | Implementation |
|--------|---------|--------|---------------|
| Close button | Click | Tap | React `onClick` in `DefaultPopoverContent` |
| Click outside | `mousedown` capture on document | `touchstart/touchend` capture on document | `useCitationEvents` |
| Escape | Radix `onEscapeKeyDown` | N/A (Android back via history) | Two-stage: step back through view states, then close |
| Drag down | N/A | `useDrawerDragToClose` (drawer only) | 80px threshold + velocity flick |

### 3.2 Performance Guidance

Section 10's advice is sound and matches the codebase:
- `transform` and `opacity` only for animations (the height morph is the one exception — it uses `height` but via `useLayoutEffect` to avoid reflow during React render)
- `requestAnimationFrame` for momentum (used in `useDragToPan` and pinch zoom)
- `will-change: transform` (used in pinch zoom: `el.style.willChange = "transform"`)
- No layout thrashing (all DOM reads batched before writes in hooks)

### 3.3 Edge Cases Enumeration

Section 7.3 correctly identifies:
- Large images needing fit-to-view (handled by `EXPANDED_MIN_READABLE_ZOOM = 0.8`)
- Small devices overflowing (handled by `maxWidth: calc(100dvw - 2rem)` + `usePopoverAlignOffset`)
- No image available (handled by `PopoverFallbackView` — text-only rendering)
- Slow image load (handled by `SPINNER_TIMEOUT_MS = 5000` for three-stage spinner: active → slow → stale)
- Pan beyond bounds (handled by `overscroll-behavior: none` + boundary clamping in `useDragToPan`)

### 3.4 Momentum Physics

The spec's exponential decay model is correct in principle. The codebase's implementation is more refined:

```typescript
// Codebase (useDragToPan):
DECELERATION = 0.88          // More aggressive than spec's 0.95
VELOCITY_BOOST = 2.0         // Launch amplification
VELOCITY_CUTOFF = 0.3        // px/frame stop threshold
// Frame-rate independent: DECELERATION^(dt / 16.67)

// Spec:
deceleration = 0.95          // Too floaty for a constrained strip
// No boost, no cutoff, no frame-rate independence
```

The spec's `0.95` would make the keyhole strip feel sluggish — each frame retains 95% of velocity, taking ~60 frames (1 second) to mostly stop. The codebase's `0.88` with `2.0x` boost gives a satisfying flick-and-settle in ~15 frames (~250ms).

---

## Part 4: What the Spec Is Missing

### 4.1 View State Machine (Critical Gap)

The spec's component states (Section 1) are:
> Closed, Opening, Open, Panning, Zoomed, Expanding, Fullscreen, Closing

The actual state model is fundamentally different:

```
┌─────────────────────────────────────────────────────────┐
│ Popover (Radix)                                          │
│                                                          │
│  ┌──────────┐    click     ┌───────────────────┐         │
│  │ summary  │───────────→ │ expanded-evidence  │         │
│  │          │ ←───────────│                    │         │
│  └──────────┘   Escape    └───────────────────┘         │
│       │                           │                      │
│       │    direct click           │ click expand         │
│       └──────────────────────┐    │                      │
│                              ↓    ↓                      │
│                     ┌────────────────┐                   │
│                     │ expanded-page  │                   │
│                     │                │                   │
│                     └────────────────┘                   │
│                        Escape → prev                     │
│                                                          │
│  Width: summary → content-adaptive → viewport-2rem      │
│  Height: auto → auto → calc(100dvh - 2rem)              │
└─────────────────────────────────────────────────────────┘
```

**Escape navigates backward through states:** `expanded-page → expanded-evidence → summary → close`. Each step uses `prevBeforeExpandedPageRef` to remember the return path.

The spec must document this state machine — it's the core interaction model.

### 4.2 The Drawer (Critical Gap)

The spec completely omits the `CitationDrawer` — a bottom-sheet that groups multiple citations by source. On mobile, this is often the primary interaction surface.

**Drawer architecture:**

| Feature | Implementation |
|---------|---------------|
| Portal | `createPortal(node, document.body)` via `getPortalContainer()` |
| Backdrop | `bg-black/40` (light) / `bg-black/60` (dark), z-index 9998 |
| Stagger animation | Exponential approach: `MAX × (1 - e^(-i × DELAY / MAX))`, capped at 250ms |
| Accordion | Single-expanded radio pattern via `DrawerEscapeContext` |
| Drag-to-close | `useDrawerDragToClose` (80px threshold, velocity flick, rubber-band, haptic) |
| Drag-to-expand | Same hook, upward drag (−80px) triggers `onExpand` callback |
| Page filtering | `computeUniquePageNumbers()` extracts cited pages; pill UI filters |
| Reduced motion | `transitionDuration: "0ms"` when `usePrefersReducedMotion()` returns true |

**Drawer trigger (`CitationDrawerTrigger`):**

```
[Per-citation status icons] [Source label] [TtC display] [Chevron]
```

- Status icons stack with `-0.25rem` overlap, expand on hover (desktop) or go straight to drawer (mobile)
- Tooltips on individual icons show source name, anchor text preview (60 chars), and proof thumbnail
- Label generated by `generateDefaultLabel()`: single source → name, 2+ → "Name +N"

The spec should dedicate a full section to the drawer and trigger.

### 4.3 Width Morphing Between States

The spec only discusses height and fullscreen. The popover also morphs **width**:

```typescript
// Summary: content-adaptive (keyhole image determines width)
getSummaryPopoverWidth(keyholeDisplayedWidth)
// → clamp(320px, ${imageWidth + 32}px, 480px)

// Expanded-evidence: image determines width
getExpandedPopoverWidth(expandedImageWidth)
// → max(320px, min(${imageWidth + 26}px, calc(100dvw - 2rem)))

// Expanded-page: full viewport minus margins
// → var(--dc-guard-max-width, calc(100dvw - 2rem))
```

Width transitions **snap** (no CSS transition) because text re-wraps on every intermediate width frame, causing visible jitter. This is an industry-standard decision (Linear, Notion, Vercel all snap widths).

### 4.4 Timing Telemetry System

The codebase tracks Time-to-Certainty (TtC) — how long from citation render to verification resolution:

```typescript
TTC_INSTANT_THRESHOLD_MS = 100     // Below → "instant"
TTC_SLOW_THRESHOLD_MS = 10_000     // Above → "slow"
TTC_MAX_DISPLAY_MS = 60_000        // Display cap at ">60s"
REVIEW_DWELL_THRESHOLD_MS = 2000   // Popover dwell = genuine review

// Display formatting:
// < 100ms → "instant"
// 100-999ms → "0.Xs"
// 1-10s → "X.Xs"
// 10-60s → "XXs"
// ≥ 60s → ">60s"

// Tiers: fast (<2s, green), normal (2-10s, gray), slow (>10s, gray)
```

This affects UI timing (spinner staging, TtC display in trigger/popover) and should be part of the spec.

### 4.5 Three-Layer Positioning Defense

The spec proposes animations that would fight with the positioning system. The spec must acknowledge:

| Layer | Mechanism | When it acts |
|-------|-----------|-------------|
| 1. Radix | `transform: translate3d(x,y,0)` | Every frame (floating-ui) |
| 2. Hooks | `sideOffset` + `alignOffset` props | On open + resize |
| 3. Guard | CSS `translate` property (separate from `transform`) | After morph settles (300ms debounce) |

Key constants:
- `MIN_SPACE_PX = 200` — locked side flip threshold
- `VIEWPORT_MARGIN_PX = 16` — 1rem edge margin for all positioning
- `SETTLE_MS = 300` — guard debounce (200ms morph + 100ms buffer)
- `--dc-guard-max-width` — CSS custom property set by guard to exclude scrollbar width

Any proposed animation on `transform` will conflict with Layer 1. Any proposed animation on `translate` will conflict with Layer 3.

### 4.6 Hit-Box Extenders

The spec mentions "44px minimum touch targets" but doesn't address how to achieve this without layout bloat:

```typescript
// Invisible pseudo-element touch targets (no layout impact):
HITBOX_EXTEND_8 = "after:content-[''] after:absolute after:inset-[-8px]"
// → 16px added to each dimension (element remains visually unchanged)

HITBOX_EXTEND_8x14 = "after:content-[''] after:absolute after:inset-x-[-8px] after:inset-y-[-14px]"
// → 16px horizontal, 28px vertical (for vertically tight UI like status indicators)
```

Requires `position: relative` on the parent. Used on status indicators, small buttons, and citation triggers.

### 4.7 Security Considerations for Images

The spec mentions "Right-click context menu on image (allow save image)" but doesn't address image source validation. The codebase has comprehensive validation:

```typescript
isValidProofImageSrc(src: unknown): src is string
// 1. Data URI: only png/jpeg/webp/avif/gif (blocks SVG — can contain scripts)
// 2. Relative paths: reject //, reject .., iterative decode (5×) to prevent double-encoding
// 3. URLs: require https (or localhost for dev), whitelist trusted hosts
// 4. Unicode lookalike dots (U+FF0E, U+2024) → rejected
// 5. Null bytes → rejected
// 6. Decoded length < 2KB → validated
```

The spec should note that all image sources must pass `isValidProofImageSrc()` before rendering.

### 4.8 Zoom Controls UI

The spec only describes gesture-based zoom (pinch, wheel, double-tap). The codebase has a full zoom toolbar in expanded-page:

```
[ − ] ──────●────── [ + ]  125%
```

- Slider range: `[zoomFloor * 100, EXPANDED_ZOOM_MAX * 100]`, step 5%
- −/+ buttons: `EXPANDED_ZOOM_STEP = 0.25` (25% increments)
- Display: `Math.round(zoom * 100)%`
- Slider grab lock: Freezes container width so controls don't shift during zoom
- Keyboard: Enter/Space on buttons, arrow keys on slider

This is the primary zoom affordance on both desktop and mobile. The spec should document it.

---

## Part 5: Accessibility Deep Dive

### 5.1 What Exists (Stronger Than Spec Assumes)

The spec's Section 7 implies accessibility is not yet implemented. In fact:

**ARIA attributes (182 occurrences across 32 files):**
- `role="button"` + `tabIndex={0}` on non-native interactive elements
- `role="dialog"` + `aria-modal="true"` on SourcesListComponent modal
- `aria-expanded` on accordion items
- `aria-level` + `aria-label` on source group headings
- `aria-hidden="true"` on decorative icons
- `role="status"` + `aria-label` on URL access explanation section
- `role="group"` + `aria-label` on stacked status icons
- `role="img"` + `aria-label` on meaningful status indicators

**Keyboard handlers:**
- Enter/Space on all interactive elements (SourcesListItem, CitationTooltip, DrawerItem, EvidenceTray buttons)
- Escape handled at multiple levels (Radix popover, SourcesListComponent, drawer)
- Two-stage Escape navigation (expanded → summary → close)

**Focus management:**
- `FOCUS_RING_CLASSES = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"` applied to buttons, links, triggers
- Focus ring suppressed on mouse click (`focus-visible` only fires on keyboard focus)
- `onCloseAutoFocus: e.preventDefault()` — prevents Radix from scroll-jumping to return focus to trigger

### 5.2 Genuine Gaps the Spec Should Address

| Gap | Priority | Description |
|-----|----------|-------------|
| **Focus trap** | High | Popover has no focus trap — Tab can escape to background content. Radix's `Popover` doesn't trap by default (unlike `Dialog`). Need `FocusTrap` wrapper or manual `tabIndex` management. |
| **Focus return** | Medium | `onCloseAutoFocus` prevents focus return (to avoid scroll jump). This means keyboard users lose their place after closing. Need conditional: return focus if user opened via keyboard, suppress if opened via click. |
| **Arrow key navigation** | Low | No arrow key image panning (spec suggests 50px per keypress). Worth adding for expanded-page: arrow keys pan, +/− zoom. |
| **aria-live for status changes** | Medium | Verification status can change while popover is open (pending → verified). No `aria-live` region announces this. Radix's dialog role doesn't auto-announce content changes. |
| **Reduced motion: height morph** | Low | When `prefersReducedMotion`, `AnimatedHeightWrapper` renders as Fragment (no animation wrapper at all). This causes instant height jumps which can be disorienting. Better to keep the wrapper but set `transitionDuration: 0ms` (instant but no layout shift). |

### 5.3 Reduced Motion — Existing System Is Better Than Spec's Proposal

The spec proposes:
```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; }
}
```

The codebase uses a **graduated approach** via `usePrefersReducedMotion()`:

| Component | When reduced | Behavior |
|-----------|-------------|----------|
| `DefaultPopoverContent` | `AnimatedHeightWrapper` → renders `<>{children}</>` (Fragment) | Height morphs become instant |
| `CitationDrawer` accordion | `transitionDuration: "0ms"` | Expand/collapse instant |
| `CitationDrawer` stagger | Stagger delays still computed but animation duration 0 | Items appear simultaneously |
| `EvidenceTray` fills | Fill animation conditionally skipped | Immediate appearance |
| `CitationStatusIndicator` | CSS `@media` disables spinner rotation | Static icon |

This is superior to the blanket `0.01ms` override because:
- Skeleton loading pulses still work (users need loading feedback)
- Hover color transitions still work (functional feedback, not decorative)
- Focus rings still animate (accessibility feedback)

**Recommendation:** Keep the existing graduated system. Fix the one regression (height morph should use `0ms` transition, not Fragment, to avoid layout jump).

---

## Part 6: Mobile vs Desktop — Three Tiers, Not Two

The spec treats this as a binary: "mobile" vs "desktop." The codebase handles three tiers:

| Tier | Detection | Interaction Model |
|------|-----------|-------------------|
| **Touch-only (phone)** | `(pointer: coarse)` + small viewport | Drawer for groups, popover for singles. Touch dismiss, drag-to-close, no hover. |
| **Touch + large viewport (tablet)** | `(pointer: coarse)` + large viewport | Popover (not drawer). Touch gestures but no hover expand on icons. |
| **Pointer-primary (desktop)** | `(pointer: fine)` | Popover. Mouse drag-to-pan, Ctrl+wheel zoom, hover tooltips, click-outside dismiss. |

**The spec conflates:**
- "Two-finger pan" (trackpad scroll) with "pinch zoom" (touch gesture) — these are different
- "Swipe down" (touch gesture on phone) with "trackpad swipe" (navigation gesture on macOS) — these are different
- Mobile dismiss (touch outside) with desktop dismiss (click outside) — these use different event systems (`touchstart/touchend` vs `mousedown`)

**Recommendation:** Replace Section 8 with a three-tier table showing gesture ownership per tier.

---

## Part 7: Recommended Changes Summary

### Remove from Spec

| Section | Item | Reason |
|---------|------|--------|
| 1, 2.6, 3.6, 3.8 | Fullscreen modal | Use view state transitions within popover |
| 2.1 | `setPointerCapture` + `preventDefault` on trigger | Breaks accessibility; use existing click handler |
| 2.3 | Custom gesture arena for image pan | Native scroll is better; `useDragToPan` handles mouse |
| 2.4.1 | Pinch zoom in popover/keyhole | Only valid in expanded-page (already built) |
| 2.4.2 | Double-tap zoom | Conflicts with iOS Safari system gesture |
| 3.1 | Transform-origin at trigger position | Conflicts with three-layer positioning |
| 3.1 | Backdrop-filter blur | GPU-heavy on mobile; codebase uses opacity overlay |
| 3.2 | 50ms visible text stagger | Costs latency; keep existing 30ms technical stagger |
| 7.2 | Blanket `0.01ms` reduced motion | Breaks loading indicators; use existing graduated system |

### Correct in Spec

| Section | Item | Correction |
|---------|------|-----------|
| 2.2.4 | Swipe-to-close 50px | 80px threshold; drawer only, not popover |
| 3.1 | 100ms popover entry | 200ms (entry); 80ms (exit) — asymmetric |
| 3.7 | 200ms exit | 80ms — dismissals should feel instant |
| 2.3.1 | 0.95 momentum decay | 0.88 with 2.0x velocity boost (frame-rate independent) |
| 2.3.1 | 5px slop threshold | 10px for touch (`TAP_SLOP_PX`); 5px for mouse drag (`DRAG_THRESHOLD`) |
| 8 | Binary mobile/desktop | Three tiers: touch-only, touch+large, pointer-primary |

### Add to Spec

| Priority | Item | Description |
|----------|------|-------------|
| **Critical** | View state machine | `summary → expanded-evidence → expanded-page` with two-stage Escape |
| **Critical** | CitationDrawer | Bottom sheet, accordion, stagger animation, drag-to-close |
| **Critical** | Width morphing | Content-adaptive widths, snap transitions (no CSS morph) |
| **High** | Three-layer positioning | How positioning works, what cannot be animated |
| **High** | Focus trap | Genuine accessibility gap — popover needs Tab trapping |
| **High** | Zoom toolbar | Primary zoom affordance on both platforms |
| **Medium** | Timing telemetry | TtC tracking, spinner staging, dwell thresholds |
| **Medium** | Hit-box extenders | Pseudo-element touch targets without layout bloat |
| **Medium** | Image security | `isValidProofImageSrc()` validation requirements |
| **Medium** | aria-live announcements | Status change announcements while popover is open |
| **Low** | Arrow key navigation | Keyboard-only image panning in expanded-page |
| **Low** | Focus return strategy | Conditional: return on keyboard-open, suppress on click-open |

---

## Verdict

The spec is a solid **interaction design intent document** for someone unfamiliar with the codebase. As an implementation specification, it would cause regressions in positioning, accessibility, gesture handling, and animation feel.

**Recommended path forward:**

1. **Preserve the spec's intent** — its mental model of gestures, conflicts, and user flows is useful as design documentation
2. **Rewrite as a delta** — map each spec requirement to existing code, mark "exists," "partially exists," or "gap"
3. **Prioritize the genuine gaps** — focus trap, aria-live, arrow-key panning, focus return strategy, drawer documentation
4. **Ship the easy wins** — the momentum tuning, reduced-motion height fix, and focus trap would have more impact than any gesture system rewrite
5. **Test on devices** — the spec's testing checklist (Section 6) is good; use it against the existing implementation to find real issues rather than theoretical ones

---
---

# Appendix A: Gap-Filling Specification Sections

The following sections fill the gaps identified in the review above. Each is a complete spec section that can be inserted into the original specification, replacing the corresponding area.

---

## A.1 View State Machine

*Replaces: Spec Section 1 "Component States"*

### State Definition

```typescript
type PopoverViewState = "summary" | "expanded-evidence" | "expanded-page";
```

Three states within a **single Radix Popover** (no separate modal):

| State | Width | Height | Content |
|-------|-------|--------|---------|
| `summary` | `clamp(320px, keyholeWidth + 32px, 480px)` | `auto` | Header + quote + keyhole strip |
| `expanded-evidence` | `max(320px, min(imageWidth + 26px, 100dvw - 2rem))` | `auto` | Header + quote + inline expanded image |
| `expanded-page` | `var(--dc-guard-max-width, calc(100dvw - 2rem))` | `calc(100dvh - 2rem)` | Header + full-page image viewer with zoom toolbar |

### Transition Diagram

```
                        click keyhole
         ┌──────────┐ ───────────────→ ┌───────────────────┐
         │ summary  │                  │ expanded-evidence │
         │ (default)│ ←─────────────── │                   │
         └────┬─────┘    Escape        └────────┬──────────┘
              │                                  │
              │ click expand button              │ click expand button
              │                                  │
              ↓                                  ↓
         ┌─────────────────────────────────────────┐
         │           expanded-page                  │
         │                                          │
         │  Escape → return to origin state         │
         │  (summary or expanded-evidence)          │
         └──────────────────────────────────────────┘
```

### Two-Stage Escape Navigation

The system remembers which state the user came from via `prevBeforeExpandedPageRef`:

| Current State | First Escape | Second Escape |
|---------------|-------------|---------------|
| `expanded-page` (from summary) | → `summary` | → Close popover |
| `expanded-page` (from expanded-evidence) | → `expanded-evidence` | → `summary`, then close |
| `expanded-evidence` | → `summary` | → Close popover |
| `summary` | → Close popover | N/A |

### Width Transition Policy

**Width snaps instantly** — no CSS transition. Text re-wraps on every intermediate width frame, causing visible jitter. This matches Linear, Notion, and Vercel behavior.

### Height Transition Policy

**Height animates** via `useAnimatedHeight` (imperative, zero React renders):

| Direction | Duration | Easing | Behavior |
|-----------|----------|--------|----------|
| Expand (grow) | 200ms | `cubic-bezier(0.34, 1.06, 0.64, 1)` | Spring with 6% overshoot |
| Collapse (shrink) | 100ms | `cubic-bezier(0.2, 0, 0, 1)` | Decisive decelerate |

**Algorithm:**
1. `useLayoutEffect` fires (before paint) — measures new content height
2. Pins wrapper to old height with `overflow: hidden`
3. Next frame: applies CSS transition, animates to new height
4. `transitionend`: clears inline styles, returns to `auto`

**Shrinking exception:** If new height < old height, animation is skipped (gap would appear below shorter content).

### Content Stagger

`CONTENT_STAGGER_DELAY_MS = 30ms` — container morphs first, content follows 30ms later. Not a visible animation; prevents empty-container flash during morph.

### Triple Always-Render Pattern

All three states render simultaneously; inactive states are hidden with `display: none`. This keeps the React hook tree stable — React 19 StrictMode corrupts the fiber effect linked list when conditionally swapping components with different hook counts inside a portal.

**Re-entry animation:** When returning from expanded to summary, applies `animate-in fade-in-0 duration-100` to avoid a visual snap.

---

## A.2 Citation Drawer (Bottom Sheet)

*Adds: Missing section — the spec has no drawer documentation*

### Overview

The `CitationDrawer` is a portal-based bottom sheet that groups multiple citations by source. On mobile, this is often the primary interaction surface.

### Structure

```
CitationDrawer (portal to document.body)
├── Backdrop (bg-black/30, z-index 9998)
├── Drawer Container (z-index 9999, rounded-t-2xl)
│   ├── Drag Handle Bar (w-10 h-1, rounded-full)
│   ├── Header
│   │   ├── Source Heading (favicon + name + "+N")
│   │   ├── Stacked Status Icons
│   │   ├── Page Badges (filterable pills)
│   │   └── Close Button
│   ├── Header Inline Panel (expanded-page viewer, optional)
│   │   ├── InlineExpandedImage (with zoom/pan)
│   │   └── Indicator Row (per-citation buttons)
│   └── Scrollable Citation List (overflow-y: auto)
│       ├── Source Group Header (multi-source only)
│       └── CitationDrawerItemComponent (per citation)
│           ├── Summary Row (status icon + text + chevron)
│           └── Expanded Detail (accordion, EvidenceTray)
└── (Scroll Lock: acquireScrollLock / releaseScrollLock)
```

### Positioning

| Position | Layout | Max Height | Drag-to-Close |
|----------|--------|-----------|---------------|
| `bottom` (default, mobile) | `inset-x-0 bottom-0 rounded-t-2xl` | `80dvh` (normal), `100dvh` (full-page) | Yes |
| `right` (side panel) | `inset-y-0 right-0 w-full max-w-md` | Full height | No |

### Accordion Behavior

Single-expanded radio pattern — only one citation expanded at a time:

| Animation | Duration | Easing |
|-----------|----------|--------|
| Accordion expand | 200ms | `cubic-bezier(0.34, 1.06, 0.64, 1)` |
| Accordion collapse | 120ms | `cubic-bezier(0.2, 0, 0, 1)` |

Uses CSS `grid-template-rows: 0fr → 1fr` transition (not height animation).

### Stagger Animation

Citations animate in with an **exponential approach** delay curve:

```
delay(i) = 250 × (1 − e^(−i × 40 / 250))
```

| Item | Delay |
|------|-------|
| 0 | ~0ms |
| 1 | ~40ms |
| 2 | ~77ms |
| 3 | ~109ms |
| 4 | ~138ms |
| ... | → 250ms asymptote |

Each item enters with: `fade-in-0 slide-in-from-bottom-2 duration-[160ms]`

**Why exponential over linear:** Avoids the abrupt "cliff" where all items beyond a linear cap appear simultaneously.

### Drag-to-Close Gesture

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Close threshold | **80px** downward | Apple sheet dismiss threshold (~75-80px) |
| Flick velocity | **0.5 px/ms** (~500 px/s) | Fast downward flick dismisses even below threshold |
| Rubber-band factor | **0.4** | 40% damping past threshold (resistance feel) |
| Velocity samples | **4** (ring buffer) | Smooth velocity estimation |
| Haptic feedback | `navigator.vibrate?.(10)` | 10ms pulse at threshold crossing (fires once per gesture) |
| Expand threshold | **−80px** upward | Same threshold, opposite direction |

**Snap-back:** Two-phase RAF — `setIsDragging(false)` enables CSS transition, then `rAF(setDragOffset(0))` animates back.

### Escape Key Navigation (Three Levels)

| Level | Escape Action | Result |
|-------|--------------|--------|
| Header inline panel open | Close panel | Stay in drawer |
| Citation expanded | Collapse accordion | Stay in drawer |
| Citation list visible | Close drawer | Return to page |

### Drawer Trigger

Compact collapsed summary bar:

```
[Per-citation status icons] [Source label] [TtC display] [Chevron]
```

- **Status icons:** Stack with `-0.25rem` overlap; expand horizontally on desktop hover
- **Label:** `generateDefaultLabel()` — single source → name, 2+ → "Name +N" (truncated to 25 chars)
- **TtC display:** `"avg rev {time}"` when metrics available, using `TTC_TEXT_STYLE` (muted, tabular-nums)
- **Tooltip:** On individual icon hover — shows source name, anchor text preview (60 chars), proof thumbnail

---

## A.3 Three-Layer Positioning Defense

*Adds: Missing section — the spec must acknowledge this system*

### Architecture

| Layer | Mechanism | Property Modified | When It Acts |
|-------|-----------|------------------|-------------|
| 1. Radix | `@floating-ui/dom computePosition()` | `transform: translate3d(x, y, 0)` | Every position update |
| 2. Hooks | `sideOffset` + `alignOffset` props | Radix prop inputs | On open + view-state change + resize |
| 3. Guard | `useViewportBoundaryGuard` | CSS `translate: dx dy` (separate property) | After morph settles (300ms debounce) |

### Layer 2: Offset Hooks

**useLockedPopoverSide:**
- Picks `top` or `bottom` once on open via `useLayoutEffect`
- `MIN_SPACE_PX = 200` — minimum required space before flipping
- **Never changes** during popover lifetime (prevents scroll-triggered jumps)

**useExpandedPageSideOffset:**
- Positions expanded-page at 1rem (16px) from viewport edge
- Uses `useMemo` (not `useLayoutEffect + setState`) — offset is synchronous, no one-frame delay
- Math: `side === "bottom" ? 16 - triggerRect.bottom : triggerRect.top - (viewportHeight - 16)`

**usePopoverAlignOffset:**
- Clamps popover horizontally so neither edge is within 16px of viewport boundary
- Uses `document.documentElement.clientWidth` (excludes scrollbar)
- `requestAnimationFrame` debounced on window resize
- Computation is independent of current offset — converges in single pass

### Layer 3: Viewport Boundary Guard

- **SETTLE_MS = 300ms** (200ms morph + 100ms buffer) — debounce for ResizeObserver
- Sets `--dc-guard-max-width` CSS variable (viewport width minus 32px, excluding scrollbar)
- Uses CSS `translate` (separate from Radix's `transform`) — corrections compose additively
- **No React state** — pure DOM manipulation for React Compiler compatibility

Three reactive sources:
1. **MutationObserver** on Radix wrapper (detects `@floating-ui` transform updates)
2. **ResizeObserver** on content (debounced by SETTLE_MS)
3. **Window resize** (immediate, rAF-deferred)

**If Layers 1-2 get it right, Layer 3 is a no-op** — `clamp()` returns `dx=0, dy=0`.

### Constraints on Animation

Any animation proposal must respect:
- **Cannot animate `transform`** — Layer 1 (Radix) owns it
- **Cannot animate `translate`** — Layer 3 (Guard) owns it
- **Entry animation uses Tailwind `animate-in`** which composes via Radix's `data-[state=open]` selectors, not custom transforms

---

## A.4 Zoom Toolbar

*Adds: Missing section — the spec only describes gesture-based zoom*

### Structure

```
ZoomToolbar (absolute, bottom-right, bg-black/50 backdrop-blur-sm)
├── Zoom Out Button (−)
├── Range Slider (5% steps, capsule thumb 14×22px)
├── Percentage Display (tabular-nums, min-w-[4ch])
├── Locate Button (scroll to annotation, dirty-bit emphasis)
└── Zoom In Button (+)
```

**Position:** `bottom: 8px, right: 8px` within the expanded-page container.

### Zoom Constants

| Constant | Value | Context |
|----------|-------|---------|
| `EXPANDED_ZOOM_MIN` | 0.5 (50%) | Hard floor for expanded-page |
| `EXPANDED_ZOOM_MAX` | 3.0 (300%) | Hard ceiling |
| `EXPANDED_ZOOM_STEP` | 0.25 (25%) | Per +/− button click |
| `EXPANDED_MIN_READABLE_ZOOM` | 0.8 (80%) | Auto-zoom floor for legibility |
| `KEYHOLE_ZOOM_MIN` | 1.0 | Never below natural pixel density |
| `KEYHOLE_ZOOM_MAX` | 2.5 | Read small text |
| `KEYHOLE_ZOOM_STEP` | 0.15 | Per discrete wheel notch |
| `WHEEL_ZOOM_SENSITIVITY` | 0.005 | Ctrl+wheel delta → zoom delta |
| `KEYHOLE_WHEEL_ZOOM_SENSITIVITY` | 0.008 | Keyhole-specific (more sensitive) |

### Slider Behavior

- Range: `[zoomFloor × 100, EXPANDED_ZOOM_MAX × 100]`, step 5%
- Keyboard: native `<input type="range">` — arrow keys ±5%, Home/End to extremes
- **Grab lock:** `onSliderGrab` freezes container width (`minWidth = maxWidth = current`) so the toolbar doesn't shift under the user's finger during zoom-out

### Fit-to-Screen Computation

```
maxImageWidth = viewportWidth - 32 - 26  (margins + shell)
fitZoom = maxImageWidth / naturalWidth
readableZoom = clamp(fitZoom, 0.8, 1.0)
zoomFloor = min(0.5, fitZoom)
```

If `hasManualZoomRef` is true (user has zoomed), window resize preserves user's zoom level.

### Scroll Position Anchor Preservation

During gesture zoom (pinch or Ctrl+wheel), CSS `transform: scale()` is applied directly to the image wrapper (GPU-composited, zero layout reflow). On gesture end:

1. Final zoom committed to React state → width reflows
2. `useLayoutEffect` clears transform and corrects scroll position:

```
ratio = newZoom / oldZoom
scrollLeft = (anchorX + oldScrollLeft) × ratio − anchorX
scrollTop = (anchorY + oldScrollTop) × ratio − anchorY
```

This keeps the content point under the gesture anchor visually stable.

### Locate Button & Drift Detection

- `DRIFT_THRESHOLD_PX = 15` — marks annotation as "drifted" (off-screen) after 15px pan
- When drifted: locate button emphasized (brighter, pulse)
- When centered: locate button de-emphasized (muted)
- Click: smooth-scrolls to annotation, sets `isAnimatingScroll` flag to suppress false drift detection during scroll

---

## A.5 Accessibility Gaps & Fixes

*Amends: Spec Section 7*

### A.5.1 Focus Trap (High Priority — Genuine Gap)

**Current state:** Radix `Popover` does NOT provide focus trapping (unlike `Dialog`). Tab key can escape to background content.

**Fix:**

```typescript
// In Popover.tsx or CitationComponent.tsx:
// Option A: Use the `inert` attribute on background content
useEffect(() => {
  if (!isOpen) return;
  const main = document.querySelector("main"); // or app root
  if (main) main.setAttribute("inert", "");
  return () => main?.removeAttribute("inert");
}, [isOpen]);

// Option B: Wrap PopoverContent with a FocusTrap component
// Only activate for keyboard-opened popovers
```

**Conditional activation:** Track whether popover was opened via keyboard (`handleKeyDown` already exists and identifies Enter/Space). Only trap focus for keyboard-opened popovers — mouse users can click outside to dismiss without needing a trap.

### A.5.2 Focus Return (Medium Priority — Regression Risk)

**Current state:** `onCloseAutoFocus` calls `e.preventDefault()` unconditionally to avoid scroll-jumping to trigger on close.

**Problem:** Keyboard users lose their place after closing because focus doesn't return.

**Fix:**

```typescript
// Track how popover was opened
const openedViaKeyboardRef = useRef(false);

// In keyboard handler:
if (e.key === "Enter" || e.key === " ") {
  openedViaKeyboardRef.current = true;
  // ... open popover
}

// In click handler:
openedViaKeyboardRef.current = false;

// In onCloseAutoFocus:
onCloseAutoFocus={(e: Event) => {
  if (!openedViaKeyboardRef.current) {
    e.preventDefault(); // Suppress scroll-jump for click-opened popovers
  }
  // For keyboard-opened: allow Radix to return focus (use preventScroll: true if available)
}}
```

### A.5.3 aria-live for Status Changes (Medium Priority — Partially Exists)

**Current state:** `aria-live="polite"` exists on the trigger's status description span, but NOT inside the popover content. When verification status changes from pending → verified while the popover is open, screen readers don't announce the change.

**Fix:**

```tsx
// In DefaultPopoverContent.tsx, add inside popover content:
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {prevStatusRef.current === "pending" && isVerified && "Citation verified — exact match found"}
  {prevStatusRef.current === "pending" && isMiss && "Verification complete — citation not found in source"}
  {prevStatusRef.current === "pending" && isPartialMatch && "Verification complete — partial match found"}
</div>
```

### A.5.4 Arrow Key Panning (Low Priority — Partially Exists)

**Current state:** Arrow keys work in keyhole strip (50% of container width per keypress, min 80px). Arrow keys do NOT work in expanded-page view.

**Fix for expanded-page:**

```typescript
// In InlineExpandedImage container:
onKeyDown={(e) => {
  const el = containerRef.current;
  if (!el) return;
  const step = e.shiftKey ? 200 : 50; // Shift = large pan
  switch (e.key) {
    case "ArrowLeft":  el.scrollLeft -= step; e.preventDefault(); break;
    case "ArrowRight": el.scrollLeft += step; e.preventDefault(); break;
    case "ArrowUp":    el.scrollTop -= step;  e.preventDefault(); break;
    case "ArrowDown":  el.scrollTop += step;  e.preventDefault(); break;
  }
}}
tabIndex={0} // Make container focusable
```

### A.5.5 Reduced Motion Height Fix (Low Priority — Easy Win)

**Current state:** `AnimatedHeightWrapper` renders as `<Fragment>` when `prefersReducedMotion` is true. This removes the wrapper entirely, causing instant layout jumps.

**Fix:** Keep the wrapper but disable animation:

```typescript
if (prefersReducedMotion) {
  return (
    <div ref={wrapperRef}>
      <div ref={contentRef} style={{ display: "flow-root" }}>
        {children}
      </div>
    </div>
  );
}
// useAnimatedHeight hook still runs but detects prefersReducedMotion
// and sets transitionDuration: "0ms" instead of skipping entirely
```

Height changes are still instant (0ms duration), but without the disorienting layout shift that occurs when the wrapper DOM element appears/disappears.

---

## A.6 Hit-Box Extenders

*Adds: Missing section — the spec mentions 44px touch targets but not the implementation mechanism*

### CSS Implementation

```typescript
// Uniform 8px extension (16px added per dimension):
HITBOX_EXTEND_8 = "after:content-[''] after:absolute after:inset-[-8px]"

// Rectangular extension (16px horizontal, 28px vertical):
HITBOX_EXTEND_8x14 = "after:content-[''] after:absolute after:inset-x-[-8px] after:inset-y-[-14px]"
```

### How They Work

The `::after` pseudo-element extends the clickable area without affecting layout:
- Element must be `position: relative | absolute | fixed`
- Negative `inset` values extend the pseudo-element beyond the parent's bounds
- The pseudo-element is invisible (`content: ''`) but captures pointer events
- Layout is unaffected — siblings don't move

### Usage Example

A 28px (size-7) close button with `HITBOX_EXTEND_8`:
```
Visual button: 28×28px
::after extension: 8px each side
Effective touch target: 44×44px ✓ (meets Apple HIG minimum)
```

### Where Used

- Annotation overlay close button (8px all sides)
- Keyhole pan arrow buttons (8px horizontal, 14px vertical — wider vertical reach for thumbs)
- Verification timeline controls (8px horizontal, 14px vertical)

---

## A.7 Timing Telemetry

*Adds: Missing section — the spec doesn't document how timing affects UX*

### Time-to-Certainty (TtC) System

TtC tracks how long from citation render to verification resolution:

| Range | Display | Tier | Visual Treatment |
|-------|---------|------|-----------------|
| < 100ms | "instant" | fast | Green tint (`#86efac`) |
| 100-999ms | "0.Xs" | fast | Green tint |
| 1-2s | "X.Xs" | fast | Green tint |
| 2-10s | "X.Xs" or "XXs" | normal | Muted gray (`#9ca3af`) |
| 10-60s | "XXs" | slow | Muted gray |
| ≥ 60s | ">60s" | slow | Muted gray |

### Spinner Staging

Three-stage spinner for pending citations:

| Stage | Trigger | Visual |
|-------|---------|--------|
| `active` | Initial state | Standard spin animation |
| `slow` | After `SPINNER_TIMEOUT_MS` (5s) | Decelerated rotation, 60% opacity |
| `stale` | After 15s | Hidden |

### Popover Dwell

`REVIEW_DWELL_THRESHOLD_MS = 2000` — if popover stays open > 2s, emit `citation_reviewed` timing event.

### Aggregate Metrics

`useTtcMetrics(verifications)` computes: `avgTtcMs`, `minTtcMs`, `maxTtcMs`, `medianTtcMs`, `resolvedCount`, `totalCount`. Displayed in drawer trigger as `"avg rev {time}"`.

---

## A.8 Image Security

*Adds: Missing section — the spec mentions "right-click save image" but not validation*

### Source Validation (`isValidProofImageSrc`)

All image sources must pass validation before rendering:

1. **Data URIs:** Only `data:image/png`, `jpeg`, `webp`, `avif`, `gif`. **Blocks SVG** (can contain `<script>`)
2. **Relative paths:** Reject `//` (protocol-relative), `..` (traversal). Iterative decode (5×) to prevent double-encoding attacks. Reject Unicode lookalike dots (U+FF0E, U+2024). Reject null bytes. Decoded length < 2KB.
3. **URLs:** Require `https://` (or localhost for dev). Whitelist: `api.deepcitation.com`, `cdn.deepcitation.com`, `proof.deepcitation.com`

### Image Error Handling

```typescript
// Module-level handler (no new ref per render):
handleImageError = (e) => { e.target.style.display = "none"; }
```

Hides broken images silently instead of showing browser error icons.

---

## A.9 Device Tier Model

*Replaces: Spec Section 8 "Mobile vs Desktop"*

### Three Tiers

| Tier | Detection | Popover | Drawer | Hover | Gestures |
|------|-----------|---------|--------|-------|----------|
| **Touch-only (phone)** | `(pointer: coarse)` + small viewport | Single citations | Groups | No — skip icon spread, go straight to drawer | Native scroll pan, pinch zoom (expanded only), drag-to-close |
| **Touch + large viewport (tablet)** | `(pointer: coarse)` + large viewport | Both | Optional | No | Same as phone |
| **Pointer-primary (desktop)** | `(pointer: fine)` | Both | Optional | Yes — icon spread, tooltips | Mouse drag-to-pan, Ctrl+wheel zoom, click-outside dismiss |

### Event System Per Tier

| Event | Phone | Tablet | Desktop |
|-------|-------|--------|---------|
| Open popover | `touchend` (TAP_SLOP_PX = 10) | `touchend` | `click` |
| Close outside | `touchstart/touchend` capture, passive | `touchstart/touchend` capture, passive | `mousedown` capture |
| Close debounce | `TOUCH_CLICK_DEBOUNCE_MS = 100` | 100ms | N/A |
| Image pan | Native overflow scroll | Native overflow scroll | `useDragToPan` (mouse drag) |
| Zoom | Pinch (expanded only) | Pinch (expanded only) | Ctrl+wheel |
| Drawer close | `useDrawerDragToClose` (80px + velocity) | N/A (side panel, no drag) | N/A |

### Passive Event Listeners

All touch event handlers use `{ passive: true }` except:
- `touchmove` during pinch zoom (`passive: false` — needs `preventDefault` to block native scroll)
- `wheel` during zoom (`passive: false` — needs `preventDefault` to block page scroll)

---

## A.10 Gesture Ownership Table

*Replaces: Spec Section 5 "Gesture Conflict Resolution"*

Instead of a unified gesture arena, each interaction surface owns its gestures:

| Surface | Horizontal | Vertical | Zoom | Tap |
|---------|-----------|----------|------|-----|
| **Keyhole strip** | Native scroll (touch) / `useDragToPan` (mouse) | Parent scroll wins | Wheel only (`useWheelZoom`, sensitivity 0.008) | Expand to evidence (DRAG_THRESHOLD = 5px) |
| **Expanded-page image** | Scroll pan (overflow) | Scroll pan (overflow) | Ctrl+wheel (0.005) / pinch (touch) | N/A |
| **Drawer handle** | N/A | `useDrawerDragToClose` (80px threshold) | N/A | N/A |
| **Popover content** | N/A | Scroll (overflow-y: auto) | N/A | N/A |
| **Citation trigger** | N/A | N/A | N/A | Click/tap (TAP_SLOP_PX = 10px) |

### Conflict Resolution (Without Gesture Arena)

| Conflict | Winner | Mechanism |
|----------|--------|-----------|
| Scroll vs keyhole pan | **Browser decides** | `overflow-x: auto` + `overscroll-behavior: none` |
| Keyhole pan vs tap-to-expand | **Distance threshold** | `DRAG_THRESHOLD = 5px` in `useDragToPan`; `wasDraggingRef` suppresses click |
| Scroll vs drawer drag | **Direction + surface** | Drawer drag only on handle bar; content area scrolls normally |
| Bare scroll vs zoom | **Modifier key** | `requireCtrl: true` — bare scroll pans, Ctrl+scroll zooms |
| Touch scroll vs popover open | **Distance threshold** | `TAP_SLOP_PX = 10px` — movement > 10px = scroll, < 10px = tap |
