import type { CSSProperties, ReactNode } from "react";
import { ERROR_COLOR_STYLE, INDICATOR_SIZE_STYLE } from "./constants.js";

/**
 * Props for StatusIndicatorWrapper component.
 * Internal component used to consistently style icon-based status indicators across citation variants.
 */
export interface StatusIndicatorWrapperProps {
  /**
   * The icon element to wrap (e.g., XIcon, CheckIcon, etc.).
   * The icon should be an SVG component that uses currentColor for styling.
   */
  children: ReactNode;

  /**
   * Optional color style override.
   * @default ERROR_COLOR_STYLE (red for not found status)
   *
   * @example
   * ```tsx
   * <StatusIndicatorWrapper colorStyle={VERIFIED_COLOR_STYLE}>
   *   <CheckIcon />
   * </StatusIndicatorWrapper>
   * ```
   */
  colorStyle?: CSSProperties;

  /**
   * Optional additional CSS classes to apply to the wrapper.
   * @default ""
   *
   * Use this to add additional styling that doesn't fit the standard color/size pattern.
   * Example: `className="[text-decoration:none]"` to prevent underline inheritance.
   */
  className?: string;

  /**
   * Optional data attribute for testing and debugging.
   * Sets the `data-dc-indicator` attribute on the wrapper span.
   * @default undefined
   *
   * @example
   * ```tsx
   * <StatusIndicatorWrapper dataIndicator="error">
   *   <XIcon />
   * </StatusIndicatorWrapper>
   * // Renders: <span data-dc-indicator="error">...</span>
   * ```
   */
  dataIndicator?: string;
}

/**
 * Shared wrapper component for icon-based status indicators.
 *
 * **Internal Component**: This is used internally by CitationComponent and CitationVariants.
 * It provides consistent sizing (0.85em), centering (flexbox), and color styling across all
 * citation variants.
 *
 * The wrapper ensures that:
 * - Icons are properly centered both horizontally and vertically
 * - Icons scale proportionally with text using em units
 * - Color styling is applied consistently via CSS custom properties
 * - Minimum size of 10px is maintained for accessibility
 *
 * @internal
 *
 * @example
 * ```tsx
 * // Basic usage with default error color
 * <StatusIndicatorWrapper>
 *   <XIcon />
 * </StatusIndicatorWrapper>
 *
 * // Custom color for verified state
 * <StatusIndicatorWrapper colorStyle={VERIFIED_COLOR_STYLE}>
 *   <CheckIcon />
 * </StatusIndicatorWrapper>
 *
 * // With additional styling
 * <StatusIndicatorWrapper className="[text-decoration:none]" dataIndicator="error">
 *   <XIcon />
 * </StatusIndicatorWrapper>
 * ```
 */
export const StatusIndicatorWrapper = ({
  children,
  colorStyle = ERROR_COLOR_STYLE,
  className = "",
  dataIndicator,
}: StatusIndicatorWrapperProps) => (
  <span
    className={`ml-0.5 shrink-0 inline-flex items-center justify-center ${className}`.trim()}
    style={{ ...INDICATOR_SIZE_STYLE, ...colorStyle }}
    aria-hidden="true"
    {...(dataIndicator && { "data-dc-indicator": dataIndicator })}
  >
    {children}
  </span>
);
