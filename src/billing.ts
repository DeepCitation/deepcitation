/**
 * Canonical usage warning thresholds for DeepCitation.
 * Expressed as percentages of the monthly budget *used*.
 * Shared across the CLI, web dashboard, and SDK consumers.
 */

/** Percentage of budget used at which a visual/informational usage warning appears. */
export const USAGE_WARN_PCT = 80;

/** Percentage of budget used at which an urgent "action needed" warning appears. */
export const USAGE_CRITICAL_PCT = 90;
