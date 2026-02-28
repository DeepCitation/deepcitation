/**
 * Citation status indicator components.
 *
 * Contains all icon and dot indicator variants, the unified
 * CitationStatusIndicator component, and the SpinnerStage type.
 *
 * @packageDocumentation
 */

import type React from "react";
import type { CitationStatus } from "../types/citation.js";
import {
  CARET_INDICATOR_SIZE_STYLE,
  CARET_PILL_STYLE,
  DOT_COLORS,
  DOT_INDICATOR_SIZE_STYLE,
  INDICATOR_SIZE_STYLE,
  PARTIAL_COLOR_STYLE,
  PENDING_COLOR_STYLE,
  VERIFIED_COLOR_STYLE,
} from "./constants.js";
import { CheckIcon, ChevronDownIcon, SpinnerIcon, XIcon } from "./icons.js";
import { StatusIndicatorWrapper } from "./StatusIndicatorWrapper.js";
import type { IndicatorVariant } from "./types.js";
import { cn } from "./utils.js";

// =============================================================================
// ICON INDICATOR COMPONENTS
// =============================================================================
//
// Status indicators show the verification state visually:
//
// | Status        | Indicator          | Color  | searchState.status values                    |
// |---------------|--------------------| -------|----------------------------------------------|
// | Pending       | Spinner            | Gray   | "pending", "loading", null/undefined         |
// | Verified      | Checkmark (✓)      | Green  | "found", "found_anchor_text_only", etc.      |
// | Partial Match | Checkmark (✓)      | Amber  | "found_on_other_page", "partial_text_found"  |
// | Not Found     | X icon (✕)         | Red    | "not_found"                                  |
//
// Use `renderIndicator` prop to customize. Use `variant="indicator"` to show only the icon.
// =============================================================================

/** Verified indicator - green checkmark for exact matches (subscript-positioned) */
const VerifiedIndicator = () => (
  <span
    className="inline-flex relative ml-0.5 top-[0.1em] [text-decoration:none] animate-in fade-in-0 zoom-in-90 duration-150"
    style={{ ...INDICATOR_SIZE_STYLE, ...VERIFIED_COLOR_STYLE }}
    data-dc-indicator="verified"
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
);

/** Partial match indicator - amber checkmark for partial/relocated matches (subscript-positioned) */
const PartialIndicator = () => (
  <span
    className="inline-flex relative ml-0.5 top-[0.1em] [text-decoration:none] animate-in fade-in-0 zoom-in-90 duration-150"
    style={{ ...INDICATOR_SIZE_STYLE, ...PARTIAL_COLOR_STYLE }}
    data-dc-indicator="partial"
    aria-hidden="true"
  >
    <CheckIcon />
  </span>
);

/** Miss indicator - red X for not found (centered, not subscript).
 * Subtle fade-in entry so the miss result doesn't feel like the UI "gave up". */
const MissIndicator = () => (
  <StatusIndicatorWrapper
    className="relative top-[0.1em] [text-decoration:none] animate-in fade-in-0 duration-100"
    dataIndicator="error"
  >
    <XIcon />
  </StatusIndicatorWrapper>
);

// =============================================================================
// DOT INDICATOR COMPONENT (subtle colored dot, like GitHub/shadcn status dots)
// =============================================================================

/** Unified dot indicator — color + optional pulse animation. */
const DotIndicator = ({
  color,
  pulse = false,
  label,
}: {
  color: keyof typeof DOT_COLORS;
  pulse?: boolean;
  label: string;
}) => (
  <span
    className={cn(
      "inline-block ml-0.5 rounded-full [text-decoration:none] [vertical-align:0.1em]",
      DOT_COLORS[color],
      pulse && "animate-pulse",
    )}
    style={DOT_INDICATOR_SIZE_STYLE}
    data-dc-indicator={
      color === "red" ? "error" : color === "gray" ? "pending" : color === "amber" ? "partial" : "verified"
    }
    role="img"
    aria-label={label}
  />
);

const VerifiedDot = () => <DotIndicator color="green" label="Verified" />;
const PartialDot = () => <DotIndicator color="amber" label="Partial match" />;
const PendingDot = () => <DotIndicator color="gray" pulse label="Verifying" />;
const MissDot = () => <DotIndicator color="red" label="Not found" />;

// =============================================================================
// SPINNER STAGE TYPE
// =============================================================================

export type SpinnerStage = "active" | "slow" | "stale";

// =============================================================================
// CITATION STATUS INDICATOR
// =============================================================================

export interface CitationStatusIndicatorProps {
  renderIndicator?: (status: CitationStatus) => React.ReactNode;
  status: CitationStatus;
  indicatorVariant: IndicatorVariant;
  shouldShowSpinner: boolean;
  isVerified: boolean;
  isPartialMatch: boolean;
  isMiss: boolean;
  spinnerStage: SpinnerStage;
  /** Whether the popover is currently open. Used by the caret variant to flip direction. */
  isOpen?: boolean;
  /** Which side the popover is on. Caret flips only when popover is above ("top"). */
  popoverSide?: "top" | "bottom";
}

/**
 * Renders the appropriate status indicator based on citation verification state.
 * Renders in priority order:
 * 1. Custom renderIndicator (if provided)
 * 2. Spinner (for pending/loading states)
 * 3. Verified checkmark (green)
 * 4. Partial match checkmark (amber)
 * 5. Miss X icon (red)
 */
export const CitationStatusIndicator = ({
  renderIndicator,
  status,
  indicatorVariant,
  shouldShowSpinner,
  isVerified,
  isPartialMatch,
  isMiss,
  spinnerStage,
  isOpen,
  popoverSide,
}: CitationStatusIndicatorProps): React.ReactNode => {
  if (renderIndicator) return renderIndicator(status);
  if (indicatorVariant === "none") return null;

  // Caret variant: disclosure chevron with pill wrapper.
  // Outer span = pill (bg, rounded-full, color) — does NOT rotate.
  // Inner span = icon container (sizing, rotation transform).
  // Spinner still takes priority to communicate loading state.
  if (indicatorVariant === "caret") {
    // Only flip when popover is above; down-caret already points toward a bottom popover.
    const shouldFlip = isOpen === true && popoverSide === "top";

    // Color: miss → red, open → darker gray, default → light gray.
    const pillTextClass = isMiss
      ? "text-red-500 dark:text-red-400"
      : isOpen
        ? "text-gray-600 dark:text-gray-400"
        : "text-gray-400 dark:text-gray-500";

    // Pill background: miss → red tint, open → slightly darker, default → subtle gray.
    const pillBgClass = isMiss
      ? "bg-red-50 dark:bg-red-950"
      : isOpen
        ? "bg-gray-200/60 dark:bg-gray-700/60"
        : "bg-gray-100/60 dark:bg-gray-800/40";

    if (shouldShowSpinner) {
      return (
        <span
          className={cn(
            "inline-flex items-center justify-center relative ml-0.5 top-[0.05em] [text-decoration:none] rounded-full",
            pillBgClass,
            "text-gray-400 dark:text-gray-500",
          )}
          style={CARET_PILL_STYLE}
          data-dc-indicator="pending"
          aria-hidden="true"
        >
          <span className="inline-flex animate-spin" style={{ ...CARET_INDICATOR_SIZE_STYLE, ...PENDING_COLOR_STYLE }}>
            <SpinnerIcon />
          </span>
        </span>
      );
    }
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center relative ml-0.5 top-[0.05em] [text-decoration:none] rounded-full",
          pillBgClass,
          pillTextClass,
        )}
        style={CARET_PILL_STYLE}
        data-dc-indicator={isMiss ? "caret-error" : "caret"}
        aria-hidden="true"
      >
        <span
          className="inline-flex"
          style={{
            ...CARET_INDICATOR_SIZE_STYLE,
            transition: "transform 150ms ease",
            transform: shouldFlip ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <ChevronDownIcon />
        </span>
      </span>
    );
  }

  if (indicatorVariant === "dot") {
    if (shouldShowSpinner) return <PendingDot />;
    if (isVerified && !isPartialMatch) return <VerifiedDot />;
    if (isPartialMatch) return <PartialDot />;
    if (isMiss) return <MissDot />;
    return null;
  }

  // Default: icon variant — 3-stage spinner.
  // "slow" stage uses a decelerating spin (eased rotation) + reduced opacity
  // to communicate "still working but taking longer" without constant motion.
  if (shouldShowSpinner) {
    return (
      <span
        className={cn(
          "inline-flex relative ml-1 top-[0.1em] [text-decoration:none] transition-opacity duration-[400ms]",
          spinnerStage === "active" && "animate-spin",
          spinnerStage === "slow" && "animate-[dc-spin-ease_2s_linear_infinite]",
        )}
        style={{
          ...INDICATOR_SIZE_STYLE,
          ...PENDING_COLOR_STYLE,
          opacity: spinnerStage === "slow" ? 0.6 : 1,
        }}
        data-dc-indicator="pending"
        aria-hidden="true"
        title={spinnerStage === "slow" ? "Still verifying..." : undefined}
      >
        <SpinnerIcon />
        {spinnerStage === "slow" && (
          <style>{`
            @keyframes dc-spin-ease {
              0% { transform: rotate(0deg); }
              60% { transform: rotate(252deg); }
              100% { transform: rotate(360deg); }
            }
            @media (prefers-reduced-motion: reduce) {
              .animate-\\[dc-spin-ease_2s_linear_infinite\\] { animation: none !important; }
            }
          `}</style>
        )}
      </span>
    );
  }
  if (isVerified && !isPartialMatch) return <VerifiedIndicator />;
  if (isPartialMatch) return <PartialIndicator />;
  if (isMiss) return <MissIndicator />;
  return null;
};
