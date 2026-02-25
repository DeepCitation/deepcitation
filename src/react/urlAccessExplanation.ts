/**
 * URL access explanation — mapping utilities for URL access failures.
 *
 * Converts API access statuses to UrlFetchStatus values and structured
 * UrlAccessExplanation objects for display in the popover.
 * The rendering component (UrlAccessExplanationSection) lives in DefaultPopoverContent.tsx.
 *
 * @packageDocumentation
 */

import type { SearchStatus } from "../types/search.js";
import type { UrlAccessStatus } from "../types/verification.js";
import type { UrlFetchStatus } from "./types.js";

// =============================================================================
// TYPES
// =============================================================================

/** Structured explanation for URL access failures shown in the popover. */
export interface UrlAccessExplanation {
  /** Short status title, e.g., "Paywall Detected" */
  title: string;
  /** 1-sentence explanation of what happened */
  description: string;
  /** Actionable suggestion for the user, or null if nothing can be done */
  suggestion: string | null;
  /** Color scheme: "amber" for blocked (potentially resolvable), "red" for errors */
  colorScheme: "amber" | "red";
}

// =============================================================================
// STATUS MAPPING
// =============================================================================

/**
 * Maps UrlAccessStatus (from verification API response) to UrlFetchStatus (UI layer).
 * Used when the verification object has url-specific access data.
 *
 * For the generic "blocked" status, uses the error message to infer the specific
 * block type (paywall, login, rate limit, geo-restriction, or anti-bot fallback).
 */
export function mapUrlAccessStatusToFetchStatus(status: UrlAccessStatus, errorMessage?: string | null): UrlFetchStatus {
  switch (status) {
    case "accessible":
      return "verified";
    case "redirected":
      return "redirected";
    case "redirected_same_domain":
      return "redirected_valid";
    case "not_found":
      return "error_not_found";
    case "forbidden":
      return "blocked_login";
    case "server_error":
      return "error_server";
    case "timeout":
      return "error_timeout";
    case "blocked":
      return inferBlockedType(errorMessage);
    case "network_error":
      return "error_network";
    case "pending":
      return "pending";
    case "unknown":
      return "unknown";
  }
}

/**
 * Infer specific blocked type from the error message when the API returns
 * the generic "blocked" status. Falls back to "blocked_antibot" (site protection)
 * as the most common cause.
 */
function inferBlockedType(errorMessage?: string | null): UrlFetchStatus {
  if (!errorMessage) return "blocked_antibot";
  const msg = errorMessage.toLowerCase();
  if (msg.includes("paywall") || msg.includes("subscribe") || msg.includes("subscription")) {
    return "blocked_paywall";
  }
  if (msg.includes("login") || msg.includes("sign in") || msg.includes("sign-in") || msg.includes("authenticate")) {
    return "blocked_login";
  }
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("too many")) {
    return "blocked_rate_limit";
  }
  if (msg.includes("geo") || msg.includes("region") || msg.includes("country") || msg.includes("available in")) {
    return "blocked_geo";
  }
  return "blocked_antibot";
}

/**
 * Maps SearchStatus (from verification response) to UrlFetchStatus (UI layer).
 * Used as fallback when verification.url.urlAccessStatus is not available.
 */
export function mapSearchStatusToFetchStatus(status: SearchStatus | null | undefined): UrlFetchStatus {
  if (!status) return "pending";
  switch (status) {
    case "found":
    case "found_anchor_text_only":
    case "found_phrase_missed_anchor_text":
      return "verified";
    case "found_on_other_page":
    case "found_on_other_line":
    case "partial_text_found":
    case "first_word_found":
      return "partial";
    case "not_found":
      // SearchStatus.not_found means the text wasn't found on the page,
      // NOT that the page returned HTTP 404.  When urlAccessStatus is
      // absent we can't infer URL-level errors from a search miss.
      return "unknown";
    case "loading":
    case "pending":
    case "timestamp_wip":
    case "skipped":
      return "pending";
    default: {
      const _exhaustiveCheck: never = status;
      return _exhaustiveCheck;
    }
  }
}

// =============================================================================
// EXPLANATION RESOLUTION
// =============================================================================

/**
 * Get a structured explanation for URL access failures.
 * Returns null for success/pending/unknown statuses (no explanation needed).
 */
export function getUrlAccessExplanation(
  fetchStatus: UrlFetchStatus,
  errorMessage?: string | null,
): UrlAccessExplanation | null {
  switch (fetchStatus) {
    // Blocked scenarios (amber — potentially resolvable by the user)
    case "blocked_paywall":
      return {
        title: "Paywall Detected",
        description: errorMessage || "This site requires a paid subscription to access.",
        suggestion: "You can verify this citation by visiting the URL directly if you have a subscription.",
        colorScheme: "amber",
      };
    case "blocked_login":
      return {
        title: "Login Required",
        description: errorMessage || "This page requires authentication to view its content.",
        suggestion: "Log in to the site and visit the URL to verify this citation.",
        colorScheme: "amber",
      };
    case "blocked_geo":
      return {
        title: "Region Restricted",
        description: errorMessage || "This content isn't available from our verification server's location.",
        suggestion: "Try visiting the URL directly — it may be accessible from your location.",
        colorScheme: "amber",
      };
    case "blocked_antibot":
      return {
        title: "Blocked by Site Protection",
        description: errorMessage || "This site's bot protection prevented our crawler from accessing the page.",
        suggestion: "Visit the URL directly in your browser to verify this citation.",
        colorScheme: "amber",
      };
    case "blocked_rate_limit":
      return {
        title: "Rate Limited",
        description: errorMessage || "Too many requests were sent to this site.",
        suggestion: "Try again later — the rate limit should reset shortly.",
        colorScheme: "amber",
      };

    // Error scenarios (red — likely can't be resolved without fixing the URL)
    case "error_not_found":
      return {
        title: "Page Not Found",
        description: errorMessage || "This URL returned a 404 error — the page may have been moved or deleted.",
        suggestion: "Check if the URL is correct, or search the site for the content.",
        colorScheme: "red",
      };
    case "error_server":
      return {
        title: "Server Error",
        description: errorMessage || "The website returned a server error and could not be accessed.",
        suggestion: "Try again later — the site may be experiencing temporary issues.",
        colorScheme: "red",
      };
    case "error_timeout":
      return {
        title: "Connection Timed Out",
        description: errorMessage || "The website took too long to respond to our verification request.",
        suggestion: "Try again later — the site may be under heavy load.",
        colorScheme: "red",
      };
    case "error_network":
      return {
        title: "Network Error",
        description: errorMessage || "Could not connect to this website — the domain may be unreachable.",
        suggestion: "Check if the URL is correct and that the site is still online.",
        colorScheme: "red",
      };

    // Non-error statuses — no explanation needed
    default:
      return null;
  }
}
