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
  ERROR_COLOR_STYLE,
  INDICATOR_SIZE_STYLE,
  PARTIAL_COLOR_STYLE,
  PENDING_COLOR_STYLE,
  VERIFIED_COLOR_STYLE,
} from "./constants.js";
import { useTranslation } from "./i18n.js";
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
// | Verified      | Checkmark (✓)      | Green  | "found", "found_source_match_only", etc.      |
// | Partial Match | Checkmark (✓)      | Amber  | "found_on_other_page", "partial_text_found"  |
// | Not Found     | X icon (✕)         | Red    | "not_found"                                  |
//
// Use `renderIndicator` prop to customize. Use `variant="indicator"` to show only the icon.
// =============================================================================

/** Verified indicator - green checkmark for exact matches */
const VerifiedIndicator = () => (
  <StatusIndicatorWrapper
    className="align-middle [text-decoration:none] animate-in fade-in-0 zoom-in-90 duration-120"
    colorStyle={VERIFIED_COLOR_STYLE}
    dataIndicator="verified"
  >
    <CheckIcon />
  </StatusIndicatorWrapper>
);

/** Partial match indicator - amber checkmark for partial/relocated matches */
const PartialIndicator = () => (
  <StatusIndicatorWrapper
    className="align-middle [text-decoration:none] animate-in fade-in-0 zoom-in-90 duration-120"
    colorStyle={PARTIAL_COLOR_STYLE}
    dataIndicator="partial"
  >
    <CheckIcon />
  </StatusIndicatorWrapper>
);

/** Miss indicator - red X for not found.
 * Subtle fade-in entry so the miss result doesn't feel like the UI "gave up". */
const MissIndicator = () => (
  <StatusIndicatorWrapper
    className="align-middle [text-decoration:none] animate-in fade-in-0 duration-75"
    colorStyle={ERROR_COLOR_STYLE}
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

const VerifiedDot = () => {
  const t = useTranslation();
  return <DotIndicator color="green" label={t("indicator.verified")} />;
};
const PartialDot = () => {
  const t = useTranslation();
  return <DotIndicator color="amber" label={t("indicator.partial")} />;
};
const PendingDot = () => {
  const t = useTranslation();
  return <DotIndicator color="gray" pulse label={t("indicator.verifying")} />;
};
const MissDot = () => {
  const t = useTranslation();
  return <DotIndicator color="red" label={t("indicator.notFound")} />;
};

/** Neutral wayfinding dot for form-navigation citations — always rendered, no verification semantics. */
const NavDot = () => {
  const t = useTranslation();
  return (
    <span
      className={cn("inline-block ml-0.5 rounded-full [text-decoration:none] [vertical-align:0.1em]", DOT_COLORS.gray)}
      style={DOT_INDICATOR_SIZE_STYLE}
      data-dc-indicator="nav"
      role="img"
      aria-label={t("indicator.formSection")}
    />
  );
};

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
  const t = useTranslation();

  if (renderIndicator) return renderIndicator(status);
  if (indicatorVariant === "none") return null;

  // Navigation-anchor dot: a single neutral gray dot, always rendered regardless
  // of verification state. Used for form-navigation citations (section headings,
  // question labels) — wayfinding aids that point at the blank form and have
  // nothing to verify, so they must read differently from evidence citations.
  if (indicatorVariant === "nav-dot") {
    return <NavDot />;
  }

  // Caret variant: disclosure chevron with pill wrapper.
  // Outer span = pill (bg, rounded-full, color) — does NOT rotate.
  // Inner span = icon container (sizing, rotation transform).
  // Spinner still takes priority to communicate loading state.
  if (indicatorVariant === "caret") {
    // Only flip when popover is above; down-caret already points toward a bottom popover.
    const shouldFlip = isOpen === true && popoverSide === "top";

    if (shouldShowSpinner) {
      return (
        <span
          className={cn(
            "inline-flex items-center justify-center ml-0.5 align-middle [text-decoration:none] rounded-full",
            "bg-dc-muted/[0.3]",
            "text-dc-subtle-foreground",
          )}
          style={CARET_PILL_STYLE}
          data-dc-indicator="pending"
          aria-hidden="true"
        >
          <span
            className="inline-flex animate-pulse opacity-60 motion-reduce:animate-none"
            style={{ ...CARET_INDICATOR_SIZE_STYLE, ...PENDING_COLOR_STYLE }}
          >
            <SpinnerIcon />
          </span>
        </span>
      );
    }

    // Color: miss → red, default → muted gray.
    const pillTextClass = isMiss ? "text-dc-destructive" : "text-dc-subtle-foreground";
    const pillBgClass = isMiss ? "bg-dc-destructive/10" : "bg-dc-muted/[0.3]";

    return (
      <span
        className={cn(
          "inline-flex items-center justify-center ml-0.5 align-middle [text-decoration:none] rounded-full",
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
            transition: "transform 120ms cubic-bezier(0.2, 0, 0, 1)",
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

  // Default: icon variant — pulse animation.
  // "slow" stage uses a longer period + lower base opacity to signal "still working".
  // Wrapper carries the base opacity; inner span carries the pulse animation.
  // CSS animations override inline `opacity` on the same element, so the two must
  // live on different elements — opacities then multiply through the hierarchy
  // (active 0.7 × pulse 1↔0.5 = 0.7↔0.35; slow 0.5 × pulse 1↔0.5 = 0.5↔0.25).
  if (shouldShowSpinner) {
    return (
      <span
        className="inline-flex ml-1 align-middle [text-decoration:none] transition-opacity duration-[350ms]"
        style={{ opacity: spinnerStage === "slow" ? 0.5 : 0.7 }}
        data-dc-indicator="pending"
        aria-hidden="true"
        title={spinnerStage === "slow" ? t("indicator.stillVerifying") : undefined}
      >
        <span
          className={cn(
            "inline-flex",
            spinnerStage === "active" && "animate-pulse motion-reduce:animate-none",
            spinnerStage === "slow" && "animate-[pulse_2.5s_ease-in-out_infinite] motion-reduce:animate-none",
          )}
          style={{ ...INDICATOR_SIZE_STYLE, ...PENDING_COLOR_STYLE }}
        >
          <SpinnerIcon />
        </span>
      </span>
    );
  }
  if (isVerified && !isPartialMatch) return <VerifiedIndicator />;
  if (isPartialMatch) return <PartialIndicator />;
  if (isMiss) return <MissIndicator />;
  return null;
};
