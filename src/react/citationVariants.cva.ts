/**
 * CVA (class-variance-authority) variant definitions for citation components.
 *
 * Defines all visual variants (chip, brackets, text, superscript, badge, linter)
 * and their status-dependent class sets. Consumers can import these CVA configs
 * to build custom citation UIs with consistent variant styling.
 *
 * @packageDocumentation
 */

import { cva, type VariantProps } from "class-variance-authority";

// =============================================================================
// CITATION CONTAINER VARIANTS
// =============================================================================

/**
 * Citation container variant classes.
 *
 * Controls the outer wrapper styling (layout, spacing, typography, background)
 * for each variant. Status-dependent hover classes are handled via
 * `citationHoverVariants` to keep concerns separate.
 */
export const citationContainerVariants = cva("inline-flex items-center transition-colors", {
  variants: {
    variant: {
      chip: "gap-0.5 px-1.5 py-0 rounded-full text-[0.9em] font-normal bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
      brackets:
        "items-baseline gap-0.5 whitespace-nowrap font-mono font-normal text-xs leading-tight text-gray-500 dark:text-gray-400",
      text: "font-normal",
      superscript: "", // Structural layout handled in component (uses <sup>)
      badge:
        "gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 cursor-pointer",
      linter: "cursor-pointer font-normal",
    },
  },
  defaultVariants: {
    variant: "brackets",
  },
});

export type CitationContainerVariants = VariantProps<typeof citationContainerVariants>;

// =============================================================================
// CITATION HOVER VARIANTS
// =============================================================================

/**
 * Status-dependent hover classes for citation variants.
 *
 * Used by chip, badge, superscript, and linter variants that handle their own
 * hover styling. The `status` determines the hover background color, while
 * `opacity` controls the intensity:
 * - 15: Contained variants (chip, superscript) where hover is on the element itself
 * - 10: Outer trigger wrapper, more subtle
 */
export const citationHoverVariants = cva("", {
  variants: {
    status: {
      verified: "",
      partial: "",
      miss: "",
      pending: "hover:bg-gray-200 dark:hover:bg-gray-700",
    },
    opacity: {
      "10": "",
      "15": "",
    },
  },
  compoundVariants: [
    // Verified hover (opacity 15 — contained variants)
    {
      status: "verified",
      opacity: "15",
      className: "hover:bg-green-600/15 dark:hover:bg-green-500/15",
    },
    // Verified hover (opacity 10 — wrapper)
    {
      status: "verified",
      opacity: "10",
      className: "hover:bg-green-600/10 dark:hover:bg-green-500/10",
    },
    // Partial hover (opacity 15)
    {
      status: "partial",
      opacity: "15",
      className: "hover:bg-amber-500/15 dark:hover:bg-amber-500/15",
    },
    // Partial hover (opacity 10)
    {
      status: "partial",
      opacity: "10",
      className: "hover:bg-amber-500/10 dark:hover:bg-amber-500/10",
    },
    // Miss hover (opacity 15)
    {
      status: "miss",
      opacity: "15",
      className: "hover:bg-red-500/15 dark:hover:bg-red-400/15",
    },
    // Miss hover (opacity 10)
    {
      status: "miss",
      opacity: "10",
      className: "hover:bg-red-500/10 dark:hover:bg-red-400/10",
    },
  ],
  defaultVariants: {
    status: "pending",
    opacity: "15",
  },
});

export type CitationHoverVariants = VariantProps<typeof citationHoverVariants>;

// =============================================================================
// LINTER DECORATION STYLES
// =============================================================================

/**
 * Static linter style objects keyed by status.
 *
 * The linter variant uses CSS text-decoration rather than Tailwind classes
 * for its underline styling. Pre-defining these avoids allocating new objects
 * on every render.
 */

const LINTER_BASE: React.CSSProperties = {
  textDecoration: "underline",
  textDecorationThickness: "2px",
  textUnderlineOffset: "3px",
  borderRadius: "2px",
  color: "inherit",
  fontSize: "inherit",
  fontFamily: "inherit",
  lineHeight: "inherit",
};

export const LINTER_STYLES = {
  verified: {
    ...LINTER_BASE,
    textDecorationStyle: "solid" as const,
    textDecorationColor: "var(--dc-linter-success, #4a7c5f)",
  },
  partial: {
    ...LINTER_BASE,
    textDecorationStyle: "dashed" as const,
    textDecorationColor: "var(--dc-linter-warning, #f59e0b)",
  },
  miss: {
    ...LINTER_BASE,
    textDecorationStyle: "wavy" as const,
    textDecorationColor: "var(--dc-linter-error, #c0605f)",
  },
  pending: {
    ...LINTER_BASE,
    textDecorationStyle: "dotted" as const,
    textDecorationColor: "var(--dc-linter-pending, #9ca3af)",
  },
} as const satisfies Record<string, React.CSSProperties>;

/**
 * Linter-specific hover classes keyed by status.
 * Separate from the general hover variants because linter uses different
 * opacity levels for pending state.
 */
export const LINTER_HOVER_CLASSES = {
  verified: "hover:bg-green-600/10 dark:hover:bg-green-500/10",
  partial: "hover:bg-amber-500/10 dark:hover:bg-amber-500/10",
  miss: "hover:bg-red-500/10 dark:hover:bg-red-400/10",
  pending: "bg-gray-500/[0.05] hover:bg-gray-500/10 dark:bg-gray-400/[0.05] dark:hover:bg-gray-400/10",
} as const;

// =============================================================================
// BADGE HOVER VARIANTS
// =============================================================================

/**
 * Badge-specific hover classes.
 * The badge variant uses /10 opacity hover for all statuses (same as linter
 * verified/partial/miss, but with neutral gray for pending).
 */
export const BADGE_HOVER_CLASSES = {
  verified: "hover:bg-green-600/10 dark:hover:bg-green-500/10",
  partial: "hover:bg-amber-500/10 dark:hover:bg-amber-500/10",
  miss: "hover:bg-red-500/10 dark:hover:bg-red-400/10",
  pending: "hover:bg-gray-200 dark:hover:bg-gray-700",
} as const;

// =============================================================================
// STATUS RESOLUTION HELPER
// =============================================================================

/**
 * Derive a status key from boolean flags.
 * Handles the priority order: partial > miss > verified > pending.
 * (Partial matches have isVerified=true, so partial must be checked first.)
 */
export function resolveStatusKey(
  isVerified: boolean,
  isPartialMatch: boolean,
  isMiss: boolean,
  shouldShowSpinner: boolean,
): "verified" | "partial" | "miss" | "pending" {
  if (shouldShowSpinner) return "pending";
  if (isPartialMatch) return "partial";
  if (isMiss) return "miss";
  if (isVerified) return "verified";
  return "pending";
}

// =============================================================================
// SUPERSCRIPT SPECIFIC
// =============================================================================

/**
 * Superscript inline styles. Defined as static const to avoid object
 * allocation on every render.
 */
export const SUPERSCRIPT_STYLE: React.CSSProperties = {
  fontSize: "0.65em",
  lineHeight: 0,
  position: "relative",
  top: "-0.65em",
  verticalAlign: "baseline",
};
