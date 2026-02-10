/**
 * Shared constants for DeepCitation React components
 * @packageDocumentation
 */

import type React from "react";

/**
 * CSS custom property name for the wavy underline color.
 * Can be overridden via CSS: `--dc-wavy-underline-color: #your-color;`
 * Defaults to red-500 (#ef4444) if not set.
 */
export const WAVY_UNDERLINE_COLOR_VAR = "--dc-wavy-underline-color";

/**
 * Default color for wavy underline (Tailwind red-500).
 * Used as fallback when CSS custom property is not set.
 */
export const WAVY_UNDERLINE_DEFAULT_COLOR = "#ef4444";

/**
 * Style for wavy underline in miss/not-found/error state.
 * Uses wavy text decoration (like spell-checker) instead of strikethrough
 * to indicate "this has a problem" rather than "this was deleted".
 *
 * The color can be customized via CSS custom property:
 * ```css
 * :root {
 *   --dc-wavy-underline-color: #dc2626; // red-600
 * }
 * ```
 *
 * @example
 * ```tsx
 * <span style={isMiss ? MISS_WAVY_UNDERLINE_STYLE : undefined}>
 *   Citation text
 * </span>
 * ```
 */
export const MISS_WAVY_UNDERLINE_STYLE: React.CSSProperties = {
  textDecoration: "underline",
  textDecorationStyle: "wavy",
  textDecorationColor: `var(${WAVY_UNDERLINE_COLOR_VAR}, ${WAVY_UNDERLINE_DEFAULT_COLOR})`,
  textUnderlineOffset: "2px",
};

// =============================================================================
// Status Color CSS Custom Properties
// These can be overridden via CSS to match your design system:
//
// :root {
//   --dc-verified-color: #22c55e;
//   --dc-partial-color: #eab308;
//   --dc-error-color: #dc2626;
//   --dc-pending-color: #6b7280;
//   --dc-popover-width: 400px;
// }
// =============================================================================

/**
 * CSS custom property name for verified/success indicator color.
 * @example
 * ```css
 * :root {
 *   --dc-verified-color: #22c55e; // Override default
 * }
 * ```
 */
export const VERIFIED_COLOR_VAR = "--dc-verified-color";
/** Default verified indicator color (Tailwind green-600) */
export const VERIFIED_COLOR_DEFAULT = "#16a34a";

/**
 * CSS custom property name for partial match indicator color.
 * @example
 * ```css
 * :root {
 *   --dc-partial-color: #eab308; // Override default
 * }
 * ```
 */
export const PARTIAL_COLOR_VAR = "--dc-partial-color";
/** Default partial match indicator color (Tailwind amber-500) */
export const PARTIAL_COLOR_DEFAULT = "#f59e0b";

/**
 * CSS custom property name for error/not-found indicator color.
 * @example
 * ```css
 * :root {
 *   --dc-error-color: #dc2626; // Override default
 * }
 * ```
 */
export const ERROR_COLOR_VAR = "--dc-error-color";
/** Default error indicator color (Tailwind red-500) */
export const ERROR_COLOR_DEFAULT = "#ef4444";

/**
 * CSS custom property name for pending indicator color.
 * @example
 * ```css
 * :root {
 *   --dc-pending-color: #6b7280; // Override default
 * }
 * ```
 */
export const PENDING_COLOR_VAR = "--dc-pending-color";
/** Default pending indicator color (Tailwind gray-400) */
export const PENDING_COLOR_DEFAULT = "#9ca3af";

/**
 * CSS custom property name for popover width.
 * @example
 * ```css
 * :root {
 *   --dc-popover-width: 500px; // Override default 384px
 * }
 * ```
 */
export const POPOVER_WIDTH_VAR = "--dc-popover-width";
/** Default popover width */
export const POPOVER_WIDTH_DEFAULT = "384px";

/** Inline style for verified indicator color, using CSS custom property with fallback */
export const VERIFIED_COLOR_STYLE: React.CSSProperties = {
  color: `var(${VERIFIED_COLOR_VAR}, ${VERIFIED_COLOR_DEFAULT})`,
};

/** Inline style for partial match indicator color, using CSS custom property with fallback */
export const PARTIAL_COLOR_STYLE: React.CSSProperties = {
  color: `var(${PARTIAL_COLOR_VAR}, ${PARTIAL_COLOR_DEFAULT})`,
};

/** Inline style for error/not-found indicator color, using CSS custom property with fallback */
export const ERROR_COLOR_STYLE: React.CSSProperties = {
  color: `var(${ERROR_COLOR_VAR}, ${ERROR_COLOR_DEFAULT})`,
};

/** Inline style for pending indicator color, using CSS custom property with fallback */
export const PENDING_COLOR_STYLE: React.CSSProperties = {
  color: `var(${PENDING_COLOR_VAR}, ${PENDING_COLOR_DEFAULT})`,
};

/**
 * Duration in ms to show "Copied" feedback before resetting to idle state.
 * Used for copy-to-clipboard feedback in various components.
 */
export const COPY_FEEDBACK_DURATION_MS = 2000;

/**
 * Base CSS classes for popover containers in CitationComponent.
 * Provides consistent styling for all popover states (pending, success, partial, error).
 */
export const POPOVER_CONTAINER_BASE_CLASSES =
  "rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-md max-h-[inherit] overflow-y-auto";

/**
 * Dynamic indicator size styles.
 * Uses em units so the indicator scales with the parent font size.
 * 0.85em provides good visibility at most text sizes while staying proportional.
 * minWidth/minHeight ensure a minimum of 10px for accessibility at very small font sizes.
 */
export const INDICATOR_SIZE_STYLE: React.CSSProperties = {
  width: "0.85em",
  height: "0.85em",
  minWidth: "10px",
  minHeight: "10px",
};
