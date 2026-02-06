/**
 * URL Display Utilities
 *
 * This module contains utilities for working with URLs and status icons.
 * These are separated from the component file to comply with Fast Refresh rules.
 */

import type { UrlFetchStatus } from "./types.js";
import { isBlockedStatus, isErrorStatus, isVerifiedStatus } from "./urlStatus.js";

/**
 * Extracts domain from URL for compact display.
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    // Fallback for invalid URLs
    return url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }
}

/**
 * Truncates a string to max length with ellipsis.
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 1)}…`;
}

/**
 * Get path from URL for display.
 */
export function getUrlPath(url: string): string {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    return path === "/" ? "" : path;
  } catch {
    return "";
  }
}

/**
 * Status indicator icons for URL fetch states.
 */
export const STATUS_ICONS: Record<UrlFetchStatus, { icon: string; label: string; className: string }> = {
  verified: {
    icon: "✓",
    label: "Verified",
    className: "text-green-600 dark:text-green-500",
  },
  partial: {
    icon: "~",
    label: "Partial match",
    className: "text-amber-500 dark:text-amber-400",
  },
  pending: {
    icon: "…",
    label: "Verifying",
    className: "text-gray-400 dark:text-gray-500",
  },
  accessible: {
    icon: "○",
    label: "Accessible",
    className: "text-blue-500 dark:text-blue-400",
  },
  redirected: {
    icon: "↪",
    label: "Redirected",
    className: "text-amber-500 dark:text-amber-400",
  },
  redirected_valid: {
    icon: "↪✓",
    label: "Redirected (valid)",
    className: "text-green-600 dark:text-green-500",
  },
  blocked_antibot: {
    icon: "⊘",
    label: "Blocked by anti-bot",
    className: "text-amber-500 dark:text-amber-400",
  },
  blocked_login: {
    icon: "⊙",
    label: "Login required",
    className: "text-amber-500 dark:text-amber-400",
  },
  blocked_paywall: {
    icon: "$",
    label: "Paywall",
    className: "text-amber-500 dark:text-amber-400",
  },
  blocked_geo: {
    icon: "⊕",
    label: "Geo-restricted",
    className: "text-amber-500 dark:text-amber-400",
  },
  blocked_rate_limit: {
    icon: "◔",
    label: "Rate limited",
    className: "text-amber-500 dark:text-amber-400",
  },
  error_timeout: {
    icon: "⊗",
    label: "Timed out",
    className: "text-red-500 dark:text-red-400",
  },
  error_not_found: {
    icon: "⊗",
    label: "Not found",
    className: "text-red-500 dark:text-red-400",
  },
  error_server: {
    icon: "⊗",
    label: "Server error",
    className: "text-red-500 dark:text-red-400",
  },
  error_network: {
    icon: "⊗",
    label: "Network error",
    className: "text-red-500 dark:text-red-400",
  },
  unknown: {
    icon: "?",
    label: "Unknown status",
    className: "text-gray-400 dark:text-gray-500",
  },
};

/**
 * Compact URL display utilities.
 */
export const urlDisplayUtils = {
  extractDomain,
  truncateString,
  getUrlPath,
  isBlockedStatus,
  isErrorStatus,
  isVerifiedStatus,
};
