# Design Review: Citation Component Specification
## From the perspective of a design engineer (Apple HIG, Notion, Linear, GitHub)

---

## Overall Assessment

The spec is thorough in breadth — it covers gestures, animations, conflict resolution, and accessibility. That ambition is good. But as written, it would lead to a **fundamentally different component** than what's already built, introduces patterns that conflict with the existing architecture's carefully considered decisions, and in several places proposes interactions that violate platform conventions or create unnecessary complexity.

The existing codebase is significantly more sophisticated than the spec assumes. The spec reads as if written from scratch for a hypothetical component, not as an evolution of the current system. Below is a section-by-section review.

---

## 1. Critical Misalignments with Existing Architecture

### 1.1 The spec proposes `setPointerCapture` for trigger taps — the codebase uses click events

**Spec says:** Use `onPointerDown` with `setPointerCapture` and `preventDefault()` to register intent, then open on `pointerUp` if distance < 3px.

**Problem:** The existing `CitationComponent` uses standard click handlers with a scroll-vs-tap discriminator (`TAP_SLOP_PX = 10px`). The `useCitationEvents` hook already handles click/hover/keyboard. Introducing `setPointerCapture` on the *trigger* is an anti-pattern here:

- `preventDefault()` on `pointerdown` kills text selection, link long-press menus, and assistive technology interactions
- `setPointerCapture` steals the pointer from the browser's own scroll detection — the very problem the spec then tries to solve in Section 5
- The 3px slop is too tight; 10px (current) is correct for mobile where finger contact patches are imprecise (Apple HIG recommends even larger)

**Recommendation:** Keep the current click-based open. The existing `TAP_SLOP_PX = 10px` threshold with the `wasPopoverOpenBeforeTap` pattern already solves "accidental open on scroll" (Flow 4 in the spec) without needing a gesture arena on the trigger.

### 1.2 The spec proposes hover-to-open — the codebase is click-only

The spec's `isHovering` naming might suggest hover semantics. The actual codebase is intentionally **click-to-show, never hover**. This is correct:

- Hover popovers on dense citation text create "popover storms"
- Linear, Notion, and GitHub all use click-to-open for content popovers (hover is reserved for tooltips with < 200ms delay)
- Click-to-open gives the user agency and is unambiguous on touch

**Recommendation:** Spec should explicitly state "click-to-open only, no hover-to-open."

### 1.3 The spec proposes `avoidCollisions` and middleware — the codebase explicitly disables them

The spec doesn't mention the existing three-layer positioning defense. Several animation proposals (transform-origin at click point, scale from trigger) would fight with the existing Radix positioning. The `avoidCollisions={false}` decision is documented in CLAUDE.md as a core design principle.

**Recommendation:** Spec Section 3 (animations) must work within the existing positioning stack. Any entrance animation must not use `transform-origin` tied to trigger position, because the popover is positioned by Radix's `translate3d` and the guard's CSS `translate` — injecting a third transform coordinate system creates unpredictable results.

### 1.4 The spec proposes a "fullscreen modal" — the codebase uses inline expanded states

The spec describes a separate fullscreen modal with its own lifecycle. The actual architecture uses **view state transitions within the same popover**: `summary` → `expanded-evidence` → `expanded-page`. This is a critical difference:

- The popover stays mounted; its content morphs via `useAnimatedHeight`
- Width adapts via `getExpandedPopoverWidth()` / `EXPANDED_POPOVER_MID_WIDTH`
- The expanded-page state uses `calc(100dvh - 2rem)` height — effectively full-viewport but still a popover
- Escape navigates back through states: `expanded-page → previous → close`

**A separate modal would:**
- Break the two-stage Escape pattern
- Lose the position-locked side (the popover's side is locked for its lifetime)
- Require duplicating scroll lock, focus management, and keyboard handling
- Create a FLIP animation that fights with Radix's positioning

**Recommendation:** Replace "fullscreen modal" throughout the spec with "expanded-page view state." The transition is a morph (height/width change), not a FLIP to a new element.

---

## 2. Gesture System Review

### 2.1 Image Pan Gesture Arena (Section 2.3) — Overengineered

The gesture arena pattern described is correct in theory but **the codebase already solves this differently and more simply:**

- The keyhole image strip uses **native horizontal scroll** (`overflow-x: auto`) plus `useDragToPan` for mouse drag
- Touch panning is native browser scrolling (the container scrolls, not a transform)
- The direction discrimination is handled by the browser's own touch-action/overscroll-behavior, not a custom arena

The spec's proposed gesture arena (Section 2.3.1) with `setPointerCapture`, direction analysis, and 1.5x aspect ratio thresholds would **replace working native scrolling with a custom reimplementation** that:
- Loses native scroll inertia (iOS rubber-band, Android overscroll glow)
- Loses accessibility scroll events
- Adds ~200 lines of gesture code for something CSS `overflow-x: auto` already handles

**Recommendation:** For the keyhole strip, keep native scroll + `useDragToPan` for mouse. The gesture arena is only needed if you add transform-based panning (which you shouldn't — native scroll is better UX).

### 2.2 Pinch Zoom (Section 2.4.1) — Not Currently Implemented, and Probably Shouldn't Be in Popover

The spec proposes pinch-to-zoom inside the popover image. The codebase doesn't have this, and for good reason:

- The keyhole strip is 120px tall — pinch-zoom in a 120px strip is a terrible experience
- Pinch-zoom conflicts with browser page zoom on mobile (users expect pinch to zoom the whole page)
- The expanded-page view uses `useWheelZoom` (Ctrl+wheel on desktop, scroll-to-zoom in keyhole) which is more precise

**Recommendation:** Pinch-to-zoom should only be considered for the expanded-page view state, and even there, `useZoomControls` with button +/- is more discoverable and accessible. If pinch is added, it must use `touch-action: none` on the image container (which breaks native scroll — circular problem).

### 2.3 Double-Tap Zoom (Section 2.4.2) — Conflicts with iOS Safari

Double-tap on iOS Safari is a system gesture (smart zoom / accessibility zoom). Overriding it with `touch-action: manipulation` is a global decision that affects the entire page. The codebase doesn't do this.

**Recommendation:** Remove double-tap zoom. Use explicit zoom controls (+/- buttons) which are always accessible and don't conflict with platform gestures.

### 2.4 Swipe-to-Close (Section 2.2.4) — Already Implemented as Drag-to-Close on Drawer

The spec proposes "swipe down on popover to close with 50px threshold." The codebase has `useDrawerDragToClose` with:
- 80px threshold (`DRAWER_DRAG_CLOSE_THRESHOLD_PX`)
- Velocity detection (> 0.5 px/ms flick-to-dismiss)
- Rubber-banding past threshold (0.4x factor)
- Haptic feedback (`navigator.vibrate(10)`)
- Bidirectional (down = close, up = expand)

The spec's 50px threshold is too sensitive — it would trigger on casual scrolls within the popover content. 80px is the right number (Apple's sheet dismiss threshold is ~75-80px).

**Recommendation:** Reference the existing `useDrawerDragToClose` system. Don't propose a separate 50px swipe-down on the popover — the popover isn't a bottom sheet.

---

## 3. Animation Review

### 3.1 Popover Entrance (Section 3.1) — Mostly Aligned but Wrong Transform Origin

**Spec:** 100ms, `cubic-bezier(0.16, 1, 0.3, 1)`, opacity 0→1, scale 0.92→1.0, transform-origin at trigger position.

**Current:** Uses Tailwind `animate-in` (Radix-based enter/exit with `useAnimationState`). The timing scale is:
- Morph expand: 200ms with `cubic-bezier(0.34, 1.06, 0.64, 1)` (6% spring overshoot)
- Morph collapse: 100ms with `cubic-bezier(0.2, 0, 0, 1)`

**Issues:**
- Transform-origin at trigger position doesn't work with Radix's `translate3d` positioning (the popover is already translated to its final position; adding a transform-origin creates a double-offset)
- 100ms for entry is fine, but the spec ignores that the popover has **multiple entry paths** (fresh open vs. returning from expanded state)
- The backdrop blur proposal (10px) is a heavy GPU operation; the codebase doesn't use backdrop-filter, and adding it would cause jank on mid-range mobile devices

**Recommendation:**
- Drop transform-origin at trigger position; use center or top-center origin (depending on locked side)
- Keep the existing 200ms morph timing for state transitions
- Consider 120-150ms for initial open (100ms feels slightly rushed for a content-rich popover)
- Skip backdrop-filter blur — use opacity-only overlay (current approach)

### 3.2 Quote Text Stagger (Section 3.2) — Unnecessary

The 50ms-delayed text fade-in is a "delightful animation" that costs 250ms of perceived latency. In a citation component where users are trying to verify information, speed-to-content is paramount.

**Linear/Notion pattern:** Content appears immediately when the container opens. The container animation is the only stagger needed.

**The codebase has:** `CONTENT_STAGGER_DELAY_MS = 30ms` — just enough to avoid an empty-container flash during height morph, not a visible animation.

**Recommendation:** Keep the existing 30ms stagger for technical correctness. Don't add a visible text entrance animation.

### 3.3 Image Skeleton (Section 3.3) — Good, Already Exists

The skeleton loading pattern with pulse animation is a standard pattern. The codebase handles this through image loading states. No issues.

### 3.4 Expand to Fullscreen FLIP (Section 3.6) — Wrong Approach for This Architecture

The FLIP animation (store bounds, transition to new position) assumes two separate elements (popover → modal). The actual architecture morphs the same popover. A FLIP would:

- Fight with Radix's positioning (the popover element stays mounted)
- Require removing the element from Radix's positioning to do a fixed-position FLIP, then reinserting it
- Create flash/jank during the coordinate system switch

**Recommendation:** The current height/width morph with `useAnimatedHeight` is the right approach. Enhance it with:
- Crossfade of inner content (summary → expanded-page content)
- Spring easing on the height transition (already using `cubic-bezier(0.34, 1.06, 0.64, 1)`)
- Consider shared `layoutId` only if migrating to Framer Motion (not recommended for a library — adds 30KB dependency)

### 3.5 Exit Animation (Section 3.7) — Good Principle, Minor Tweak

"Ease-in for exit" is correct design rationale (accelerating exit = object departing). The current 100ms collapse is appropriately fast. The spec's 200ms is slightly slow for a dismiss — users expect immediate feedback on close.

**Recommendation:** Keep 100-120ms for close. Reserve 200ms for state transitions where content is changing.

---

## 4. Accessibility Review

### 4.1 Keyboard Navigation (Section 7.1) — Incomplete

The spec lists basic keyboard interactions but misses the existing two-stage Escape:

```
Escape in expanded-page → return to previous state
Escape in summary → close popover
```

Also missing:
- Focus trap within popover (`useFocusTrap` or Radix's built-in) — **not currently implemented; genuine gap**
- Focus return to trigger on close
- `aria-expanded` on the trigger
- `aria-haspopup="dialog"` on the trigger

The codebase does have some accessibility attributes:
- `role="button"` + `tabIndex={0}` on interactive divs (CitationDrawer)
- `aria-expanded` on accordion items in the drawer
- `aria-level` + `aria-label` on source group headings
- Enter/Space key handlers in `EvidenceTray`

**Recommendation:** Audit existing `useCitationEvents` keyboard handling and document what's already there before proposing additions. Focus trap is a real gap worth adding — spec should prioritize it over gesture work.

### 4.2 Reduced Motion (Section 7.2) — Too Aggressive, and Ignores Existing System

The codebase **already has** `usePrefersReducedMotion()` hook (in `src/react/hooks/usePrefersReducedMotion.ts`) used throughout:
- `EvidenceTray.tsx` — conditionally applies fill animations
- `CitationStatusIndicator.tsx` — CSS `@media` for spinner
- `DefaultPopoverContent.tsx` — renders as Fragment (skips wrapper) when reduced motion preferred
- `CitationDrawer.tsx` — conditionally applies stagger animations

The spec proposes a blanket `animation-duration: 0.01ms !important` override. This:
- Ignores the existing graduated system
- Breaks skeleton loading indicators (users still need loading feedback)
- Causes layout jumps from instant height changes

**Apple HIG guidance:** `prefers-reduced-motion` should remove *decorative* motion, not *functional* motion. A height change should still animate (perhaps at 2x speed), but a springy bounce should be removed.

**Recommendation:** Reference the existing `usePrefersReducedMotion()` hook pattern. Enhance it with:
```css
@media (prefers-reduced-motion: reduce) {
  /* Remove decorative: springs, bounces, scale transforms */
  --dc-ease-expand: linear;
  --dc-ease-collapse: linear;

  /* Shorten functional: height morphs, fades */
  --dc-morph-expand-ms: 100ms;
  --dc-morph-collapse-ms: 50ms;

  /* Keep: opacity transitions, skeleton pulses (slower) */
}
```

### 4.3 Screen Reader Announcements (Section 7.4) — Needs Refinement

The spec proposes `aria-live="polite"` for popover open. Since the popover is a dialog, it should use:
- `role="dialog"` on the popover (Radix already provides this)
- `aria-labelledby` pointing to the quote or source name
- No separate live region needed — the dialog role handles announcements

---

## 5. Mobile vs Desktop (Section 8) — Missing Key Distinction

The spec treats mobile as "touch" and desktop as "mouse." The codebase handles a more nuanced split:

- `useIsTouchDevice()` — detects touch capability
- `isMobile` prop — allows consumer override
- Touch vs. mouse event paths are separate (different dismiss handlers, different slop thresholds)

**Missing from spec:**
- **Tablet (iPad):** Touch device with large viewport — should use popover (not drawer), but touch gestures
- **Desktop with touchscreen:** Mouse and touch simultaneously
- **Trackpad gestures:** Two-finger scroll is *not* pinch-zoom; the spec conflates them

**Recommendation:** Replace "Mobile vs Desktop" with "Touch vs Pointer" and document the three tiers: touch-only (phone), touch+large-viewport (tablet), pointer-primary (desktop).

---

## 6. What the Spec Gets Right

- **Gesture conflict resolution concept** (Section 5) — the principle is sound even if the implementation approach needs adjustment
- **Momentum physics** — exponential decay at 0.95/frame is correct; the codebase uses 0.88/frame with a boost factor, which is slightly more aggressive (appropriate for a constrained image strip)
- **Pan boundary constraints** — the rubber-band + spring-back pattern is the right choice (Option B)
- **Performance guidance** (Section 10) — transform/opacity only, rAF for momentum, will-change usage
- **Edge cases** (Section 7.3) — good enumeration of failure modes (no image, slow load, tiny viewport)
- **Close affordances** — multiple close methods (button, outside click, Escape, drag) is correct

---

## 7. Recommended Changes Summary

| Spec Section | Issue | Action |
|---|---|---|
| 1 (Structure) | Shows "Fullscreen Modal" as separate component | Replace with view state transitions within popover |
| 2.1 (Trigger) | `setPointerCapture` + `preventDefault` | Remove; use existing click handler with `TAP_SLOP_PX` |
| 2.3 (Image Pan) | Custom gesture arena replaces native scroll | Remove; keep native `overflow-x: auto` + `useDragToPan` |
| 2.4.1 (Pinch Zoom) | Pinch-zoom in keyhole strip | Remove for keyhole; consider only for expanded-page |
| 2.4.2 (Double-Tap) | Conflicts with iOS Safari system gesture | Remove entirely |
| 2.2.4 (Swipe Close) | 50px threshold on popover | Reference existing `useDrawerDragToClose` (80px, drawer only) |
| 3.1 (Entrance) | Transform-origin at trigger | Use center/side-aware origin; drop backdrop-filter |
| 3.2 (Quote Stagger) | 50ms visible text delay | Keep existing 30ms technical stagger, no visible animation |
| 3.6 (FLIP Expand) | Separate fullscreen element | Use existing height/width morph within popover |
| 3.7 (Exit) | 200ms exit | Keep 100-120ms (current) |
| 7.2 (Reduced Motion) | Blanket 0.01ms override | Graduated approach: remove decorative, shorten functional |
| 8 (Mobile/Desktop) | Binary split | Three tiers: touch-only, touch+large, pointer-primary |

---

## 8. What Should Be Added to the Spec

1. **View state machine** — The spec doesn't document the `summary → expanded-evidence → expanded-page` transitions or the two-stage Escape pattern. This is the core interaction model.

2. **Width morphing** — The popover changes width between states (`getSummaryPopoverWidth` → `getExpandedPopoverWidth`). The spec only discusses height/fullscreen.

3. **Drawer variant** — The spec doesn't mention the `CitationDrawer` (bottom sheet for grouped citations). On mobile, this is a primary interaction surface with its own drag-to-close gesture, haptic feedback, and accordion expand/collapse.

4. **Timing telemetry** — The codebase tracks Time-to-Certainty (TtC) and popover dwell time. The spec should document how timing affects UX (e.g., spinner staging after 5s).

5. **Content-adaptive sizing** — The popover shrinks to fit the keyhole image width. This is a significant interaction detail.

6. **Zoom toolbar** — The expanded-page has +/- buttons with a zoom level display. More discoverable than gesture-only zoom.

7. **Focus trap** — The popover lacks a focus trap. This is a genuine accessibility gap. The spec should prioritize adding it over gesture refinements.

8. **aria-live announcements** — No live regions exist for status changes (e.g., verification completing while popover is open). The spec's Section 7.4 proposal is directionally correct but should use Radix's built-in dialog announcements rather than a custom live region.

9. **Passive event listeners** — The codebase uses `{ passive: true }` for touch handlers on the drawer drag gesture. The spec doesn't mention listener options, which matters for scroll performance on mobile.

10. **Hit-box extenders** — The codebase uses invisible `::after` pseudo-elements (`HITBOX_EXTEND_8`, `HITBOX_EXTEND_8x14`) to enlarge touch targets without affecting layout. The spec mentions 44px minimum touch targets but doesn't discuss hit-box extension, which is how the codebase achieves it without layout bloat.

---

## Verdict

The spec is a good **first draft for a greenfield component**. But this isn't greenfield — the codebase has ~15 custom hooks, a three-layer positioning system, view state morphing, and platform-aware gesture handling already built. The spec needs a second pass that:

1. Inventories what already exists
2. Identifies gaps (what's not built yet)
3. Proposes changes only where the current implementation falls short
4. Respects the architectural decisions already made (no fullscreen modal, no `avoidCollisions`, click-not-hover)

The strongest path forward is to treat this spec as a **design intent document** and produce a separate **implementation delta** that maps spec requirements to existing code, identifies true gaps, and proposes targeted additions.
