/**
 * Animation and transition timing constants for DeepCitation React components.
 *
 * CANONICAL LOCATION for:
 * - Five-tier animation scale (ANIM_INSTANT_MS … ANIM_SLOW_MS)
 * - Popover morph timing (POPOVER_MORPH_EXPAND_MS, POPOVER_MORPH_COLLAPSE_MS)
 * - Easing curves (EASE_EXPAND, EASE_COLLAPSE, EASE_GHOST_EXPAND, etc.)
 * - Blink animation profile (BLINK_ENTER_*, BLINK_EXIT_*, BLINK_ROW_*)
 * - View transition timings (VT_EVIDENCE_*)
 * - Page-expand ghost keyframe constants (GHOST_*)
 * - Drawer stagger constants
 * - EvidenceTray list animation (EVIDENCE_LIST_*)
 * - Locate icon pulse constants
 *
 * @packageDocumentation
 */

// =============================================================================
// FIVE-TIER ANIMATION TIMING SCALE
// =============================================================================
//
// Tier              Constant              Duration  Tailwind class   Use cases
// ──────────────────────────────────────────────────────────────────────────────
// Instant           ANIM_INSTANT_MS        80ms     duration-[80ms]  Hover bg, trigger color
// Fast              ANIM_FAST_MS          120ms     duration-120     Micro-interactions, exits, chevrons
// Standard          ANIM_STANDARD_MS      180ms     duration-180     Popover entry, grid expand, morphs
// Measured          ANIM_MEASURED_MS      250ms     duration-[250ms] Drawer slide-in, morph expand
// Slow              ANIM_SLOW_MS          350ms     duration-[350ms] Full-page transitions, coordinated
//
// Expand/collapse morphs use separate constants + asymmetric easing:
//   POPOVER_MORPH_EXPAND_MS   120ms  BLINK_ENTER_EASING   (fast start, gentle settle)
//   POPOVER_MORPH_COLLAPSE_MS 80ms   EASE_COLLAPSE        (aggressive start, soft landing)
//
// NOTE: Tailwind duration-* classes in JSX must remain as literal strings for
// JIT purging. The table above is the single source of truth for timing values.

/** Instant — micro-feedback (hover bg, trigger color). */
export const ANIM_INSTANT_MS = 80;
/** Fast — small interactive transitions (chip color, icon swap). */
export const ANIM_FAST_MS = 120;
/** Standard — primary interactions (button press, toggle). */
export const ANIM_STANDARD_MS = 180;
/** Measured — layout shifts, geometry changes (panel resize, bar fill). */
export const ANIM_MEASURED_MS = 250;
/** Slow — large-area or staged transitions (page morph, spinner settle). */
export const ANIM_SLOW_MS = 350;

// =============================================================================
// POPOVER MORPH TIMING
// =============================================================================

/** Transition duration for popover morph expand (summary → expanded). */
export const POPOVER_MORPH_EXPAND_MS = 120;
/** Transition duration for popover morph collapse (expanded → summary). Faster = snappier close. */
export const POPOVER_MORPH_COLLAPSE_MS = 80;

// =============================================================================
// EASING CURVES
// =============================================================================

/**
 * Easing for expand transitions — restrained spring with ~2% overshoot.
 * Appropriate only when total travel ≤ ~200px (keeps absolute overshoot ≤ 4px).
 * For larger motions (VT morphs, page transitions, height morphs) use
 * EASE_COLLAPSE or BLINK_ENTER_EASING — both are zero-overshoot.
 */
export const EASE_EXPAND = "cubic-bezier(0.34, 1.02, 0.64, 1)";

/**
 * Easing for collapse transitions — decisive decelerate.
 * Bézier: starts with velocity (0.2), then eases into final state (0, 1).
 */
export const EASE_COLLAPSE = "cubic-bezier(0.2, 0, 0, 1)";

/**
 * Easing for the page-expand ghost — deliberate departure, confident arrival.
 * Slow out of the keyhole, fast through mid-flight, soft landing at spotlight.
 * Feels like "expanding into" the space rather than "thrown and catching itself."
 */
export const EASE_GHOST_EXPAND = "cubic-bezier(0.05, 0.7, 0.1, 1)";

/** Easing for popover content reveal during page transitions (both expand and collapse). */
export const EASE_CONTENT_REVEAL = "ease-in";

// =============================================================================
// VIEW TRANSITION: EVIDENCE IMAGE MORPH
// =============================================================================

/** Duration (ms) for evidence image expand VT (keyhole → expanded). ANIM_STANDARD_MS tier. */
export const VT_EVIDENCE_EXPAND_MS = 180;
/** Duration (ms) for the page-expand ghost animation (summary/preview → expanded page). ANIM_MEASURED_MS tier (250ms). */
export const VT_EVIDENCE_PAGE_EXPAND_MS = 250;
/** Duration (ms) for evidence image collapse VT (expanded → keyhole). ANIM_FAST_MS tier. */
export const VT_EVIDENCE_COLLAPSE_MS = 120;
/**
 * Opacity dip for VT old-snapshot cross-fade on collapse (empirically tuned).
 * Low enough to suppress text-detail flicker during geometry morph,
 * high enough to preserve the shape silhouette for spatial tracking.
 */
export const VT_EVIDENCE_DIP_OPACITY = 0.45;

// =============================================================================
// PAGE-EXPAND GHOST ANIMATION KEYFRAME TUNING
// =============================================================================
//
// Mirrors the collapse's "dip-then-reveal" structure:
//   Collapse: old 1.0 → 0.45 (30%) → 0  /  new 0 → 0 (60%) → 1
//   Expand:   ghost dominates first 60%   /  page near-invisible until ghost lands
//
// The ghost is the "old snapshot equivalent" — the thing the eye tracks.
// It must be opaque enough to dominate over the dimmed page beneath.
// The page is the "new snapshot equivalent" — stays hidden, then reveals sharply.

/** Ghost initial opacity — solid "card" lifting from click origin. */
export const GHOST_OPACITY_START = 0.88;
/** Ghost opacity at early interpolation (18% progress) — fully solid in flight. */
export const GHOST_OPACITY_EARLY = 1;
/** Ghost opacity at mid interpolation (42% progress) — fully solid, blur carries motion cue. */
export const GHOST_OPACITY_MID = 1;
/** Ghost opacity at late interpolation (68% progress) — still solid, approaching target. */
export const GHOST_OPACITY_LATE = 1;
/** Ghost near-peak opacity before final fade-out (92% progress) — beginning handoff. */
export const GHOST_OPACITY_PEAK = 0.4;

// Page-expand ghost motion blur.
// CSS `filter: blur()` masks the non-uniform scale distortion (squashed text)
// mid-flight and reads as cinematic motion blur. GPU-composited, no layout cost.
/** Ghost blur (px) at start — sharp at source position. */
export const GHOST_BLUR_START_PX = 0;
/** Ghost blur (px) at early interpolation — motion building. */
export const GHOST_BLUR_EARLY_PX = 3;
/** Ghost blur (px) at mid interpolation — peak motion blur (sole mid-flight cue). */
export const GHOST_BLUR_MID_PX = 7;
/** Ghost blur (px) at late interpolation — clearing as ghost nears target. */
export const GHOST_BLUR_LATE_PX = 3;
/** Ghost blur (px) at near-peak — sharp for clean handoff to page content. */
export const GHOST_BLUR_PEAK_PX = 0;

/** Page content floor opacity during page-expand — nearly invisible.
 *  Must be very low so the ghost dominates the first 60% of the animation
 *  (mirroring how the collapse keeps new content at 0 until 60%). */
export const PAGE_EXPAND_CONTENT_OPACITY_FLOOR = 0.03;

/** Ghost keyframe offset: early interpolation. */
export const GHOST_OFFSET_EARLY = 0.18;
/** Ghost keyframe offset: mid interpolation. */
export const GHOST_OFFSET_MID = 0.42;
/** Ghost keyframe offset: late interpolation. */
export const GHOST_OFFSET_LATE = 0.68;
/** Ghost keyframe offset: near-peak before fade-out. */
export const GHOST_OFFSET_PEAK = 0.92;

/**
 * Page-collapse ghost duration (ms) — faster than expand for a decisive exit.
 *
 * NOTE: keyframe offsets, opacity profile, and blur profile are shared with
 * the expand pipeline (see applyGhostMorph in viewTransition.ts). The two
 * directions intentionally remain distinct only in duration and easing —
 * expand departs slowly from the keyhole and arrives confidently at the
 * spotlight (EASE_GHOST_EXPAND); collapse snaps away with fast deceleration
 * (EASE_COLLAPSE). Everything else is the same math, inverted.
 */
export const PAGE_COLLAPSE_GHOST_MS = 180;

// =============================================================================
// BLINK ANIMATION PROFILE
// =============================================================================
//
// "Blink" = mostly-final immediately, then tiny settle frames.
// Standard envelope is 120ms enter / 80ms exit.

/** Total enter duration (ms) for container-level Blink animations. */
export const BLINK_ENTER_TOTAL_MS = 120;
/** Mid-step threshold (ms) for 2-step enter stages. */
export const BLINK_ENTER_STEP_MS = 60;
/** Total exit duration (ms) for container-level Blink animations. */
export const BLINK_EXIT_TOTAL_MS = 80;

/** Total enter duration (ms) for row reveal/collapse surfaces. */
export const BLINK_ROW_ENTER_TOTAL_MS = 450;
/** Mid-step threshold (ms) for row reveal enter stages. */
export const BLINK_ROW_ENTER_STEP_MS = 260;
/** Total exit duration (ms) for row reveal close stages. */
export const BLINK_ROW_EXIT_TOTAL_MS = 350;

/** Fast row profile enter duration (ms) for sidebar-like quick expansions. */
export const BLINK_ROW_FAST_ENTER_TOTAL_MS = 180;
/** Fast row profile mid-step threshold (ms). */
export const BLINK_ROW_FAST_ENTER_STEP_MS = 100;
/** Fast row profile exit duration (ms). */
export const BLINK_ROW_FAST_EXIT_TOTAL_MS = 120;

/** EvidenceTray search-attempt list enter duration (ms). */
export const EVIDENCE_LIST_EXPAND_TOTAL_MS = 120;
/** EvidenceTray search-attempt list enter settle threshold (ms). */
export const EVIDENCE_LIST_EXPAND_STEP_MS = 60;
/** EvidenceTray search-attempt list collapse duration (ms). */
export const EVIDENCE_LIST_COLLAPSE_TOTAL_MS = 80;

/** Blink enter easing — near-linear with tiny settle. */
export const BLINK_ENTER_EASING = "cubic-bezier(0.25, 0.25, 0.5, 1)";
/** Blink exit easing — quick settle-out. */
export const BLINK_EXIT_EASING = "cubic-bezier(0.3, 0.2, 0.5, 1)";

/** Container stage A opacity (0–1) for Blink enter. */
export const BLINK_ENTER_OPACITY_A = 0.22;
/** Container stage B opacity (0–1) for Blink enter. */
export const BLINK_ENTER_OPACITY_B = 0.78;
/** Container exit opacity (0–1) for Blink close. */
export const BLINK_EXIT_OPACITY = 0.08;

/** Container stage A scale for Blink enter. */
export const BLINK_ENTER_SCALE_A = 0.992;
/** Container stage B scale for Blink enter. */
export const BLINK_ENTER_SCALE_B = 0.997;
/** Container close scale for Blink exit. */
export const BLINK_EXIT_SCALE = 0.996;

/** Container stage A vertical offset (px) for Blink enter. */
export const BLINK_ENTER_Y_A_PX = 0;
/** Container stage B vertical offset (px) for Blink enter. */
export const BLINK_ENTER_Y_B_PX = 0;
/** Container close vertical offset (px) for Blink exit. */
export const BLINK_EXIT_Y_PX = 0;

/** Row stage A opacity (0–1) for Blink reveal (first burst: medium/high). */
export const BLINK_ROW_OPACITY_A = 0.72;
/** Row stage B opacity (0–1) for Blink reveal (near-full but still light). */
export const BLINK_ROW_OPACITY_B = 0.42;
/** Row close opacity (0–1) for Blink hide. */
export const BLINK_ROW_EXIT_OPACITY = 0.32;

/** Row stage A inset (px) for Blink reveal. */
export const BLINK_ROW_INSET_A_PX = 4;
/** Row stage B inset (px) for Blink reveal. */
export const BLINK_ROW_INSET_B_PX = 2;

// =============================================================================
// DRAWER STAGGER
// =============================================================================

/**
 * Per-item stagger delay for citation drawer row reveal animations.
 * Each successive row enters 40ms after the previous, creating a cascading
 * "waterfall" effect that visually communicates list hierarchy.
 */
export const DRAWER_STAGGER_DELAY_MS = 40;
/**
 * Asymptotic cap for cumulative citation drawer stagger delay.
 * Uses exponential approach: `MAX * (1 - e^(-i * DELAY / MAX))`.
 * Early items are ~DELAY apart; gaps shrink smoothly toward zero at MAX.
 */
export const DRAWER_STAGGER_MAX_MS = 250;

// =============================================================================
// CONTENT STAGGER
// =============================================================================

/** Stagger delay before expanded-page content animates in. Container morph starts first.
 * 30ms is tight enough to avoid an empty-container flash while still letting the shell
 * establish its new dimensions before content appears. */
export const CONTENT_STAGGER_DELAY_MS = 30;

// =============================================================================
// LOCATE ICON PULSE
// =============================================================================

/** Locate icon pulse grow duration (ms) after annotation overlay dismiss. */
export const LOCATE_ICON_PULSE_GROW_MS = 120;
/** Locate icon pulse settle duration (ms) after grow stage completes. */
export const LOCATE_ICON_PULSE_SETTLE_MS = 80;
/** Locate icon pulse peak scale (1 = baseline size). */
export const LOCATE_ICON_PULSE_SCALE = 1.12;
/** Locate icon pulse accent color used during temporary highlight.
 *  Uses the muted-foreground design token (neutral zinc) so the cue reads
 *  as the same quiet grey as the dismiss button that triggered it. */
export const LOCATE_ICON_PULSE_COLOR = "var(--dc-muted-foreground)";

// =============================================================================
// MISCELLANEOUS INTERACTION TIMINGS
// =============================================================================

/** Delay in ms before hiding a tooltip on mouse leave (prevents flicker on cursor exit). */
export const TOOLTIP_HIDE_DELAY_MS = 80;

/** Debounce threshold in ms for ignoring click events immediately after touch events. */
export const TOUCH_CLICK_DEBOUNCE_MS = 100;

/**
 * Sensitivity multiplier for trackpad pinch-to-zoom (Ctrl+wheel).
 * Maps `deltaY` pixels into a zoom delta — 0.005 gives roughly 1% zoom
 * per pixel of wheel travel, balancing precision and responsiveness.
 */
export const WHEEL_ZOOM_SENSITIVITY = 0.005;

/**
 * Duration in ms to show "Copied" feedback before resetting to idle state.
 * Used for copy-to-clipboard feedback in various components.
 */
export const COPY_FEEDBACK_DURATION_MS = 2000;

/** Auto-hide spinner after this duration if verification is still pending. */
export const SPINNER_TIMEOUT_MS = 5000;

// =============================================================================
// DRAWER DRAG-TO-CLOSE
// =============================================================================

/** Minimum downward drag distance (px) on the drawer handle to trigger close. */
export const DRAWER_DRAG_CLOSE_THRESHOLD_PX = 80;

/**
 * Maximum distance (px) a finger can move between touchstart and touchend
 * and still be considered a tap (not a scroll or swipe). Matches the
 * platform tap-vs-scroll threshold used by iOS and Chrome.
 */
export const TAP_SLOP_PX = 10;
