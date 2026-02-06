/**
 * URL Status Check Utilities
 *
 * This module contains status checking functions for URL fetch statuses.
 * These are separated from the component file to comply with Fast Refresh rules.
 */

import type { UrlFetchStatus } from "./types.js";

/**
 * Checks if status is a blocked status.
 */
export function isBlockedStatus(status: UrlFetchStatus): boolean {
  return status.startsWith("blocked_");
}

/**
 * Checks if status is an error status.
 */
export function isErrorStatus(status: UrlFetchStatus): boolean {
  return status.startsWith("error_");
}

/**
 * Checks if status indicates the URL is accessible (may not have verified content yet).
 */
export function isAccessibleStatus(status: UrlFetchStatus): boolean {
  return status === "verified" || status === "partial" || status === "accessible" || status === "redirected_valid";
}

/**
 * Checks if status indicates a redirect occurred.
 */
export function isRedirectedStatus(status: UrlFetchStatus): boolean {
  return status === "redirected" || status === "redirected_valid";
}

/**
 * Checks if URL was successfully verified.
 */
export function isVerifiedStatus(status: UrlFetchStatus): boolean {
  return status === "verified" || status === "partial" || status === "redirected_valid";
}
