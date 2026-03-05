# Accessibility Patterns

Open this file when modifying popover focus behavior, screen reader announcements, reduced-motion handling, or keyboard navigation in deepcitation React components.

The custom popover (`Popover.tsx` + `PopoverPrimitives.tsx`) does not provide focus trapping, focus return, or status announcements — these are handled by CitationComponent.

## Focus Trap via `inert` Attribute

**NEVER set `inert` on `document.body` when portaling content into it.** The popover portal renders inside `document.body` — setting `inert` on body makes the popover itself inert.

The focus trap in `Citation.tsx` uses `inert` to prevent Tab from escaping the popover into background content. It only activates for keyboard-opened popovers (`openedViaKeyboardRef.current === true`):

```typescript
// CORRECT — inert on <main>, popover portal is a sibling
const main = document.querySelector("main");
if (main) {
  main.setAttribute("inert", "");
  return () => main.removeAttribute("inert");
}

// CORRECT fallback — inert each body child, skip the popover's portal
for (const child of Array.from(document.body.children)) {
  if (popoverEl && child.contains(popoverEl)) continue;
  child.setAttribute("inert", "");
}

// WRONG — makes the popover itself inert
document.body.setAttribute("inert", ""); // ❌ NEVER
```

## Conditional Focus Return (`openedViaKeyboardRef`)

`onCloseAutoFocus` is conditional: keyboard-opened popovers return focus to the trigger (so the user can continue navigating); mouse/touch-opened popovers suppress focus return (which would scroll-jump the trigger into view, disorienting users who have scrolled away).

```typescript
// The ref is set in handleKeyDown (true) and handleClick (false)
onCloseAutoFocus={(e: Event) => {
  if (!openedViaKeyboardRef.current) {
    e.preventDefault(); // Suppress scroll-jump for mouse-opened
  }
  openedViaKeyboardRef.current = false;
}}
```

**Do NOT unconditionally `e.preventDefault()` in `onCloseAutoFocus`.** This was a previous pattern that broke keyboard navigation.

## aria-live Region for Status Transitions

When verification status changes while the popover is open (pending → verified/partial/miss), a hidden `aria-live` region announces the change to screen readers.

**The `aria-live` container must always be rendered (even when empty).** Screen readers only announce content *changes within an existing container*. A newly-inserted container with pre-populated text is NOT reliably announced.

```tsx
// CORRECT — always in the DOM, content changes trigger announcement
const statusLiveRegion = (
  <div aria-live="polite" aria-atomic="true" className="sr-only">
    {statusAnnouncement}  {/* empty string initially, set on transition */}
  </div>
);

// WRONG — conditional render means first announcement is missed
const statusLiveRegion = statusAnnouncement
  ? <div aria-live="polite">{statusAnnouncement}</div>  // ❌
  : null;
```

**The announcement text must be cleared** when re-entering pending state (`setStatusAnnouncement("")`) so React detects the state change when setting it again on the next resolution. Without clearing, React skips identical state updates and the second transition is silent.

## Reduced Motion: Keep Wrapper DOM, Zero Duration

**When `prefersReducedMotion` is true, `AnimatedHeightWrapper` keeps its wrapper `<div>` structure** and passes `0` for durations to `useAnimatedHeight`. It must NOT return a Fragment.

```typescript
// CORRECT — wrapper stays, animation is instant
<AnimatedHeightWrapper viewState={viewState}>  {/* passes 0ms */}
  {children}
</AnimatedHeightWrapper>

// WRONG — Fragment removes wrapper, causes layout shift
if (prefersReducedMotion) return <>{children}</>; // ❌ DO NOT
```

**`useAnimatedHeight` bails out when duration is 0**, clearing all inline styles immediately. A 0ms CSS transition does NOT fire `transitionend` (per CSS Transitions spec §3.1), so the `onTransitionEnd` cleanup on the wrapper would never run — leaving stale `overflow: hidden` that clips content.

## Arrow Key Panning in Expanded-Page

`InlineExpandedImage` (in `EvidenceTray.tsx`) supports arrow key panning for keyboard-only users:
- Default: **50px** per keypress
- **Shift+Arrow**: **200px** per keypress (large pan)
- All four directions supported (ArrowLeft/Right → `scrollLeft`, ArrowUp/Down → `scrollTop`)
